/**
 * The org-metadata JSON that gets pinned to IPFS and referenced by the org's
 * `metadataHash` on chain.
 *
 * There is exactly ONE definition of this object on purpose. It used to be built
 * twice — once by the Identity step (to get a CID early) and once by the deploy
 * page — and the two drifted: the Identity copy omitted `hideTreasury` and
 * `useTokenSymbol`, the deploy copy wrote `template: 'default'` because it read
 * `organization.template`, which nothing ever sets. Since the deploy page skips its
 * own upload when a CID already exists, the Identity copy always won and those
 * settings were silently dropped from every org that walked the normal wizard.
 *
 * Keys here must match what POContext reads back (see POContext's `org.metadata?.*`).
 */

/**
 * @param {Object} state - full deployer state
 * @returns {Object} the metadata object to pin
 */
export function buildOrgMetadata(state) {
  const organization = state?.organization || {};
  const features = state?.features || {};
  return {
    description: organization.description || '',
    links: (organization.links || []).map((link) => ({ name: link.name, url: link.url })),
    // `ui.selectedTemplate` is the real choice; `organization.template` is a
    // vestigial field that never leaves its 'default' initial value.
    template: state?.ui?.selectedTemplate || organization.template || 'default',
    logo: organization.logoURL || null,
    hideTreasury: features.hideTreasury === true,
    // The app shows "Shares" unless an org opts into its token's real ticker
    // (util/tokenLabel). Someone who picked a ticker at launch meant to see it,
    // so opt in for them rather than making them find the toggle in Settings.
    useTokenSymbol: Boolean(organization.tokenSymbol?.trim()),
  };
}

export default buildOrgMetadata;
