import { dueDateSec, effectiveDeadlineSec, toSec } from '@/util/deadlineUtils';

export function profileMemberSince(timestamp) {
  const seconds = toSec(timestamp);
  if (!seconds) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function profileTaskHref(task, org) {
  const query = new URLSearchParams({ org: org || '', task: task.id });
  if (task.projectId) query.set('projectId', task.projectId);
  return `/tasks/?${query.toString()}`;
}

// The account query is capped and omits deadlines/project IDs. Merge its
// assignments with the existing project feed without counting a task twice.
export function profileWork(claimedTasks = [], flatTasks = [], address) {
  const account = address?.toLowerCase();
  const fullById = new Map(flatTasks.map(task => [task.id, task]));
  const tasks = new Map();
  for (const task of claimedTasks) {
    const full = fullById.get(task.id);
    // The project feed can already know about a release or reassignment while
    // the account query is still indexing. Do not send someone to stale work.
    if (full && account && full.claimedBy?.toLowerCase() !== account) continue;
    tasks.set(task.id, { ...task, ...full });
  }
  for (const task of flatTasks) {
    if (account && task.claimedBy?.toLowerCase() === account) tasks.set(task.id, task);
  }
  return [...tasks.values()]
    .filter(task => task.status === 'Assigned' || task.status === 'Submitted')
    .map(task => ({
      ...task,
      deadline: task.status === 'Assigned' ? effectiveDeadlineSec(task) ?? dueDateSec(task) : null,
    }))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'Assigned' ? -1 : 1;
      return (a.deadline ?? Infinity) - (b.deadline ?? Infinity) || String(a.id).localeCompare(String(b.id));
    });
}

// Active proposals may have ended and be waiting for results. Only currently
// open voting belongs in this list; retain the shared feed's vote/eligibility data.
export function profileDecisions(proposals = [], nowMs = Date.now()) {
  const now = nowMs / 1000;
  return [...new Map(proposals.map(proposal => [proposal.id, proposal])).values()]
    .filter(proposal => proposal.status === 'Active'
      && Number(proposal.endTimestamp) > now
      && Number(proposal.startTimestamp || 0) <= now)
    .sort((a, b) => Number(!!a.userHasVoted) - Number(!!b.userHasVoted)
      || Number(a.endTimestamp) - Number(b.endTimestamp));
}
