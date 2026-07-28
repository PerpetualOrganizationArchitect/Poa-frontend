import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery } from '@apollo/client';
import { useAuth } from './AuthContext';
import { FETCH_USER_DATA_NEW, FETCH_TOKEN_APPROVER_HATS } from '../util/queries';
import { useRouter } from 'next/router';
import { useOrgName } from '../hooks/useOrgName';
import { usePOContext } from './POContext';
import { formatTokenAmount } from '../util/formatToken';
import { useRefresh } from './RefreshContext';
import { findUsernameAcrossChains } from '../util/crossChainUsername';
import { useSubgraphClient } from '../util/apolloClient';

const UserContext = createContext();

export const useUserContext = () => useContext(UserContext);

export const UserProvider = ({ children }) => {
    const { accountAddress: authAddress } = useAuth();
    const router = useRouter();
    const userDAO = useOrgName();
    const { orgId, roleHatIds, participationTokenAddress, subgraphUrl } = usePOContext();

    const [userData, setUserData] = useState({});
    const [graphUsername, setGraphUsername] = useState('');
    const [claimedTasks, setClaimedTasks] = useState([]);
    const [userProposals, setUserProposals] = useState([]);
    const [completedModules, setCompletedModules] = useState([]);
    const [userDataLoading, setUserDataLoading] = useState(true);
    // Optimistic overrides — set by optimisticJoin, cleared when subgraph catches up
    const [optimisticRoles, setOptimisticRoles] = useState(null);

    // Optimistic lock: prevents stale subgraph data from overwriting optimistic join state.
    // Mirrors the pattern in TaskBoardContext.js.
    const optimisticLockRef = useRef(null);
    const OPTIMISTIC_GRACE_PERIOD = 15000; // 15s — covers 8s scheduled refetch + margin

    const [account, setAccount] = useState(null);

    // Use AuthContext's unified address (supports both EOA and passkey)
    const effectiveAddress = authAddress;

    useEffect(() => {
        if (effectiveAddress) {
            setAccount(effectiveAddress.toLowerCase());
        }
    }, [effectiveAddress]);

    // Construct the org-specific user ID
    const orgUserID = orgId && account ? `${orgId}-${account}` : null;
    const client = useSubgraphClient(subgraphUrl);

    const { data, error, loading, refetch } = useQuery(FETCH_USER_DATA_NEW, {
        variables: {
            orgUserID: orgUserID,
            userAddress: account,
        },
        skip: !orgUserID || !account,
        fetchPolicy: 'cache-first',
        client,
    });

    // Ref-stabilize refetch so callbacks don't re-create when Apollo returns a new reference
    const refetchRef = useRef(refetch);
    refetchRef.current = refetch;

    // Query approver hats for the participation token
    const { data: approverHatsData } = useQuery(FETCH_TOKEN_APPROVER_HATS, {
        variables: { tokenAddress: participationTokenAddress },
        skip: !participationTokenAddress,
        fetchPolicy: 'cache-first',
        client,
    });

    // Derive role booleans from query data (replaces separate useState + useEffect pattern).
    // optimisticRoles overrides allow immediate UI feedback after join before subgraph indexes.
    const hasMemberRole = useMemo(() => {
        if (optimisticRoles?.hasMemberRole) return true;
        const user = data?.user;
        return !!(user && user.membershipStatus === 'Active');
    }, [data, optimisticRoles]);

    const hasExecRole = useMemo(() => {
        if (optimisticRoles?.hasExecRole) return true;
        const userHatIds = data?.user?.currentHatIds || [];
        const execHatId = roleHatIds?.[1];
        return !!(execHatId && userHatIds.includes(execHatId));
    }, [data, roleHatIds, optimisticRoles]);

    const hasApproverRole = useMemo(() => {
        const userHatIds = data?.user?.currentHatIds || [];
        const approverHatIds = (approverHatsData?.hatPermissions || []).map(p => p.hatId);
        return approverHatIds.some(hatId => userHatIds.includes(hatId));
    }, [data, approverHatsData]);

    // Subscribe to role:claimed event to refetch user data
    const { subscribe } = useRefresh();

    const refetchUserData = useCallback(() => {
        if (orgUserID && account) {
            refetchRef.current();
        }
    }, [orgUserID, account]);

    // Refetch immediately — executeWithNotification already waited for the
    // subgraph to index the transaction block before emitting these events.
    useEffect(() => {
        const unsubscribe = subscribe('role:claimed', () => {
            refetchUserData();
        });
        return unsubscribe;
    }, [subscribe, refetchUserData]);

    useEffect(() => {
        const unsubscribe = subscribe('user:username_changed', () => {
            refetchUserData();
        });
        return unsubscribe;
    }, [subscribe, refetchUserData]);

    useEffect(() => {
        if (data) {
            // Optimistic lock: if optimisticJoin was recently called, check whether the
            // subgraph has caught up before accepting its data.
            if (optimisticLockRef.current) {
                const elapsed = Date.now() - optimisticLockRef.current;
                if (elapsed < OPTIMISTIC_GRACE_PERIOD) {
                    const serverHatIds = data.user?.currentHatIds || [];
                    if (serverHatIds.length === 0) {
                        // Subgraph hasn't indexed the join yet — keep optimistic state
                        return;
                    }
                }
                // Server caught up or grace period expired — clear lock and optimistic overrides
                optimisticLockRef.current = null;
                setOptimisticRoles(null);
            }

            const { user, account: accountData } = data;

            setGraphUsername(accountData?.username || '');

            if (user) {
                setUserData({
                    id: user.id,
                    address: user.address,
                    participationTokenBalance: formatTokenAmount(user.participationTokenBalance || '0'),
                    hatIds: user.currentHatIds || [],
                    tasksCompleted: user.totalTasksCompleted || 0,
                    totalVotes: user.totalVotes || 0,
                    firstSeenAt: user.firstSeenAt || null,
                    membershipStatus: user.membershipStatus,
                    completedTasks: (user.completedTasks || []).map(task => ({
                        id: task.id,
                        taskId: task.taskId,
                        title: task.title,
                        payout: formatTokenAmount(task.payout || '0'),
                        status: 'Completed',
                    })),
                });

                setClaimedTasks((user.assignedTasks || []).map(task => ({
                    id: task.id,
                    taskId: task.taskId,
                    title: task.title,
                    payout: formatTokenAmount(task.payout || '0'),
                    status: task.status,
                })));

                setCompletedModules((user.modulesCompleted || []).map(m => ({
                    moduleId: m.moduleId,
                    completedAt: m.completedAt,
                })));

                const proposals = user.hybridProposalsCreated || [];
                setUserProposals(proposals.map(p => ({
                    id: p.id,
                    proposalId: p.proposalId,
                    title: p.title,
                    type: 'Hybrid',
                    startTimestamp: p.startTimestamp,
                    endTimestamp: p.endTimestamp,
                    status: p.status,
                })).sort((a, b) => {
                    const aCompleted = a.status !== 'Active';
                    const bCompleted = b.status !== 'Active';
                    if (aCompleted && !bCompleted) return 1;
                    if (!aCompleted && bCompleted) return -1;
                    return parseInt(a.endTimestamp) - parseInt(b.endTimestamp);
                }));
            } else {
                setUserData({});
                setClaimedTasks([]);
                setCompletedModules([]);
                setUserProposals([]);
            }

            setUserDataLoading(false);
        }
    }, [data]);

    // Cross-chain username fallback: if this chain's subgraph has no username
    // for the user, check all chains. The user may have registered on a different chain.
    useEffect(() => {
        if (graphUsername || !account || !data) return;
        let cancelled = false;
        findUsernameAcrossChains(account).then(({ username }) => {
            if (!cancelled && username) {
                setGraphUsername(username);
            }
        }).catch((err) => {
            console.warn('[UserContext] Cross-chain username lookup failed:', err);
        });
        return () => { cancelled = true; };
    }, [graphUsername, account, data]);

    useEffect(() => {
        if (!orgId && userDAO) {
            setUserDataLoading(true);
        }
    }, [orgId, userDAO]);

    useEffect(() => {
        if (!account && !loading) {
            setUserDataLoading(false);
        }
    }, [account, loading]);

    // If the user-data query errors (subgraph down, timeout, etc.), clear the
    // loading flag so pages aren't stuck on an infinite spinner.
    useEffect(() => {
        if (error && !loading) {
            setUserDataLoading(false);
        }
    }, [error, loading]);

    /**
     * Optimistically set user state after a successful join transaction.
     * This allows immediate redirect to profileHub without waiting for subgraph indexing.
     * The subgraph data will replace this on the next refetch.
     *
     * @param {{ address: string, hatIds: string[], username: string }} joinData
     */
    const optimisticJoin = useCallback(({ address: userAddr, hatIds, username }) => {
        const lowerAddr = userAddr?.toLowerCase();
        optimisticLockRef.current = Date.now();
        if (username) setGraphUsername(username);
        // Set optimistic role overrides so useMemo derivations return true immediately
        const roles = { hasMemberRole: true };
        const execHat = roleHatIds?.[1];
        if (execHat && hatIds?.length > 0) {
            try {
                const execNorm = BigInt(execHat).toString();
                const hasExec = hatIds.some(h => BigInt(h).toString() === execNorm);
                if (hasExec) roles.hasExecRole = true;
            } catch {
                // If BigInt conversion fails, skip — subgraph will correct it on refetch
            }
        }
        setOptimisticRoles(roles);
        setUserData(prev => ({
            ...prev,
            id: orgId ? `${orgId}-${lowerAddr}` : prev.id,
            address: lowerAddr || prev.address,
            hatIds: hatIds || prev.hatIds || [],
            membershipStatus: 'Active',
            participationTokenBalance: prev.participationTokenBalance || '0',
            tasksCompleted: prev.tasksCompleted || 0,
            totalVotes: prev.totalVotes || 0,
        }));
        setUserDataLoading(false);

        // Schedule a subgraph refetch to replace optimistic data with real data.
        // This is called before the transaction completes (optimistic), so we use
        // a fixed delay. The actual transaction's refresh event (via executeWithNotification)
        // will also trigger a refetch with proper _meta waiting.
        setTimeout(() => refetchUserData(), 8000);
    }, [orgId, roleHatIds, refetchUserData]);

    // Stabilize error: only change when the message string changes, not the object reference
    const errorMessage = error?.message || null;

    const contextValue = useMemo(() => ({
        // Connected user's address (passkey smart account or EOA), auth-aware.
        // Consumers (e.g. TaskCardModal's isClaimer check) rely on this; omitting
        // it previously made `account` undefined → the claimer could never submit
        // their own task from the modal (Submit stayed disabled for everyone).
        address: effectiveAddress,
        userDataLoading,
        userProposals,
        userData,
        graphUsername,
        setGraphUsername,
        hasExecRole,
        hasMemberRole,
        hasApproverRole,
        claimedTasks,
        completedModules,
        error: errorMessage ? { message: errorMessage } : null,
        refetchUserData,
        optimisticJoin,
    }), [
        effectiveAddress,
        userDataLoading,
        userProposals,
        userData,
        graphUsername,
        setGraphUsername,
        hasExecRole,
        hasMemberRole,
        hasApproverRole,
        claimedTasks,
        completedModules,
        errorMessage,
        refetchUserData,
        optimisticJoin,
    ]);

    return (
        <UserContext.Provider value={contextValue}>
            {children}
        </UserContext.Provider>
    );
};
