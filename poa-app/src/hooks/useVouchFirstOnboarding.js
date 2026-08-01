/**
 * useVouchFirstOnboarding
 * State machine hook for vouch-first passkey onboarding.
 *
 * Flow: create credential → get counterfactual address → share vouch link →
 * poll for vouches → once quorum met → deploy + join in single UserOp.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@apollo/client';
import { getClient } from '@/util/apolloClient';
import { useAuth } from '../context/AuthContext';
import { usePOContext } from '../context/POContext';
import { useUserActive } from './useUserActive';
import { DEFAULT_CHAIN_ID } from '../config/networks';
import { createChainClients } from '../services/web3/utils/chainClients';
import { createPasskeyCredential } from '../services/web3/passkey/passkeyCreate';
import {
  createPasskeyOnboardingService,
  PasskeyOnboardingService,
  OnboardingStep,
  STEP_MESSAGES,
} from '../services/web3/domain/PasskeyOnboardingService';
import {
  savePendingCredential,
  getPendingCredentialForOrg,
  removePendingCredential,
} from '../services/web3/passkey/passkeyStorage';
import { FETCH_INFRASTRUCTURE_ADDRESSES } from '../util/queries';
import { FETCH_PASSKEY_FACTORY_ADDRESS } from '../util/passkeyQueries';

/**
 * Vouch-first onboarding phases
 */
export const VouchFirstPhase = {
  IDLE: 'idle',
  CREATING_CREDENTIAL: 'creating_credential',
  AWAITING_VOUCHES: 'awaiting_vouches',
  COMPLETING: 'completing',
  SUCCESS: 'success',
  ERROR: 'error',
};

/**
 * @param {Object} params
 * @param {string} params.orgName - DAO name (userDAO)
 * @param {Function} params.refetchVouches - refetch function from useVouches
 */
export function useVouchFirstOnboarding({
  orgName,
  refetchVouches,
  eligibilityModuleAddress,
  existingUsername,
}) {
  const { publicClient: homePublicClient, bundlerClient: homeBundlerClient, activatePasskey } = useAuth();
  const { quickJoinContractAddress, orgId, subgraphUrl, orgChainId } = usePOContext();

  // Create chain-specific clients when org is on a different chain
  const isCrossChain = orgChainId && orgChainId !== DEFAULT_CHAIN_ID;
  const { publicClient, bundlerClient, chainId } = useMemo(() => {
    if (!isCrossChain) {
      return { publicClient: homePublicClient, bundlerClient: homeBundlerClient, chainId: DEFAULT_CHAIN_ID };
    }
    const clients = createChainClients(orgChainId);
    if (!clients) return { publicClient: homePublicClient, bundlerClient: homeBundlerClient, chainId: DEFAULT_CHAIN_ID };
    return { publicClient: clients.publicClient, bundlerClient: clients.bundlerClient, chainId: orgChainId };
  }, [isCrossChain, orgChainId, homePublicClient, homeBundlerClient]);

  // Per-chain client prevents cache poisoning: each endpoint has its own InMemoryCache.
  const orgClient = useMemo(() => getClient(subgraphUrl), [subgraphUrl]);

  // Infrastructure addresses — routed to org's chain subgraph.
  // Skip until subgraphUrl is resolved by POContext to avoid querying the default
  // (Arbitrum) subgraph and getting wrong-chain addresses (e.g. registry on Arbitrum
  // instead of Gnosis).
  const { data: infraData } = useQuery(FETCH_INFRASTRUCTURE_ADDRESSES, {
    client: orgClient,
    skip: !subgraphUrl,
  });
  const registryAddress = infraData?.universalAccountRegistries?.[0]?.id || null;
  const paymasterAddress = infraData?.poaManagerContracts?.[0]?.paymasterHubProxy || null;

  const { data: factoryData } = useQuery(FETCH_PASSKEY_FACTORY_ADDRESS, {
    client: orgClient,
    skip: !subgraphUrl,
  });
  const factoryAddress = factoryData?.passkeyAccountFactories?.[0]?.id || null;

  // State
  const [phase, setPhase] = useState(VouchFirstPhase.IDLE);
  const [pendingCredential, setPendingCredential] = useState(null);
  const [vouchLink, setVouchLink] = useState('');
  const [step, setStep] = useState(OnboardingStep.IDLE);
  const [error, setError] = useState(null);
  const pollIntervalRef = useRef(null);

  const stepMessage = STEP_MESSAGES[step] || '';

  // On mount: check for existing pending credential
  useEffect(() => {
    if (!orgName) return;
    const stored = getPendingCredentialForOrg(orgName);
    // A pending saved by the zk-email one-step claim flow is NOT a vouch application — adopting it
    // here would build a vouch link with hatId=undefined and crash completion. Leave it alone.
    if (stored && stored.flow !== 'zkemail') {
      setPendingCredential(stored);
      setPhase(VouchFirstPhase.AWAITING_VOUCHES);
      setVouchLink(buildVouchLink(orgName, stored.accountAddress, stored.selectedHatId));
    }
  }, [orgName]);

  const isActive = useUserActive();
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  // Refetch vouches immediately when user returns from inactive state
  const wasActiveRef = useRef(isActive);
  useEffect(() => {
    if (isActive && !wasActiveRef.current && phase === VouchFirstPhase.AWAITING_VOUCHES && refetchVouches) {
      refetchVouches();
    }
    wasActiveRef.current = isActive;
  }, [isActive, phase, refetchVouches]);

  // Poll for vouches while awaiting (safety net — useVouches already refetches on vouch events).
  // Skips refetch when the tab is hidden or user is idle to reduce subgraph load.
  useEffect(() => {
    if (phase === VouchFirstPhase.AWAITING_VOUCHES && refetchVouches) {
      pollIntervalRef.current = setInterval(() => {
        if (isActiveRef.current) refetchVouches();
      }, 45000);
      return () => clearInterval(pollIntervalRef.current);
    }
    return () => clearInterval(pollIntervalRef.current);
  }, [phase, refetchVouches]);

  /**
   * Step 1: Create passkey credential + compute counterfactual address.
   * Does NOT deploy — just creates the WebAuthn credential and saves to pending storage.
   */
  const createCredentialAndLink = useCallback(async (username, selectedHatId) => {
    if (!factoryAddress || !publicClient) {
      setError(new Error('We couldn’t get your account ready just yet. Please try again in a moment.'));
      return;
    }

    setPhase(VouchFirstPhase.CREATING_CREDENTIAL);
    setError(null);

    try {
      // Create passkey (biometric prompt)
      const credential = await createPasskeyCredential(username);

      // Compute counterfactual address
      const accountAddress = await PasskeyOnboardingService.computeCounterfactualAddress(
        publicClient,
        factoryAddress,
        credential,
      );

      const pending = {
        credentialId: credential.credentialId,
        rawCredentialId: credential.rawCredentialId,
        publicKeyX: credential.publicKeyX,
        publicKeyY: credential.publicKeyY,
        salt: credential.salt.toString(),
        accountAddress,
        selectedHatId,
        orgName,
        username,
      };

      // Persist so flow survives browser close
      savePendingCredential(pending);
      setPendingCredential(pending);

      const link = buildVouchLink(orgName, accountAddress, selectedHatId);
      setVouchLink(link);

      // Copy to clipboard
      try {
        await navigator.clipboard.writeText(link);
      } catch {
        // Clipboard may fail in some browsers — link is still displayed
      }

      setPhase(VouchFirstPhase.AWAITING_VOUCHES);
      return pending;
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.message?.includes('NotAllowedError')) {
        setError(new Error('Passkey creation was cancelled.'));
      } else {
        setError(err);
      }
      setPhase(VouchFirstPhase.ERROR);
    }
  }, [factoryAddress, publicClient, orgName]);

  /**
   * Step 2: Deploy account + join in single UserOp.
   * Called after vouch quorum is met.
   */
  const completeOnboarding = useCallback(async (username) => {
    if (!pendingCredential) {
      setError(new Error('We couldn’t find your in-progress sign-up. Please start creating your account again.'));
      return;
    }

    if (!publicClient || !bundlerClient || !factoryAddress || !registryAddress || !quickJoinContractAddress || !paymasterAddress || !orgId) {
      setError(new Error('We couldn’t finish setting up your account just yet. Please try again in a moment.'));
      return;
    }

    setPhase(VouchFirstPhase.COMPLETING);
    setError(null);

    try {
      const service = createPasskeyOnboardingService({
        publicClient,
        bundlerClient,
        factoryAddress,
        registryAddress,
        quickJoinAddress: quickJoinContractAddress,
        eligibilityModuleAddress,
        paymasterAddress,
        orgId,
        hatId: pendingCredential.selectedHatId,
        chainId,
        existingUsername: existingUsername || null,
      });

      const credential = {
        credentialId: pendingCredential.credentialId,
        publicKeyX: pendingCredential.publicKeyX,
        publicKeyY: pendingCredential.publicKeyY,
        rawCredentialId: pendingCredential.rawCredentialId,
        salt: BigInt(pendingCredential.salt),
        accountAddress: pendingCredential.accountAddress,
      };

      const result = await service.deployWithExistingCredential(
        username,
        credential,
        (newStep, data) => {
          setStep(newStep);
          if (newStep === OnboardingStep.ERROR) {
            setError(data?.error || new Error('Unknown error'));
          }
        },
      );

      // Clean up pending storage
      removePendingCredential(pendingCredential.accountAddress);

      // Activate passkey auth
      activatePasskey({
        credentialId: result.credentialId,
        rawCredentialId: result.rawCredentialId,
        publicKeyX: result.publicKeyX,
        publicKeyY: result.publicKeyY,
        accountAddress: result.accountAddress,
        salt: result.salt,
      });

      setPhase(VouchFirstPhase.SUCCESS);
      return result;
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.message?.includes('NotAllowedError')) {
        setError(new Error('Passkey signing was cancelled.'));
      } else {
        setError(err);
      }
      setPhase(VouchFirstPhase.ERROR);
    }
  }, [
    pendingCredential,
    publicClient,
    bundlerClient,
    factoryAddress,
    registryAddress,
    quickJoinContractAddress,
    eligibilityModuleAddress,
    paymasterAddress,
    orgId,
    chainId,
    existingUsername,
    activatePasskey,
  ]);

  /**
   * Reset the entire flow.
   */
  const reset = useCallback(() => {
    if (pendingCredential?.accountAddress) {
      removePendingCredential(pendingCredential.accountAddress);
    }
    setPendingCredential(null);
    setVouchLink('');
    setPhase(VouchFirstPhase.IDLE);
    setStep(OnboardingStep.IDLE);
    setError(null);
  }, [pendingCredential]);

  return {
    phase,
    pendingCredential,
    vouchLink,
    step,
    stepMessage,
    error,
    createCredentialAndLink,
    completeOnboarding,
    reset,
    // Expose for optimistic cache update after join
    existingUsername: existingUsername || null,
    vouchedHatId: pendingCredential?.selectedHatId || null,
  };
}

function buildVouchLink(orgName, accountAddress, hatId) {
  if (typeof window === 'undefined') return '';
  const base = `${window.location.origin}/join`;
  return `${base}?org=${encodeURIComponent(orgName)}&vouch=${accountAddress}&hatId=${hatId}`;
}

export default useVouchFirstOnboarding;
