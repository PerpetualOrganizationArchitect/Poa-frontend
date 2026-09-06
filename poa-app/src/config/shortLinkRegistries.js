import { NETWORKS } from '@/config/networks';

// Wire-format registry slots: append new deployments; NEVER reorder or replace
// existing entries. orgIds(index) is append-only in these OrgRegistry contracts.
// A registry migration must get a new slot so old links keep their identity.
export const SHORT_LINK_REGISTRIES = Object.freeze([
  { chainId: NETWORKS.arbitrum.chainId, address: '0x7b023b9566b96616d54935ae8de80579c93f62ac' },
  { chainId: NETWORKS.gnosis.chainId, address: '0x3744b372abc41589226313f2bb1db3acaa22a854' },
]);
