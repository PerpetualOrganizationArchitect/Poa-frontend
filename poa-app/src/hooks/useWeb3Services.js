/**
 * useWeb3Services - Hook to access Web3 service layer
 * Provides a unified interface to all Web3 services with proper initialization.
 * Supports both EOA (RainbowKit/wagmi) and Passkey (ERC-4337) auth types.
 */

import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { useQuery } from '@apollo/client';
import { getClient, useSubgraphClient } from '@/util/apolloClient';
import { encodeFunctionData } from 'viem';
import { useEthersSigner, useEthersProvider } from '@/components/ProviderConverter';
import { useWalletClient } from 'wagmi';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useRefreshEmit } from '../context/RefreshContext';
import { useIPFScontext } from '../context/ipfsContext';
import { waitForSubgraphBlock } from '@/util/waitForSubgraph';
import { ReadyState, getNotReadyMessage as buildNotReadyMessage } from '@/util/readiness';
import { usePOContext } from '../context/POContext';
import { useUserContext } from '../context/UserContext';
import { INFRASTRUCTURE_CONTRACTS, getInfrastructureAddress } from '../config/contracts';
import { DEFAULT_NETWORK, DEFAULT_CHAIN_ID, NETWORKS } from '../config/networks';
import { FETCH_INFRASTRUCTURE_ADDRESSES } from '../util/queries';
import { FETCH_PAYMASTER_ORG_CONFIG, FETCH_PASSKEY_FACTORY_ADDRESS } from '../util/passkeyQueries';
import { createChainClients } from '../services/web3/utils/chainClients';
import PasskeyAccountFactoryABI from '../../abi/PasskeyAccountFactory.json';

// Core services
import { ContractFactory, createContractFactory } from '../services/web3/core/ContractFactory';
import { TransactionManager, createTransactionManager } from '../services/web3/core/TransactionManager';
import { createSmartAccountTransactionManager } from '../services/web3/core/SmartAccountTransactionManager';
import { createEOA7702TransactionManager } from '../services/web3/eip7702/EOA7702TransactionManager';
import { checkWallet7702Support } from '../services/web3/eip7702/authorizationBuilder';
import { EOA_DELEGATION_ADDRESS } from '../config/contracts';

// Domain services
import { UserService, createUserService } from '../services/web3/domain/UserService';
import { OrganizationService, createOrganizationService } from '../services/web3/domain/OrganizationService';
import { VotingService, VotingType, createVotingService } from '../services/web3/domain/VotingService';
import { TaskService, createTaskService } from '../services/web3/domain/TaskService';
import { EducationService, createEducationService } from '../services/web3/domain/EducationService';
import { EligibilityService, createEligibilityService } from '../services/web3/domain/EligibilityService';
import { ZkEmailInvitesService, createZkEmailInvitesService } from '../services/web3/domain/ZkEmailInvitesService';
import { TokenRequestService, createTokenRequestService } from '../services/web3/domain/TokenRequestService';
import { TreasuryService, createTreasuryService } from '../services/web3/domain/TreasuryService';

/**
 * Hook to access all Web3 services
 * @param {Object} [options={}] - Configuration options
 * @param {Object} [options.ipfsService] - IPFS service instance for content storage (falls back to context)
 * @param {string} [options.network] - Network name (defaults to DEFAULT_NETWORK)
 * @returns {Object} Object containing all services and utilities
 */
export function useWeb3Services(options = {}) {
  const { ipfsService: providedIpfs = null, network = DEFAULT_NETWORK } = options;
  const signer = useEthersSigner();
  // Pass DEFAULT_CHAIN_ID so wagmi returns a client even without a wallet connection.
  // Without this, passkey-only users get no provider (useClient() returns undefined
  // when no wallet is connected and no chainId is specified).
  const provider = useEthersProvider({ chainId: DEFAULT_CHAIN_ID });
  const { isPasskeyUser, isAuthenticated, passkeyConnecting, passkeyState, publicClient, bundlerClient } = useAuth();

  // Get IPFS service from context if not provided
  const ipfsContext = useIPFScontext();
  const ipfsService = providedIpfs || ipfsContext;

  // Get org ID, chain, and subgraph URL from POContext for paymaster data
  // usePOContext returns undefined when outside POProvider (non-org routes)
  const poContext = usePOContext();
  const orgId = poContext?.orgId || null;
  const subgraphUrl = poContext?.subgraphUrl || null;
  const orgChainId = poContext?.orgChainId || null;

  // Create chain-specific clients when org is on a different chain than home chain
  const isCrossChain = orgChainId && orgChainId !== DEFAULT_CHAIN_ID;
  const { effectivePublicClient, effectiveBundlerClient, effectiveChainId } = useMemo(() => {
    if (!isCrossChain) {
      return { effectivePublicClient: publicClient, effectiveBundlerClient: bundlerClient, effectiveChainId: DEFAULT_CHAIN_ID };
    }
    const clients = createChainClients(orgChainId);
    if (!clients) {
      return { effectivePublicClient: publicClient, effectiveBundlerClient: bundlerClient, effectiveChainId: DEFAULT_CHAIN_ID };
    }
    return { effectivePublicClient: clients.publicClient, effectiveBundlerClient: clients.bundlerClient, effectiveChainId: orgChainId };
  }, [isCrossChain, orgChainId, publicClient, bundlerClient]);

  // Get user's hat IDs for hat-scoped paymaster budget
  // useUserContext returns undefined outside UserProvider (safe with optional chaining)
  const userContext = useUserContext();
  const hatIds = userContext?.userData?.hatIds || null;

  // Per-chain client prevents cache poisoning: each endpoint has its own
  // InMemoryCache, so infrastructure addresses from one chain can't leak into
  // another chain's queries.
  const orgClient = useSubgraphClient(subgraphUrl);

  // Fetch infrastructure addresses from subgraph — routed to org's chain.
  // Skip until subgraphUrl is resolved by POContext to avoid querying the default
  // (Arbitrum) subgraph and getting wrong-chain addresses.
  const { data: infraData } = useQuery(FETCH_INFRASTRUCTURE_ADDRESSES, {
    client: orgClient,
    skip: !subgraphUrl,
  });
  const registryAddress = infraData?.universalAccountRegistries?.[0]?.id || null;
  const paymasterHubAddress = infraData?.poaManagerContracts?.[0]?.paymasterHubProxy || null;

  // For passkey cross-chain: fetch factory address from org chain to compute initCode
  const { data: factoryData } = useQuery(FETCH_PASSKEY_FACTORY_ADDRESS, {
    skip: !isPasskeyUser || !isCrossChain || !subgraphUrl,
    client: orgClient,
  });
  const orgFactoryAddress = factoryData?.passkeyAccountFactories?.[0]?.id || null;

  // Compute initCode for cross-chain passkey account deployment.
  // Verifies the target chain factory produces the same CREATE2 address (factories at
  // different addresses on different chains produce different account addresses).
  // SmartAccountTransactionManager will check account existence at call time before using it.
  const [crossChainInitCode, setCrossChainInitCode] = useState('0x');
  // Track whether cross-chain initCode resolution has completed (so we can
  // block isReady until it finishes and prevent transactions from firing early).
  // Lazy-initialize: for non-passkey/non-cross-chain users, start resolved (true)
  // to avoid a false→true transition that triggers an extra render in every instance.
  const needsCrossChainInit = isPasskeyUser && isCrossChain;
  const [crossChainInitCodeResolved, setCrossChainInitCodeResolved] = useState(() => !needsCrossChainInit);

  useEffect(() => {
    if (!isPasskeyUser || !isCrossChain) {
      // Not cross-chain — no initCode needed, immediately resolved.
      // No-op setState when value already matches (React bails out).
      setCrossChainInitCode('0x');
      setCrossChainInitCodeResolved(true);
      return;
    }

    if (!orgFactoryAddress || !passkeyState || !effectivePublicClient) {
      // Cross-chain but deps not ready yet — mark as unresolved
      setCrossChainInitCode('0x');
      setCrossChainInitCodeResolved(false);
      return;
    }

    setCrossChainInitCodeResolved(false);
    let cancelled = false;

    async function verifyAndBuildInitCode() {
      try {
        // Verify factory produces the same account address on the target chain
        const targetAddress = await effectivePublicClient.readContract({
          address: orgFactoryAddress,
          abi: PasskeyAccountFactoryABI,
          functionName: 'getAddress',
          args: [passkeyState.credentialId, passkeyState.publicKeyX, passkeyState.publicKeyY, BigInt(passkeyState.salt)],
        });

        if (cancelled) return;

        if (targetAddress.toLowerCase() !== passkeyState.accountAddress.toLowerCase()) {
          console.error(
            `[useWeb3Services] Cross-chain CREATE2 mismatch: target factory produces ${targetAddress}, ` +
            `expected ${passkeyState.accountAddress}. Cross-chain account deployment unavailable.`
          );
          setCrossChainInitCode('0x');
          setCrossChainInitCodeResolved(true);
          return;
        }

        const factoryCallData = encodeFunctionData({
          abi: PasskeyAccountFactoryABI,
          functionName: 'createAccount',
          args: [passkeyState.credentialId, passkeyState.publicKeyX, passkeyState.publicKeyY, BigInt(passkeyState.salt)],
        });
        setCrossChainInitCode(orgFactoryAddress + factoryCallData.slice(2));
      } catch (e) {
        if (!cancelled) {
          console.warn('[useWeb3Services] Failed to verify cross-chain factory:', e.message);
          setCrossChainInitCode('0x');
        }
      } finally {
        if (!cancelled) {
          setCrossChainInitCodeResolved(true);
        }
      }
    }

    verifyAndBuildInitCode();
    return () => { cancelled = true; };
  }, [isPasskeyUser, isCrossChain, orgFactoryAddress, passkeyState, effectivePublicClient]);

  // Check if this org has gas sponsorship enabled (subgraph lookup, no RPC)
  const { data: pmConfig } = useQuery(FETCH_PAYMASTER_ORG_CONFIG, {
    variables: { orgId },
    skip: !orgId,
    fetchPolicy: 'cache-first',
    client: orgClient,
  });
  const orgPaymaster = pmConfig?.paymasterOrgConfigs?.[0];
  // Entity existence = registered. Only pass paymaster address when not paused.
  const paymasterAddress = (orgPaymaster && !orgPaymaster.isPaused)
    ? paymasterHubAddress
    : null;

  // Create core services — auth-type-aware
  const factory = useMemo(() => {
    if (isPasskeyUser) {
      // Passkey: factory is used for ABI encoding only (SmartAccountTransactionManager
      // handles execution). Provider is optional — contracts work for encoding without one.
      return createContractFactory(null, provider || undefined);
    }
    // EOA: create factory with signer
    if (!signer) return null;
    return createContractFactory(signer);
  }, [signer, provider, isPasskeyUser]);

  // EIP-7702 capability detection for EOA users
  const { data: walletClient } = useWalletClient();
  const [eoa7702Capable, setEoa7702Capable] = useState(false);
  const eoa7702DisabledRef = useRef(false); // Disabled for session if runtime fails
  useEffect(() => {
    if (isPasskeyUser || !walletClient || eoa7702DisabledRef.current) {
      setEoa7702Capable(false);
      return;
    }
    checkWallet7702Support(walletClient).then(setEoa7702Capable).catch(() => setEoa7702Capable(false));
  }, [walletClient, isPasskeyUser]);

  const txManager = useMemo(() => {
    if (isPasskeyUser) {
      // Passkey: create SmartAccountTransactionManager
      // Uses org-chain clients when org is on a different chain than home chain
      if (!passkeyState || !effectivePublicClient || !effectiveBundlerClient) return null;
      return createSmartAccountTransactionManager({
        accountAddress: passkeyState.accountAddress,
        rawCredentialId: passkeyState.rawCredentialId,
        publicClient: effectivePublicClient,
        bundlerClient: effectiveBundlerClient,
        paymasterAddress,
        orgId,
        hatIds,
        chainId: effectiveChainId,
        initCode: crossChainInitCode,
      });
    }

    // EOA: always create the direct tx manager (needed as fallback)
    if (!signer) return null;
    const directTxManager = createTransactionManager(signer);

    // EOA with EIP-7702: try gas-sponsored via PaymasterHub, fall back to direct tx
    if (eoa7702Capable && walletClient && paymasterAddress && orgId && hatIds?.length > 0
        && effectivePublicClient && effectiveBundlerClient) {
      return createEOA7702TransactionManager({
        accountAddress: walletClient.account.address,
        walletClient,
        publicClient: effectivePublicClient,
        bundlerClient: effectiveBundlerClient,
        paymasterAddress,
        orgId,
        hatIds,
        chainId: effectiveChainId,
        eoaDelegationAddress: EOA_DELEGATION_ADDRESS,
        fallbackTxManager: directTxManager,
        on7702Disabled: () => {
          // Disable 7702 for the rest of this session so subsequent calls go direct
          eoa7702DisabledRef.current = true;
          setEoa7702Capable(false);
        },
      });
    }

    return directTxManager;
  }, [signer, isPasskeyUser, passkeyState, effectivePublicClient, effectiveBundlerClient, paymasterAddress, orgId, hatIds, effectiveChainId, crossChainInitCode, eoa7702Capable, walletClient]);

  // Create domain services
  const services = useMemo(() => {
    if (!factory || !txManager) {
      return {
        user: null,
        organization: null,
        voting: null,
        task: null,
        education: null,
        eligibility: null,
        zkEmailInvites: null,
        tokenRequest: null,
        treasury: null,
      };
    }

    return {
      user: createUserService(factory, txManager, registryAddress),
      organization: createOrganizationService(factory, txManager, registryAddress, effectiveChainId),
      voting: createVotingService(factory, txManager, ipfsService),
      task: createTaskService(factory, txManager, ipfsService),
      education: createEducationService(factory, txManager, ipfsService),
      eligibility: createEligibilityService(factory, txManager),
      zkEmailInvites: createZkEmailInvitesService(factory, txManager),
      tokenRequest: createTokenRequestService(factory, txManager, ipfsService),
      treasury: createTreasuryService(factory, txManager),
    };
  }, [factory, txManager, ipfsService, registryAddress, effectiveChainId]);

  // Contract addresses helper
  const getContractAddress = useCallback((contractName) => {
    return getInfrastructureAddress(contractName);
  }, []);

  // Discriminated readiness so call sites can tell "signed out" from "still
  // initializing" — and never tell a signed-in user to "connect your wallet".
  // For cross-chain passkey users, also wait for initCode resolution so
  // transactions don't fire before we know whether account deployment is needed.
  const readyState = (() => {
    // Not authenticated and not mid-connection → genuinely signed out.
    if (!isAuthenticated && !passkeyConnecting) return ReadyState.SIGNED_OUT;
    const servicesUp = isPasskeyUser
      ? Boolean(isAuthenticated && factory && txManager && crossChainInitCodeResolved)
      : Boolean(signer && factory && txManager);
    return servicesUp ? ReadyState.READY : ReadyState.INITIALIZING;
  })();
  // Back-compat: existing `!isReady` checks keep working unchanged.
  const isReady = readyState === ReadyState.READY;

  // Bound helper so call sites don't re-import readiness or recompute chainName.
  const orgChainName = orgChainId
    ? Object.values(NETWORKS).find((n) => n.chainId === orgChainId)?.name
    : null;
  const getNotReadyMessage = useCallback(
    (state = readyState) => buildNotReadyMessage(state, { chainName: orgChainName }),
    [readyState, orgChainName]
  );

  return useMemo(() => ({
    // Core
    factory,
    txManager,

    // Domain services
    ...services,

    // Utilities
    getContractAddress,
    isReady,
    readyState,
    getNotReadyMessage,
    signer,

    // Constants
    VotingType,
  }), [factory, txManager, services, getContractAddress, isReady, readyState, getNotReadyMessage, signer]);
}

/**
 * Hook for transaction execution with integrated notifications
 * Wraps service calls with loading states and automatic notifications.
 *
 * After a successful transaction, waits for the subgraph to index
 * the new block before emitting the refresh event. This centralizes
 * the _meta polling (max 2 queries) so subscribers can refetch immediately
 * with fresh data.
 */
export function useTransactionWithNotification() {
  const { addNotification, updateNotification } = useNotification();
  const { emit } = useRefreshEmit();
  const poContext = usePOContext();
  const subgraphUrl = poContext?.subgraphUrl;

  /**
   * Execute a transaction with notification handling
   * @param {Function} transactionFn - Async function that returns a TransactionResult
   * @param {Object} options - Options for the transaction
   * @param {string} options.pendingMessage - Message to show while pending
   * @param {string} options.successMessage - Message to show on success
   * @param {string} [options.errorMessage] - Custom error message (uses parsed error if not provided)
   * @param {string} [options.refreshEvent] - Event to emit on success
   * @param {Object} [options.refreshData] - Data to include with refresh event
   * @returns {Promise<TransactionResult>}
   */
  const executeWithNotification = useCallback(async (
    transactionFn,
    {
      pendingMessage,
      successMessage,
      errorMessage,
      refreshEvent,
      refreshData = {},
    }
  ) => {
    // Show pending notification with loading status (blue spinner)
    const pendingId = addNotification(pendingMessage, 'loading');

    try {
      const result = await transactionFn();

      if (result.success) {
        // Update pending notification to success
        updateNotification(pendingId, successMessage, 'success');

        // Wait for subgraph to index the tx block, then emit refresh event.
        // Fire-and-forget: don't block the caller (optimistic UI is already showing).
        // Max 2 _meta queries (~5s initial + 2s backup), then emit regardless.
        if (refreshEvent) {
          const emitRefresh = async () => {
            await waitForSubgraphBlock(subgraphUrl, result.blockNumber);
            emit(refreshEvent, {
              ...refreshData,
              transactionHash: result.txHash,
            });
          };
          emitRefresh();
        }
      } else {
        // Prefer the PARSED contract reason over the caller's generic static
        // errorMessage. The parser now decodes the real revert (e.g. "This task
        // requires an application before claiming") on both the EOA and passkey
        // paths; showing "Failed to claim task" instead would throw that away.
        const message = result.error?.userMessage || errorMessage || 'Transaction failed';
        updateNotification(pendingId, message, 'error');
      }

      return result;
    } catch (error) {
      // Thrown (non-TransactionResult) path. Prefer a parsed userMessage if the
      // throw carried one; otherwise keep the caller's intentional errorMessage
      // ahead of a raw exception string (so internal errors don't leak to users).
      const message = error?.userMessage || errorMessage || error?.message || 'An unexpected error occurred';
      updateNotification(pendingId, message, 'error');

      return {
        success: false,
        error,
      };
    }
  }, [addNotification, updateNotification, emit, subgraphUrl]);

  /**
   * Create a transaction handler for common operations
   * Returns a wrapped function that handles notifications automatically
   */
  const createHandler = useCallback((
    serviceFn,
    {
      pendingMessage,
      successMessage,
      errorMessage,
      refreshEvent,
    }
  ) => {
    return async (...args) => {
      return executeWithNotification(
        () => serviceFn(...args),
        {
          pendingMessage,
          successMessage,
          errorMessage,
          refreshEvent,
          refreshData: { args },
        }
      );
    };
  }, [executeWithNotification]);

  return useMemo(() => ({
    executeWithNotification,
    createHandler,
  }), [executeWithNotification, createHandler]);
}

/**
 * Combined hook for services + transaction notifications
 * Most convenient for component usage
 */
export function useWeb3(options = {}) {
  const services = useWeb3Services(options);
  const txNotification = useTransactionWithNotification();

  return useMemo(() => ({
    ...services,
    ...txNotification,
  }), [services, txNotification]);
}

export default useWeb3Services;
