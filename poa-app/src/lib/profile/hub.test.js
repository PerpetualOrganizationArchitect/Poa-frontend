import { describe, expect, it } from 'vitest';
import { profileDecisions, profileMemberSince, profileTaskHref, profileWork } from './hub';

describe('profile work', () => {
  it('merges account and project assignments, prioritizes deadlines, and omits completed or reassigned work', () => {
    const account = [
      { id: 'a-1', status: 'Assigned' },
      { id: 'a-2', status: 'Submitted' },
      { id: 'a-3', status: 'Assigned' },
      { id: 'a-4', status: 'Assigned' },
    ];
    const projects = [
      { id: 'a-1', status: 'Assigned', claimedBy: '0xABC', dueDate: '100', projectId: 'p-1' },
      { id: 'a-2', status: 'Submitted', claimedBy: '0xabc', absoluteDeadline: '50' },
      { id: 'a-3', status: 'Completed', claimedBy: '0xabc' },
      { id: 'a-4', status: 'Assigned', claimedBy: '0xother' },
      { id: 'b-1', status: 'Assigned', claimedBy: '0xabc', claimDeadline: '80' },
    ];
    const work = profileWork(account, projects, '0xAbC');
    expect(work.map(task => task.id)).toEqual(['b-1', 'a-1', 'a-2']);
    expect(work[1].projectId).toBe('p-1');
    expect(work[2].deadline).toBeNull();
  });

  it('keeps account assignments while project data is still loading', () => {
    expect(profileWork([{ id: 'a-1', status: 'Assigned' }], [], '0xabc')).toHaveLength(1);
  });

  it('preserves composite IDs and special characters in task navigation', () => {
    const url = new URL(profileTaskHref({ id: 'a-1', projectId: 'p-1' }, 'People & places'), 'https://poa.test');
    expect(url.searchParams.get('task')).toBe('a-1');
    expect(url.searchParams.get('projectId')).toBe('p-1');
    expect(url.searchParams.get('org')).toBe('People & places');
    expect(profileTaskHref({ id: 'a-1' }, 'Org')).not.toContain('undefined');
  });
});

describe('profile decisions', () => {
  it('shows both voting types, excludes future/ended decisions, and keeps voted decisions after unvoted ones', () => {
    const proposals = [
      { id: 'hybrid-1', status: 'Active', endTimestamp: '150', userHasVoted: true },
      { id: 'dd-1', status: 'Active', endTimestamp: '200' },
      { id: 'hybrid-2', status: 'Active', endTimestamp: '100' },
      { id: 'hybrid-3', status: 'Active', startTimestamp: '120', endTimestamp: '200' },
      { id: 'dd-2', status: 'Executed', endTimestamp: '200' },
      { id: 'dd-1', status: 'Active', endTimestamp: '200' },
    ];
    expect(profileDecisions(proposals, 100000).map(p => p.id)).toEqual(['dd-1', 'hybrid-1']);
    expect(profileDecisions(proposals, 200000)).toEqual([]);
  });
});

it('omits unknown activity dates rather than showing an invented membership date', () => {
  expect(profileMemberSince(null)).toBeNull();
  expect(profileMemberSince('0')).toBeNull();
  expect(profileMemberSince('broken')).toBeNull();
  expect(profileMemberSince('1725206400')).toBe('Sep 2024');
});
