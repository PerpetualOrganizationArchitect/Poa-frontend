import { describe, it, expect } from 'vitest';
import { utils } from 'ethers';
import {
  buildSetOrgMetadataAdminCall,
  canSetOrgMetadataAdmin,
  orgRegistryInterface,
  EDIT_ORG_DETAILS_COPY,
} from './orgAdmin';

const REGISTRY = '0x1111111111111111111111111111111111111111';
const ORG_ID = `0x${'ab'.repeat(32)}`;

describe('canSetOrgMetadataAdmin', () => {
  it('requires both a registry address and a bytes32 org id', () => {
    expect(canSetOrgMetadataAdmin({ orgRegistry: REGISTRY, orgId: ORG_ID })).toBe(true);
    expect(canSetOrgMetadataAdmin({ orgRegistry: '', orgId: ORG_ID })).toBe(false);
    expect(canSetOrgMetadataAdmin({ orgRegistry: REGISTRY, orgId: '' })).toBe(false);
    expect(canSetOrgMetadataAdmin({ orgRegistry: REGISTRY, orgId: '0x1234' })).toBe(false);
  });
});

describe('buildSetOrgMetadataAdminCall', () => {
  it('encodes setOrgMetadataAdminHat(orgId, subjectId) against the registry', () => {
    const call = buildSetOrgMetadataAdminCall({ orgRegistry: REGISTRY, orgId: ORG_ID, subjectId: '7' });
    expect(utils.getAddress(call.target)).toBe(utils.getAddress(REGISTRY));
    expect(call.value).toBe('0');
    const decoded = orgRegistryInterface.decodeFunctionData('setOrgMetadataAdminHat', call.data);
    expect(decoded[0]).toBe(ORG_ID);
    expect(decoded[1].toString()).toBe('7');
  });
  it('refuses to encode without the registry / org id / a real subject id', () => {
    expect(() => buildSetOrgMetadataAdminCall({ orgRegistry: '', orgId: ORG_ID, subjectId: '7' })).toThrow();
    expect(() => buildSetOrgMetadataAdminCall({ orgRegistry: REGISTRY, orgId: '0x00', subjectId: '7' })).toThrow();
    expect(() => buildSetOrgMetadataAdminCall({ orgRegistry: REGISTRY, orgId: ORG_ID, subjectId: '0' })).toThrow();
  });
});

describe('EDIT_ORG_DETAILS_COPY', () => {
  it('names the single-holder nature and offers an honest unavailable message', () => {
    expect(EDIT_ORG_DETAILS_COPY.label).toMatch(/org details/i);
    expect(EDIT_ORG_DETAILS_COPY.help).toMatch(/one role/i);
    expect(EDIT_ORG_DETAILS_COPY.unavailable).toMatch(/has not loaded/i);
  });
});
