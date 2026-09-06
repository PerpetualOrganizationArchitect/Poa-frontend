import { beforeAll, describe, expect, it, vi } from 'vitest';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { buildAllowlist, domainHash, emailHash, assertRootMatches, proofForDomain, proofForEmailHash, LEAF_TYPES } from '@/lib/zkemail/allowlist';
import { readInvites, describeWho, inviteKey } from '@/lib/zkemail/inviteDisplay';
import { bytes32ToIpfsCid } from '@/services/web3/utils/encoding';
import { buildRoleEmailAllowlist, prepareRoleEmailAllowlist, EMPTY_EMAIL_ROOT } from '@/lib/accessV2/roleEmailAllowlist';

const ORG = `0x${'11'.repeat(32)}`;
const CID = `0x${'22'.repeat(32)}`;
const ROLE = '100';
const form = { kind: 'role', join: { domains: [' ACME.com ', '@acme.com', 'new.org'] }, emailInvites: [' Alice@acme.com ', { email: 'alice@acme.com' }, 'bob@new.org'] };
let existing;

beforeAll(async () => {
  existing = await buildAllowlist({ orgId: ORG, entries: [
    { type: 'domain', identifier: 'acme.com', hatIds: ['0x1', '2'] },
    { type: 'domain', identifier: 'old.org', hatIds: ['3'] },
    { type: 'email', identifier: 'alice@acme.com', hatIds: ['4'] },
    { type: 'email', identifier: 'older@old.org', hatIds: ['5'] },
  ] });
});

describe('role email list preservation', () => {
  it('merges new role membership into matching commitments and preserves unrelated grants', async () => {
    const built = await buildRoleEmailAllowlist({ form, subjectId: ROLE, orgId: ORG, currentDoc: existing.doc, currentRoot: existing.root });
    const tree = assertRootMatches(built.doc, built.root);
    expect((await proofForDomain(tree, 'acme.com')).hatIds).toEqual(['1', '2', ROLE]);
    expect((await proofForDomain(tree, 'old.org')).hatIds).toEqual(['3']);
    expect((await proofForDomain(tree, 'new.org')).hatIds).toEqual([ROLE]);
    expect(proofForEmailHash(tree, await emailHash('alice@acme.com')).hatIds).toEqual(['4', ROLE]);
    expect(proofForEmailHash(tree, await emailHash('older@old.org')).hatIds).toEqual(['5']);
    expect(proofForEmailHash(tree, await emailHash('bob@new.org')).hatIds).toEqual([ROLE]);
    expect(built.domainCount).toBe(2);
    expect(built.emailCount).toBe(2);
    expect(built.doc.entries).toHaveLength(6);
    expect(built.json).not.toContain('alice@');
    expect(built.json).not.toContain('older@');
    expect(built.json).not.toContain('bob@');
  });

  it('takes existing grants from verified leaves, not mutable display metadata', async () => {
    const doc = structuredClone(existing.doc);
    doc.entries[0].hatIds = ['999'];
    doc.entries[2].identifier = 'injected@private.org';
    doc.uncommittedPrivateEmails = ['leak@private.org'];
    const built = await buildRoleEmailAllowlist({ form, subjectId: ROLE, orgId: ORG, currentDoc: doc, currentRoot: existing.root });
    expect((await proofForDomain(assertRootMatches(built.doc, built.root), 'acme.com')).hatIds).toEqual(['1', '2', ROLE]);
    expect(built.doc.entries.flatMap((entry) => entry.hatIds).map((id) => BigInt(id).toString())).not.toContain('999');
    expect(built.json).not.toContain('injected@');
    expect(built.json).not.toContain('leak@');
  });

  it('dedupes numerical subject IDs and repeated leaves by their commitment', async () => {
    const id = await domainHash('acme.com');
    const tree = StandardMerkleTree.of([[0, id, ['1', '1']], [0, id, ['1', '100']]], LEAF_TYPES);
    const doc = { orgId: ORG, entries: [{ type: 'domain', identifier: 'ACME.com' }], treeDump: tree.dump() };
    const built = await buildRoleEmailAllowlist({ form: { join: { domains: ['acme.com'] } }, subjectId: '0x64', orgId: ORG, currentDoc: doc, currentRoot: tree.root });
    expect(built.doc.entries).toHaveLength(1);
    expect(built.doc.entries[0].hatIds).toEqual(['0x1', '0x64']);
  });

  it('retains private entries through the membership settings reader and builder', async () => {
    const built = await buildRoleEmailAllowlist({ form, subjectId: ROLE, orgId: ORG, currentRoot: EMPTY_EMAIL_ROOT });
    const rows = readInvites(built.doc);
    const rebuilt = await buildAllowlist({ orgId: ORG, entries: rows });
    expect(rebuilt.root).toBe(built.root);
    expect(rebuilt.json).not.toContain('alice@');
    const privateRows = rows.filter((row) => row.type === 'email');
    expect(privateRows).toHaveLength(2);
    expect(inviteKey(privateRows[0])).not.toBe(inviteKey(privateRows[1]));
    expect(describeWho(privateRows[0])).toBe('Private email invite');
  });

  it('fails closed when an active file is missing, swapped, or belongs to another org', async () => {
    const args = { form, subjectId: ROLE, orgId: ORG, currentRoot: existing.root };
    await expect(buildRoleEmailAllowlist(args)).rejects.toThrow('load the current email invites');
    await expect(buildRoleEmailAllowlist({ ...args, currentDoc: existing.doc, currentRoot: CID })).rejects.toThrow('on-chain root');
    await expect(buildRoleEmailAllowlist({ ...args, currentDoc: { ...existing.doc, orgId: CID } })).rejects.toThrow('another org');
  });

  it('rejects incomplete domain metadata without silently removing a domain', async () => {
    await expect(buildRoleEmailAllowlist({ form, subjectId: ROLE, orgId: ORG, currentRoot: existing.root, currentDoc: { ...existing.doc, entries: [] } })).rejects.toThrow('verified domain name');
  });

  it('rejects unclaimable open roles and group invites', async () => {
    await expect(buildRoleEmailAllowlist({ form: { ...form, openRole: true }, subjectId: ROLE, orgId: ORG, currentRoot: EMPTY_EMAIL_ROOT })).rejects.toThrow('Open roles');
    await expect(buildRoleEmailAllowlist({ form: { ...form, kind: 'group' }, subjectId: ROLE, orgId: ORG, currentRoot: EMPTY_EMAIL_ROOT })).rejects.toThrow('individual roles');
  });

  it('rejects circuit-overlong input instead of truncating hashes into collisions', async () => {
    await expect(emailHash(`${'a'.repeat(192)}@example.org`)).rejects.toThrow('192 bytes');
    await expect(buildRoleEmailAllowlist({ form: { emailInvites: [`${'a'.repeat(192)}@example.org`] }, subjectId: ROLE, orgId: ORG, currentRoot: EMPTY_EMAIL_ROOT })).rejects.toThrow('192 characters');
  });
});

describe('preparing an email role proposal', () => {
  const services = () => ({
    form, subjectId: ROLE, orgId: ORG,
    readActiveAllowlist: vi.fn().mockResolvedValue({ root: existing.root, cid: CID }),
    fetchDocument: vi.fn().mockResolvedValue(existing.doc),
    uploadDocument: vi.fn().mockResolvedValue({ path: bytes32ToIpfsCid(CID) }),
    readEmailRegistered: vi.fn().mockResolvedValue(false),
  });

  it('reads the live list, publishes a preserved private document, and rechecks the commitment', async () => {
    const args = services();
    const result = await prepareRoleEmailAllowlist(args);
    expect(result).toMatchObject({ cid: CID, subjectId: ROLE, domainCount: 2, emailCount: 2, previousRoot: existing.root, previousCid: CID });
    expect(args.readActiveAllowlist).toHaveBeenCalledTimes(2);
    expect(args.fetchDocument).toHaveBeenCalledWith(bytes32ToIpfsCid(CID));
    expect(args.readEmailRegistered).toHaveBeenCalledTimes(2);
    expect(args.uploadDocument.mock.calls[0][0]).not.toContain('alice@');
  });

  it('does no upload/read for a role without email joining', async () => {
    const args = { ...services(), form: {} };
    expect(await prepareRoleEmailAllowlist(args)).toBeNull();
    expect(args.readActiveAllowlist).not.toHaveBeenCalled();
    expect(args.uploadDocument).not.toHaveBeenCalled();
  });

  it('blocks unavailable active lists before upload', async () => {
    const args = services();
    args.fetchDocument.mockResolvedValue(null);
    await expect(prepareRoleEmailAllowlist(args)).rejects.toThrow('current email invites');
    expect(args.uploadDocument).not.toHaveBeenCalled();
  });

  it('blocks already-consumed specific-email invites rather than clearing their registration', async () => {
    const args = services();
    args.readEmailRegistered.mockResolvedValue(true);
    await expect(prepareRoleEmailAllowlist(args)).rejects.toThrow('Add that person’s account');
    expect(args.uploadDocument).not.toHaveBeenCalled();
  });

  it('fails on a changed active root or changed file during upload', async () => {
    for (const newer of [{ root: CID, cid: CID }, { root: existing.root, cid: ORG }]) {
      const args = services();
      args.readActiveAllowlist.mockResolvedValueOnce({ root: existing.root, cid: CID }).mockResolvedValueOnce(newer);
      await expect(prepareRoleEmailAllowlist(args)).rejects.toThrow('changed while preparing');
    }
  });
});
