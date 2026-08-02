/**
 * Network Configuration
 * Centralizes all network-related constants for multi-chain support
 */

export const NETWORKS = {
  arbitrum: {
    chainId: 42161,
    name: 'Arbitrum One',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrl: process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    blockExplorer: 'https://arbiscan.io',
    isTestnet: false,
    subgraphUrl: process.env.NEXT_PUBLIC_ARBITRUM_SUBGRAPH_URL || 'https://gateway.thegraph.com/api/204b1629ba85581bdc48cc6701e821ff/subgraphs/id/2egvcs94ZStD38inRtK9bp3Maw3UZw4BDinH8jLyAF4G',
    bountyTokens: {
      USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    },
    defaultFunding: '0.003',
    defaultBudgetCap: '0.003',
  },
  gnosis: {
    chainId: 100,
    name: 'Gnosis',
    nativeCurrency: { name: 'xDAI', symbol: 'xDAI', decimals: 18 },
    rpcUrl: process.env.NEXT_PUBLIC_GNOSIS_RPC_URL || 'https://rpc.gnosischain.com',
    blockExplorer: 'https://gnosisscan.io',
    isTestnet: false,
    subgraphUrl: process.env.NEXT_PUBLIC_GNOSIS_SUBGRAPH_URL || 'https://gateway.thegraph.com/api/204b1629ba85581bdc48cc6701e821ff/subgraphs/id/576YA6oF16nA2uG5Q9KFfBSvJm4ZNKzWZkwh8eWXaxJs',
    bountyTokens: {
      BREAD: '0xa555d5344f6FB6c65da19e403Cb4c1eC4a1a5Ee3',
      USDC:  '0xDDAfbb505ad214D7b80b1f830fcCc89B60fB7A83',
      WXDAI: '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d',
    },
    defaultFunding: '0.0002',
    defaultBudgetCap: '0.0002',
  },
};

// Home chain (accounts, passkeys, core infrastructure)
export const DEFAULT_NETWORK = 'arbitrum';
export const DEFAULT_CHAIN_ID = NETWORKS[DEFAULT_NETWORK].chainId;

// Default chain for org deployment (satellite chain)
export const DEFAULT_DEPLOY_NETWORK = 'gnosis';
export const DEFAULT_DEPLOY_CHAIN_ID = NETWORKS[DEFAULT_DEPLOY_NETWORK].chainId;

/**
 * Get network configuration by chain ID
 * @param {number} chainId - The chain ID to look up
 * @returns {Object|null} Network configuration or null if not found
 */
export function getNetworkByChainId(chainId) {
  return Object.values(NETWORKS).find(n => n.chainId === chainId) || null;
}

/**
 * Get network name by chain ID
 * @param {number} chainId - The chain ID to look up
 * @returns {string|null} Network name or null if not found
 */
export function getNetworkNameByChainId(chainId) {
  const entry = Object.entries(NETWORKS).find(([_, config]) => config.chainId === chainId);
  return entry ? entry[0] : null;
}

/**
 * Check if a chain ID is supported
 * @param {number} chainId - The chain ID to check
 * @returns {boolean} True if the network is supported
 */
export function isNetworkSupported(chainId) {
  return !!getNetworkByChainId(chainId);
}

export const DEFAULT_SUBGRAPH_URL = NETWORKS[DEFAULT_NETWORK].subgraphUrl;

/**
 * Get subgraph URL for a given chain ID.
 * Falls back to the default network's subgraph.
 */
export function getSubgraphUrl(chainId) {
  return getNetworkByChainId(chainId)?.subgraphUrl || DEFAULT_SUBGRAPH_URL;
}

/**
 * Get all subgraph endpoints for cross-chain queries.
 * Used by browse page and org discovery to query all chains in parallel.
 */
export function getAllSubgraphUrls() {
  return Object.values(NETWORKS)
    .filter(n => !n.isTestnet)
    .map(n => ({ chainId: n.chainId, url: n.subgraphUrl, name: n.name }));
}
