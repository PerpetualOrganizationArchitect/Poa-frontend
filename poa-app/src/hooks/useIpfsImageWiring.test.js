/**
 * Profile Hub avatar wiring, enforced over the source.
 *
 * `useIpfsImage.test.js` covers source classification plus the shared avatar
 * consumers. This file pins the Profile Hub-specific boundary: neither the
 * header nor its upstream props may turn a CID into a single-gateway URL before
 * the resilient hook sees it.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '..');
const read = (...parts) => {
  try {
    return readFileSync(join(SRC, ...parts), 'utf8');
  } catch {
    return '';
  }
};

const profileHeader = read('components', 'profileHub', 'ProfileHeader.jsx');
const profilePage = read('components', 'profileHub', 'ProfileHub.jsx');
const poContext = read('context', 'POContext.js');

describe('Profile Hub avatars use the resilient IPFS image boundary', () => {
  it('ProfileHeader resolves its selected avatar CID through useIpfsImage', () => {
    expect(profileHeader).toMatch(
      /import\s+(?:useIpfsImage|\{\s*useIpfsImage\s*\})\s+from ['"]@\/hooks\/useIpfsImage['"]/
    );
    expect(profileHeader).toMatch(/useIpfsImage\s*\(/);
    expect(profileHeader).toContain('avatarCid');
    expect(profileHeader).not.toContain('ipfs.io/ipfs');
  });

  it('keeps the header input as a CID all the way from POContext', () => {
    // useIpfsImage deliberately passes normal http(s) URLs through. Feeding it
    // POContext's former ipfs.io URL would therefore bypass the fallback stack.
    expect(profilePage).toContain('avatarCidMap');
    expect(profilePage).toContain('avatarCid=');
    expect(profilePage).not.toContain('ipfs.io/ipfs');

    const mapStart = poContext.indexOf('const avatarCidMap = useMemo');
    const mapEnd = poContext.indexOf('}, [state.leaderboardData])', mapStart);
    const avatarCidMap = mapStart < 0
      ? ''
      : poContext.slice(mapStart, mapEnd < 0 ? undefined : mapEnd);
    expect(avatarCidMap, 'POContext avatar CID map was not found').toBeTruthy();
    expect(avatarCidMap).toContain('user.avatarCid');
    expect(avatarCidMap).not.toContain('ipfs.io/ipfs');
  });

  it('lets the surface its own avatar data win over an avatar-less identity record', () => {
    // findUserProfileByAddress keeps the single richest record across chains, so
    // a home-chain account with a username but no avatar can outrank the org
    // chain's record that has one. Treating that as authoritative is what made a
    // member's uploaded photo disappear from the group they uploaded it in.
    const userIdentity = read('components', 'common', 'UserIdentity.jsx');
    const leaderboardModal = read('components', 'leaderboard', 'LeaderboardUserModal.jsx');
    const header = read('components', 'profileHub', 'ProfileHeader.jsx');

    expect(userIdentity).toContain('identity?.avatarCid || avatarCidHint || null');
    expect(leaderboardModal).toContain('identity?.avatarCid || user?.avatarCid || null');
    // The Profile Hub already holds this profile's own record, so its explicit
    // prop outranks the TTL'd identity cache entirely.
    expect(header).toContain('avatarCid || identity?.avatarCid || null');

    for (const [name, source] of [
      ['UserIdentity', userIdentity],
      ['LeaderboardUserModal', leaderboardModal],
      ['ProfileHeader', header],
    ]) {
      expect(source, `${name} still discards the hint on a resolved identity`)
        .not.toContain('hasResolvedIdentity');
    }
  });
});
