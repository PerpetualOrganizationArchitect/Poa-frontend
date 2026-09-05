/**
 * Create chain-specific viem + Pimlico clients.
 * Used by hooks that need to interact with a chain different from the home chain.
 */

import { createPublicClient, http, defineChain } from 'viem';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { getNetworkByChainId } from '../../../config/networks';
import { getBundlerUrl, ENTRY_POINT_ADDRESS } from '../../../config/passkey';

function defineNetworkChain(network) {
  return defineChain({
    id: network.chainId,
    name: network.name,
    nativeCurrency: network.nativeCurrency,
    rpcUrls: { default: { http: [network.rpcUrl] } },
    blockExplorers: { default: { name: 'Explorer', url: network.blockExplorer } },
  });
}

/**
 * A read-only viem public client for a chain — for balance/state reads that have no business
 * constructing a bundler client (which needs a Pimlico key and warns when it is missing).
 * @param {number} chainId
 * @returns {Object | null}
 */
export function createPublicClientForChain(chainId) {
  const network = getNetworkByChainId(chainId);
  if (!network) return null;
  return createPublicClient({ chain: defineNetworkChain(network), transport: http(network.rpcUrl) });
}

/**
 * Create viem public client + Pimlico bundler client for a specific chain.
 * @param {number} chainId
 * @returns {{ publicClient: Object, bundlerClient: Object } | null}
 */
export function createChainClients(chainId) {
  const network = getNetworkByChainId(chainId);
  if (!network) return null;

  const chain = defineNetworkChain(network);

  return {
    publicClient: createPublicClient({ chain, transport: http(network.rpcUrl) }),
    bundlerClient: createPimlicoClient({
      chain,
      transport: http(getBundlerUrl(network.chainId)),
      entryPoint: { address: ENTRY_POINT_ADDRESS, version: '0.7' },
    }),
  };
}
