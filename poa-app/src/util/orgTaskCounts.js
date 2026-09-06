const PAGE_SIZE = 1000;

const TASK_COUNTS_QUERY = `
  query ExploreTaskCounts($managers: [Bytes!]!, $after: ID!) {
    tasks(
      first: ${PAGE_SIZE}
      orderBy: id
      orderDirection: asc
      where: {
        taskManager_in: $managers
        id_gt: $after
        status_in: ["Open", "Assigned", "Submitted", "Completed"]
        project_: { deleted: false }
      }
    ) {
      id
      taskManager
      status
    }
  }
`;

// Count minimal task rows across every page, so large organizations are not
// silently capped by the subgraph's collection limit. Call per source: the
// same contract address can exist in more than one registry.
export async function fetchOrgTaskCounts(endpoint, managerIds, fetchImpl = fetch) {
  const counts = Object.fromEntries(managerIds.map((id) => [id, { open: 0, total: 0 }]));
  if (!managerIds.length) return counts;

  const signal = AbortSignal.timeout(8000);
  let after = "";
  while (true) {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: TASK_COUNTS_QUERY, variables: { managers: managerIds, after } }),
      signal,
    });
    if (!response.ok) throw new Error('Task counts unavailable');
    const result = await response.json();
    if (result.errors?.length || !Array.isArray(result.data?.tasks)) {
      throw new Error('Task counts unavailable');
    }

    const tasks = result.data.tasks;
    for (const task of tasks) {
      const count = counts[task.taskManager];
      if (!count) continue;
      count.total += 1;
      if (task.status === 'Open') count.open += 1;
    }
    if (tasks.length < PAGE_SIZE) return counts;

    const nextCursor = tasks[tasks.length - 1].id;
    if (!nextCursor || nextCursor <= after) throw new Error('Task pagination did not advance');
    after = nextCursor;
  }
}
