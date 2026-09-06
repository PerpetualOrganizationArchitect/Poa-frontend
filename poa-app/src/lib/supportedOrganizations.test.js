import { describe, expect, it } from 'vitest';
import { isSupportedOrganization, supportedMemberships } from '@/lib/supportedOrganizations';
import { authorityNode } from '@/lib/accessV2/fixtures';

const org = (name, authority = authorityNode()) => ({ id: `id-${name}`, name, membershipAuthority: authority });
describe('Wave G organization support', () => {
  it.each(['Kansas Blockchain', 'KUBI', 'Decentral Park', 'Poa', 'Test6', 'A future native organization'])('keeps %s when cut over', name => {
    expect(isSupportedOrganization(org(name))).toBe(true);
  });
  it.each(['Argus', 'Test', 'Test2', 'Test3', 'tkrjehbcuebc', 'Test5', 'Kansas Blockchain'])('hides %s without authority regardless of its name', name => {
    expect(isSupportedOrganization(org(name, null))).toBe(false);
  });
  it.each([
    null, {}, authorityNode({ id: '0x' + '0'.repeat(40) }), authorityNode({ id: 'invalid' }),
    authorityNode({ isRouterBound: false }), authorityNode({ isRouterBound: 'true' }),
    authorityNode({ cutoverAt: null }), authorityNode({ cutoverAt: '0' }), authorityNode({ cutoverAt: 'invalid' }),
  ])('fails closed on incomplete, unbound or malformed cutover evidence', authority => {
    expect(isSupportedOrganization(org('Poa', authority))).toBe(false);
  });
  it('preserves paused and native V2 orgs without demanding a legacy router binding entity', () => {
    expect(isSupportedOrganization(org('Native', authorityNode({ paused: true })))).toBe(true);
  });
  it('retains entire historical rows and totals for survivors without filtering old activity', () => {
    const history = { organization: org('Kansas Blockchain'), firstSeenAt: '100', totalVotes: 32, totalTasksCompleted: 19, proposals: [{ id: 'v1-proposal', timestamp: '200' }] };
    const rows = supportedMemberships([history, { organization: org('Argus', null), totalVotes: 75 }]);
    expect(rows).toEqual([history]);
    expect(rows[0]).toBe(history);
  });
});
