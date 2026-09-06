import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery } from '@apollo/client';
import { useAuth } from './AuthContext';
import { FETCH_USER_DATA_NEW, FETCH_TOKEN_APPROVER_HATS } from '../util/queries';
import { useOrgName } from '../hooks/useOrgName';
import { usePOContext } from './POContext';
import { formatTokenAmount } from '../util/formatToken';
import { useRefreshSubscription, RefreshEvent } from './RefreshContext';
import { findUsernameAcrossChains } from '../util/crossChainUsername';
import { useSubgraphClient } from '../util/apolloClient';
import {
    buildUserScope,
    deriveUserDataLoading,
    isDataForScope,
    isUserStateCurrent,
} from '../lib/user/userScope';
import { useUserActive } from '../hooks/useUserActive';

const UserContext = createContext();

export const useUserContext = () => useContext(UserContext);

export const UserProvider = ({ children }) => {
    const { accountAddress: authAddress } = useAuth();
    const userDAO = useOrgName();
    const { orgId, participationTokenAddress, subgraphUrl } = usePOContext();

    const [userData, setUserData] = useState({});
    const [graphUsername, setGraphUsername] = useState('');
    const [claimedTasks, setClaimedTasks] = useState([]);
    const [userProposals, setUserProposals] = useState([]);
    const [completedModules, setCompletedModules] = useState([]);
    const [userDataLoading, setUserDataLoading] = useState(true);
    const [resolvedUserScope, setResolvedUserScope] = useState(null);
    // Optimistic overrides — set by optimisticJoin, cleared when subgraph catches up
    const [optimisticRoles, setOptimisticRoles] = useState(null);

    // Optimistic lock: prevents stale subgraph data from overwriting optimistic join state.
    // Mirrors the pattern in TaskBoardContext.js.
    const optimisticLockRef = useRef(null);
    // Apollo may retain the same error object while query variables change.
    // Remember the error identity already handled so an org switch cannot
    // reinterpret a previous scope's error as a result for the next scope.
    const handledUserErrorRef = useRef(null);
    const OPTIMISTIC_GRACE_PERIOD = 15000; // 15s — covers 8s scheduled refetch + margin

    // Use AuthContext's unified address (supports both EOA and passkey). Keep
    // this derived instead of copying it into state: the old one-way effect
    // never cleared `account` on disconnect and left the prior profile live.
    const effectiveAddress = authAddress || null;
    const account = useMemo(
        () => effectiveAddress?.toLowerCase() || null,
        [effectiveAddress]
    );

    // Construct the org-specific user ID
    const orgUserID = buildUserScope(orgId, account);
    const userScopeRef = useRef(orgUserID);

    // Auth changes (including disconnect and A -> B account switches) and org
    // changes invalidate every user-derived value. Apollo may retain the
    // previous query's `data` when a query becomes skipped, so clearing only
    // the address is not sufficient.
    useEffect(() => {
        if (userScopeRef.current === orgUserID) return;
        userScopeRef.current = orgUserID;
        optimisticLockRef.current = null;
        setOptimisticRoles(null);
        setUserData({});
        setGraphUsername('');
        setClaimedTasks([]);
        setUserProposals([]);
        setCompletedModules([]);
        setResolvedUserScope(null);
        setUserDataLoading(!!orgUserID);
    }, [orgUserID]);

    const client = useSubgraphClient(subgraphUrl);
    const isActive = useUserActive();

    const { data, error, loading, refetch } = useQuery(FETCH_USER_DATA_NEW, {
        variables: {
            orgUserID: orgUserID,
            userAddress: account,
        },
        skip: !orgUserID || !account,
        fetchPolicy: 'cache-first',
        // Gentle poll: hat grants / assignments by OTHER members produce no local
        // RefreshEvent, so polling is the only way they appear without a reload.
        // 60s (vs ProjectContext's 40s) since this is a liveness backstop.
        // Pauses when the tab is hidden or the user is idle (useUserActive).
        pollInterval: isActive ? 60000 : 0,
        client,
    });

    // Ref-stabilize refetch so callbacks don't re-create when Apollo returns a new reference
    const refetchRef = useRef(refetch);
    refetchRef.current = refetch;

    // When the user returns (tab visible / mouse moves), refetch immediately
    // so stale data doesn't persist until the next poll tick.
    const wasActiveRef = useRef(isActive);
    useEffect(() => {
        if (isActive && !wasActiveRef.current && orgUserID && account) {
            refetchRef.current();
        }
        wasActiveRef.current = isActive;
    }, [isActive, orgUserID, account]);

    // Query approver hats for the participation token
    const { data: approverHatsData } = useQuery(FETCH_TOKEN_APPROVER_HATS, {
        variables: { tokenAddress: participationTokenAddress },
        skip: !participationTokenAddress,
        fetchPolicy: 'cache-first',
        client,
    });

    // Apollo can retain the last result after `skip` flips true. Never expose
    // that result to a disconnected or newly-switched account.
    const isCurrentUserData = useMemo(
        () => isDataForScope({ data, account, orgUserID }),
        [account, orgUserID, data]
    );

    // Derive role booleans from query data (replaces separate useState + useEffect pattern).
    // optimisticRoles overrides allow immediate UI feedback after join before subgraph indexes.
    const hasMemberRole = useMemo(() => {
        if (!account) return false;
        if (optimisticRoles?.hasMemberRole && resolvedUserScope === orgUserID) return true;
        if (!isCurrentUserData) return false;
        const user = data?.user;
        return !!(user && user.membershipStatus === 'Active');
    }, [account, data, isCurrentUserData, optimisticRoles, orgUserID, resolvedUserScope]);

    // NOTE: there is deliberately no `hasExecRole` here. It used to be the positional
    // guess `roleHatIds[1]`, which no contract implements and which inverts on any org
    // whose senior role deployed first (Argus: Agent at index 0, Apprentice at 1 — so
    // every real admin was denied and a junior would have been granted). Authority now
    // comes from the contract that enforces it: `projectTaskPermissions` (util/permissions)
    // for TaskManager surfaces, `useVoteCreateGate` for proposals, `useEducationCreateGate`
    // for learning modules, `creatorHatIds` for projects, and `hasApproverRole` below for
    // participation-token approvals. Do not reintroduce a positional role index.
    const hasApproverRole = useMemo(() => {
        if (!account || !isCurrentUserData) return false;
        const userHatIds = data?.user?.currentHatIds || [];
        const approverHatIds = (approverHatsData?.hatPermissions || []).map(p => p.hatId);
        return approverHatIds.some(hatId => userHatIds.includes(hatId));
    }, [account, data, approverHatsData, isCurrentUserData]);

    const refetchUserData = useCallback(() => {
        if (orgUserID && account) {
            refetchRef.current();
        }
    }, [orgUserID, account]);

    // Refetch on any event that can change this user's row in FETCH_USER_DATA_NEW.
    // executeWithNotification-emitted events already waited for the subgraph to
    // index the tx block; TaskBoardContext emits immediately, and the poll heals
    // any pre-index refetch.
    useRefreshSubscription(
        [
            // assignedTasks / completedTasks / totalTasksCompleted / balance
            RefreshEvent.TASK_CLAIMED,
            RefreshEvent.TASK_SUBMITTED,
            RefreshEvent.TASK_COMPLETED,
            RefreshEvent.TASK_UNCLAIMED,
            RefreshEvent.TASK_ASSIGNED,
            RefreshEvent.TASK_REJECTED,
            RefreshEvent.TASK_CANCELLED,
            RefreshEvent.TASK_UPDATED,
            RefreshEvent.TASK_APPLICATION_APPROVED,
            // Deleting a project soft-deletes the parent only; assignedTasks
            // otherwise stays cached with its now-hidden child tasks.
            RefreshEvent.PROJECT_DELETED,
            // modulesCompleted + module payout → balance
            RefreshEvent.MODULE_COMPLETED,
            // participationTokenBalance (self-approval; requester side is poll-covered)
            RefreshEvent.TOKEN_REQUEST_APPROVED,
            // hybridProposalsCreated + totalVotes
            RefreshEvent.PROPOSAL_CREATED,
            RefreshEvent.PROPOSAL_VOTED,
            RefreshEvent.PROPOSAL_COMPLETED,
            // membershipStatus / currentHatIds
            RefreshEvent.MEMBER_JOINED,
            RefreshEvent.ROLE_CLAIMED,
            RefreshEvent.ROLE_VOUCHED,
            RefreshEvent.ROLE_VOUCH_REVOKED,
            // account.username
            RefreshEvent.USER_CREATED,
            RefreshEvent.USERNAME_CHANGED,
        ],
        refetchUserData,
        [refetchUserData]
    );

    useEffect(() => {
        if (data && isCurrentUserData) {
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
            setResolvedUserScope(orgUserID);

            if (user) {
                setUserData({
                    id: user.id,
                    address: user.address,
                    participationTokenBalance: formatTokenAmount(user.participationTokenBalance || '0'),
                    // Raw wei alongside the display value: eligibility gates
                    // (voterEligibility ERC20_BAL) must compare wei exactly as
                    // the contract does — the formatted value rounds to whole
                    // tokens and misjudges sub-token balances.
                    participationTokenBalanceWei: user.participationTokenBalance || '0',
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
    }, [data, isCurrentUserData, orgUserID]);

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
        // Set optimistic role overrides so useMemo derivations return true immediately.
        // Only membership is optimistic: task/vote authority is resolved per-surface from
        // the hats in `userData.hatIds`, which this same call sets below.
        setOptimisticRoles({ hasMemberRole: true });
        setResolvedUserScope(orgUserID);
        setUserData(prev => ({
            ...prev,
            id: orgId ? `${orgId}-${lowerAddr}` : prev.id,
            address: lowerAddr || prev.address,
            hatIds: hatIds || prev.hatIds || [],
            membershipStatus: 'Active',
            participationTokenBalance: prev.participationTokenBalance || '0',
            participationTokenBalanceWei: prev.participationTokenBalanceWei || '0',
            tasksCompleted: prev.tasksCompleted || 0,
            totalVotes: prev.totalVotes || 0,
        }));
        setUserDataLoading(false);

        // Schedule a subgraph refetch to replace optimistic data with real data.
        // This is called before the transaction completes (optimistic), so we use
        // a fixed delay. The actual transaction's refresh event (via executeWithNotification)
        // will also trigger a refetch with proper _meta waiting.
        setTimeout(() => refetchUserData(), 8000);
    }, [orgId, orgUserID, refetchUserData]);

    // A failed query must settle the loading flag. Without this the Profile Hub
    // sits on its spinner forever (`isFullyLoaded` waits on !userDataLoading),
    // which is exactly the "stuck loading" a subgraph blip used to produce.
    // This is the single error path: recording the scope is what makes the
    // derived loading flag settle, so a plain setUserDataLoading(false) elsewhere
    // would not actually clear the spinner.
    //
    // Error identity, rather than the current scope id, is the freshness signal.
    // On org navigation this effect re-runs because orgUserID changes. If Apollo
    // is still exposing the exact error from the previous operation, it has
    // already been handled and must not resolve the new scope. Once Apollo clears
    // the error, a later failure is eligible to settle its own scope.
    useEffect(() => {
        if (!error) {
            handledUserErrorRef.current = null;
            return;
        }
        if (handledUserErrorRef.current === error) return;
        handledUserErrorRef.current = error;
        setUserDataLoading(false);
        setResolvedUserScope(orgUserID);
    }, [error, orgUserID]);

    // Stabilize error: only change when the message string changes, not the object reference
    const errorMessage = error?.message || null;
    const userStateIsCurrent = isUserStateCurrent({ account, orgUserID, resolvedUserScope });
    // A logged-out visitor is never "loading"; an account whose org id has not
    // resolved yet always is. See lib/user/userScope for the full rule set.
    const exposedUserDataLoading = deriveUserDataLoading({
        account,
        orgUserID,
        resolvedUserScope,
        queryLoading: userDataLoading,
    });

    const contextValue = useMemo(() => ({
        // Connected user's address (passkey smart account or EOA), auth-aware.
        // Consumers (e.g. TaskCardModal's isClaimer check) rely on this; omitting
        // it previously made `account` undefined → the claimer could never submit
        // their own task from the modal (Submit stayed disabled for everyone).
        address: effectiveAddress,
        userDataLoading: exposedUserDataLoading,
        userProposals: userStateIsCurrent ? userProposals : [],
        userData: userStateIsCurrent ? userData : {},
        graphUsername: userStateIsCurrent ? graphUsername : '',
        setGraphUsername,
        hasMemberRole,
        hasApproverRole,
        claimedTasks: userStateIsCurrent ? claimedTasks : [],
        completedModules: userStateIsCurrent ? completedModules : [],
        error: errorMessage ? { message: errorMessage } : null,
        refetchUserData,
        optimisticJoin,
    }), [
        effectiveAddress,
        exposedUserDataLoading,
        userStateIsCurrent,
        userProposals,
        userData,
        graphUsername,
        setGraphUsername,
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
