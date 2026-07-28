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
  useClipboard,
  useDisclosure,
  VStack,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { FaCopy, FaCheck } from 'react-icons/fa';
import { useAuth } from '@/context/AuthContext';
import { useClaimZkEmailRole, ZK_CLAIM_STEPS } from '@/hooks/useClaimZkEmailRole';
import { useZkEmailInviteSummary } from '@/hooks/useZkEmailInviteSummary';
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
  } = useClaimZkEmailRole();
  const summary = useZkEmailInviteSummary();
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
                          Haven’t seen your email yet.
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
                    ? 'Proving your email in your browser — usually ~15 seconds (plus a one-time download the first time)…'
                    : step === ZK_CLAIM_STEPS.SIGNING
                      ? 'Confirm with your passkey — your account, username, and role go on-chain together…'
                      : 'Submitting your claim…'}
              </Text>
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
                  {error.message}
                </Text>
              )}
            </Box>
          )}

          {/* ── Step 5: Done ── */}
          {phase === 5 && (
            <VStack py={4} spacing={4}>
              <Alert status="success" borderRadius="lg">
                <AlertIcon />
                Role claimed! You’re signed in and your new role will appear shortly.
              </Alert>
              <HStack>
                <Button colorScheme="teal" onClick={() => router.push(orgUrl(org, 'dashboard'))} isDisabled={!org}>
                  Go to your dashboard
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    reset();
                    setFileName('');
                  }}
                >
                  Claim another
                </Button>
              </HStack>
            </VStack>
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
