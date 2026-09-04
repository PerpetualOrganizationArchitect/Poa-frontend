import { describe, expect, it } from 'vitest';
import { isRoleMetadataReference, resolveLegacyRoleName } from './roleNames';

const METADATA_CID = '0xc9f573a180f5c200d297e8c451effc4ffb8ae867ec72add82f282daf310443fc';

describe('resolveLegacyRoleName', () => {
  it('uses the linked IPFS name instead of a CID-shaped Role.name', () => {
    const role = {
      name: METADATA_CID,
      hat: {
        name: 'New Member',
        metadataCID: METADATA_CID,
        metadata: { name: 'New Member' },
      },
    };

    expect(resolveLegacyRoleName(role, { fallback: 'Role 3' })).toBe('New Member');
  });

  it('prefers the latest linked metadata name over an older semantic Role.name', () => {
    const role = {
      name: 'New Member',
      hat: { name: 'Freshman', metadata: { name: 'First-year Member' } },
    };

    expect(resolveLegacyRoleName(role)).toBe('First-year Member');
  });

  it('uses the Hat event name while IPFS content is still unavailable', () => {
    expect(resolveLegacyRoleName({ name: METADATA_CID, hat: { name: 'New Member' } }))
      .toBe('New Member');
  });

  it('falls back to a semantic Role.name when the Hat still exposes a content pointer', () => {
    const role = { name: 'Member', hat: { name: METADATA_CID, metadataCID: METADATA_CID } };
    expect(resolveLegacyRoleName(role)).toBe('Member');
  });

  it('never renders an opaque content pointer when no semantic name is indexed', () => {
    const role = { name: METADATA_CID, hat: { name: METADATA_CID, metadataCID: METADATA_CID } };
    expect(resolveLegacyRoleName(role, { fallback: 'Role 3' })).toBe('Role 3');
  });

  it('supports a separately fetched IPFS name and trims display values', () => {
    expect(resolveLegacyRoleName(
      { name: 'Old name', hat: { name: METADATA_CID } },
      { ipfsName: '  New Member  ' },
    )).toBe('New Member');
  });
});

describe('isRoleMetadataReference', () => {
  it.each([
    METADATA_CID,
    METADATA_CID.toUpperCase().replace('0X', '0x'),
    'ipfs://Qmbw1jcUepUGCQB96ML1DdxKUTtqyLRTGeuPJosH3pXDG7',
    'ipns://example.eth/role.json',
    'https://example.com/role.json',
    'http://example.com/role.json',
    'data:application/json;base64,e30=',
    'ar://someArweaveTransactionId',
    'Qmbw1jcUepUGCQB96ML1DdxKUTtqyLRTGeuPJosH3pXDG7',
    'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3wnie2ef5t7eo4aoqpxf3pmdy',
    `b${'a'.repeat(49)}`,
  ])('recognizes %s as metadata, not a display name', (value) => {
    expect(isRoleMetadataReference(value)).toBe(true);
  });

  it('does not reject ordinary role names', () => {
    expect(isRoleMetadataReference('New Member')).toBe(false);
    expect(isRoleMetadataReference('BusinessDevelopmentLead')).toBe(false);
  });
});
