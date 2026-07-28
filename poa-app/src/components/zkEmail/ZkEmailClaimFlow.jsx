import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  Code,
  Heading,
  HStack,
  Input,
  Link as ChakraLink,
  Progress,
  Spinner,
  Text,
  keyframes,
  useClipboard,
  useDisclosure,
  VStack,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { FaCopy, FaCheck } from 'react-icons/fa';
import { gql } from '@apollo/client';
import { useAuth } from '@/context/AuthContext';
import { usePOContext } from '@/context/POContext';
import { useUserContext } from '@/context/UserContext';
import { useRefreshEmit, RefreshEvent } from '@/context/RefreshContext';
import { getClient } from '@/util/apolloClient';
import { useClaimZkEmailRole, ZK_CLAIM_STEPS } from '@/hooks/useClaimZkEmailRole';
import { useZkEmailInviteSummary, hatKey } from '@/hooks/useZkEmailInviteSummary';
import { useOrgName } from '@/hooks/useOrgName';
import { orgUrl } from '@/util/orgUrl';
import { buildCommand, buildMailto, prefetchCircuitArtifacts } from '@/lib/zkemail/prover';
import SignInModal from '@/components/passkey/SignInModal';

// Optional claim inbox (a Cloudflare Email Worker — see cloudflare-worker-claim-inbox/). When BOTH
// the address and the worker URL are set, the user just sends the email — the page picks up the
// DELIVERED (always DKIM-signed) copy automatically, from any mail app. Manual .eml upload stays
// as the permissionless fallback either way. Unset = manual-upload-only.
const CLAIM_INBOX = process.env.NEXT_PUBLIC_ZKEMAIL_INBOX || '';
const CLAIM_INBOX_URL = (process.env.NEXT_PUBLIC_ZKEMAIL_INBOX_URL || '').replace(/\/$/, '');
const INBOX_ENABLED = Boolean(CLAIM_INBOX && CLAIM_INBOX_URL);

const POLL_INTERVAL_MS = 2000;
const POLL_WINDOW_MS = 600_000; // keep listening for 10 min per step-2 visit

/** Submit-failure copy: bundler/paymaster reverts are hex soup — translate the common ones. The
 *  prove is cached, so every one of these is retryable with a single tap. */
function friendlyRetryMessage(error) {
  const raw = String(error?.message || '');
  if (/AA33|paymaster|Ineligible|BudgetExceeded/i.test(raw)) {
    return 'The gas sponsor declined this attempt (it may be briefly out of budget). Your proof is saved — try again in a moment.';
  }
  if (/AA31|prefund|insufficient funds/i.test(raw)) {
    return 'Gas sponsorship hiccup — your proof is saved, just try again.';
  }
  if (/EmailAlreadyRegistered/i.test(raw)) {
    return 'This email address has already registered here — ask an org admin to re-open it if you need to register again.';
  }
  if (/nullifier/i.test(raw)) {
    return 'This email was already used for a claim. Send a fresh email to claim again.';
  }
  if (/timeout|timed out|network|fetch/i.test(raw)) {
    return 'Network hiccup while submitting — your proof is saved, try again.';
  }
  return raw.length > 180 ? `${raw.slice(0, 177)}…` : raw;
}

/* ───────────────────────── Claim celebration + welcome ───────────────────────── */

// Confirms the subgraph has indexed the new member (User entity id = `${orgId}-${address}`, lowercase).
const CONFIRM_MEMBER_INDEXED = gql`
  query ConfirmMemberIndexed($id: ID!) {
    user(id: $id) {
      id
    }
  }
`;

const confettiFall = keyframes`
  0%   { transform: translate3d(0, -8vh, 0) rotate(0deg); opacity: 1; }
  100% { transform: translate3d(var(--drift), 108vh, 0) rotate(660deg); opacity: 0.85; }
`;
const CONFETTI_COLORS = ['#38B2AC', '#9F7AEA', '#F6E05E', '#F687B3', '#63B3ED', '#68D391'];

/** Lightweight confetti burst — pure CSS keyframes (house style, no dependency), honors reduced motion. */
function ConfettiBurst() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        left: `${(i * 61) % 100}%`,
        delay: `${((i * 37) % 100) / 100}s`,
        duration: `${2.2 + ((i * 53) % 100) / 60}s`,
        drift: `${(((i * 29) % 100) - 50) * 2}px`,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        w: `${6 + ((i * 13) % 6)}px`,
        h: `${10 + ((i * 17) % 8)}px`,
      })),
    [],
  );
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return null;
  }
  return (
    <Box position="fixed" inset={0} pointerEvents="none" overflow="hidden" zIndex={1400} aria-hidden>
      {pieces.map((c, i) => (
        <Box
          key={i}
          position="absolute"
          top="-16px"
          left={c.left}
          w={c.w}
          h={c.h}
          bg={c.color}
          borderRadius="2px"
          style={{ '--drift': c.drift }}
          animation={`${confettiFall} ${c.duration} ${c.delay} cubic-bezier(0.25, 0.8, 0.6, 1) forwards`}
        />
      ))}
    </Box>
  );
}

/**
 * Post-claim welcome: celebrates, shows WHO you now are (roles, verified email, account) from
 * in-memory claim data (never a fresh subgraph query — indexing lags the mint by seconds), points at
 * what to do next, and tracks profile indexing so the hand-off to /profile isn't a shrug.
 */
function ClaimWelcome({ org, username, accountAddress, roleNames, verifiedAs, profileReady, onProfile, onClaimAnother }) {
  const short = accountAddress ? `${accountAddress.slice(0, 6)}…${accountAddress.slice(-4)}` : '';
  return (
    <VStack py={4} spacing={4} align="stretch">
      <VStack spacing={1} textAlign="center">
        <Heading size="lg">🎉 Welcome to {org}!</Heading>
        <Text fontSize="sm" color="gray.600">
          {username ? `You’re in, ${username}.` : 'You’re in.'} Your email checked out and your role is on-chain.
        </Text>
      </VStack>

      <Box borderWidth="1px" borderRadius="lg" p={4} bg="teal.50" borderColor="teal.200">
        <VStack align="stretch" spacing={2} fontSize="sm">
          {roleNames.length > 0 && (
            <HStack>
              <Text color="gray.600" flexShrink={0}>
                Your role{roleNames.length > 1 ? 's' : ''}:
              </Text>
              <Wrap spacing={1}>
                {roleNames.map((n) => (
                  <WrapItem key={n}>
                    <Badge colorScheme="teal">{n}</Badge>
                  </WrapItem>
                ))}
              </Wrap>
            </HStack>
          )}
          {verifiedAs && (
            <HStack>
              <Text color="gray.600" flexShrink={0}>
                Verified as:
              </Text>
              <Code fontSize="xs">{verifiedAs}</Code>
            </HStack>
          )}
          {short && (
            <HStack>
              <Text color="gray.600" flexShrink={0}>
                Your account:
              </Text>
              <Code fontSize="xs">{short}</Code>
            </HStack>
          )}
        </VStack>
      </Box>

      <Box fontSize="sm" color="gray.600">
        <Text fontWeight="600" mb={1} color="gray.700">
          What you can do now
        </Text>
        <VStack align="stretch" spacing={1}>
          <Text>
            •{' '}
            <ChakraLink color="teal.600" href={orgUrl(org, 'tasks')}>
              Pick up a task
            </ChakraLink>{' '}
            and earn participation tokens
          </Text>
          <Text>
            •{' '}
            <ChakraLink color="teal.600" href={orgUrl(org, 'voting')}>
              Vote
            </ChakraLink>{' '}
            on active proposals
          </Text>
          <Text>
            •{' '}
            <ChakraLink color="teal.600" href={orgUrl(org, 'learn')}>
              Learn &amp; earn
            </ChakraLink>{' '}
            with the org’s modules
          </Text>
        </VStack>
      </Box>

      <HStack fontSize="xs" color={profileReady ? 'green.600' : 'gray.500'} justify="center">
        {profileReady ? (
          <>
            <FaCheck />
            <Text>Your profile is ready.</Text>
          </>
        ) : (
          <>
            <Spinner size="xs" />
            <Text>Setting up your profile — this takes a few seconds…</Text>
          </>
        )}
      </HStack>

      <HStack justify="center">
        <Button colorScheme="teal" onClick={onProfile} isDisabled={!org}>
          Go to your profile →
        </Button>
        <Button variant="outline" onClick={onClaimAnother}>
          Claim another
        </Button>
      </HStack>
    </VStack>
  );
}

/** Verified who-can-join summary (domains + roles from the root-matched allowlist file). */
function InviteSummary({ summary }) {
  const { status, domains, emailCount, refresh } = summary;

  if (status === 'loading') {
    return (
      <HStack fontSize="sm" color="gray.500">
        <Spinner size="xs" />
        <Text>Checking this organization’s invite list…</Text>
      </HStack>
    );
  }
  if (status === 'unknown') {
    // Chain read failed: liveness is NOT known (could be dormant) — don't claim invites are active.
    return (
      <Alert status="warning" borderRadius="lg" fontSize="sm">
        <AlertIcon />
        <HStack justify="space-between" w="full">
          <Text>Couldn’t check this organization’s invite list right now (network hiccup).</Text>
          <Button size="xs" onClick={refresh} flexShrink={0}>
            Re-check
          </Button>
        </HStack>
      </Alert>
    );
  }
  if (status === 'degraded') {
    return (
      <Alert status="warning" borderRadius="lg" fontSize="sm">
        <AlertIcon />
        <HStack justify="space-between" w="full">
          <Text>
            Email invites are active, but the invite list couldn’t be loaded right now. You can still try
            to claim — your eligibility is checked against the on-chain list when you upload your email.
          </Text>
          <Button size="xs" onClick={refresh} flexShrink={0}>
            Re-check
          </Button>
        </HStack>
      </Alert>
    );
  }
  if (status !== 'active') return null;

  return (
    <Box p={3} borderWidth="1px" borderRadius="lg" bg="blackAlpha.50">
      <Wrap spacing={2} align="center">
        <WrapItem>
          <Text fontWeight="semibold" fontSize="sm">
            Who can claim:
          </Text>
        </WrapItem>
        {domains.map(({ domain, roleNames }) => (
          <WrapItem key={domain}>
            <Badge px={2} py={1} borderRadius="md" colorScheme="teal" textTransform="none">
              @{domain}
              {roleNames.length > 0 ? ` → ${roleNames.join(', ')}` : ''}
            </Badge>
          </WrapItem>
        ))}
      </Wrap>
      {emailCount > 0 && (
        <Text fontSize="xs" color="gray.600" mt={2}>
          Some people are invited by their personal email address too — those invites aren’t listed. If
          you were told you’re invited, your email works even if your domain isn’t shown.
        </Text>
      )}
    </Box>
  );
}

/** Numbered progress header. Step 1 renders as already-done for signed-in users. */
function StepHeader({ phase, skipAccount }) {
  const labels = ['Account', 'Send email', 'Verify', 'Finish'];
  const pct = phase >= 5 ? 100 : Math.max(0, ((phase - 1) / labels.length) * 100);
  return (
    <Box mb={5}>
      <HStack justify="space-between" mb={2}>
        {labels.map((label, i) => {
          const n = i + 1;
          const done = phase > n || (n === 1 && skipAccount);
          const active = phase === n;
          return (
            <HStack key={label} spacing={1} opacity={done || active ? 1 : 0.45}>
              <Box
                w="18px"
                h="18px"
                borderRadius="full"
                bg={done ? 'teal.500' : active ? 'teal.100' : 'gray.200'}
                color={done ? 'white' : 'gray.700'}
                fontSize="11px"
                fontWeight="bold"
                display="flex"
                alignItems="center"
                justifyContent="center"
              >
                {done ? '✓' : n}
              </Box>
              <Text fontSize="xs" fontWeight={active ? 'bold' : 'normal'} display={{ base: active ? 'block' : 'none', md: 'block' }}>
                {label}
              </Text>
            </HStack>
          );
        })}
      </HStack>
      <Progress value={pct} size="xs" colorScheme="teal" borderRadius="full" />
    </Box>
  );
}

/** The manual .eml path — the permissionless fallback. All the export pathology guidance lives here. */
function ManualUpload({ onPick, busy, fileName, expandedByDefault, isAuthenticated }) {
  const body = (
    <>
      <Text fontSize="sm" color="gray.600" mt={1}>
        Download the <b>received copy</b> of your email (not your Sent folder — that copy is unsigned,
        and a self-send to the same account is never signed). Mobile apps and third-party mail apps
        (Spark, etc.) can’t export it — use the provider’s <b>website</b>:
      </Text>
      <Box fontSize="sm" color="gray.600" pl={4} my={2}>
        <Text>
          • <b>Gmail</b> — mail.google.com → open the message → ⋮ → <b>Show original</b> →{' '}
          <b>Download original</b>
        </Text>
        <Text mt={1}>
          • <b>Outlook</b> — outlook.com → open the message → ⋯ → <b>Save as</b> (.eml)
        </Text>
        <Text mt={1}>
          • <b>Apple Mail</b> (Mac) — select the message → File → Save As… → <b>Raw Message Source</b>
        </Text>
      </Box>
      <Text fontSize="sm" color="gray.600" mb={2}>
        Forwarded copies, screenshots, or PDFs won’t verify.{' '}
        {!isAuthenticated && 'Your account, username, and role are all created in this one step.'}
      </Text>
      <Button onClick={onPick} isDisabled={busy} size="sm">
        {fileName || 'Choose .eml file'}
      </Button>
    </>
  );

  if (expandedByDefault) {
    return (
      <Box>
        <Text fontWeight="semibold">Then upload the raw email here</Text>
        {body}
      </Box>
    );
  }
  return (
    <Accordion allowToggle mt={2}>
      <AccordionItem border="none">
        <AccordionButton px={0} _hover={{ bg: 'transparent' }}>
          <Text fontSize="sm" color="gray.500">
            Prefer not to use the claim inbox? Upload the raw email yourself
          </Text>
          <AccordionIcon color="gray.500" />
        </AccordionButton>
        <AccordionPanel px={0}>{body}</AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
}

/**
 * The client-side ZK Email claim flow, as a guided stepper:
 *   1 Account  — pick a username, passkey created locally (skipped when signed in)
 *   2 Send     — send the pre-filled email; the page picks up the delivered copy automatically
 *                (manual .eml upload collapsed underneath as the permissionless fallback)
 *   3 Verify   — allowlist check + in-browser ZK proof (+ signing states)
 *   4 Finish   — one click → passkey → account + username + role in a single gasless transaction
 * Render only when `zkEmailInvitesEnabled`.
 */
export default function ZkEmailClaimFlow() {
  const { isAuthenticated, accountAddress } = useAuth();
  const {
    claim,
    finishClaim,
    ready,
    step,
    error,
    reset,
    pendingAccount,
    prepareNewPasskey,
    discardPendingPasskey,
    newAccountReady,
    claimerAddress,
    meta,
    proveProgress,
  } = useClaimZkEmailRole();
  const summary = useZkEmailInviteSummary();
  const { orgId, subgraphUrl, roleNames: roleNamesMap } = usePOContext();
  const { optimisticJoin } = useUserContext();
  const { emit } = useRefreshEmit();
  const router = useRouter();
  const org = useOrgName();
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [username, setUsername] = useState('');
  const [creating, setCreating] = useState(false);
  const [pollTick, setPollTick] = useState(0); // bump to restart a timed-out poll window
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const lastInboxEmlRef = useRef(null); // don't re-claim an inbox eml that already failed
  const signInDisclosure = useDisclosure();
  const subjectClip = useClipboard(claimerAddress ? buildCommand(claimerAddress) : '');
  const inboxClip = useClipboard(CLAIM_INBOX);

  const busy =
    step === ZK_CLAIM_STEPS.CHECKING ||
    step === ZK_CLAIM_STEPS.PROVING ||
    step === ZK_CLAIM_STEPS.SIGNING ||
    step === ZK_CLAIM_STEPS.SUBMITTING;

  const hasClaimTarget = Boolean(claimerAddress);
  const stepsLive = summary.status === 'active' || summary.status === 'degraded';
  const done = step === ZK_CLAIM_STEPS.DONE;

  /* ── Post-claim: celebrate, bridge the subgraph indexing gap, then hand off to /profile. ── */
  const [showConfetti, setShowConfetti] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const optimisticDoneRef = useRef(false);

  // Names for the hats just claimed (in-memory `meta.hatIds` -> POContext role-name map; hatKey
  // normalizes hex allowlist ids vs decimal subgraph ids).
  const claimedRoleNames = useMemo(() => {
    if (!meta?.hatIds?.length) return [];
    const normalized = {};
    Object.entries(roleNamesMap || {}).forEach(([id, name]) => {
      const k = hatKey(id);
      if (k) normalized[k] = name;
    });
    return [...new Set(meta.hatIds.map((h) => normalized[hatKey(h)]).filter(Boolean))];
  }, [meta, roleNamesMap]);

  // Celebration burst + optimistic membership: the profile hub renders correctly the moment the user
  // lands on it (UserContext.optimisticJoin sets hatIds/username with a stale-response lock and its
  // own delayed refetch) instead of flashing the pre-claim welcome screen while the subgraph indexes.
  useEffect(() => {
    if (!done) {
      optimisticDoneRef.current = false;
      setShowConfetti(false);
      setProfileReady(false);
      return undefined;
    }
    if (optimisticDoneRef.current) return undefined;
    optimisticDoneRef.current = true;
    setShowConfetti(true);
    const confettiTimer = setTimeout(() => setShowConfetti(false), 4500);
    try {
      optimisticJoin({ address: accountAddress, hatIds: meta?.hatIds || [], username: username || undefined });
    } catch (_) {
      /* optimistic-only — the poll below still refreshes real data */
    }
    return () => clearTimeout(confettiTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  // Poll the subgraph until OUR new membership is actually indexed, then push one more refetch —
  // covers gateways slower than the ~7s waitForSubgraphBlock window (whose single refetch can land
  // on stale data and never retry). Bounded; purely a freshness/UX concern.
  useEffect(() => {
    if (!(done && orgId && subgraphUrl && accountAddress)) return undefined;
    let alive = true;
    const id = `${orgId}-${accountAddress}`.toLowerCase();
    const client = getClient(subgraphUrl);
    const startedAt = Date.now();
    (async () => {
      while (alive && Date.now() - startedAt < 90_000) {
        try {
          const { data } = await client.query({
            query: CONFIRM_MEMBER_INDEXED,
            variables: { id },
            fetchPolicy: 'network-only',
          });
          if (data?.user?.id) {
            if (alive) {
              setProfileReady(true);
              emit(RefreshEvent.ROLE_CLAIMED, { indexed: true });
            }
            return;
          }
        } catch (_) {
          /* transient — keep polling */
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, orgId, subgraphUrl, accountAddress]);

  // Single derived phase — no second state machine to drift from the hook.
  const phase = useMemo(() => {
    if (step === ZK_CLAIM_STEPS.DONE) return 5;
    if (ready && !busy) return 4;
    if (busy) return 3;
    if (hasClaimTarget) return 2;
    return 1;
  }, [step, ready, busy, hasClaimTarget]);

  const onFile = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      // Clear the value immediately: browsers suppress onChange for an unchanged value, which would
      // otherwise kill the natural retry path (re-picking the same .eml after an error).
      e.target.value = '';
      if (!file) return;
      setFileName(file.name);
      const emlText = await file.text();
      await claim(emlText);
    },
    [claim],
  );

  const onCreatePasskey = useCallback(async () => {
    setCreating(true);
    try {
      await prepareNewPasskey(username);
    } finally {
      setCreating(false);
    }
  }, [prepareNewPasskey, username]);

  // Warm the proving key while the user is off sending their email: the ~640 MB chunked download
  // (first visit) runs during mail-delivery dead time instead of blocking the Verify step, and repeat
  // visits resolve instantly from the IndexedDB cache. Which circuit: a domain entry proves v1
  // (PopRoleClaim); an allowlist with ONLY specific-address entries proves v2. Mixed allowlists warm
  // v1 (one ~640 MB key in memory is plenty) — a v2 claim then downloads on demand as before.
  useEffect(() => {
    if (!(phase === 2 && stepsLive)) return;
    prefetchCircuitArtifacts(summary.domains?.length ? 'domain' : 'email');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase === 2, stepsLive]);

  // Auto-poll: while on the Send step, quietly watch the claim inbox for the delivered email and
  // start verification the moment it arrives — the user never clicks "I sent it". An inbox eml that
  // already failed is not retried (only NEW bytes trigger another attempt: the worker is latest-wins,
  // so re-sending produces different bytes).
  useEffect(() => {
    if (!(INBOX_ENABLED && phase === 2 && claimerAddress && stepsLive)) return undefined;
    let alive = true;
    setPollTimedOut(false);
    const deadline = Date.now() + POLL_WINDOW_MS;
    (async () => {
      while (alive && Date.now() < deadline) {
        try {
          const res = await fetch(`${CLAIM_INBOX_URL}/claim-email?claimer=${claimerAddress}`);
          if (res.ok) {
            const data = await res.json();
            if (data.status === 'ready' && data.eml && data.eml !== lastInboxEmlRef.current) {
              lastInboxEmlRef.current = data.eml;
              if (!alive) return;
              setFileName('(picked up from the claim inbox)');
              await claim(data.eml);
              return;
            }
          }
        } catch (_) {
          /* transient — keep polling */
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
      if (alive) setPollTimedOut(true);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase === 2, claimerAddress, stepsLive, pollTick]);

  // Module deployed but no allowlist activated: every claim would revert AllowlistNotActive —
  // say so instead of walking the user through steps that cannot succeed.
  if (summary.status === 'dormant') {
    return (
      <VStack spacing={4} align="stretch">
        <Heading size="md">Claim a role with your email</Heading>
        <Alert status="info" borderRadius="lg">
          <AlertIcon />
          <HStack justify="space-between" w="full">
            <Text>
              This organization has email invites set up but hasn’t activated an invite list yet. Check
              back once governance activates it.
            </Text>
            <Button size="xs" onClick={summary.refresh} flexShrink={0}>
              Re-check
            </Button>
          </HStack>
        </Alert>
        {!isAuthenticated && pendingAccount && (
          <Alert status="info" borderRadius="lg" fontSize="sm">
            <AlertIcon />
            <HStack justify="space-between" w="full" align="start">
              <Text>
                You have a pending claim account (<b>{pendingAccount.username}</b>,{' '}
                <Code fontSize="xs">{pendingAccount.accountAddress}</Code>) — it stays usable once the
                invite list is activated.
              </Text>
              <Button size="xs" variant="outline" onClick={discardPendingPasskey} flexShrink={0}>
                Start over
              </Button>
            </HStack>
          </Alert>
        )}
      </VStack>
    );
  }

  return (
    <VStack spacing={5} align="stretch">
      <Box>
        <Heading size="md">Claim a role with your email</Heading>
        <Text mt={1} color="gray.600" fontSize="sm">
          Prove you control an invited email — entirely in your browser. No password, no seed phrase, no
          gas.
        </Text>
      </Box>

      <InviteSummary summary={summary} />

      {stepsLive && (
        <Box borderWidth="1px" borderRadius="xl" p={{ base: 4, md: 6 }} boxShadow="sm">
          <StepHeader phase={phase} skipAccount={isAuthenticated} />

          {/* ── Step 1: Account ── */}
          {phase === 1 && (
            <Box>
              <Text fontWeight="semibold">Pick a username</Text>
              <Text fontSize="sm" color="gray.600" mt={1} mb={3}>
                Your passkey is created with your fingerprint — everything else (account, username, role)
                lands together in one gasless transaction at the end.
              </Text>
              <HStack spacing={3} align="stretch" flexWrap="wrap">
                <Input
                  placeholder="Choose a username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  size="sm"
                  maxW="240px"
                />
                <Button
                  colorScheme="teal"
                  size="sm"
                  onClick={onCreatePasskey}
                  isLoading={creating}
                  isDisabled={!newAccountReady || username.trim().length < 3}
                >
                  Create passkey &amp; continue
                </Button>
              </HStack>
              <HStack spacing={3} mt={3}>
                <Text fontSize="xs" color="gray.500">
                  Already have an account?
                </Text>
                <Button variant="link" size="xs" onClick={signInDisclosure.onOpen}>
                  Sign in with passkey
                </Button>
                <ConnectButton showBalance={false} chainStatus="none" accountStatus="address" />
              </HStack>
            </Box>
          )}

          {/* ── Step 2: Send the email (auto-pickup) ── */}
          {phase === 2 && (
            <Box>
              {!isAuthenticated && pendingAccount && (
                <HStack justify="space-between" mb={3} fontSize="xs" color="gray.500">
                  <Text>
                    Claiming as <b>{pendingAccount.username}</b>
                  </Text>
                  <Button size="xs" variant="ghost" onClick={discardPendingPasskey}>
                    Start over
                  </Button>
                </HStack>
              )}

              {INBOX_ENABLED ? (
                <>
                  <Text fontWeight="semibold">Send the verification email</Text>
                  <Text fontSize="sm" color="gray.600" mt={1} mb={3}>
                    From your <b>invited email address</b>, using any mail app — we’ll pick it up
                    automatically the moment it arrives. The body doesn’t matter.
                  </Text>
                  <HStack spacing={3} flexWrap="wrap" mb={3}>
                    <Button
                      as={ChakraLink}
                      href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(CLAIM_INBOX)}&su=${encodeURIComponent(buildCommand(claimerAddress))}`}
                      isExternal
                      colorScheme="blue"
                      size="sm"
                    >
                      Compose in Gmail
                    </Button>
                    <Button
                      as={ChakraLink}
                      href={buildMailto({ to: CLAIM_INBOX, claimer: claimerAddress })}
                      isExternal
                      variant="outline"
                      size="sm"
                    >
                      Open my mail app
                    </Button>
                  </HStack>
                  <Box fontSize="sm" borderWidth="1px" borderRadius="md" p={3} bg="blackAlpha.50">
                    <HStack>
                      <Text color="gray.500" w="52px" flexShrink={0}>
                        To:
                      </Text>
                      <Code fontSize="xs">{CLAIM_INBOX}</Code>
                      <Button size="xs" variant="ghost" onClick={inboxClip.onCopy}>
                        {inboxClip.hasCopied ? <FaCheck /> : <FaCopy />}
                      </Button>
                    </HStack>
                    <HStack mt={1} align="start">
                      <Text color="gray.500" w="52px" flexShrink={0}>
                        Subject:
                      </Text>
                      <Code fontSize="xs" whiteSpace="pre-wrap" wordBreak="break-all">
                        {buildCommand(claimerAddress)}
                      </Code>
                      <Button size="xs" variant="ghost" onClick={subjectClip.onCopy}>
                        {subjectClip.hasCopied ? <FaCheck /> : <FaCopy />}
                      </Button>
                    </HStack>
                  </Box>

                  <HStack mt={4} spacing={2}>
                    {pollTimedOut ? (
                      <>
                        <Text fontSize="sm" color="orange.600">
                          Haven’t seen your email yet. Usual causes: it was sent from a different
                          address than your invited one, it’s still in your Outbox, or the subject was
                          edited — it must contain your exact claim line (copy it above). Delivery can
                          take a minute; re-sending is safe.
                        </Text>
                        <Button
                          size="xs"
                          onClick={() => {
                            lastInboxEmlRef.current = null; // re-arm: retry the stored email too
                            setPollTick((t) => t + 1);
                          }}
                        >
                          Keep watching
                        </Button>
                      </>
                    ) : (
                      <>
                        <Spinner size="xs" color="teal.500" />
                        <Text fontSize="sm" color="gray.600">
                          Watching the inbox — once you hit send, everything continues automatically…
                        </Text>
                      </>
                    )}
                  </HStack>

                  <ManualUpload onPick={() => fileRef.current?.click()} busy={busy} fileName={fileName} isAuthenticated={isAuthenticated} />
                </>
              ) : (
                <>
                  <Text fontWeight="semibold">Send the verification email</Text>
                  <Text fontSize="sm" color="gray.600" mt={1} mb={2}>
                    From your <b>invited email address</b>, send a message with this exact subject to{' '}
                    <b>another inbox you can open</b> — a work email, a second account, etc. (Not to the
                    same address: your own Sent copy is saved <i>before</i> the provider signs it.)
                  </Text>
                  <Code p={2} borderRadius="md" w="full" whiteSpace="pre-wrap" display="block">
                    {buildCommand(claimerAddress)}
                  </Code>
                  <Alert status="warning" borderRadius="md" fontSize="xs" mt={2} py={2}>
                    <AlertIcon boxSize={3} />
                    Compose it in your provider’s <b>own website or official app</b> (e.g.
                    mail.google.com). Messages sent through third-party apps like Spark are stored{' '}
                    <b>without</b> the signature this claim needs.
                  </Alert>
                  <HStack mt={3} spacing={3} flexWrap="wrap" mb={4}>
                    <Button
                      as={ChakraLink}
                      href={`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(buildCommand(claimerAddress))}`}
                      isExternal
                      colorScheme="blue"
                      size="sm"
                    >
                      Compose in Gmail (web)
                    </Button>
                    <Button
                      as={ChakraLink}
                      href={buildMailto({ to: '', claimer: claimerAddress })}
                      isExternal
                      variant="outline"
                      size="sm"
                    >
                      Other provider…
                    </Button>
                  </HStack>
                  <ManualUpload
                    onPick={() => fileRef.current?.click()}
                    busy={busy}
                    fileName={fileName}
                    expandedByDefault
                    isAuthenticated={isAuthenticated}
                  />
                </>
              )}

              {step === ZK_CLAIM_STEPS.ERROR && error && (
                <Alert status="error" borderRadius="lg" fontSize="sm" mt={4}>
                  <AlertIcon />
                  <VStack align="start" spacing={2} w="full">
                    <Text>{error.message || 'Something went wrong.'}</Text>
                    {INBOX_ENABLED && lastInboxEmlRef.current && (
                      <Button
                        size="xs"
                        onClick={() => {
                          lastInboxEmlRef.current = null;
                          setPollTick((t) => t + 1);
                        }}
                      >
                        Retry with the received email
                      </Button>
                    )}
                  </VStack>
                </Alert>
              )}
            </Box>
          )}

          {/* ── Step 3: Verifying ── */}
          {phase === 3 && (
            <VStack py={6} spacing={3}>
              <Spinner size="lg" color="teal.500" />
              <Text fontSize="sm" color="gray.600" textAlign="center" maxW="380px">
                {step === ZK_CLAIM_STEPS.CHECKING
                  ? 'Checking the organization’s allowlist…'
                  : step === ZK_CLAIM_STEPS.PROVING
                    ? proveProgress?.phase === 'download'
                      ? `Downloading the proving key — part ${proveProgress.done} of ${proveProgress.total} (one-time, cached after this)…`
                      : proveProgress?.phase === 'assemble'
                        ? 'Preparing the proving key…'
                        : 'Computing your proof in your browser — usually 15–40 seconds…'
                    : step === ZK_CLAIM_STEPS.SIGNING
                      ? 'Confirm with your passkey — your account, username, and role go on-chain together…'
                      : 'Submitting your claim…'}
              </Text>
              {step === ZK_CLAIM_STEPS.PROVING && proveProgress?.phase === 'download' && (
                <Progress
                  value={(proveProgress.done / Math.max(proveProgress.total, 1)) * 100}
                  size="xs"
                  colorScheme="teal"
                  borderRadius="full"
                  w="240px"
                />
              )}
            </VStack>
          )}

          {/* ── Step 4: Finish. A SEPARATE click fires the passkey/wallet signature — required:
                 WebAuthn refuses to run after the long prove consumed the previous user activation
                 ("The document is not focused"). Survives a cancelled biometric (instant retry off
                 the cached proof). ── */}
          {phase === 4 && (
            <Box p={4} borderWidth="1px" borderRadius="lg" borderColor="teal.300" bg="teal.50">
              <Text fontWeight="semibold" color="teal.800">
                {step === ZK_CLAIM_STEPS.ERROR ? 'Almost there — try again' : 'Email verified ✓ — finish your claim'}
              </Text>
              <Text fontSize="sm" color="teal.800" mt={1} mb={3}>
                {!isAuthenticated
                  ? 'Tap below and confirm with your passkey — your account, username, and role are created together in one gasless transaction.'
                  : 'Tap below and confirm to mint your role.'}
              </Text>
              <Button colorScheme="teal" size="sm" onClick={finishClaim}>
                {step === ZK_CLAIM_STEPS.ERROR ? 'Retry — confirm with your passkey' : 'Finish & claim my role'}
              </Button>
              {step === ZK_CLAIM_STEPS.ERROR && error && (
                <Text fontSize="xs" color="red.600" mt={2}>
                  {friendlyRetryMessage(error)}
                </Text>
              )}
            </Box>
          )}

          {/* ── Step 5: Done — celebrate, welcome, bridge the subgraph gap, hand off to /profile ── */}
          {phase === 5 && (
            <>
              {showConfetti && <ConfettiBurst />}
              <ClaimWelcome
                org={org}
                username={username}
                accountAddress={accountAddress}
                roleNames={claimedRoleNames}
                verifiedAs={meta?.mode === 'email' ? meta?.fromEmail : meta?.domain ? `@${meta.domain}` : ''}
                profileReady={profileReady}
                onProfile={() => router.push(`/profile/?org=${encodeURIComponent(org)}`)}
                onClaimAnother={() => {
                  reset();
                  setFileName('');
                }}
              />
            </>
          )}
        </Box>
      )}

      {/* Account-step errors (e.g. username taken) happen before the stepper card advances. */}
      {phase === 1 && step === ZK_CLAIM_STEPS.ERROR && error && (
        <Alert status="error" borderRadius="lg" fontSize="sm">
          <AlertIcon />
          {error.message || 'Something went wrong.'}
        </Alert>
      )}

      {/* No `accept` filter: some platform pickers grey out valid .eml files with it; the upload is
          content-validated (DKIM header pre-flight) instead. Input lives outside the step bodies so
          a mid-read step change can't unmount it. */}
      <input ref={fileRef} type="file" hidden onChange={onFile} />

      <SignInModal
        isOpen={signInDisclosure.isOpen}
        onClose={signInDisclosure.onClose}
        onSuccess={() => {}}
        onCreateAccount={() => signInDisclosure.onClose()}
      />
    </VStack>
  );
}
