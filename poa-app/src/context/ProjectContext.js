import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery } from '@apollo/client';
import { FETCH_PROJECTS_DATA_NEW, FETCH_PROJECTS_DATA_WITH_RELEASES, FETCH_PROJECT_MANAGERS } from '../util/queries';
import { usePOContext } from './POContext';
import { useRefreshSubscription, RefreshEvent } from './RefreshContext';
import { PROJECT_AUTHORITY_EVENTS, trackAuthorityRefresh } from '../util/authorityEvents';
import { formatTokenAmount } from '../util/formatToken';
import { getTokenByAddress } from '../util/tokens';
import { useUserActive } from '../hooks/useUserActive';
import { useSubgraphClient } from '../util/apolloClient';
import { hasCapability, peekCapability, CAPABILITY } from '../util/subgraphCapabilities';

const ProjectContext = createContext();

export const useProjectContext = () => useContext(ProjectContext);

const STATUS_TO_COLUMN = {
    'Open': 'Open',
    'Assigned': 'In Progress',
    'Submitted': 'In Review',
    'Completed': 'Completed',
    'Cancelled': null,
};

export const ProjectProvider = ({ children }) => {
    const [projectsData, setProjectsData] = useState([]);
    const [nextTaskId, setNextTaskId] = useState(0);
    // Org-wide ROLE_PERM grants, lifted to state so consumers can read them without a
    // project in hand (e.g. the Create Project modal, which shows them as a baseline
    // even when the org has zero projects yet).
    const [globalRolePermissions, setGlobalRolePermissions] = useState([]);
    // True from the moment an authority-changing event fires until BOTH authority
    // documents have answered again. See `authorityRefreshing` below.
    const [authorityRefreshing, setAuthorityRefreshing] = useState(false);
    const { orgId, subgraphUrl } = usePOContext();

    const client = useSubgraphClient(subgraphUrl);
    const isActive = useUserActive();

    // TaskManager v7 claim-release fields (subgraph-pop #201) only exist on newer
    // deployments, and one unknown field fails the WHOLE query — which here would
    // blank the entire task board. So probe first and upgrade the document only
    // once the serving endpoint is known to have them.
    //
    // Seed synchronously from the cached answer: starting at `false` and flipping
    // after the async probe renders once with the base document — enough for
    // Apollo to put it on the wire — and then fetches the whole board a SECOND
    // time with the rich one, on every load and every org switch. peekCapability
    // returns undefined when genuinely unknown, where base-first is correct.
    const [releasesSupported, setReleasesSupported] = useState(
        () => peekCapability(subgraphUrl, CAPABILITY.TASK_RELEASES) === true
    );
    useEffect(() => {
        let cancelled = false;
        // Re-seed on endpoint change: a different chain may serve an older schema.
        setReleasesSupported(peekCapability(subgraphUrl, CAPABILITY.TASK_RELEASES) === true);
        if (!subgraphUrl) return undefined;
        hasCapability(subgraphUrl, CAPABILITY.TASK_RELEASES).then((has) => {
            if (!cancelled) setReleasesSupported(!!has);
        });
        return () => { cancelled = true; };
    }, [subgraphUrl]);

    const projectsQuery = releasesSupported ? FETCH_PROJECTS_DATA_WITH_RELEASES : FETCH_PROJECTS_DATA_NEW;

    // pollInterval keeps task data fresh. cache-and-network shows cached data instantly.
    // 40s balances liveness against The Graph Studio rate limits.
    // Polling pauses when the tab is hidden or the user is idle (useUserActive).
    const { data, error, refetch } = useQuery(projectsQuery, {
        variables: { orgId: orgId },
        skip: !orgId,
        fetchPolicy: 'cache-and-network',
        pollInterval: isActive ? 40000 : 0,
        client,
    });

    // Project managers ride in a SEPARATE document so an endpoint that lacks
    // `Project.managers` degrades to "no manager bypass" instead of blanking the
    // board (see FETCH_PROJECT_MANAGERS). Managers only change via createProject
    // or the executor-only setConfig(PROJECT_MANAGER, ...), so no poll — the
    // refresh subscription below (plus the tab-return refetch) covers both, and is
    // also how a failed initial fetch recovers.
    const { data: managersData, refetch: refetchManagers } = useQuery(FETCH_PROJECT_MANAGERS, {
        variables: { orgId: orgId },
        skip: !orgId,
        fetchPolicy: 'cache-first',
        client,
    });


    const managersByProjectId = useMemo(() => {
        const map = new Map();
        (managersData?.organization?.taskManager?.projects || []).forEach((p) => {
            map.set(p.id, (p.managers || []).map((m) => String(m.manager).toLowerCase()));
        });
        return map;
    }, [managersData]);

    // Reset the board the moment the org changes — otherwise the previous org's
    // projects survive until (and unless) the new org's query answers with a
    // taskManager, and actions would pair the new org's TaskManager address
    // with the old org's composite ids.
    const prevOrgIdRef = useRef(orgId);
    useEffect(() => {
        if (prevOrgIdRef.current === orgId) return;
        prevOrgIdRef.current = orgId;
        setProjectsData([]);
        setNextTaskId(0);
        setGlobalRolePermissions([]);
    }, [orgId]);

    // True while this org's query has not answered yet (Apollo clears `data`
    // when variables change; cache-and-network serves a revisit instantly from
    // cache). Lets pages show a loader instead of a false "no projects" state.
    // `!error` is the escape hatch: a persistent subgraph failure must render
    // the (empty) board rather than an infinite spinner — the 40s poll then
    // heals the board when the endpoint recovers.
    const projectsLoading = !!orgId && !data && !error;

    // Ref-stabilize refetch so callbacks don't re-create when Apollo returns a new reference
    const refetchRef = useRef(refetch);
    refetchRef.current = refetch;
    const refetchManagersRef = useRef(refetchManagers);
    refetchManagersRef.current = refetchManagers;

    // When the user returns (tab visible / mouse moves), refetch immediately
    // so stale data doesn't persist until the next poll tick.
    const wasActiveRef = useRef(isActive);
    useEffect(() => {
        if (isActive && !wasActiveRef.current && orgId) {
            refetchRef.current();
            // The managers document has no poll of its own, so this is also how a
            // failed initial fetch recovers — without it, one bad response would
            // disable the project-manager bypass for the rest of the session.
            refetchManagersRef.current();
        }
        wasActiveRef.current = isActive;
    }, [isActive, orgId]);

    // Refetch immediately — executeWithNotification already waited for the
    // subgraph to index the transaction block before emitting the event.
    const handleRefresh = useCallback(() => {
        if (orgId) {
            refetchRef.current();
        }
    }, [orgId]);

    // Creating or deleting a project also changes its manager set (the creator is
    // auto-added on-chain), so those two events refresh the managers document too.
    //
    // These are also the only events that can change authority, so this is where the
    // answer becomes known-suspect. Both documents carry an authority input — managers
    // here, the per-hat role masks on the board — and they are two INDEPENDENT requests.
    // The gate has to stay open until both have answered: the managers document is a
    // fraction of the size of the board (which drags every task and its metadata along)
    // and reliably lands first, so clearing on it alone would re-arm the refusal while
    // the mask grant was still in flight — the exact false denial this is here to stop.
    //
    // `trackAuthorityRefresh` is where the all-must-settle rule lives, and is unit-tested.
    const handleProjectSetChange = useCallback(() => {
        if (!orgId) return;
        trackAuthorityRefresh(setAuthorityRefreshing, [
            () => refetchRef.current(),
            () => refetchManagersRef.current(),
        ]);
    }, [orgId]);

    // PROJECT_CREATED / PROJECT_DELETED / PROPOSAL_COMPLETED — setConfig(PROJECT_MANAGER, ...)
    // and setProjectRolePerm are both executor-only, so a passing proposal is the only
    // other in-app route. Shared with the gate's test via util/authorityEvents.
    useRefreshSubscription(
        PROJECT_AUTHORITY_EVENTS,
        handleProjectSetChange,
        [handleProjectSetChange]
    );

    useRefreshSubscription(
        [
            // PROJECT_CREATED / PROJECT_DELETED are handled by handleProjectSetChange
            // above, which also refreshes the managers document.
            RefreshEvent.PROJECT_BUDGET_UPDATED,
            RefreshEvent.TASK_CREATED,
            RefreshEvent.TASK_CLAIMED,
            RefreshEvent.TASK_SUBMITTED,
            RefreshEvent.TASK_COMPLETED,
            RefreshEvent.TASK_UPDATED,
            RefreshEvent.TASK_CANCELLED,
            RefreshEvent.TASK_REJECTED,
            RefreshEvent.TASK_ASSIGNED,
            RefreshEvent.TASK_UNCLAIMED,
            RefreshEvent.TASK_APPLICATION_SUBMITTED,
            RefreshEvent.TASK_APPLICATION_APPROVED,
        ],
        handleRefresh,
        [handleRefresh]
    );

    useEffect(() => {
        if (data?.organization?.taskManager) {
            const projects = data.organization.taskManager.projects || [];
            // Org-wide ROLE_PERM grants — shared across every project under this TaskManager.
            // Attach to each transformed project so consumers can mirror the contract's
            // _permMask fallback: project mask wins if non-zero, else fall back to global.
            // Also surfaced at the context level (below) for consumers that need the org-wide
            // grants without a project — e.g. the Create Project modal's baseline display.
            const globalPerms = data.organization.taskManager.globalRolePermissions || [];
            setGlobalRolePermissions(globalPerms);

            // Transform projects for kanban board
            const transformedProjects = projects.map(project => {
                const projectTitle = project.title || 'Indexing...';
                const transformedProject = {
                    id: project.id,
                    title: projectTitle,
                    name: projectTitle, // Alias for TaskManager components
                    metadataHash: project.metadataHash,
                    // Use indexed metadata from subgraph as primary source
                    description: project.metadata?.description || '',
                    // createdAt is indexed by the subgraph (unix seconds string); surfaced in the
                    // project info modal's stats. May be undefined on optimistic/indexing projects.
                    createdAt: project.createdAt,
                    cap: project.cap,
                    spent: project.spent || '0',
                    bountyCaps: project.bountyCaps || [],
                    rolePermissions: project.rolePermissions || [],
                    globalRolePermissions: globalPerms,
                    // Active project managers (lowercased). The contract's `_isPM` bypass —
                    // arrives from its own document, so it may be [] for a beat on first paint.
                    managers: managersByProjectId.get(project.id) || [],
                    // Whether that [] means "no managers" or "not here yet", answered PER
                    // PROJECT rather than per org. The distinction is load-bearing for gates
                    // that DENY (see `permissionGate` in util/permissions): a project the
                    // board knows about but the managers document has not returned yet — a
                    // brand-new project between the board's poll and the managers refetch —
                    // would otherwise be certified as "this project has no managers" and
                    // hard-deny the very people who manage it. Absent/failed/unsupported
                    // `Project.managers` leaves this false everywhere, which is the
                    // documented "no manager bypass" degradation rather than a denial.
                    managersLoaded: managersByProjectId.has(project.id),
                    columns: [
                        { id: 'open', title: 'Open', tasks: [] },
                        { id: 'inProgress', title: 'In Progress', tasks: [] },
                        { id: 'inReview', title: 'In Review', tasks: [] },
                        { id: 'completed', title: 'Completed', tasks: [] },
                    ],
                };

                (project.tasks || []).forEach(task => {
                    if (task.status === 'Cancelled') return;

                    const taskTitle = task.title || 'Indexing...';
                    const taskPayout = formatTokenAmount(task.payout || '0');
                    const bountyTokenInfo = getTokenByAddress(task.bountyToken);
                    const transformedTask = {
                        id: task.id,
                        taskId: task.taskId,
                        title: taskTitle,
                        name: taskTitle, // Alias for TaskManager components
                        // Use indexed metadata from subgraph as primary source.
                        // Use ?? (not ||) to preserve empty strings as valid values
                        // and keep null to signal "not yet loaded" for the IPFS fallback.
                        description: task.metadata?.description ?? null,
                        difficulty: task.metadata?.difficulty ?? 'medium',
                        estHours: task.metadata?.estimatedHours ?? 1,
                        // Raw hashes for IPFS fallback if indexed data is missing
                        metadataHash: task.metadataHash,
                        submissionHash: task.submissionHash,
                        // Submission text from subgraph (stored in metadata entity)
                        submission: task.metadata?.submission ?? null,
                        claimedBy: task.assignee || '',
                        payout: taskPayout,
                        Payout: taskPayout, // Alias with capital P for TaskCard
                        kubixPayout: taskPayout, // Alias for TaskColumn
                        bountyToken: task.bountyToken,
                        bountyPayoutRaw: task.bountyPayout || '0',
                        bountyPayout: formatTokenAmount(task.bountyPayout || '0', bountyTokenInfo.decimals, bountyTokenInfo.decimals <= 6 ? 2 : 2),
                        projectId: project.id,
                        status: task.status,
                        claimerUsername: task.assigneeUsername || '',
                        completerUsername: task.completerUsername || '',
                        requiresApplication: task.requiresApplication,
                        applications: task.applications || [],
                        // Transform applications to applicants format for TaskCardModal
                        applicants: (task.applications || []).map(app => ({
                            address: app.applicant,
                            username: app.applicantUsername || '',
                            applicationHash: app.applicationHash,
                            approved: app.approved,
                            appliedAt: app.appliedAt,
                        })),
                        rejectionHash: task.rejectionHash,
                        rejectionCount: task.rejectionCount || 0,
                        rejectionReason: (task.rejections || []).find(r => r.metadata?.rejection)?.metadata?.rejection || '',
                        rejections: (task.rejections || []).map(r => ({
                            rejectorUsername: r.rejectorUsername || '',
                            rejectedAt: r.rejectedAt,
                        })),
                        isIndexing: !task.title,
                        createdAt: task.createdAt,
                        assignedAt: task.assignedAt,
                        submittedAt: task.submittedAt,
                        completedAt: task.completedAt,
                        // ---- Deadlines (TaskManager v6) ----
                        // Raw subgraph passthrough (string seconds or null); consumers
                        // normalize via deadlineUtils.toSec (0/'0' also mean unset).
                        completionWindow: task.completionWindow ?? null,
                        absoluteDeadline: task.absoluteDeadline ?? null,
                        claimDeadline: task.claimDeadline ?? null,
                        reclaimCount: task.reclaimCount || 0,
                        claimExpiries: task.claimExpiries || [],
                        // v7 claim release. Absent whenever the endpoint predates
                        // subgraph-pop #201 (or Apollo replays a cache entry that
                        // was normalized before the capability probe flipped), so
                        // these must default rather than assume the richer query ran.
                        releaseCount: task.releaseCount || 0,
                        lastReleasedAt: task.lastReleasedAt ?? null,
                        releases: task.releases || [],
                        // Soft due date lives in the IPFS metadata (unix seconds).
                        dueDate: task.metadata?.dueDate != null ? Number(task.metadata.dueDate) : null,
                    };

                    const columnTitle = STATUS_TO_COLUMN[task.status] || 'Open';
                    const column = transformedProject.columns.find(c => c.title === columnTitle);
                    if (column) {
                        column.tasks.push(transformedTask);
                    }
                });

                return transformedProject;
            });

            // Compute nextTaskId from raw data (includes cancelled tasks) so optimistic
            // IDs never collide with cancelled task IDs that are filtered from projectsData.
            let maxTaskId = -1;
            projects.forEach(project => {
                (project.tasks || []).forEach(task => {
                    const numId = parseInt(task.taskId, 10);
                    if (!isNaN(numId) && numId > maxTaskId) maxTaskId = numId;
                });
            });
            setNextTaskId(maxTaskId + 1);

            setProjectsData(transformedProjects);
        }
        // managersByProjectId is a dep so the board re-transforms when the (separate,
        // usually slower) managers document lands and PM affordances appear without a reload.
    }, [data, managersByProjectId]);

    // Derive taskCount from projectsData (correctly excludes cancelled tasks)
    const taskCount = useMemo(() => {
        let totalTasks = 0;
        projectsData.forEach(project => {
            project.columns?.forEach(col => {
                totalTasks += col.tasks?.length || 0;
            });
        });
        return totalTasks;
    }, [projectsData]);

    // Derive recommended (open) tasks from projectsData
    const recommendedTasks = useMemo(() => {
        return projectsData.flatMap(project =>
            (project.columns?.find(c => c.id === 'open')?.tasks || []).map(task => ({
                ...task,
                projectTitle: project.title,
            }))
        );
    }, [projectsData]);

    const contextValue = useMemo(() => ({
        projectsData,
        projectsLoading,
        taskCount,
        recommendedTasks,
        nextTaskId,
        globalRolePermissions,
        // True from an authority-changing event until both authority documents have
        // answered again. Gates that REFUSE must treat it as "not resolved"; gates that
        // merely reveal an affordance can ignore it.
        authorityRefreshing,
        // Exposed so the release ACTION can be gated on the same probe as the
        // release FIELDS. The TaskUnclaimed mapping handler ships in the same
        // subgraph release as these fields, so an endpoint that fails the probe
        // also cannot index a release — the board would show the task as still
        // claimed forever, and the next click would revert BadStatus.
        releasesSupported,
    }), [projectsData, projectsLoading, taskCount, recommendedTasks, nextTaskId, globalRolePermissions, authorityRefreshing, releasesSupported]);

    return (
        <ProjectContext.Provider value={contextValue}>
            {children}
        </ProjectContext.Provider>
    );
};
