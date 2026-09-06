/** Wave G support is determined by indexed cutover, never an org name or event age. */
export const ORGANIZATION_SUPPORT_FIELDS = `membershipAuthority { id isRouterBound cutoverAt }`;

export function isSupportedOrganization(organization) {
  const authority = organization?.membershipAuthority;
  return typeof authority?.id === 'string'
    && /^0x[0-9a-f]{40}$/i.test(authority.id)
    && !/^0x0{40}$/i.test(authority.id)
    && authority.isRouterBound === true
    && /^\d+$/.test(String(authority.cutoverAt ?? ''))
    && BigInt(authority.cutoverAt) > 0n;
}

/** Keep each retained row intact, including its complete pre-cutover activity totals. */
export function supportedMemberships(memberships) {
  return (memberships || []).filter((row) => isSupportedOrganization(row?.organization));
}
