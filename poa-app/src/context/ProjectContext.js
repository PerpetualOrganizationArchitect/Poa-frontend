import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery } from '@apollo/client';
import { FETCH_PROJECTS_DATA_NEW, FETCH_PROJECTS_DATA_WITH_RELEASES } from '../util/queries';
import { usePOContext } from './POContext';
import { useRefreshSubscription, RefreshEvent } from './RefreshContext';
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
    const { data, refetch } = useQuery(projectsQuery, {
        variables: { orgId: orgId },
        skip: !orgId,
        fetchPolicy: 'cache-and-network',
        pollInterval: isActive ? 40000 : 0,
        client,
    });

    // Ref-stabilize refetch so callbacks don't re-create when Apollo returns a new reference
    const refetchRef = useRef(refetch);
    refetchRef.current = refetch;

    // When the user returns (tab visible / mouse moves), refetch immediately
    // so stale data doesn't persist until the next poll tick.
    const wasActiveRef = useRef(isActive);
    useEffect(() => {
        if (isActive && !wasActiveRef.current && orgId) {
            refetchRef.current();
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

    useRefreshSubscription(
        [
            RefreshEvent.PROJECT_CREATED,
            RefreshEvent.PROJECT_DELETED,
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
    }, [data]);

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
        taskCount,
        recommendedTasks,
        nextTaskId,
        globalRolePermissions,
        // Exposed so the release ACTION can be gated on the same probe as the
        // release FIELDS. The TaskUnclaimed mapping handler ships in the same
        // subgraph release as these fields, so an endpoint that fails the probe
        // also cannot index a release — the board would show the task as still
        // claimed forever, and the next click would revert BadStatus.
        releasesSupported,
    }), [projectsData, taskCount, recommendedTasks, nextTaskId, globalRolePermissions, releasesSupported]);

    return (
        <ProjectContext.Provider value={contextValue}>
            {children}
        </ProjectContext.Provider>
    );
};
