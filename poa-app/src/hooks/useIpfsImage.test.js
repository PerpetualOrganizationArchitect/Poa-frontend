import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('@/context/ipfsContext', () => ({
  useIPFScontext: () => ({}),
}));

import { classifyIpfsImageSource } from './useIpfsImage';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '..');
const read = (...parts) => readFileSync(join(SRC, ...parts), 'utf8');

describe('classifyIpfsImageSource', () => {
  it('passes browser-ready URLs through unchanged', () => {
    for (const source of [
      'https://images.example/avatar.png',
      'http://images.example/avatar.png',
      '//images.example/avatar.png',
      'blob:https://poa.box/1234',
      'data:image/png;base64,AAAA',
    ]) {
      expect(classifyIpfsImageSource(source)).toEqual({ kind: 'direct', value: source });
    }
  });

  it('normalizes bare CIDs and IPFS URI forms for the shared loader', () => {
    const cid = 'QmcJmonrdFPySQZftHRtvzoWePiGwNeG7wn35Z2qkJbbae';
    expect(classifyIpfsImageSource(cid)).toEqual({ kind: 'ipfs', value: cid });
    expect(classifyIpfsImageSource(`ipfs://${cid}`)).toEqual({ kind: 'ipfs', value: cid });
    expect(classifyIpfsImageSource(`ipfs://ipfs/${cid}`)).toEqual({ kind: 'ipfs', value: cid });
    expect(classifyIpfsImageSource(`/ipfs/${cid}`)).toEqual({ kind: 'ipfs', value: cid });
  });

  it('recovers CIDs from HTTP gateway URLs instead of bypassing the fallback stack', () => {
    const cid = 'QmcJmonrdFPySQZftHRtvzoWePiGwNeG7wn35Z2qkJbbae';
    expect(classifyIpfsImageSource(`https://ipfs.io/ipfs/${cid}`)).toEqual({
      kind: 'ipfs',
      value: cid,
    });
    expect(classifyIpfsImageSource(`https://api.thegraph.com/ipfs/${cid}?download=1#avatar`)).toEqual({
      kind: 'ipfs',
      value: cid,
    });
    expect(classifyIpfsImageSource(`//gateway.pinata.cloud/ipfs/${cid}/avatar.png`)).toEqual({
      kind: 'ipfs',
      value: `${cid}/avatar.png`,
    });
    const cidV1 = 'bafybeigprb5sszgq2zpupgeoddj7hvimnxdfivgwp3nennfdinxbduqoe4';
    expect(classifyIpfsImageSource(`https://${cidV1}.ipfs.dweb.link/avatar.png`)).toEqual({
      kind: 'ipfs',
      value: `${cidV1}/avatar.png`,
    });
  });

  it('does not reinterpret an ordinary HTTP /ipfs/ route without a CID', () => {
    for (const source of [
      'https://images.example/ipfs/default-avatar.png',
      'https://images.example/ipfs/badge.png',
      'https://images.example/ipfs/backgroundbannerimages',
    ]) {
      expect(classifyIpfsImageSource(source)).toEqual({ kind: 'direct', value: source });
    }
  });

  it('treats absent and whitespace-only values as empty', () => {
    expect(classifyIpfsImageSource()).toEqual({ kind: 'empty', value: null });
    expect(classifyIpfsImageSource(null)).toEqual({ kind: 'empty', value: null });
    expect(classifyIpfsImageSource('   ')).toEqual({ kind: 'empty', value: null });
    expect(classifyIpfsImageSource('ipfs://')).toEqual({ kind: 'empty', value: null });
    expect(classifyIpfsImageSource('/ipfs/')).toEqual({ kind: 'empty', value: null });
  });

  it('keeps a CID that addresses a file inside a directory', () => {
    const cid = 'QmcJmonrdFPySQZftHRtvzoWePiGwNeG7wn35Z2qkJbbae';
    expect(classifyIpfsImageSource(`${cid}/avatar.png`)).toEqual({
      kind: 'ipfs',
      value: `${cid}/avatar.png`,
    });
  });

  it('passes an on-chain bytes32 hash through for normalization', () => {
    const bytes32 = `0x${'ab'.repeat(32)}`;
    expect(classifyIpfsImageSource(bytes32)).toEqual({ kind: 'ipfs', value: bytes32 });
  });

  it('does not turn an unresolvable bare string into a gateway request', () => {
    // Anything that is not a real CID could only 404. Sending it would also
    // make an empty-avatar profile look like a failing network call.
    for (const source of [
      'undefined',
      'null',
      'default-avatar.png',
      'hudsonhrh.eth',
      'Qmnotacid',
      'QmcJmonrdFPySQZftHRtvzoWePiGwNeG7wn35Z2qkJbba',   // one char short
      'QmcJmonrdFPySQZftHRtvzoWePiGwNeG7wn35Z2qkJbbaex', // one char long
      '0xdeadbeef',
    ]) {
      expect(classifyIpfsImageSource(source), `sent ${source} to IPFS`)
        .toEqual({ kind: 'empty', value: null });
    }
  });
});

describe('profile avatar source wiring', () => {
  const consumers = [
    ['UserIdentity', read('components', 'common', 'UserIdentity.jsx')],
    ['AvatarUpload', read('components', 'account', 'AvatarUpload.jsx')],
    ['LeaderboardUserModal', read('components', 'leaderboard', 'LeaderboardUserModal.jsx')],
    ['public profile', read('pages', 'u', 'index.js')],
  ];

  it('routes every requested consumer through useIpfsImage', () => {
    for (const [name, source] of consumers) {
      expect(source, `${name} does not import the shared hook`).toContain("from '@/hooks/useIpfsImage'");
      expect(source, `${name} does not invoke the shared hook`).toMatch(/useIpfsImage\(/);
    }
  });

  it('does not restore the unreliable direct ipfs.io avatar path', () => {
    for (const [name, source] of consumers) {
      expect(source, `${name} contains a direct ipfs.io avatar URL`).not.toContain('ipfs.io/ipfs');
    }
  });

  it('ignores stale async results without aborting the provider cache', () => {
    const hook = read('hooks', 'useIpfsImage.js');
    // The design constraint, not the variable names: several avatars can be
    // awaiting the *same* cached provider promise, so a stale render must drop
    // its result rather than abort a request other consumers still need.
    expect(hook, 'aborting would cancel a shared, cached fetch').not.toMatch(/AbortController|\.abort\(/);
    // Unmount/re-render must install a cleanup, and no result may be published
    // without first consulting the guard that cleanup flips.
    expect(hook, 'effect installs no cleanup').toMatch(/return \(\) => \{[\s\S]*?\};\s*\n\s*\}, \[/);
    const publishes = hook.match(/setResolved\(\{[^}]*\}\)/g) || [];
    expect(publishes.length, 'no async publish found').toBeGreaterThan(0);
    for (const publish of publishes) {
      const at = hook.indexOf(publish);
      const statement = hook.slice(Math.max(0, hook.lastIndexOf('\n', at)), at);
      expect(statement, `unguarded publish: ${publish}`).toMatch(/if \(!\w+\)/);
    }
  });

  it('drops a query string or fragment before hitting the gateway', () => {
    // These are HTTP concepts, not part of an IPFS content path — sending them
    // 404s a CID that resolves fine.
    const cid = 'QmcJmonrdFPySQZftHRtvzoWePiGwNeG7wn35Z2qkJbbae';
    expect(classifyIpfsImageSource(`${cid}?w=64`)).toEqual({ kind: 'ipfs', value: cid });
    expect(classifyIpfsImageSource(`${cid}#top`)).toEqual({ kind: 'ipfs', value: cid });
    expect(classifyIpfsImageSource(`ipfs://${cid}/avatar.png?v=2#x`)).toEqual({
      kind: 'ipfs',
      value: `${cid}/avatar.png`,
    });
  });

  it('refuses relative path segments rather than round-tripping a certain 404', () => {
    const cid = 'QmcJmonrdFPySQZftHRtvzoWePiGwNeG7wn35Z2qkJbbae';
    for (const source of [`${cid}/../secrets`, `${cid}/./avatar.png`, `${cid}/..`]) {
      expect(classifyIpfsImageSource(source), `sent ${source} to IPFS`)
        .toEqual({ kind: 'empty', value: null });
    }
  });
});
