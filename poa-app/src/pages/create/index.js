import React, { useState, useMemo, useEffect, useRef } from "react";
import SEOHead from "@/components/common/SEOHead";
import {
  Box,
  useToast,
  Button,
  Text,
  IconButton,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  useBreakpointValue,
} from "@chakra-ui/react";
import { CloseIcon } from "@chakra-ui/icons";
import { useQuery } from "@apollo/client";
import { getClient } from "@/util/apolloClient";
import LogoDropzoneModal from "@/components/Architect/LogoDropzoneModal";
import LinksModal from "@/components/Architect/LinksModal";
import { useAccount, useDisconnect, useSwitchChain, useConfig } from "wagmi";
import { getConnectorClient } from "wagmi/actions";
import { useEthersSigner, clientToSigner } from "@/components/ProviderConverter";
import { useAuth } from "@/context/AuthContext";
import { useIPFScontext } from "@/context/ipfsContext";
import { main, buildDeployCalldata } from "../../../scripts/newDeployment";
import { useRouter } from "next/router";
import { FETCH_INFRASTRUCTURE_ADDRESSES, FETCH_USERNAME_NEW } from "@/util/queries";
import { ipfsCidToBytes32 } from "@/services/web3/utils/encoding";
import { signRegistration, getSkipRegistrationDefaults } from "@/services/web3/utils/registrySigner";
import { ethers } from 'ethers';

// New deployer imports
import {
  DeployerProvider,
  useDeployer,
  DeployerWizard,
  mapStateToDeploymentParams,
  mapPaymasterConfig,
  getPaymasterFundingValue,
} from "@/features/deployer";
import { resolveRoleUsernames } from "@/features/deployer/utils/usernameResolver";

// Passkey deployment via ERC-4337 UserOp
import { encodeFunctionData, createPublicClient, http, defineChain } from "viem";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import PasskeyAccountABI from "../../../abi/PasskeyAccount.json";
import PasskeyAccountFactoryABI from "../../../abi/PasskeyAccountFactory.json";
import UniversalAccountRegistryABI from "../../../abi/UniversalAccountRegistry.json";
import OrgDeployerNewABI from "../../../abi/OrgDeployerNew.json";
import { DeploymentPreviewModal } from "@/features/deployer/components/DeploymentPreviewModal";
import { buildUserOp, getUserOpHash } from "@/services/web3/passkey/userOpBuilder";
import { signUserOpWithPasskey } from "@/services/web3/passkey/passkeySign";
import { encodeOrgDeployPaymasterData } from "@/services/web3/passkey/paymasterData";
import { getBundlerUrl, ENTRY_POINT_ADDRESS } from "@/config/passkey";
import { DEFAULT_DEPLOY_CHAIN_ID, getNetworkByChainId, getSubgraphUrl } from "@/config/networks";
import { FETCH_PASSKEY_FACTORY_ADDRESS } from "@/util/passkeyQueries";

/**
 * Read-only simulation of deployFullOrg against the deploy chain. Returns the
 * decoded DeploymentResult (predicted module addresses) on success, or throws a
 * friendly error if the call reverts. NO transaction is sent. This is also the
 * behavioral version gate: a pre-`taskManagerPerms` (21-field) OrgDeployer will
 * revert when decoding the 22-field tuple.
 */
// Friendlier guidance for reverts surfaced by the sim. Keyed by OrgDeployer ABI
// error NAME (decodable via iface.parseError) and, for sub-contract errors whose
// fragments aren't in this ABI (TaskManager/Hats setup), by raw 4-byte SELECTOR.
const SIM_FRIENDLY_ERRORS = {
  OrgExistsMismatch: 'this organization name is already taken on-chain — choose another name',
  InvalidRoleConfiguration: 'a role is misconfigured (check hierarchy and vouching)',
  InvalidAddress: 'an address field is zero or invalid',
};
const SIM_FRIENDLY_SELECTORS = {
  '0xe3813bd4': 'a bootstrap task has no payout — set a payout greater than 0', // TaskManager InvalidPayout()
};

async function simulateDeployCalldata({ rpcUrl, to, from, calldata, valueWei }) {
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const iface = new ethers.utils.Interface(OrgDeployerNewABI);
  const tx = { to, from, data: calldata };
  if (valueWei && valueWei.gt && valueWei.gt(0)) tx.value = valueWei.toHexString();

  const fail = (detail) => new Error(
    `The deploy reverted in simulation (${detail}). Nothing was sent. ` +
    `Fix the flagged configuration — or, if this network's OrgDeployer predates task permissions, it must be upgraded first.`
  );
  // Resolve revert bytes to a friendly reason: try the ABI error name, then the
  // raw selector for known sub-contract errors. Returns null if unrecognizable.
  const friendlyFromData = (data) => {
    if (typeof data !== 'string' || !data.startsWith('0x') || data.length < 10) return null;
    try { const name = iface.parseError(data).name; return SIM_FRIENDLY_ERRORS[name] || name; } catch { /* not an OrgDeployer error */ }
    return SIM_FRIENDLY_SELECTORS[data.slice(0, 10).toLowerCase()] || `error ${data.slice(0, 10)}`;
  };

  let raw;
  try {
    raw = await provider.call(tx);
  } catch (err) {
    // Some providers THROW on revert and nest the error bytes in the payload.
    const data = err?.error?.data?.data || err?.error?.data || err?.data?.data || err?.data;
    const reason = friendlyFromData(typeof data === 'string' ? data : undefined) || err?.reason || err?.message || 'unknown error';
    throw fail(reason);
  }

  // Many RPCs (e.g. Gnosis) return revert bytes as the call RESULT without throwing.
  // A successful deployFullOrg returns a 9-address DeploymentResult; if it doesn't
  // decode, treat the return as a revert (decode the custom error if possible).
  try {
    const [result] = iface.decodeFunctionResult('deployFullOrg', raw);
    return result; // success → predicted module addresses
  } catch {
    const reason = (raw && raw !== '0x') ? friendlyFromData(raw) : 'empty return / no contract at address';
    throw fail(reason || 'unknown revert');
  }
}

/**
 * Inner component that has access to DeployerContext
 */
function DeployerPageContent() {
  const { address, status, chainId: connectedChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { passkeyState } = useAuth();
  const signer = useEthersSigner();
  const wagmiConfig = useConfig();

  const { disconnect } = useDisconnect();

  // Clear any auto-reconnected wallet so users must explicitly choose auth method.
  // Passkey sessions are unaffected (managed separately in AuthContext).
  // Uses a ref so we only disconnect once (the first auto-reconnect), not after user-initiated connects.
  const hasDisconnectedAutoReconnect = useRef(false);
  const [walletUserConnected, setWalletUserConnected] = useState(false);
  const isPasskeyUser = !!passkeyState?.accountAddress;

  useEffect(() => {
    if (!hasDisconnectedAutoReconnect.current && (status === 'reconnecting' || status === 'connected')) {
      hasDisconnectedAutoReconnect.current = true;
      // Only force auth choice when the user has a passkey — wallet-only users
      // shouldn't be disconnected because re-triggering connect can stall
      // in some wallet extensions (e.g. Brave) that consider the dapp already authorized.
      if (isPasskeyUser) {
        disconnect();
      } else {
        setWalletUserConnected(true);
      }
    }
  }, [status, disconnect, isPasskeyUser]);
  useEffect(() => {
    if (status === 'connecting') setWalletUserConnected(true);
    if (status === 'disconnected') setWalletUserConnected(false);
  }, [status]);
  const { addToIpfs } = useIPFScontext();
  const toast = useToast();
  const router = useRouter();
  const { state, actions } = useDeployer();

  // Fetch infrastructure addresses from the target deploy chain's subgraph
  const deployChainId = state.selectedChainId || DEFAULT_DEPLOY_CHAIN_ID;
  const deploySubgraphUrl = getSubgraphUrl(deployChainId);
  // Per-chain client prevents cache poisoning: each endpoint has its own InMemoryCache,
  // so Arbitrum infrastructure addresses can't leak into Gnosis queries.
  const deployClient = useMemo(() => getClient(deploySubgraphUrl), [deploySubgraphUrl]);
  const { data: infraData } = useQuery(FETCH_INFRASTRUCTURE_ADDRESSES, {
    client: deployClient,
    skip: !deploySubgraphUrl,
  });

  // Fetch passkey factory address on deploy chain (needed for cross-chain account creation)
  const { data: factoryData } = useQuery(FETCH_PASSKEY_FACTORY_ADDRESS, {
    client: deployClient,
    skip: !deploySubgraphUrl || !isPasskeyUser,
  });
  const deployChainFactoryAddress = factoryData?.passkeyAccountFactories?.[0]?.id || null;

  // Check if deployer already has a username on the deploy chain (via subgraph)
  const deployerAddr = passkeyState?.accountAddress || address;
  const { data: deployChainAccountData } = useQuery(FETCH_USERNAME_NEW, {
    variables: { id: deployerAddr?.toLowerCase() },
    client: deployClient,
    skip: !deployerAddr || !deploySubgraphUrl,
  });
  const deployChainHasUsername = !!deployChainAccountData?.account?.username;

  // Extract addresses from subgraph data
  const infrastructureAddresses = useMemo(() => {
    const poaManager = infraData?.poaManagerContracts?.[0];

    // Infrastructure PROXY addresses (from PoaManager - these are what you actually call)
    const orgDeployerAddress = poaManager?.orgDeployerProxy || null;
    const orgRegistryProxy = poaManager?.orgRegistryProxy || null;
    const paymasterHubProxy = poaManager?.paymasterHubProxy || null;
    const globalAccountRegistryProxy = poaManager?.globalAccountRegistryProxy || null;

    // Use globalAccountRegistryProxy as registryAddress (this is the UniversalAccountRegistry)
    const registryAddress = globalAccountRegistryProxy;
    const poaManagerAddress = poaManager?.id || null;
    const orgRegistryAddress = orgRegistryProxy;

    return {
      registryAddress,
      poaManagerAddress,
      orgRegistryAddress,
      orgDeployerAddress,
      orgRegistryProxy,
      paymasterHubProxy,
      globalAccountRegistryProxy,
    };
  }, [infraData]);

  // Modal states
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const [isLogoModalOpen, setIsLogoModalOpen] = useState(false);
  const [isLinksModalOpen, setIsLinksModalOpen] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);

  // Preview-and-confirm modal: holds the simulated deployment data; its
  // resolver is fulfilled (true=confirm, false=cancel) by the modal buttons.
  const [previewData, setPreviewData] = useState(null);
  const deployResolverRef = useRef(null);

  // Responsive values
  const exitButtonTop = useBreakpointValue({ base: "8px", lg: "8px", xl: "12px" });
  const exitButtonRight = useBreakpointValue({ base: "10px", lg: "16px", xl: "25px" });
  const exitButtonSize = useBreakpointValue({ base: "md", lg: "md", xl: "lg" });

  const handleExitClick = () => {
    setIsExitModalOpen(true);
  };

  const handleExitConfirm = () => {
    setIsExitModalOpen(false);
    router.push("/");
  };

  const handleExitCancel = () => {
    setIsExitModalOpen(false);
  };

  // Handle deployment from DeployerWizard
  const handleDeployStart = async (config) => {
    setIsDeploying(true);

    // Passkey deploys use chain-specific viem/bundler clients — they never
    // touch the wallet provider, so we skip chain switching and signer refresh.
    const targetChainId = state.selectedChainId || DEFAULT_DEPLOY_CHAIN_ID;
    const isPasskeyDeployer = !!passkeyState?.accountAddress;
    const needsChainSwitch = !isPasskeyDeployer && connectedChainId && connectedChainId !== targetChainId;

    if (needsChainSwitch) {
      try {
        await switchChainAsync({ chainId: targetChainId });
      } catch (e) {
        const networkName = getNetworkByChainId(targetChainId)?.name || 'the correct network';
        toast({
          title: 'Chain switch required',
          description: `Please switch to ${networkName} to deploy.`,
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
        setIsDeploying(false);
        return;
      }
    }

    // After a chain switch the signer from useEthersSigner() is stale (captured
    // at render time with the old chain's transport/network). Fetch a fresh
    // connector client for the target chain so RPC calls and signatures use the
    // correct chain.
    let deploySigner = signer;
    if (needsChainSwitch) {
      try {
        const freshClient = await getConnectorClient(wagmiConfig, { chainId: targetChainId });
        deploySigner = clientToSigner(freshClient);
        console.log('[DEPLOY] Got fresh signer for target chain', targetChainId);
      } catch (e) {
        console.warn('[DEPLOY] Could not get fresh signer, using hook signer:', e.message);
      }
    }

    // Extract deployer username from config (validated by ReviewStep)
    const deployerUsername = config?.deployerUsername || state.organization.username || '';
    console.log('[DEPLOY] Using deployer username:', deployerUsername);

    try {
      // Resolve all usernames to addresses before deployment
      const rolesWithResolvedAddresses = await resolveRoleUsernames(state.roles);

      // Upload description and links to IPFS first
      const links = state.organization.links || [];
      const jsonData = {
        description: state.organization.description || '',
        links: links.map((link) => ({
          name: link.name,
          url: link.url,
        })),
        template: state.organization.template || 'default',
        logo: state.organization.logoURL || null,
        hideTreasury: state.features.hideTreasury || false,
      };

      console.log('[DEPLOY] Preparing IPFS metadata:', jsonData);

      let infoIPFSHash = state.organization.infoIPFSHash;
      if (!infoIPFSHash) {
        console.log('[DEPLOY] No existing IPFS hash, uploading new metadata...');
        const result = await addToIpfs(JSON.stringify(jsonData));
        infoIPFSHash = result.path;
        console.log('[DEPLOY] IPFS upload complete. CID:', infoIPFSHash);
        console.log('[DEPLOY] Verify content at: https://api.thegraph.com/ipfs/api/v0/cat?arg=' + infoIPFSHash);
        actions.setIPFSHash(infoIPFSHash);
      } else {
        console.log('[DEPLOY] Using existing IPFS hash:', infoIPFSHash);
      }

      console.log('[DEPLOY] Final infoIPFSHash for deployment:', infoIPFSHash);

      // Upload role metadata to IPFS for roles with descriptions
      // Note: Role names are stored on-chain and indexed directly, not via IPFS
      console.log('[DEPLOY] Uploading role metadata to IPFS...');
      const rolesWithMetadata = await Promise.all(
        rolesWithResolvedAddresses.map(async (role) => {
          // Only upload metadata if role has a description
          if (role.description && role.description.trim()) {
            const roleMetadata = {
              description: role.description,
              image: role.image || '',
            };
            console.log(`[DEPLOY] Uploading metadata for role "${role.name}":`, roleMetadata);

            try {
              const result = await addToIpfs(JSON.stringify(roleMetadata));
              const metadataCID = result.path;
              console.log(`[DEPLOY] Role "${role.name}" metadata CID:`, metadataCID);

              // Convert IPFS CID to bytes32 for the smart contract
              const metadataCIDBytes32 = ipfsCidToBytes32(metadataCID);
              console.log(`[DEPLOY] Role "${role.name}" metadataCID (bytes32):`, metadataCIDBytes32);

              return {
                ...role,
                metadataCID: metadataCIDBytes32,
              };
            } catch (error) {
              console.error(`[DEPLOY] Failed to upload metadata for role "${role.name}":`, error);
              // Continue without metadata if upload fails
              return role;
            }
          }
          return role;
        })
      );

      // Upload bootstrap project/task descriptions to IPFS (-> metadataHash bytes32),
      // mirroring the role-metadata flow above. Titles are stored on-chain as bytes.
      const HASH_ZERO = '0x' + '0'.repeat(64);
      const uploadBootstrapDesc = async (desc, label) => {
        if (!desc || !desc.trim()) return HASH_ZERO;
        try {
          const result = await addToIpfs(JSON.stringify({ description: desc }));
          return ipfsCidToBytes32(result.path);
        } catch (err) {
          console.error(`[DEPLOY] Bootstrap metadata upload failed for ${label}:`, err);
          return HASH_ZERO;
        }
      };
      const bootstrapWithMetadata = {
        projects: await Promise.all(
          (state.bootstrap?.projects || []).map(async (p, i) => ({
            ...p,
            metadataHash: await uploadBootstrapDesc(p.description, `project ${i + 1}`),
          }))
        ),
        tasks: await Promise.all(
          (state.bootstrap?.tasks || []).map(async (t, i) => ({
            ...t,
            metadataHash: await uploadBootstrapDesc(t.description, `task ${i + 1}`),
          }))
        ),
      };

      // Get deployment params with resolved addresses and metadata
      const stateWithResolvedRoles = {
        ...state,
        roles: rolesWithMetadata,
        bootstrap: bootstrapWithMetadata,
      };

      console.log('=== DEPLOYMENT DEBUG ===');
      console.log('Infrastructure addresses:', infrastructureAddresses);

      const deployParams = mapStateToDeploymentParams(stateWithResolvedRoles, address, infrastructureAddresses);

      console.log('Deployment params:', deployParams);

      // Check if any role has custom distribution settings (additionalWearers or mintToDeployer)
      const hasCustomDistribution = deployParams.roles.some(
        role =>
          (role.distribution.additionalWearers && role.distribution.additionalWearers.length > 0) ||
          role.distribution.mintToDeployer
      );
      console.log('Has custom distribution:', hasCustomDistribution);

      console.log('Roles structure:');
      deployParams.roles.forEach((role, idx) => {
        console.log(`  Role [${idx}] ${role.name}:`, {
          canVote: role.canVote,
          vouching: role.vouching,
          defaults: role.defaults,
          hierarchy: {
            adminRoleIndex: role.hierarchy.adminRoleIndex?.toString?.() || role.hierarchy.adminRoleIndex
          },
          distribution: {
            mintToDeployer: role.distribution.mintToDeployer,
            additionalWearers: role.distribution.additionalWearers,
          },
          hatConfig: role.hatConfig,
        });
      });

      // === EIP-712 Registration Signature (EOA only) ===
      // The deploy contract's HatsTreeSetup calls registerAccountBySig atomically.
      // It checks: registryAddr != 0 && username.length > 0 && regSignature.length > 0
      // and is idempotent (skips if user already has a username on-chain).
      // We use the subgraph to avoid signing when the user already has a username,
      // and a public RPC provider for on-chain reads (nonce, block) so they work
      // reliably after a chain switch.
      let regSignatureData = getSkipRegistrationDefaults();
      const hasNewUsername = deployerUsername && deployerUsername.trim().length > 0;

      if (!isPasskeyDeployer && deploySigner && hasNewUsername && !deployChainHasUsername) {
        const registryAddress = infrastructureAddresses.registryAddress;
        if (registryAddress) {
          try {
            toast({
              title: 'Signature Required',
              description: 'Please sign the message in your wallet to register your username.',
              status: 'info',
              duration: 5000,
              isClosable: true,
            });

            // Use a public RPC provider for reads — the wallet provider can be stale
            // after switchChainAsync (transport/network metadata not yet updated).
            const targetNetwork = getNetworkByChainId(targetChainId);
            const readProvider = new ethers.providers.JsonRpcProvider(
              targetNetwork.rpcUrl,
              { chainId: targetChainId, name: targetNetwork.name }
            );

            const sigResult = await signRegistration({
              signer: deploySigner,
              registryAddress,
              username: deployerUsername,
              deadlineSeconds: 1209600,
              chainId: targetChainId,
              readProvider,
            });

            regSignatureData = {
              regDeadline: sigResult.deadline,
              regNonce: sigResult.nonce,
              regSignature: sigResult.signature,
            };

            console.log('[DEPLOY] EIP-712 signature obtained:', {
              deadline: sigResult.deadline.toString(),
              nonce: sigResult.nonce.toString(),
              signatureLength: sigResult.signature.length,
            });
          } catch (sigError) {
            if (sigError.code === 4001 || sigError.code === 'ACTION_REJECTED') {
              throw new Error('Username registration signature was rejected. Deployment cancelled.');
            }
            // Retry once after a brief delay — chain switch may not have fully propagated
            console.warn('[DEPLOY] EIP-712 signing failed, retrying after delay...', sigError.message);
            try {
              await new Promise(r => setTimeout(r, 2000));
              // Re-fetch fresh signer in case the first one was stale
              const retryClient = await getConnectorClient(wagmiConfig, { chainId: targetChainId });
              const retrySigner = clientToSigner(retryClient);
              const sigResult = await signRegistration({
                signer: retrySigner,
                registryAddress,
                username: deployerUsername,
                deadlineSeconds: 1209600,
                chainId: targetChainId,
                readProvider,
              });
              regSignatureData = {
                regDeadline: sigResult.deadline,
                regNonce: sigResult.nonce,
                regSignature: sigResult.signature,
              };
              console.log('[DEPLOY] EIP-712 signature obtained on retry');
            } catch (retryError) {
              if (retryError.code === 4001 || retryError.code === 'ACTION_REJECTED') {
                throw new Error('Username registration signature was rejected. Deployment cancelled.');
              }
              console.error('[DEPLOY] EIP-712 signing failed on retry, deploying without registration:', retryError);
              toast({
                title: 'Username registration skipped',
                description: 'Could not prepare the username signature. Your org will deploy without on-chain username registration. You can register your username later.',
                status: 'warning',
                duration: 8000,
                isClosable: true,
              });
            }
          }
        }
      } else if (!isPasskeyDeployer) {
        console.log('[DEPLOY] Skipping EIP-712 signing:', {
          hasSigner: !!deploySigner,
          hasNewUsername,
          deployChainHasUsername,
        });
      }

      // Call the deployment function
      const membershipTypeNames = state.roles.map(r => r.name);
      const executiveRoleNames = state.roles
        .filter(r => r.hierarchy.adminRoleIndex === null)
        .map(r => r.name);

      const hasQuadratic = state.voting.classes.some(c => c.quadratic);
      const hybridVotingEnabled = state.voting.classes.length > 1;

      // Pass customRoles if there are any custom distribution settings
      // This ensures mintToDeployer and additionalWearers settings are respected
      const customRoles = hasCustomDistribution ? deployParams.roles : null;

      // Paymaster config
      const paymasterConfig = mapPaymasterConfig(state.paymaster);
      const paymasterFundingWei = getPaymasterFundingValue(state.paymaster);

      // === Pre-flight simulation + preview-and-confirm gate ===
      // Build the exact deployFullOrg calldata both send paths use, simulate it
      // read-only (no tx sent), then show the user the decoded config + predicted
      // module addresses. The real send only runs after they confirm.
      // NOTE: this simulates the deployFullOrg call itself (the part that exercises
      // the 22-field tuple + all new config). For the passkey path it does NOT
      // simulate the ERC-4337 wrapper (executeBatch/registerAccount/initCode/
      // paymaster) — those are validated by the bundler at send time.
      const simDeployerAddress = isPasskeyDeployer
        ? passkeyState.accountAddress
        : await deploySigner.getAddress();

      const deployCalldataArgs = {
        memberTypeNames: membershipTypeNames,
        executivePermissionNames: executiveRoleNames,
        POname: state.organization.name,
        quadraticVotingEnabled: hasQuadratic,
        democracyVoteWeight: 50,
        participationVoteWeight: 50,
        hybridVotingEnabled,
        participationVotingEnabled: !hybridVotingEnabled,
        electionEnabled: state.features.electionHubEnabled,
        educationHubEnabled: state.features.educationHubEnabled,
        zkEmailEnabled: state.features.zkEmailInvitesEnabled,
        infoIPFSHash,
        quorumPercentageDD: state.voting.ddQuorum,
        quorumPercentagePV: state.voting.hybridQuorum,
        username: deployerUsername,
        deployerAddress: simDeployerAddress,
        customRoles,
        infrastructureAddresses,
        regSignatureData,
        paymasterConfig,
        metadataAdminRoleIndex: state.metadataAdminRoleIndex,
        // New deploy-time config (built by mapStateToDeploymentParams above).
        taskManagerPerms: deployParams.taskManagerPerms,
        ddInitialTargets: deployParams.ddInitialTargets,
        bootstrap: deployParams.bootstrap,
      };
      const { calldata: deployCalldata, orgDeployerAddress: deployContractAddress } =
        buildDeployCalldata(deployCalldataArgs);

      // Read-only simulation against the deploy chain (also the behavioral version
      // gate — a pre-taskManagerPerms OrgDeployer reverts decoding the 22-field tuple).
      const simRpcUrl = getNetworkByChainId(targetChainId)?.rpcUrl;
      let predictedResult = null;
      try {
        predictedResult = await simulateDeployCalldata({
          rpcUrl: simRpcUrl,
          to: deployContractAddress,
          from: simDeployerAddress,
          calldata: deployCalldata,
          valueWei: paymasterFundingWei,
        });
        console.log('[DEPLOY] Simulation succeeded. Predicted modules:', predictedResult);
      } catch (simErr) {
        console.error('[DEPLOY] Pre-flight simulation reverted:', simErr);
        toast({
          title: 'Simulation failed — nothing deployed',
          description: simErr.message,
          status: 'error',
          duration: 14000,
          isClosable: true,
        });
        setIsDeploying(false);
        throw simErr;
      }

      // Show the preview modal and wait for the user's decision.
      const confirmed = await new Promise((resolve) => {
        deployResolverRef.current = resolve;
        setPreviewData({
          orgName: state.organization.name,
          isPasskey: isPasskeyDeployer,
          deployerAddress: simDeployerAddress,
          networkName: getNetworkByChainId(targetChainId)?.name || `Chain ${targetChainId}`,
          fundingEth: paymasterFundingWei && paymasterFundingWei.gt(0)
            ? ethers.utils.formatEther(paymasterFundingWei)
            : '0',
          params: deployParams,
          predicted: predictedResult,
        });
      });
      setPreviewData(null);
      deployResolverRef.current = null;

      if (!confirmed) {
        console.log('[DEPLOY] User cancelled at preview — nothing sent.');
        setIsDeploying(false);
        return { success: false, cancelled: true };
      }

      if (isPasskeyDeployer) {
        // === PASSKEY DEPLOYMENT via ERC-4337 UserOp ===
        // Reuse the exact calldata that was just simulated.
        const calldata = deployCalldata;
        const orgDeployerAddress = deployContractAddress;

        const fundingBigInt = paymasterFundingWei.gt(0) ? BigInt(paymasterFundingWei.toString()) : 0n;

        // Create chain-specific clients for deployment target.
        // AuthContext clients are pinned to the home chain for login/reconnect flows.
        const targetNetwork = getNetworkByChainId(targetChainId);
        const targetChain = defineChain({
          id: targetNetwork.chainId,
          name: targetNetwork.name,
          nativeCurrency: targetNetwork.nativeCurrency,
          rpcUrls: { default: { http: [targetNetwork.rpcUrl] } },
          blockExplorers: { default: { name: 'Explorer', url: targetNetwork.blockExplorer } },
        });
        const deployPublicClient = createPublicClient({
          chain: targetChain,
          transport: http(targetNetwork.rpcUrl),
        });
        const deployBundlerClient = createPimlicoClient({
          chain: targetChain,
          transport: http(getBundlerUrl(targetChainId)),
          entryPoint: { address: ENTRY_POINT_ADDRESS, version: '0.7' },
        });

        // --- Cross-chain account handling ---
        // Check if the passkey smart account exists on the target chain.
        // If not, include initCode so the EntryPoint deploys it via the factory.
        let initCode = '0x';
        const accountBytecode = await deployPublicClient.getBytecode({
          address: passkeyState.accountAddress,
        });
        const accountExistsOnTargetChain = accountBytecode && accountBytecode !== '0x';

        if (!accountExistsOnTargetChain) {
          if (!deployChainFactoryAddress) {
            throw new Error(
              `Passkey account factory not found on ${targetNetwork.name}. ` +
              `The protocol infrastructure may not be deployed on this chain yet.`
            );
          }

          // Verify the target chain's factory produces the same address as our home-chain account.
          // CREATE2 address depends on factory address, so if factories differ across chains
          // the account address would differ — causing AA14 (initCode must return sender).
          const targetAccountAddress = await deployPublicClient.readContract({
            address: deployChainFactoryAddress,
            abi: PasskeyAccountFactoryABI,
            functionName: 'getAddress',
            args: [
              passkeyState.credentialId,
              passkeyState.publicKeyX,
              passkeyState.publicKeyY,
              BigInt(passkeyState.salt),
            ],
          });

          if (targetAccountAddress.toLowerCase() !== passkeyState.accountAddress.toLowerCase()) {
            throw new Error(
              `Account address mismatch: home chain account is ${passkeyState.accountAddress} ` +
              `but ${targetNetwork.name} factory would create ${targetAccountAddress}. ` +
              `Cross-chain deployment is not supported for this configuration.`
            );
          }

          const factoryCallData = encodeFunctionData({
            abi: PasskeyAccountFactoryABI,
            functionName: 'createAccount',
            args: [
              passkeyState.credentialId,
              passkeyState.publicKeyX,
              passkeyState.publicKeyY,
              BigInt(passkeyState.salt),
            ],
          });
          initCode = deployChainFactoryAddress + factoryCallData.slice(2);
          console.log('[DEPLOY] Account not found on target chain — initCode will deploy it');
        }

        // Check if the deployer's username is registered on the target chain's registry.
        // The home chain (Arbitrum) has the username, but this chain's registry may not.
        let needsUsernameRegistration = false;
        const registryAddress = infrastructureAddresses.registryAddress;
        if (deployerUsername && registryAddress) {
          try {
            const existingName = await deployPublicClient.readContract({
              address: registryAddress,
              abi: UniversalAccountRegistryABI,
              functionName: 'getUsername',
              args: [passkeyState.accountAddress],
            });
            needsUsernameRegistration = !existingName || existingName.trim().length === 0;
            console.log('[DEPLOY] Username on target chain:', existingName || '(none)');
          } catch {
            // If account doesn't exist yet, getUsername will revert — treat as unregistered
            needsUsernameRegistration = true;
            console.log('[DEPLOY] Could not read username on target chain — will register');
          }
        }

        // Build the UserOp callData:
        // - If username needs registration: executeBatch([registerAccount, deployFullOrg])
        // - Otherwise: single execute(deployFullOrg) (existing behavior)
        let sponsoredCallData;
        let selfFundedCallData;

        if (needsUsernameRegistration && registryAddress) {
          const registerCallData = encodeFunctionData({
            abi: UniversalAccountRegistryABI,
            functionName: 'registerAccount',
            args: [deployerUsername],
          });

          sponsoredCallData = encodeFunctionData({
            abi: PasskeyAccountABI,
            functionName: 'executeBatch',
            args: [
              [registryAddress, orgDeployerAddress],
              [0n, 0n],
              [registerCallData, calldata],
            ],
          });

          selfFundedCallData = encodeFunctionData({
            abi: PasskeyAccountABI,
            functionName: 'executeBatch',
            args: [
              [registryAddress, orgDeployerAddress],
              [0n, fundingBigInt],
              [registerCallData, calldata],
            ],
          });

          console.log('[DEPLOY] Using executeBatch: registerAccount + deployFullOrg');
        } else {
          sponsoredCallData = encodeFunctionData({
            abi: PasskeyAccountABI,
            functionName: 'execute',
            args: [orgDeployerAddress, 0n, calldata],
          });

          selfFundedCallData = encodeFunctionData({
            abi: PasskeyAccountABI,
            functionName: 'execute',
            args: [orgDeployerAddress, fundingBigInt, calldata],
          });
        }

        // Try sponsored deployment first (solidarity fund pays gas via PaymasterHub),
        // then fall back to self-funded if sponsorship is unavailable.
        let userOp;
        const paymasterHubAddress = infrastructureAddresses.paymasterHubProxy;

        if (paymasterHubAddress) {
          try {
            userOp = await buildUserOp({
              sender: passkeyState.accountAddress,
              callData: sponsoredCallData,
              bundlerClient: deployBundlerClient,
              publicClient: deployPublicClient,
              initCode,
              paymasterAddress: paymasterHubAddress,
              paymasterData: encodeOrgDeployPaymasterData(),
            });

            console.log('[DEPLOY] UserOp built with gas sponsorship (solidarity fund)');
          } catch (e) {
            const msg = e.message || e.shortMessage || e.details || '';
            const isPaymasterRejection = msg.includes('AA31') || msg.includes('AA32') || msg.includes('AA33')
              || msg.includes('paymaster') || msg.includes('Paymaster')
              || msg.includes('validatePaymasterUserOp');

            if (isPaymasterRejection) {
              console.warn('[DEPLOY] Gas sponsorship unavailable, falling back to self-funded:', msg);
              userOp = null;
            } else {
              throw e;
            }
          }
        }

        if (!userOp) {
          // Self-funded: account pays gas, can include ETH for org paymaster funding
          userOp = await buildUserOp({
            sender: passkeyState.accountAddress,
            callData: selfFundedCallData,
            bundlerClient: deployBundlerClient,
            publicClient: deployPublicClient,
            initCode,
          });

          console.log('[DEPLOY] UserOp built self-funded (account pays gas)');
        }

        // Sign with passkey (triggers biometric prompt)
        toast({
          title: 'Passkey Signature Required',
          description: 'Please authenticate with your passkey to deploy.',
          status: 'info',
          duration: 5000,
          isClosable: true,
        });

        const userOpHash = getUserOpHash(userOp, ENTRY_POINT_ADDRESS, targetChainId);
        const signature = await signUserOpWithPasskey(userOpHash, passkeyState.rawCredentialId);
        userOp.signature = signature;

        // Submit to target-chain bundler
        const opHash = await deployBundlerClient.sendUserOperation({
          ...userOp,
          entryPointAddress: ENTRY_POINT_ADDRESS,
        });

        console.log('[DEPLOY] UserOp submitted:', opHash);

        // Wait for confirmation on target chain
        const receipt = await deployBundlerClient.waitForUserOperationReceipt({
          hash: opHash,
          timeout: 120_000,
        });

        if (!receipt.success) {
          throw new Error('Deployment transaction failed on-chain.');
        }

        console.log('[DEPLOY] Passkey deployment confirmed:', receipt.receipt.transactionHash);
      } else {
        // === WALLET DEPLOYMENT via ethers signer ===
        await main(
          membershipTypeNames,
          executiveRoleNames,
          state.organization.name,
          hasQuadratic,
          50, // democracyVoteWeight
          50, // participationVoteWeight
          hybridVotingEnabled,
          !hybridVotingEnabled, // participationVotingEnabled
          state.features.electionHubEnabled,
          state.features.educationHubEnabled,
          state.organization.logoURL,
          infoIPFSHash,
          'DirectDemocracy', // votingControlType
          state.voting.ddQuorum,
          state.voting.hybridQuorum,
          deployerUsername,
          deploySigner,
          customRoles,
          infrastructureAddresses,
          regSignatureData,
          undefined, // overrideDeployerAddress
          paymasterConfig,
          paymasterFundingWei,
          state.metadataAdminRoleIndex,
          // New deploy-time config (built by mapStateToDeploymentParams above).
          deployParams.taskManagerPerms,
          deployParams.ddInitialTargets,
          deployParams.bootstrap
        );
      }

      // Return success - let DeployerWizard handle the celebration
      return { success: true, orgName: state.organization.name };

    } catch (error) {
      console.error("Error deploying organization:", error);
      toast({
        title: "Deployment failed",
        description: error.message || "There was an error during deployment.",
        status: "error",
        duration: 9000,
        isClosable: true,
      });
      throw error; // Re-throw so DeployerWizard knows it failed
    } finally {
      setIsDeploying(false);
    }
  };

  // Handle navigation after deployment celebration
  const handleDeploySuccess = () => {
    // Store deploy info for the tour prompt, then navigate immediately
    try {
      localStorage.setItem('poa-new-org-deploy', JSON.stringify({
        orgName: state.organization.name,
        deployedAt: Date.now(),
      }));
    } catch {}
    router.push(`/dashboard?org=${encodeURIComponent(state.organization.name)}&newOrg=true`);
  };

  // Handlers for modals that OrganizationStep needs
  const handleSaveLogo = (ipfsUrl) => {
    actions.setLogoURL(ipfsUrl);
    setIsLogoModalOpen(false);
  };

  const handleSaveLinks = (links) => {
    actions.updateOrganization({ links });
    setIsLinksModalOpen(false);
  };

  return (
    <Box height="100vh" overflow="hidden" position="relative">
      {/* Ambient morphing orbs - matching landing page */}
      <Box
        position="absolute"
        top="-8%"
        left="-6%"
        w={["250px", "350px", "450px"]}
        h={["250px", "350px", "450px"]}
        bg="#7DD3FC"
        opacity={0.15}
        filter="blur(80px)"
        pointerEvents="none"
        zIndex={0}
        sx={{
          animation: "createOrb1 20s ease-in-out infinite",
          "@keyframes createOrb1": {
            "0%": { borderRadius: "40% 60% 60% 40% / 60% 40% 60% 40%", transform: "translate(0, 0) rotate(0deg)" },
            "33%": { borderRadius: "60% 40% 50% 50% / 40% 60% 40% 60%", transform: "translate(25px, 15px) rotate(60deg)" },
            "66%": { borderRadius: "50% 50% 40% 60% / 50% 40% 60% 50%", transform: "translate(-10px, 30px) rotate(120deg)" },
            "100%": { borderRadius: "40% 60% 60% 40% / 60% 40% 60% 40%", transform: "translate(0, 0) rotate(0deg)" },
          },
        }}
      />
      <Box
        position="absolute"
        bottom="-5%"
        right="-4%"
        w={["200px", "300px", "400px"]}
        h={["200px", "300px", "400px"]}
        bg="#67E8F9"
        opacity={0.12}
        filter="blur(80px)"
        pointerEvents="none"
        zIndex={0}
        sx={{
          animation: "createOrb2 24s ease-in-out infinite",
          "@keyframes createOrb2": {
            "0%": { borderRadius: "60% 40% 50% 50% / 50% 60% 40% 50%", transform: "translate(0, 0) rotate(0deg)" },
            "33%": { borderRadius: "40% 60% 60% 40% / 60% 40% 60% 40%", transform: "translate(-20px, 25px) rotate(-60deg)" },
            "66%": { borderRadius: "50% 40% 50% 60% / 40% 60% 50% 40%", transform: "translate(15px, -10px) rotate(-120deg)" },
            "100%": { borderRadius: "60% 40% 50% 50% / 50% 60% 40% 50%", transform: "translate(0, 0) rotate(0deg)" },
          },
        }}
      />


      {/* Exit Button */}
      <Box position="absolute" top={exitButtonTop} right={exitButtonRight} zIndex={10}>
        <IconButton
          onClick={handleExitClick}
          bg="warmGray.100"
          _hover={{ bg: "warmGray.200" }}
          aria-label="Exit"
          icon={<CloseIcon color="warmGray.600" />}
          size={exitButtonSize}
          isRound
        />
      </Box>

      {/* Full Width Deployer Wizard */}
      <Box
        width="100%"
        height="100%"
        overflowY="auto"
      >
        <DeployerWizard
          onDeployStart={handleDeployStart}
          onDeploySuccess={handleDeploySuccess}
          deployerAddress={passkeyState?.accountAddress || (walletUserConnected ? address : undefined)}
        />
      </Box>

      {/* Modals */}
      <LogoDropzoneModal
        isOpen={isLogoModalOpen}
        onSave={handleSaveLogo}
        onClose={() => setIsLogoModalOpen(false)}
      />
      <LinksModal
        isOpen={isLinksModalOpen}
        onSave={handleSaveLinks}
        onClose={() => setIsLinksModalOpen(false)}
      />

      {/* Pre-flight preview + confirm (simulated, before any tx is sent) */}
      <DeploymentPreviewModal
        data={previewData}
        onConfirm={() => deployResolverRef.current && deployResolverRef.current(true)}
        onCancel={() => deployResolverRef.current && deployResolverRef.current(false)}
      />

      {/* Exit Confirmation Modal */}
      <Modal isOpen={isExitModalOpen} onClose={handleExitCancel} initialFocusRef={undefined}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Leave without saving?</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            Your configuration will be discarded. The organization you've been
            shaping won't be kept once you leave this screen.
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={handleExitCancel} autoFocus>
              Keep configuring
            </Button>
            <Button colorScheme="red" onClick={handleExitConfirm}>
              Leave and discard
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Deployment overlay is now handled by ReviewStep for a better UX */}
    </Box>
  );
}

/**
 * HowTo JSON-LD for the create flow. The wizard UX is full-screen and doesn't
 * leave room for a visible 5-step explainer above the fold, so we expose the
 * structure to crawlers via schema only — Google can still surface a HowTo
 * rich result without a paired DOM walkthrough.
 */
const createHowToLD = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "How to create a community-owned organization on poa.box",
  "description":
    "Launch a no-code DAO on Poa: name your organization, choose a governance model, set up roles, configure treasury and gas, and deploy on-chain.",
  "totalTime": "PT10M",
  "step": [
    {
      "@type": "HowToStep",
      "position": 1,
      "name": "Name and describe your community",
      "text":
        "Pick a name, write a short description, upload a logo, and add links to your existing community spaces (Discord, Twitter, GitHub).",
    },
    {
      "@type": "HowToStep",
      "position": 2,
      "name": "Choose a governance model",
      "text":
        "Pick direct democracy, contribution-based voting, or a hybrid. Configure quorum and approval thresholds for your community-owned organization.",
    },
    {
      "@type": "HowToStep",
      "position": 3,
      "name": "Create roles and permissions",
      "text":
        "Add member roles, executive roles, and committees. Set vouching requirements and granular permissions for each tier of membership.",
    },
    {
      "@type": "HowToStep",
      "position": 4,
      "name": "Set up treasury and gas sponsorship",
      "text":
        "Configure how your organization's on-chain treasury is managed and whether gas is sponsored from the protocol's solidarity fund or self-funded.",
    },
    {
      "@type": "HowToStep",
      "position": 5,
      "name": "Deploy on-chain",
      "text":
        "Review the configuration, sign with your wallet or passkey, and deploy the DAO. The organization is live the moment the transaction confirms.",
    },
  ],
};

const ArchitectPage = () => {
  return (
    <>
    <SEOHead
      title="Create a Community-Owned Organization on Poa (No Code)"
      description="Launch a community-owned organization on poa.box in five steps. Pick a governance model. Set up roles. Configure the treasury. Sign once. No code required."
      path="/create"
      keywords={[
        "create a DAO",
        "no-code DAO",
        "launch community-owned organization",
        "DAO setup",
        "create worker cooperative DAO",
        "create student organization DAO",
        "poa.box",
      ]}
      jsonLd={createHowToLD}
    />
    <DeployerProvider>
      <DeployerPageContent />
    </DeployerProvider>
    </>
  );
};

export default ArchitectPage;
