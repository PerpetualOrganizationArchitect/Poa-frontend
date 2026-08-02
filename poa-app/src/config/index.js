/**
 * Configuration Module
 * Barrel exports for all configuration
 */

// Network configuration
export {
  NETWORKS,
  DEFAULT_NETWORK,
  DEFAULT_CHAIN_ID,
  DEFAULT_DEPLOY_NETWORK,
  DEFAULT_DEPLOY_CHAIN_ID,
  getNetworkByChainId,
  getNetworkNameByChainId,
  isNetworkSupported,
  DEFAULT_SUBGRAPH_URL,
  getSubgraphUrl,
  getAllSubgraphUrls,
} from './networks';

// Contract addresses
export {
  INFRASTRUCTURE_CONTRACTS,
  CONTRACT_NAMES,
  getInfrastructureAddress,
  getUniversalAccountRegistryAddress,
} from './contracts';

// Gas configuration
export {
  GAS_CONFIG,
  getDefaultGasPrice,
  getMaxGasPrice,
  calculateGasLimit,
  createGasOptions,
  clampGasPrice,
} from './gas';

// Setter function definitions for governance votes
export {
  SETTER_CATEGORIES,
  SETTER_TEMPLATES,
  CONTRACT_MAP,
  RAW_FUNCTIONS,
  getTemplateById,
  getRawFunctions,
  isContractAvailable,
  isBytes32,
  normalizeBytes32,
  abbreviateHash,
} from './setterDefinitions';
