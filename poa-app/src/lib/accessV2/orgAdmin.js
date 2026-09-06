/**
 * accessV2/orgAdmin — the "edit org details" designation, kept honest to the contracts.
 *
 * There is NO "edit org metadata" permission key in AccessV2PermKeys — audited: the 11 keys are
 * dd.vote/dd.create/hv.create/tm.perms/pt.member/pt.approve/edu.create/edu.member/qj.autojoin/
 * pay.create/subject.rename, and none of them governs the ORG's own name/details. Editing the org's
 * name + metadata lives in a DIFFERENT contract: `OrgRegistry.updateOrgMetaAsAdmin`, gated by a
 * SINGLE per-org designation `metadataAdminHatOf[orgId]` (falling back to the org top hat). That
 * designation is a stored subject id, set by `OrgRegistry.setOrgMetadataAdminHat(orgId, hatId)`,
 * which after bootstrap is EXECUTOR-ONLY — so a governance role-creation batch CAN set it.
 *
 * So "Edit org details" is not a checkbox that ORs in like a permission: it is a single-holder
 * designation that REPLACES whoever currently holds it. This module encodes that call and describes
 * it truthfully. It is only encodable when the OrgRegistry address is known to the app; when it is
 * not, the caller blocks submission until the required context is available.
 *
 * PURE.
 */

import { utils } from 'ethers';

export const orgRegistryInterface = new utils.Interface([
  'function setOrgMetadataAdminHat(bytes32 orgId, uint256 hatId)',
]);

const isAddress = (a) => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a) && !/^0x0{40}$/i.test(a);
const isBytes32 = (v) => typeof v === 'string' && /^0x[0-9a-fA-F]{64}$/.test(v) && !/^0x0{64}$/i.test(v);

/** Can this app actually encode the designation? Needs both the registry and the org id. */
export function canSetOrgMetadataAdmin({ orgRegistry, orgId } = {}) {
  return isAddress(orgRegistry) && isBytes32(orgId);
}

/**
 * One Executor call making `subjectId` the org's metadata admin. Throws if the context to encode it
 * is missing — the caller must gate on {@link canSetOrgMetadataAdmin} first.
 * @returns {{ target: string, value: string, data: string }}
 */
export function buildSetOrgMetadataAdminCall({ orgRegistry, orgId, subjectId }) {
  if (!isAddress(orgRegistry)) throw new Error('accessV2: setOrgMetadataAdmin needs the org registry address');
  if (!isBytes32(orgId)) throw new Error('accessV2: setOrgMetadataAdmin needs the org id');
  const id = BigInt(String(subjectId ?? '0'));
  if (id <= 0n || id >= (1n << 256n)) throw new Error('accessV2: setOrgMetadataAdmin needs a subject id');
  return {
    target: utils.getAddress(String(orgRegistry).toLowerCase()),
    value: '0',
    data: orgRegistryInterface.encodeFunctionData('setOrgMetadataAdminHat', [orgId, id.toString()]),
  };
}

export const EDIT_ORG_DETAILS_COPY = Object.freeze({
  label: 'Edit org details',
  help:
    'Let these members change the org’s name, description and image. Only one role or group can hold this — '
    + 'turning it on hands it over from whoever has it now.',
  // Shown when the app can’t encode the call (registry address unknown): honest, not a dead switch.
  unavailable:
    'The org’s registry has not loaded. Editing org details can be assigned once it is available.',
});
