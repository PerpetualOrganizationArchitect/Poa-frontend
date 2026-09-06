import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ProfilePage from '@/pages/profile';
import { PERM_KEYS } from '@/lib/accessV2/permKeys';

const state = vi.hoisted(() => ({ grants: [], legacyGrant: true, enabled: true, authority: {}, roles: [], memberships: {}, subjectLoading: false, subjectError: null, activity: null, tokens: null }));
vi.mock('@chakra-ui/react', async () => (await import('@/test/mockChakra')).mockChakra());
vi.mock('next/router', () => ({ useRouter: () => ({ query: {}, push: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ children }) => children }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ accountAddress: '0x' + 'a'.repeat(40), isAuthenticated: true, isAuthHydrated: true }) }));
vi.mock('@/context/UserContext', () => ({ useUserContext: () => ({ claimedTasks: [{ id: 'old-task' }], graphUsername: 'alice', userDataLoading: false, hasMemberRole: state.legacyGrant, hasApproverRole: state.legacyGrant, userData: { hatIds: ['999'], participationTokenBalance: '42', tasksCompleted: 7, totalVotes: 8, firstSeenAt: '1700000000' } }) }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => ({ tokenLabel: 'TEST' }) }));
vi.mock('@/context/ProjectContext', () => ({ useProjectContext: () => ({ recommendedTasks: [{ id: 'recommended' }], projectsLoading: false }) }));
vi.mock('@/hooks', () => ({ useOrgTheme: () => ({ pageBackground: () => 'black', onBackground: 'white' }), useOrgStructure: () => ({ orgName: 'Test6', roles: [{ hatId: '999', name: 'Retired role', defaultEligible: true }], eligibilityModuleAddress: '0x' + '9'.repeat(40), permissionsMatrix: [], loading: false }) }));
vi.mock('@/hooks/useOrgName', () => ({ useOrgName: () => 'Test6' }));
vi.mock('@/hooks/useGlobalAccount', () => ({ useGlobalAccount: () => ({ profileMetadata: {} }) }));
vi.mock('@/hooks/accessV2', () => ({
  useAuthoritySubjects: () => ({ enabled: state.enabled, authority: state.authority, roles: state.roles, loading: state.subjectLoading, error: state.subjectError }),
  useMyMemberships: () => state.memberships,
}));
vi.mock('@/components/TaskManager/views/useFlatTasks', () => ({ useAllProjectsFlatTasks: () => [{ id: 'old-task', completedAt: '1700000000' }] }));
vi.mock('@/components/shared/OrgDeadEnd', () => ({ useOrgGate: () => null }));
vi.mock('@/components/shared/PulseLoader', () => ({ default: () => 'Loading authority' }));
vi.mock('@/components/common/SEOHead', () => ({ default: () => null }));
vi.mock('@/templateComponents/studentOrgDAO/NavBar', () => ({ default: () => null }));
vi.mock('@/components/userPage/AccountSettingsModal', () => ({ default: () => null }));
vi.mock('@/components/profile/EditProfileModal', () => ({ default: () => null }));
vi.mock('@/components/common/AccountControl', () => ({ default: () => null }));
vi.mock('@/components/profileHub/ProfileHeader', () => ({ default: ({ userRoles, canApproveRequests }) => <div>{userRoles.map(r => r.name).join(',')}{canApproveRequests && 'Approvals enabled'}</div> }));
vi.mock('@/components/profileHub/ExecutiveMenuModal', () => ({ default: ({ hasApproverRole }) => hasApproverRole ? 'Approval menu enabled' : null }));
vi.mock('@/components/profileHub/TokenRequestCard', () => ({ default: () => 'Contribution request enabled' }));
vi.mock('@/components/profileHub/TokenActivityCard', () => ({ default: props => { state.tokens = props; return props.children; } }));
vi.mock('@/components/profileHub/ProfileActivity', () => ({ default: props => { state.activity = props; return null; } }));
vi.mock('@/components/profileHub/UserRolesCard', () => ({ default: ({ roles }) => roles.map(r => r.name).join(',') }));
vi.mock('@/components/orgStructure/VouchProgressBar', () => ({ VouchProgressBar: () => null }));

describe('redesigned profile page retains authority-only behavior', () => {
  beforeEach(() => {
    Object.assign(state, { grants: [], legacyGrant: true, enabled: true, authority: { loading: false, error: null }, subjectLoading: false, subjectError: null, activity: null, tokens: null });
    state.roles = [{ subjectId: '123', name: 'Current authority role', permEffective: key => state.grants.includes(key) ? 1n : 0n }];
    state.memberships = { rows: [{ subjectId: '123', isMember: true }], claimable: [], loading: false, error: null };
  });
  const render = () => renderToStaticMarkup(React.createElement(ProfilePage));

  it('uses current role permissions despite contradictory legacy grants and retains activity', () => {
    const html = render();
    expect(html).toContain('Current authority role');
    expect(html).not.toContain('Retired role');
    expect(html).not.toContain('Approvals enabled');
    expect(html).not.toContain('Approval menu enabled');
    expect(html).not.toContain('Contribution request enabled');
    expect(html).not.toContain('Available to join');
    expect(state.tokens).toMatchObject({ ptBalance: 42, tasksCompleted: 7, totalVotes: 8 });
    expect(state.activity).toMatchObject({ claimedTasks: [{ id: 'old-task' }], flatTasks: [{ id: 'old-task', completedAt: '1700000000' }], recommendedTasks: [{ id: 'recommended' }] });
  });

  it('allows authority PT_APPROVE and PT_MEMBER even when legacy booleans deny them', () => {
    state.grants = [PERM_KEYS.PT_APPROVE, PERM_KEYS.PT_MEMBER];
    state.legacyGrant = false;
    const html = render();
    expect(html).toContain('Approvals enabled');
    expect(html).toContain('Approval menu enabled');
    expect(html).toContain('Contribution request enabled');
  });

  it.each(['disabled', 'authority', 'subjects', 'memberships'])('withholds the profile while %s is unavailable', kind => {
    state.grants = [PERM_KEYS.PT_APPROVE, PERM_KEYS.PT_MEMBER];
    if (kind === 'disabled') state.enabled = false;
    if (kind === 'authority') state.authority.loading = true;
    if (kind === 'subjects') state.subjectLoading = true;
    if (kind === 'memberships') state.memberships.loading = true;
    expect(render()).toContain('Loading authority');
    expect(state.tokens).toBeNull();
    expect(state.activity).toBeNull();
  });

  it.each(['authority', 'subjects', 'memberships'])('fails closed when %s errors', kind => {
    const error = new Error('Unavailable');
    if (kind === 'authority') state.authority.error = error;
    if (kind === 'subjects') state.subjectError = error;
    if (kind === 'memberships') state.memberships.error = error;
    expect(render()).toContain('We couldn’t load your roles.');
    expect(state.tokens).toBeNull();
  });

  it('passes explicit empty claimables to the real progression card', () => {
    state.roles.push({ subjectId: '124', name: 'Pending authority role', vouchConfig: { quorum: 2, enabled: true } }, { subjectId: '125', name: 'Stale default role', defaultEligible: true });
    state.memberships.rows.push({ subjectId: '124', isMember: false, claimable: false, vouchCount: 1 });
    const html = render();
    expect(html).toContain('1 of 2 endorsements');
    expect(html).not.toContain('Available to join');
    expect(html).not.toContain('View Stale default role');
  });
});
