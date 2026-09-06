/**
 * EmailInviteListField — what a member actually votes on when the group is asked to
 * change who can join by email.
 *
 * The proposal commits a merkle root on-chain, but a voter is being asked to hand out
 * roles in their own group. So this fetches the saved list and shows the people, and —
 * because approving REPLACES the previous list — leads with what changes: who is
 * gaining an invite and who is losing one. The hashes stay behind a disclosure.
 *
 * It also writes a plain-language `summary` back into the form, which becomes the
 * proposal's title on the board, so members can read the change without opening it.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, HStack, VStack, Text, Tag, Spinner, Button, Collapse, Divider, Icon,
} from '@chakra-ui/react';
import { FiAlertTriangle, FiRefreshCw } from 'react-icons/fi';
import { useIPFScontext } from '@/context/ipfsContext';
import { usePOContext } from '@/context/POContext';
import { getNetworkByChainId } from '@/config/networks';
import { readCommitment, FALLBACK_RPCS } from '@/hooks/useZkEmailInviteSummary';
import { assertRootMatches } from '@/lib/zkemail/allowlist';
import {
  readInvites, diffInvites, describeWho, inviteKey, inviteRoleNames, summarizeProposal, describeProposal,
} from '@/lib/zkemail/inviteDisplay';

const ZERO = '0x0000000000000000000000000000000000000000000000000000000000000000';

const EYEBROW = {
  fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

function RoleChips({ names, tone = 'purple' }) {
  if (!names.length) return null;
  const bg = tone === 'rose' ? 'rgba(245, 101, 101, 0.16)' : 'rgba(159, 122, 234, 0.18)';
  const color = tone === 'rose' ? 'red.100' : 'purple.100';
  return (
    <HStack spacing={1} flexWrap="wrap">
      {names.map((n) => (
        <Tag key={n} size="sm" borderRadius="full" bg={bg} color={color} fontSize="11px">
          {n}
        </Tag>
      ))}
    </HStack>
  );
}

function InviteRow({ invite, ctx, tone, muted }) {
  const names = inviteRoleNames(invite, ctx);
  const who = describeWho(invite);
  const isDomain = invite.type === 'domain';
  return (
    <HStack
      justify="space-between"
      align="start"
      py={2}
      spacing={3}
      borderTop="1px solid"
      borderColor="whiteAlpha.100"
      opacity={muted ? 0.55 : 1}
    >
      <Text fontSize="sm" color="white" wordBreak="break-word">
        {isDomain ? (
          <>
            <Text as="span" color="whiteAlpha.600">Anyone at </Text>
            <Text as="span" fontWeight="600">{invite.identifier}</Text>
          </>
        ) : who}
      </Text>
      <RoleChips names={names} tone={tone} />
    </HStack>
  );
}

function Band({ label, tone, invites, ctx, note, muted }) {
  if (!invites?.length) return null;
  const color = tone === 'rose' ? 'red.200' : tone === 'green' ? 'green.200' : 'whiteAlpha.600';
  return (
    <Box mt={4}>
      <Text {...EYEBROW} color={color}>
        {label} ({invites.length})
      </Text>
      {note && (
        <Text fontSize="xs" color="whiteAlpha.600" mt={1}>
          {note}
        </Text>
      )}
      <Box mt={1}>
        {invites.map((i) => (
          <InviteRow key={inviteKey(i)} invite={i} ctx={ctx} tone={tone} muted={muted} />
        ))}
      </Box>
    </Box>
  );
}

export default function EmailInviteListField({ cid, root, onReport }) {
  const { safeFetchFromIpfs, bytes32ToIpfsCid } = useIPFScontext();
  const { roleHatIds, roleNames, zkEmailInvitesAddress, orgChainId } = usePOContext();

  const [state, setState] = useState('idle'); // idle | loading | ready | error
  const [invites, setInvites] = useState([]);
  const [current, setCurrent] = useState(null); // null = unknown / no list live yet
  const [showKept, setShowKept] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const ctx = useMemo(() => ({ roleHatIds, roleNames }), [roleHatIds, roleNames]);

  // The list this vote would approve. Readiness depends on THIS and nothing else —
  // the comparison below is a separate, best-effort effect, because gating on it
  // would let a slow public RPC block the proposal from being created at all.
  useEffect(() => {
    let alive = true;
    if (!cid || cid === ZERO) { setState('idle'); return undefined; }
    setState('loading');
    (async () => {
      try {
        const doc = await safeFetchFromIpfs(bytes32ToIpfsCid(cid));
        if (!alive) return;

        // The document and the hash are two independent URL-supplied values, so a
        // mismatched pair would render one list while committing a different one.
        // Every other zkEmail surface binds them with assertRootMatches; so do we.
        assertRootMatches(doc, root);

        setInvites(readInvites(doc));
        setState('ready');
      } catch {
        if (alive) { setState('error'); setInvites([]); }
      }
    })();
    return () => { alive = false; };
  }, [cid, root, attempt, safeFetchFromIpfs, bytes32ToIpfsCid]);

  // What's live today, so we can show what this vote CHANGES. Deliberately not part
  // of readiness: if it can't be read we show the plain list and claim nothing about
  // removals, rather than blocking the vote.
  //
  // Read through an ORG-CHAIN rpc, not the shared service — that factory's provider
  // is bound to the home chain, so an org contract on another chain reads back
  // data="0x". Public RPCs also rate-limit browsers, hence the fallback list.
  useEffect(() => {
    let alive = true;
    setCurrent(null);
    (async () => {
      try {
        const network = getNetworkByChainId(orgChainId);
        if (!zkEmailInvitesAddress || !network) return;
        const rpcs = [network.rpcUrl, ...(FALLBACK_RPCS[orgChainId] || [])].filter(Boolean);
        const active = await readCommitment(rpcs, zkEmailInvitesAddress);
        if (!alive) return;

        if (!active?.root || active.root === ZERO) {
          setCurrent([]); // nothing live yet — every invite here is new
          return;
        }
        if (!active.cid || active.cid === ZERO) return;

        const liveDoc = await safeFetchFromIpfs(bytes32ToIpfsCid(active.cid));
        if (!alive || !liveDoc) return;
        // Same binding on the live side: an unverified doc would misreport removals.
        assertRootMatches(liveDoc, active.root);
        setCurrent(readInvites(liveDoc));
      } catch { /* leave current null — no comparison shown */ }
    })();
    return () => { alive = false; };
  }, [attempt, zkEmailInvitesAddress, orgChainId, safeFetchFromIpfs, bytes32ToIpfsCid]);

  const diff = useMemo(
    () => (state === 'ready' ? diffInvites(invites, current) : null),
    [state, invites, current],
  );

  // Feed the readable flag plus the plain-language title and description back into
  // the form, so the proposal members see is written from the real list, not a hash.
  //
  // ONE callback, carrying all three. The parent merges into form state by spreading
  // a captured `values`, so two calls in the same tick each start from the same stale
  // object and the second silently erases the first. Reporting them separately wiped
  // the readable flag and the template's own guard then blocked submit.
  //
  // Guard on the payload actually changing, too: each report re-renders us with fresh
  // callback identities and re-runs this effect, so an unguarded call is an infinite
  // loop rather than a wasted render.
  const reportedRef = useRef('');
  useEffect(() => {
    const readable = state === 'ready';
    const summary = readable ? summarizeProposal(diff, invites, ctx) : '';
    const signature = `${readable}|${summary}`;
    if (signature === reportedRef.current) return;
    reportedRef.current = signature;
    onReport?.({
      readable,
      summary,
      details: readable ? describeProposal(diff, invites, ctx) : '',
    });
  }, [state, diff, invites, onReport, ctx]);

  if (!cid || cid === ZERO) {
    return (
      <Box p={4} borderRadius="lg" bg="whiteAlpha.50" border="1px solid" borderColor="whiteAlpha.200">
        <Text fontSize="sm" color="whiteAlpha.800">
          No invite list has been saved yet.
        </Text>
        <Text fontSize="xs" color="whiteAlpha.600" mt={1}>
          Build the list in Settings, under “Who can join by email”, then come back and start this
          vote from there.
        </Text>
      </Box>
    );
  }

  if (state === 'loading' || state === 'idle') {
    return (
      <Box p={4} borderRadius="lg" bg="whiteAlpha.50" border="1px solid" borderColor="whiteAlpha.200">
        <HStack spacing={3}>
          <Spinner size="sm" color="purple.300" />
          <Text fontSize="sm" color="whiteAlpha.700">Loading the list this vote would approve…</Text>
        </HStack>
      </Box>
    );
  }

  if (state === 'error') {
    return (
      <Box p={4} borderRadius="lg" bg="rgba(245, 101, 101, 0.12)" border="1px solid" borderColor="red.400">
        <HStack align="start" spacing={3}>
          <Icon as={FiAlertTriangle} color="red.300" mt="2px" />
          <Box>
            <Text fontSize="sm" color="red.100" fontWeight="600">
              We couldn’t load the list this vote would approve.
            </Text>
            <Text fontSize="xs" color="whiteAlpha.700" mt={1}>
              Don’t approve it until you can read it.
            </Text>
            <Button
              mt={3} size="xs" variant="outline" colorScheme="red"
              leftIcon={<Icon as={FiRefreshCw} />}
              onClick={() => setAttempt((n) => n + 1)}
            >
              Try again
            </Button>
          </Box>
        </HStack>
      </Box>
    );
  }

  const total = invites.length;
  const showComparison = diff && !diff.isFirstList;
  const keptCount = diff?.kept?.length || 0;

  return (
    <Box borderRadius="lg" bg="whiteAlpha.50" border="1px solid" borderColor="whiteAlpha.200" p={4}>
      <HStack justify="space-between" align="center">
        <Box>
          <Text {...EYEBROW} color="whiteAlpha.600">Who could join</Text>
          <Text fontSize="28px" fontWeight="700" lineHeight="1.1" color="white" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {total}
          </Text>
        </Box>
        {showComparison && (
          <Tag size="sm" borderRadius="full" bg="whiteAlpha.200" color="whiteAlpha.900" fontSize="11px">
            Replaces the current list
          </Tag>
        )}
      </HStack>

      {showComparison ? (
        <>
          <Band label="New" tone="green" invites={diff.added} ctx={ctx} />
          <Band
            label="Losing their invite" tone="rose" invites={diff.removed} ctx={ctx} muted
            note="They keep any role they already claimed. They just can’t use their invite again."
          />
          <Band label="Different roles" tone="purple" invites={diff.changed} ctx={ctx} />
          {keptCount > 0 && (
            <Box mt={4}>
              <HStack justify="space-between">
                <Text {...EYEBROW} color="whiteAlpha.500">Staying ({keptCount})</Text>
                <Button size="xs" variant="link" color="purple.200" onClick={() => setShowKept((v) => !v)}>
                  {showKept ? 'Hide' : 'Show all'}
                </Button>
              </HStack>
              {showKept ? (
                <Box mt={1}>
                  {diff.kept.map((i) => (
                    <InviteRow key={inviteKey(i)} invite={i} ctx={ctx} muted />
                  ))}
                </Box>
              ) : (
                <Text fontSize="xs" color="whiteAlpha.600" mt={1} noOfLines={1}>
                  {diff.kept.slice(0, 2).map(describeWho).join(', ')}
                  {keptCount > 2 ? ` and ${keptCount - 2} more` : ''}
                </Text>
              )}
            </Box>
          )}
          {!diff.added.length && !diff.removed.length && !diff.changed.length && (
            <Text fontSize="sm" color="whiteAlpha.700" mt={3}>
              Nothing changes. This list is the same as the one already in use.
            </Text>
          )}
        </>
      ) : (
        <Box mt={3}>
          {invites.map((i) => (
            <InviteRow key={inviteKey(i)} invite={i} ctx={ctx} />
          ))}
          {!invites.length && (
            <Text fontSize="sm" color="whiteAlpha.700">This list is empty. Nobody could join with it.</Text>
          )}
        </Box>
      )}

      <Divider my={3} borderColor="whiteAlpha.100" />
      <Button size="xs" variant="link" color="whiteAlpha.500" onClick={() => setShowDetails((v) => !v)}>
        {showDetails ? 'Hide the details' : 'Check the details'}
      </Button>
      <Collapse in={showDetails} animateOpacity>
        <VStack align="stretch" spacing={1} mt={2}>
          <Text fontSize="11px" color="whiteAlpha.600">
            These go with the vote so the list can’t be swapped after it passes.
          </Text>
          <Text fontSize="11px" fontFamily="mono" color="whiteAlpha.700" wordBreak="break-all">
            Fingerprint of this list  {root || '—'}
          </Text>
          <Text fontSize="11px" fontFamily="mono" color="whiteAlpha.700" wordBreak="break-all">
            Stored copy  {cid}
          </Text>
        </VStack>
      </Collapse>
    </Box>
  );
}
