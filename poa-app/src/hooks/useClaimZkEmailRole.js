/**
 * useClaimZkEmailRole
 * Orchestrates a client-side ZK Email role claim against the merkle-allowlist model:
 *   1. read the org's active allowlist (root + CID) on-chain,
 *   2. fetch the allowlist file from IPFS and assert it matches the on-chain root,
 *   3. decide the claimer's entry — a SPECIFIC-address entry for their From email if present, else a
 *      whole-DOMAIN entry for their sending domain,
 *   4. prove the matching circuit in-browser (v2 for email, v1 for domain),
 *   5. submit the claim with the entry's hatIds + merkle proof (gasless via PaymasterHub on a passkey).
 *
 * TWO submission paths:
 *   - EXISTING account (EOA or passkey signed in): plain claimRoleBy{Domain,Email} via the tx manager.
 *   - BRAND-NEW user (no account at all): ONE-STEP onboarding — `prepareNewPasskey(username)` creates
 *     a local credential (no transaction) and computes the counterfactual account address the email
 *     subject binds to; the claim then submits registerAndClaimBy{Domain,Email}WithPasskey as a single
 *     gasless UserOp that deploys the account + registers the username + mints the role, atomically —
 *     the exact analog of the join page's vouch-first "Create Account & Get Vouch Link" flow.
 *     The pending credential persists in localStorage so a refresh between "send the email" and
 *     "upload the .eml" cannot strand the address the user already emailed.
 *
 * ZkEmailInvites is OPTIONAL — this hook refuses to run unless `zkEmailInvitesEnabled` (POContext).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@apollo/client';
import { useAccount, useSwitchChain } from 'wagmi';
import { getClient } from '@/util/apolloClient';
import { useWeb3Services, useTransactionWithNotification } from './useWeb3Services';
import { usePOContext } from '../context/POContext';
import { useAuth } from '../context/AuthContext';
import { useIPFScontext } from '../context/ipfsContext';
import { useOrgName } from './useOrgName';
import { DEFAULT_CHAIN_ID } from '../config/networks';
import { createChainClients } from '../services/web3/utils/chainClients';
import { createZkEmailOnboardingService } from '../services/web3/domain/ZkEmailOnboardingService';
import {
  savePendingCredential,
  getPendingCredentialForOrg,
  removePendingCredential,
} from '../services/web3/passkey/passkeyStorage';
import UniversalAccountRegistryABI from '../../abi/UniversalAccountRegistry.json';
import { FETCH_INFRASTRUCTURE_ADDRESSES } from '../util/queries';
import { FETCH_PASSKEY_FACTORY_ADDRESS } from '../util/passkeyQueries';
import { generateDomainProof, generateEmailAddressProof, parseEml } from '../lib/zkemail/prover';
import { emailHash, assertRootMatches, proofForDomain, proofForEmailHash } from '../lib/zkemail/allowlist';

export const ZK_CLAIM_STEPS = {
  IDLE: 'idle',
  CHECKING: 'checking',
  PROVING: 'proving',
  PROOF_READY: 'proof_ready', // proved; waiting for a user click to sign (WebAuthn needs fresh activation)
  SIGNING: 'signing', // biometric prompts for the one-step passkey path
  SUBMITTING: 'submitting',
  DONE: 'done',
  ERROR: 'error',
};

const ZERO_ROOT = '0x0000000000000000000000000000000000000000000000000000000000000000';

export function useClaimZkEmailRole() {
  const { zkEmailInvites } = useWeb3Services();
  const { executeWithNotification } = useTransactionWithNotification();
  const { zkEmailInvitesAddress, zkEmailInvitesEnabled, orgId, orgChainId, subgraphUrl } = usePOContext();
  const {
    accountAddress,
    isAuthenticated,
    isPasskeyUser,
    publicClient: homePublicClient,
    bundlerClient: homeBundlerClient,
    activatePasskey,
  } = useAuth();
  const { chain: connectedChain } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { safeFetchFromIpfs, bytes32ToIpfsCid } = useIPFScontext();
  const orgName = useOrgName();

  const [step, setStep] = useState(ZK_CLAIM_STEPS.IDLE);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState(null);
  const [pendingAccount, setPendingAccount] = useState(null);

  /* ── Infra for the one-step path (org-chain clients + addresses, same sourcing as onboarding) ── */
  const isCrossChain = orgChainId && orgChainId !== DEFAULT_CHAIN_ID;
  const { publicClient, bundlerClient, chainId } = useMemo(() => {
    if (!isCrossChain) {
      return { publicClient: homePublicClient, bundlerClient: homeBundlerClient, chainId: DEFAULT_CHAIN_ID };
    }
    const clients = createChainClients(orgChainId);
    if (!clients) return { publicClient: homePublicClient, bundlerClient: homeBundlerClient, chainId: DEFAULT_CHAIN_ID };
    return { publicClient: clients.publicClient, bundlerClient: clients.bundlerClient, chainId: orgChainId };
  }, [isCrossChain, orgChainId, homePublicClient, homeBundlerClient]);

  const orgClient = useMemo(() => getClient(subgraphUrl), [subgraphUrl]);
  const { data: infraData } = useQuery(FETCH_INFRASTRUCTURE_ADDRESSES, { client: orgClient, skip: !subgraphUrl });
  const { data: factoryData } = useQuery(FETCH_PASSKEY_FACTORY_ADDRESS, { client: orgClient, skip: !subgraphUrl });
  const registryAddress = infraData?.universalAccountRegistries?.[0]?.id || null;
  const paymasterAddress = infraData?.poaManagerContracts?.[0]?.paymasterHubProxy || null;
  const factoryAddress = factoryData?.passkeyAccountFactories?.[0]?.id || null;

  const newAccountReady = Boolean(
    publicClient && bundlerClient && factoryAddress && registryAddress && paymasterAddress && orgId && zkEmailInvitesAddress && orgName,
  );

  // Cache the last successful proof so a failure AFTER proving (biometric cancel, bundler timeout,
  // paymaster rejection) retries in seconds instead of re-running the 17-60s prove. Nothing on-chain
  // is consumed by a failed submission (the nullifier is only marked on success).
  const proofCacheRef = useRef(null);

  // A proved-but-not-yet-submitted claim, held between `claim()` (prove) and `finishClaim()` (sign +
  // submit). The split exists because the passkey/wallet signature MUST be triggered by a fresh user
  // gesture — a 14-40s prove expires the file-pick activation, so auto-firing WebAuthn throws
  // "The document is not focused". `ready` drives the "Finish" button in the UI.
  const readyRef = useRef(null);
  const [ready, setReady] = useState(false);
  // Synchronous in-flight lock so a double-click on "Finish" can't fire a second passkey ceremony /
  // submission before the async setStep(SIGNING) re-renders the button away.
  const submittingRef = useRef(false);

  const onboardingService = useMemo(() => {
    if (!newAccountReady) return null;
    return createZkEmailOnboardingService({
      publicClient,
      bundlerClient,
      factoryAddress,
      registryAddress,
      zkEmailInvitesAddress,
      paymasterAddress,
      orgId,
      chainId,
    });
  }, [newAccountReady, publicClient, bundlerClient, factoryAddress, registryAddress, zkEmailInvitesAddress, paymasterAddress, orgId, chainId]);

  // Restore a pending zk-email credential (survives refresh between sending the email and uploading).
  useEffect(() => {
    if (isAuthenticated || pendingAccount || !orgName) return;
    const pending = getPendingCredentialForOrg(orgName);
    if (pending?.flow === 'zkemail' && pending.accountAddress) {
      setPendingAccount(pending);
    }
  }, [isAuthenticated, pendingAccount, orgName]);

  const reset = useCallback(() => {
    setStep(ZK_CLAIM_STEPS.IDLE);
    setError(null);
    setMeta(null);
    readyRef.current = null;
    proofCacheRef.current = null;
    setReady(false);
  }, []);

  const fail = useCallback((e) => {
    let err = e instanceof Error ? e : new Error(String(e));
    if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
      err = new Error('Passkey prompt was cancelled — try again when you are ready.');
    } else if (/dkim.*(not found|fail|invalid|mismatch)|no (dkim|signature)/i.test(err.message || '')) {
      err = new Error(
        'The email’s signature couldn’t be verified from this file. Download the ORIGINAL raw message ' +
          'from your provider’s website (Gmail: mail.google.com → open the message → ⋮ → Show original → ' +
          'Download original) — mobile apps, Spark, forwards, and PDFs won’t work. ' +
          `(${err.message})`,
      );
    }
    setError(err);
    setStep(ZK_CLAIM_STEPS.ERROR);
    return { success: false, error: err };
  }, []);

  /**
   * ONE-STEP path, part 1 (no transaction): create the passkey credential locally and compute the
   * counterfactual account address the verification email must bind to. Persisted per-org.
   */
  const prepareNewPasskey = useCallback(
    async (username) => {
      setError(null);
      const name = (username || '').trim();
      if (name.length < 3) return fail(new Error('Pick a username (at least 3 characters) first.'));
      if (!onboardingService || !orgName) {
        return fail(new Error('Account infrastructure is still loading — try again in a moment.'));
      }
      // One pending slot per org: never clobber an in-progress vouch application (its credential —
      // and any vouches already collected for its address — would be unrecoverable).
      const existing = getPendingCredentialForOrg(orgName);
      if (existing && existing.flow !== 'zkemail') {
        return fail(
          new Error('You have an in-progress join application for this organization — finish or discard it on the Join page first.'),
        );
      }
      try {
        // Fail BEFORE the biometric prompt if the username is taken — a collision surfacing inside
        // the final claim transaction would invalidate the already-emailed subject address.
        const owner = await publicClient.readContract({
          address: registryAddress,
          abi: UniversalAccountRegistryABI,
          functionName: 'getAddressOfUsername',
          args: [name],
        });
        if (owner && owner !== '0x0000000000000000000000000000000000000000') {
          return fail(new Error(`The username "${name}" is already taken — pick another.`));
        }
        const { credential, accountAddress: addr } = await onboardingService.createPendingCredential(name);
        const pending = {
          credentialId: credential.credentialId,
          rawCredentialId: credential.rawCredentialId,
          publicKeyX: credential.publicKeyX,
          publicKeyY: credential.publicKeyY,
          salt: credential.salt.toString(),
          accountAddress: addr,
          orgName,
          username: name,
          flow: 'zkemail',
        };
        savePendingCredential(pending);
        setPendingAccount(pending);
        return { success: true, accountAddress: addr };
      } catch (e) {
        return fail(e);
      }
    },
    [onboardingService, orgName, publicClient, registryAddress, fail],
  );

  /** Abandon the pending credential (e.g. the user wants a different username). */
  const discardPendingPasskey = useCallback(() => {
    if (pendingAccount?.accountAddress) removePendingCredential(pendingAccount.accountAddress);
    setPendingAccount(null);
    reset();
  }, [pendingAccount, reset]);

  // The address the email subject must bind to: the signed-in account, or the pending one.
  const claimerAddress = isAuthenticated && accountAddress ? accountAddress : pendingAccount?.accountAddress || null;

  /**
   * Claim a role by proving control of an email the org's allowlist invites.
   * Existing accounts submit a plain claim; a pending passkey submits the one-step
   * register-and-claim UserOp (account deploy + username + role, atomically).
   * @param {string} emlText raw .eml the user controls (sent from the address being verified)
   */
  const claim = useCallback(
    async (emlText) => {
      setError(null);
      if (!zkEmailInvitesEnabled || !zkEmailInvitesAddress) {
        return fail(new Error('This organization does not have ZK Email invites enabled.'));
      }
      const oneStep = !(isAuthenticated && accountAddress);
      if (oneStep && !pendingAccount) {
        return fail(new Error('Create your passkey first (or sign in) so the claim has an account to land in.'));
      }
      if (!oneStep && !zkEmailInvites) {
        return fail(new Error('Web3 services are not ready yet — try again in a moment.'));
      }
      if (oneStep && !onboardingService) {
        return fail(new Error('Account infrastructure is still loading — try again in a moment.'));
      }
      const claimer = oneStep ? pendingAccount.accountAddress : accountAddress;

      try {
        // 1-2. Read the active allowlist and fetch + verify the file.
        setStep(ZK_CLAIM_STEPS.CHECKING);
        let root;
        let cid;
        if (oneStep) {
          // Read directly (no tx manager for a not-yet-signed-in user). Sequential (not Promise.all)
          // + retry: concurrent eth_calls to a rate-limited public RPC intermittently return empty for
          // the second call → CALL_EXCEPTION data="0x". Mirrors ZkEmailInvitesService.getActiveAllowlist.
          const readBytes32 = (functionName) =>
            publicClient.readContract({
              address: zkEmailInvitesAddress,
              abi: [{ name: functionName, type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'bytes32' }] }],
              functionName,
            });
          for (let attempt = 0; ; attempt++) {
            try {
              root = await readBytes32('merkleRoot');
              cid = await readBytes32('allowlistCid');
              break;
            } catch (e) {
              if (attempt >= 2) throw e;
              await new Promise((res) => setTimeout(res, 600));
            }
          }
        } else {
          ({ root, cid } = await zkEmailInvites.getActiveAllowlist(zkEmailInvitesAddress));
        }
        if (!root || root === ZERO_ROOT) {
          return fail(new Error('This organization has not activated an email allowlist yet.'));
        }
        const cidStr = bytes32ToIpfsCid(cid);
        const doc = await safeFetchFromIpfs(cidStr);
        if (!doc) return fail(new Error('Could not load the allowlist file from IPFS — try again.'));
        const tree = assertRootMatches(doc, root); // throws if the file does not match the on-chain root

        // Pre-flight: the upload must be a RAW RFC-822 message carrying its DKIM signature. App
        // "downloads" (Gmail/Spark mobile), forwards, and PDF/screenshot exports lack it, and the
        // prover's own error for that case is cryptic.
        if (!/^DKIM-Signature:/im.test(emlText)) {
          // Third-party composer (Spark/Readdle etc. over SMTP): the provider stores the SUBMITTED
          // copy, which is unsigned — the DKIM signature is only added on outbound delivery. No
          // export of this copy can ever verify; the message must be COMPOSED in the provider's own
          // website/app and re-sent.
          const thirdParty = /@Spark>|X-Readdle|X-Mailer:(?!.*(Gmail|Outlook))/im.test(emlText);
          // No Received chain at all = the SENT-folder copy, stored at composition BEFORE the
          // provider's outbound server adds the DKIM signature. Only the DELIVERED copy is signed.
          const sentCopy = !/^Received:/im.test(emlText);
          return fail(
            new Error(
              thirdParty
                ? 'This email was composed in a third-party app (e.g. Spark), so the saved copy has no ' +
                  'cryptographic signature — no export of it will work. Re-send the message from your ' +
                  'provider’s own website (e.g. mail.google.com) with the same subject, then download ' +
                  'the copy from the inbox that RECEIVED it.'
                : sentCopy
                  ? 'This is your SENT copy — it was saved before the signature was added, so it can ' +
                    'never verify. Download the message from the inbox that RECEIVED it instead. If you ' +
                    'sent it to your own address in the same account, re-send it (same subject) to a ' +
                    'DIFFERENT inbox you can open — a work email or second account — and export it there ' +
                    'via ⋮ → Show original → Download original.'
                  : 'This file doesn’t contain the email’s cryptographic signature. Download the ORIGINAL raw ' +
                    'message from the RECEIVING inbox via the provider’s WEBSITE — Gmail: mail.google.com → ' +
                    'open the message → ⋮ → Show original → Download original. Mobile apps and most mail ' +
                    'apps (Spark, etc.) cannot produce this file.',
            ),
          );
        }

        // Fast-fail on a stale subject BEFORE the expensive prove: the email must bind THIS claimer.
        const boundMatch = emlText.match(/Claim POP role for (0x[0-9a-fA-F]{40})/);
        if (boundMatch && boundMatch[1].toLowerCase() !== claimer.toLowerCase()) {
          return fail(
            new Error(
              `This email is bound to ${boundMatch[1]}, but you are claiming as ${claimer}. ` +
                (oneStep
                  ? 'Re-send the verification email with the exact subject shown above.'
                  : 'It was probably sent for a previous pending account — sign out to resume it, or re-send the email with the subject shown above.'),
            ),
          );
        }

        // 3. Pick the claimer's entry: a specific-address entry for their From email wins, else domain.
        const { fromEmail, dkimDomain } = parseEml(emlText);
        let mode = null;
        let entry = null;
        if (fromEmail) {
          const eHash = await emailHash(fromEmail);
          entry = proofForEmailHash(tree, eHash);
          if (entry) mode = 'email';
        }
        if (!entry && dkimDomain) {
          entry = await proofForDomain(tree, dkimDomain);
          if (entry) mode = 'domain';
        }
        if (!entry) {
          return fail(
            new Error(
              `Neither your address (${fromEmail || '?'}) nor your domain (@${dkimDomain || '?'}) is on this organization's allowlist.`,
            ),
          );
        }

        // 4. Prove the matching circuit (v2 for a specific address, v1 for a domain) — or reuse the
        //    cached proof if this exact (email, claimer, mode) already proved and only submission failed.
        let proof;
        let proofMeta;
        const cache = proofCacheRef.current;
        if (cache && cache.emlText === emlText && cache.claimer === claimer && cache.mode === mode) {
          ({ proof, proofMeta } = cache);
        } else {
          setStep(ZK_CLAIM_STEPS.PROVING);
          ({ proof, meta: proofMeta } =
            mode === 'email'
              ? await generateEmailAddressProof({ emlText, claimer })
              : await generateDomainProof({ emlText, claimer }));
          proofCacheRef.current = { emlText, claimer, mode, proof, proofMeta };
        }
        setMeta({ mode, hatIds: entry.hatIds, ...proofMeta });

        // Proof is ready. STOP before signing: the on-chain step needs a passkey/wallet signature,
        // which the browser only permits from a FRESH user gesture. The 14-40s prove has expired the
        // file-pick activation, so auto-firing the ceremony here throws "The document is not focused".
        // Capture everything the submit needs (incl. the pending credential, so a mid-flow sign-in
        // can't strand it) and hand off to `finishClaim`, which runs on a button click.
        readyRef.current = { proof, entry, mode, claimer, oneStep, credential: oneStep ? pendingAccount : null };
        setReady(true);
        setStep(ZK_CLAIM_STEPS.PROOF_READY);
        return { success: true, proofReady: true };
      } catch (e) {
        return fail(e);
      }
    },
    [
      zkEmailInvites,
      zkEmailInvitesAddress,
      zkEmailInvitesEnabled,
      accountAddress,
      isAuthenticated,
      pendingAccount,
      onboardingService,
      publicClient,
      safeFetchFromIpfs,
      bytes32ToIpfsCid,
      fail,
    ],
  );

  /**
   * Finish a proved claim: sign + submit. MUST be invoked from a user gesture (button click) — the
   * passkey/wallet ceremony needs the fresh user activation that the long proving step consumed.
   * Idempotent-safe: the proof is cached, so a failed attempt can be retried by clicking again.
   */
  const finishClaim = useCallback(
    async () => {
      const r = readyRef.current;
      if (!r) return fail(new Error('Upload your verification email first.'));
      if (submittingRef.current) return { success: false }; // already in flight — ignore double-click
      submittingRef.current = true;
      const { proof, entry, mode, claimer, oneStep, credential } = r;
      try {
        // ONE-STEP: single UserOp — deploy account + register username + claim. Wrapped in
        // executeWithNotification so subgraph-sync + 'role:claimed' fire like the tx-manager path.
        if (oneStep) {
          if (!onboardingService || !credential) {
            return fail(new Error('Account infrastructure is still loading — try again in a moment.'));
          }
          setStep(ZK_CLAIM_STEPS.SIGNING);
          const result = await executeWithNotification(
            async () => {
              const rr = await onboardingService.registerAndClaim({
                credential,
                accountAddress: claimer,
                username: credential.username,
                mode,
                proof,
                hatIds: entry.hatIds,
                merkleProof: entry.proof,
                onStep: (s) =>
                  setStep(s === 'submitting' || s === 'confirming' ? ZK_CLAIM_STEPS.SUBMITTING : ZK_CLAIM_STEPS.SIGNING),
              });
              return { success: true, blockNumber: rr.blockNumber, txHash: rr.transactionHash };
            },
            {
              pendingMessage: 'Creating your account and claiming your role…',
              successMessage: 'Account created and role claimed!',
              errorMessage: 'Claim failed',
              refreshEvent: 'role:claimed',
            },
          );
          if (!result?.success) {
            setStep(ZK_CLAIM_STEPS.ERROR);
            if (result?.error) setError(result.error);
            return result;
          }
          activatePasskey({
            credentialId: credential.credentialId,
            rawCredentialId: credential.rawCredentialId,
            publicKeyX: credential.publicKeyX,
            publicKeyY: credential.publicKeyY,
            salt: credential.salt,
            accountAddress: claimer,
            username: credential.username,
          });
          removePendingCredential(claimer);
          setPendingAccount(null);
          proofCacheRef.current = null;
          readyRef.current = null;
          setReady(false);
          setStep(ZK_CLAIM_STEPS.DONE);
          return { success: true };
        }

        // Existing account: plain claim via the tx manager (gasless on a passkey). EOA wallets must be
        // on the ORG's chain first — a tx on the wrong chain hits a no-code address and no-ops.
        if (!zkEmailInvites) {
          return fail(new Error('Web3 services are not ready yet — try again in a moment.'));
        }
        if (!isPasskeyUser && orgChainId && connectedChain?.id !== orgChainId) {
          await switchChainAsync({ chainId: orgChainId });
        }
        setStep(ZK_CLAIM_STEPS.SUBMITTING);
        // CLAIM paymaster subject (0x05) first — the hub sponsors the op bound to the ZkEmailInvites
        // proxy with NO eligibility pre-check (a first-role claimer isn't eligible until the claim
        // itself grants it); entry hats remain as fallback subjects.
        const submit =
          mode === 'email'
            ? () =>
                zkEmailInvites.claimRoleByEmail(zkEmailInvitesAddress, proof, claimer, entry.hatIds, entry.proof, {
                  paymasterClaimTarget: zkEmailInvitesAddress,
                  paymasterHatIds: entry.hatIds,
                })
            : () =>
                zkEmailInvites.claimRoleByDomain(zkEmailInvitesAddress, proof, claimer, entry.hatIds, entry.proof, {
                  paymasterClaimTarget: zkEmailInvitesAddress,
                  paymasterHatIds: entry.hatIds,
                });
        const result = await executeWithNotification(submit, {
          pendingMessage: 'Claiming your role…',
          successMessage: 'Role claimed!',
          errorMessage: 'Claim failed',
          refreshEvent: 'role:claimed',
        });

        if (result?.success) {
          if (pendingAccount?.accountAddress) {
            removePendingCredential(pendingAccount.accountAddress);
            setPendingAccount(null);
          }
          proofCacheRef.current = null;
          readyRef.current = null;
          setReady(false);
          setStep(ZK_CLAIM_STEPS.DONE);
        } else {
          setStep(ZK_CLAIM_STEPS.ERROR);
          if (result?.error) setError(result.error);
        }
        return result;
      } catch (e) {
        return fail(e);
      } finally {
        submittingRef.current = false;
      }
    },
    [
      onboardingService,
      executeWithNotification,
      activatePasskey,
      zkEmailInvites,
      zkEmailInvitesAddress,
      isPasskeyUser,
      orgChainId,
      connectedChain,
      switchChainAsync,
      pendingAccount,
      fail,
    ],
  );

  // Back-compat alias: the existing flow component calls `claimByDomain`.
  return {
    claim,
    claimByDomain: claim,
    finishClaim,
    ready,
    reset,
    step,
    error,
    meta,
    // one-step onboarding surface
    pendingAccount,
    prepareNewPasskey,
    discardPendingPasskey,
    newAccountReady,
    claimerAddress,
  };
}
