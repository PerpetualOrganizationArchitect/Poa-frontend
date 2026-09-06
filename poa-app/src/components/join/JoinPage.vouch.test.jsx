import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import JoinPage from '@/components/join/JoinPage';
import SubjectVouchPanel from '@/components/accessV2/SubjectVouchPanel';

const state = vi.hoisted(() => ({
  viewer: '0x' + 'a'.repeat(40),
  query: {}, actions: [], vouch: null, revoke: null, viewerHasVouched: false, username: null,
}));
vi.mock('@chakra-ui/react', async () => (await import('@/test/mockChakra')).mockChakra(state.actions));
vi.mock('next/router', () => ({ useRouter: () => ({ query: state.query, push: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ children }) => children }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: true, accountAddress: state.viewer }) }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => ({ orgName: 'Test6', quickJoinContractAddress: null }) }));
vi.mock('@/context/UserContext', () => ({ useUserContext: () => ({ graphUsername: 'alice' }) }));
vi.mock('@/context/IdentityContext', () => ({ useIdentity: () => ({ username: state.username }) }));
vi.mock('@/hooks/useIpfsImage', () => ({ default: () => null }));
vi.mock('@/hooks/useWeb3Services', () => ({ useWeb3: () => ({ organization: null }) }));
vi.mock('@/hooks/useAuthorityJoinRoles', () => ({ useAuthorityJoinRoles: () => ({
  roles: [{ subjectId: '123', name: 'Delegates', vouchConfig: { quorum: 1, enabled: true } }],
  authority: { enabled: true, paused: false }, loading: false, error: null,
  states: { 123: { reason: 3 } }, refetch: vi.fn(),
}) }));
vi.mock('@/hooks/accessV2', () => ({
  useAuthorityActions: () => ({ claim: vi.fn(), vouch: state.vouch, revokeVouch: state.revoke, isBusy: () => false }),
  useSubjectVouches: () => ({
    config: { enabled: true, quorum: 1 }, records: [],
    progress: { count: 0, quorum: 1, met: false, stale: 0 }, progressCopy: '0 of 1 vouches',
    vouchGate: { can: true }, viewerHasVouched: state.viewerHasVouched, enabled: true,
    refetch: vi.fn(), subject: { name: 'Delegates' },
  }),
}));
vi.mock('@/components/shared/OrgDeadEnd', () => ({ useOrgGate: () => null }));
vi.mock('@/components/common/SEOHead', () => ({ default: () => null }));
vi.mock('@/templateComponents/studentOrgDAO/NavBar', () => ({ default: () => null }));
vi.mock('@/components/common/AccountControl', () => ({ default: () => 'Signed in as Alice' }));
vi.mock('@/components/passkey/SignInModal', () => ({ default: () => null }));
vi.mock('@/components/passkey/SolidarityOnboardingModal', () => ({ default: () => null }));
vi.mock('@/components/passkey/PasskeyOnboardingModal', () => ({ default: () => null }));
vi.mock('@/components/account/SignupModal', () => ({ default: () => null }));
vi.mock('@/components/zkEmail/EmailInviteCard', () => ({ default: () => null }));
vi.mock('@/components/shared/PulseLoader', () => ({ default: () => null }));

describe('shared vouch links identify the authority action recipient', () => {
  beforeEach(() => {
    state.query = {};
    state.actions.length = 0;
    state.vouch = vi.fn().mockResolvedValue({ success: true });
    state.revoke = vi.fn().mockResolvedValue({ success: true });
    state.viewerHasVouched = false;
    state.username = null;
  });
  const button = label => {
    const action = state.actions.find(candidate => candidate.children === label);
    expect(action).toBeDefined();
    expect(action.isDisabled).toBeFalsy();
    return action;
  };

  it.each([
    ['subjectId', '0x' + 'b'.repeat(40), 'bob'],
    ['hatId', '0x' + 'Ab'.repeat(20), null],
  ])('shows the exact recipient before vouching through a %s link', async (key, target, username) => {
    state.query = { [key]: '123', vouch: target };
    state.username = username;
    const html = renderToStaticMarkup(React.createElement(JoinPage));
    expect(target.toLowerCase()).not.toBe(state.viewer);
    expect(html).toContain('Vouching for');
    expect(html).toContain(target);
    if (username) expect(html).toContain(username);
    expect(html.indexOf(target)).toBeLessThan(html.indexOf('Vouch for them'));
    await button('Vouch for them').onClick();
    expect(state.vouch).toHaveBeenCalledWith('123', target);
  });

  it('shows the viewer as recipient when checking their own vouches', () => {
    const html = renderToStaticMarkup(React.createElement(JoinPage));
    expect(html).toContain(state.viewer);
    expect(html).toContain('Vouching for');
  });

  it('keeps recipient identity on the shared panel when revoking from another caller', async () => {
    const target = '0x' + 'c'.repeat(40);
    state.viewerHasVouched = true;
    const html = renderToStaticMarkup(React.createElement(SubjectVouchPanel, { subjectId: '456', user: target }));
    expect(html).toContain(target);
    expect(html.indexOf(target)).toBeLessThan(html.indexOf('Take back my vouch'));
    await button('Take back my vouch').onClick();
    expect(state.revoke).toHaveBeenCalledWith('456', target);
    expect(state.vouch).not.toHaveBeenCalled();
  });
});
