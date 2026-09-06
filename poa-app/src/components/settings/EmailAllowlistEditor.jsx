/**
 * EmailAllowlistEditor — "Who can join by email", the admin half of email invites.
 *
 * Two deliberate acts, and admins reliably conflate them, so the UI is built around
 * making the difference unmissable:
 *
 *   1. SAVE (here). Build the list — whole domains or single addresses, each granting
 *      roles — upload the JSON to IPFS, and record `{ cid, root }` in the org metadata
 *      via `updateOrgMetaAsAdmin`. Same non-clobbering pattern as OrgMetadataEditor
 *      (re-fetch the full metadata, merge one field). No vote. Nothing goes live.
 *   2. APPROVE (the voting page). The group votes on the saved list. Only a passing
 *      vote writes the root the contract verifies. "Ask the group to approve" hands
 *      the saved list to the `email-invites` proposal template via a deep link.
 *
 * Saving always builds a WHOLE replacement list, so the editor prefills with whatever
 * is live today — dropping a row is a revocation, and it has to be an authored act
 * rather than an accident of starting from an empty form.
 *
 * VOCABULARY: nothing user-facing says allowlist, merkle, root, CID, stage, or
 * activate. The hashes exist, but they are derived from the saved list and live behind
 * "Check the details" — a person should never read one to use this feature.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Card,
  CardBody,
  Checkbox,
  CheckboxGroup,
  Collapse,
  HStack,
  Heading,
  IconButton,
  Input,
  Select,
  Spinner,
  Stack,
  Tag,
  Text,
  VStack,
  useToast,
  Wrap,
} from '@chakra-ui/react';
import { CloseIcon } from '@chakra-ui/icons';
import { useAccount, useSwitchChain } from 'wagmi';
import { useQuery } from '@apollo/client';
import { useIPFScontext } from '@/context/ipfsContext';
import { useWeb3Services, useTransactionWithNotification } from '@/hooks/useWeb3Services';
import { usePOContext } from '@/context/POContext';
import { useOrgStructure } from '@/hooks/useOrgStructure';
import { useAuth } from '@/context/AuthContext';
import { ipfsCidToBytes32, stringToBytes } from '@/services/web3/utils/encoding';
import { RefreshEvent } from '@/context/RefreshContext';
import { assertRootMatches, buildAllowlist } from '@/lib/zkemail/allowlist';
import { describeWho, inviteKey, inviteRoleNames, readInvites } from '@/lib/zkemail/inviteDisplay';
import { getClient } from '@/util/apolloClient';
import { FETCH_INFRASTRUCTURE_ADDRESSES, FETCH_ORG_BY_ID } from '@/util/queries';
import { getSubgraphUrl, getNetworkByChainId } from '@/config/networks';
import OrgRegistryABI from '../../../abi/OrgRegistry.json';

const EYEBROW = {
  fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.08em',
};

/**
 * The heaviest object on the card, and always present — it answers "where is this
 * right now, and what do I do next". A count with a status sentence beats a badge,
 * because the two-step (save, then the group votes) is the thing admins get wrong.
 */
function StatusPlate({ savedCount, awaitingVote, isActive, hasLive, draftCount, isDirty, onPropose }) {
  const nothingYet = savedCount === null && !hasLive && !draftCount;

  const tone = isDirty ? 'warmGray' : isActive ? 'green' : awaitingVote ? 'coral' : 'warmGray';
  const accent = { green: 'green.400', coral: 'coral.400', warmGray: 'warmGray.300' }[tone];

  const eyebrow = isDirty
    ? 'Not saved yet'
    : isActive ? 'In use' : awaitingVote ? 'Waiting on the group' : 'Not set up';

  const sentence = isDirty
    ? 'You’ve changed the list. Save it, then ask the group to approve it.'
    : isActive
      ? 'Live. Everyone here can join now.'
      : awaitingVote
        ? hasLive
          ? 'Saved. The group votes on this before it replaces the live list.'
          : 'Saved. The group hasn’t voted yet, so no one can join until they do.'
        : 'No invite list yet. Build one below and save it.';

  // While editing, the numeral tracks what's on screen; otherwise what's saved.
  const bigNumber = isDirty ? draftCount : (savedCount ?? draftCount);
  const wasCount = isDirty && savedCount !== null && savedCount !== draftCount ? savedCount : null;

  return (
    <Box
      borderRadius="xl"
      bg="warmGray.50"
      borderWidth="1px"
      borderColor="warmGray.200"
      borderLeftWidth="4px"
      borderLeftColor={accent}
      px={4}
      py={4}
    >
      <Stack direction={{ base: 'column', sm: 'row' }} justify="space-between" align={{ sm: 'center' }} spacing={3}>
        <HStack spacing={4} align="center">
          {!nothingYet && (
            <Text
              fontSize="44px" fontWeight="700" lineHeight="1" color="warmGray.900"
              sx={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {bigNumber}
            </Text>
          )}
          <Box>
            <Text {...EYEBROW} color="warmGray.500">{eyebrow}</Text>
            {wasCount !== null && (
              <Text fontSize="xs" color="warmGray.500">was {wasCount}</Text>
            )}
            <Text fontSize="sm" color="warmGray.700" mt="2px">{sentence}</Text>
          </Box>
        </HStack>

        {/* No button when it is live and unchanged, or while there are unsaved edits —
            a CTA that skips the save step would propose the wrong list. */}
        {awaitingVote && !isDirty && onPropose && (
          <Button size="sm" colorScheme="coral" borderRadius="lg" onClick={onPropose} flexShrink={0}>
            Ask the group to approve
          </Button>
        )}
      </Stack>
    </Box>
  );
}

/** One line of the list. Hairline-ruled, not a card — the list reads as a document. */
function InviteRow({ entry, roleCtx, onRemove }) {
  // Shared with the voting surface. Matches hat ids numerically, because a saved
  // document stores them as 0x-hex while POContext hands back decimal strings —
  // a string compare silently rendered every row with no role at all.
  const names = inviteRoleNames(entry, roleCtx);
  return (
    <HStack
      justify="space-between"
      align="center"
      py={2.5}
      spacing={3}
      borderTop="1px solid"
      borderColor="warmGray.200"
      role="group"
    >
      <HStack spacing={2} flexWrap="wrap" flex="1" minW={0}>
        <Text fontSize="sm" color="warmGray.900" wordBreak="break-word">
          {entry.type === 'domain' ? (
            <>
              <Text as="span" color="warmGray.500">Anyone at </Text>
              <Text as="span" fontWeight="600">{entry.identifier}</Text>
            </>
          ) : describeWho(entry)}
        </Text>
        {names.map((n) => (
          <Tag key={n} size="sm" borderRadius="full" bg="warmGray.100" color="warmGray.700" fontSize="11px">
            {n}
          </Tag>
        ))}
      </HStack>
      <IconButton
        aria-label={`Remove ${describeWho(entry)}`}
        icon={<CloseIcon boxSize={2.5} />}
        size="xs"
        variant="ghost"
        color="warmGray.400"
        opacity={0}
        _groupHover={{ opacity: 1 }}
        _focusVisible={{ opacity: 1 }}
        onClick={onRemove}
      />
    </HStack>
  );
}

/**
 * Order-insensitive fingerprint of a list, for telling edited from saved.
 *
 * Hat ids must be normalized: a saved document stores them as '0x'-hex while rows
 * added in the composer carry decimal strings. Comparing the raw strings made
 * "remove a prefilled row and add it back" look like a permanent edit, which pinned
 * the plate to "Not saved yet" and hid the "Ask the group to approve" button.
 */
const normalizeHat = (h) => { try { return BigInt(h).toString(); } catch { return String(h); } };
const signature = (list) => JSON.stringify(
  (list || [])
    .map((e) => `${inviteKey(e)}:${(e.hatIds || []).map(normalizeHat).sort().join(',')}`)
    .sort(),
);

const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
// ASCII-only local + domain — matches what the circuit (ASCII From-address regex) and contract can
// actually match. A non-ASCII address would build a permanently-unclaimable leaf, so reject it here
// at entry time (the allowlist builder also fail-closes on non-ASCII as a backstop for other callers).
const EMAIL_RE = /^[\x21-\x7E]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const ZERO_ROOT = '0x0000000000000000000000000000000000000000000000000000000000000000';

export default function EmailAllowlistEditor({ orgId, orgChainId, currentName }) {
  const toast = useToast();
  const { addToIpfs, safeFetchFromIpfs, bytes32ToIpfsCid } = useIPFScontext();
  const router = useRouter();
  const { factory, txManager, isReady, zkEmailInvites } = useWeb3Services();
  const { executeWithNotification } = useTransactionWithNotification();
  const { isPasskeyUser } = useAuth();
  const { roleHatIds, roleNames, zkEmailInvitesAddress } = usePOContext();
  const { chain: connectedChain } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  // `defaultEligible` roles are open to everyone. QuickJoin rejects claiming an open
  // hat (POP #185, H-03), so an invite pointing at one can never be redeemed — surface
  // that here rather than letting invitees discover it after a 30-second proof.
  const { roles: structureRoles } = useOrgStructure();
  const openHatIds = useMemo(
    () => new Set((structureRoles || []).filter((r) => r.defaultEligible).map((r) => String(r.hatId))),
    [structureRoles],
  );

  const roles = useMemo(
    () =>
      (roleHatIds || []).map((hatId, index) => ({
        hatId: String(hatId),
        index,
        name: roleNames?.[hatId] || roleNames?.[String(hatId)] || `Role ${index + 1}`,
        isOpen: openHatIds.has(String(hatId)),
      })),
    [roleHatIds, roleNames, openHatIds],
  );

  const roleCtx = useMemo(() => ({ roleHatIds, roleNames }), [roleHatIds, roleNames]);

  const orgSubgraphUrl = orgChainId ? getSubgraphUrl(orgChainId) : null;
  const orgClient = useMemo(() => getClient(orgSubgraphUrl), [orgSubgraphUrl]);
  const { data: infraData } = useQuery(FETCH_INFRASTRUCTURE_ADDRESSES, { client: orgClient, skip: !orgSubgraphUrl });
  const orgRegistryAddress = infraData?.poaManagerContracts?.[0]?.orgRegistryProxy || null;

  // The org's current metadata hash — used to re-fetch + preserve all metadata when staging, and to
  // read the currently-staged allowlist for status display.
  const { data: orgData } = useQuery(FETCH_ORG_BY_ID, {
    client: orgClient,
    variables: { id: orgId },
    skip: !orgSubgraphUrl || !orgId,
  });
  const metadataHash = orgData?.organization?.metadataHash || null;
  const [staged, setStaged] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!metadataHash || metadataHash === ZERO_ROOT) return;
      try {
        const meta = await safeFetchFromIpfs(bytes32ToIpfsCid(metadataHash));
        if (alive && meta?.zkEmailAllowlist) setStaged(meta.zkEmailAllowlist);
      } catch (_) {
        /* metadata unavailable */
      }
    })();
    return () => {
      alive = false;
    };
  }, [metadataHash, safeFetchFromIpfs, bytes32ToIpfsCid]);

  // entries: [{ type:'domain'|'email', identifier:string, hatIds:string[] }]
  const [entries, setEntries] = useState([]);
  const [draftType, setDraftType] = useState('domain');
  const [draftId, setDraftId] = useState('');
  const [draftHats, setDraftHats] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [activeRoot, setActiveRoot] = useState(null);
  const [prefilledCount, setPrefilledCount] = useState(0);
  const prefilledRef = useRef(false);
  // Signature of the list as it was loaded, so we can tell "edited" from "saved".
  const [baseline, setBaseline] = useState(null);

  // Read the live root, so the plate can tell "in use" from "waiting on the group".
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!zkEmailInvites || !zkEmailInvitesAddress) return;
      try {
        const { root } = await zkEmailInvites.getActiveAllowlist(zkEmailInvitesAddress);
        if (alive) setActiveRoot(root);
      } catch (_) {
        /* dormant / not deployed — the plate just shows "not set up" */
      }
    })();
    return () => { alive = false; };
  }, [zkEmailInvites, zkEmailInvitesAddress]);

  // Prefill the editor with the list the admin is actually editing.
  //
  // Saving always builds a WHOLE replacement list, so an empty editor would make
  // "add one address" silently revoke everyone already invited. Prefer the SAVED
  // list (their most recent intent, possibly still waiting on a vote) over the live
  // one — otherwise a saved-but-unapproved list shows a count in the plate above an
  // empty list below, which reads as data loss.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (prefilledRef.current) return;

      const sources = [];
      if (staged?.cid) sources.push({ cid: staged.cid, root: staged.root });
      if (zkEmailInvites && zkEmailInvitesAddress) {
        try {
          const active = await zkEmailInvites.getActiveAllowlist(zkEmailInvitesAddress);
          if (active?.cid && active.cid !== ZERO_ROOT && active?.root && active.root !== ZERO_ROOT) {
            sources.push({ cid: bytes32ToIpfsCid(active.cid), root: active.root });
          }
        } catch (_) { /* nothing live */ }
      }

      let loaded = false;
      for (const source of sources) {
        try {
          const doc = await safeFetchFromIpfs(source.cid);
          if (!alive || prefilledRef.current) return;
          // Only trust a document that matches the hash it was committed under.
          assertRootMatches(doc, source.root);
          const current = readInvites(doc).filter((e) => e.hatIds.length);
          if (!current.length) continue;
          prefilledRef.current = true;
          setEntries((prev) => (prev.length ? prev : current));
          setPrefilledCount(current.length);
          setBaseline(signature(current));
          loaded = true;
          return;
        } catch (_) { /* try the next source */ }
      }
      // Nothing loaded (no saved list, or every source unreadable). Anchor the
      // baseline anyway so isDirty reflects real edits instead of staying false and
      // offering to propose a list we never actually read.
      if (alive && !loaded && !prefilledRef.current) {
        prefilledRef.current = true;
        setBaseline(signature([]));
      }
    })();
    return () => { alive = false; };
  }, [staged, zkEmailInvites, zkEmailInvitesAddress, safeFetchFromIpfs, bytes32ToIpfsCid]);

  const addEntry = () => {
    const id = draftId.trim().toLowerCase();
    if (draftType === 'domain' && !DOMAIN_RE.test(id)) {
      return toast({ title: 'Enter a valid domain, like acme.com', status: 'error', duration: 3000 });
    }
    if (draftType === 'email' && !EMAIL_RE.test(id)) {
      return toast({ title: 'Enter a valid email address', status: 'error', duration: 3000 });
    }
    if (!draftHats.length) return toast({ title: 'Pick at least one role', status: 'error', duration: 3000 });
    if (entries.some((e) => e.type === draftType && e.identifier === id)) {
      return toast({ title: 'That’s already on the list', status: 'warning', duration: 2000 });
    }
    setEntries((prev) => [...prev, { type: draftType, identifier: id, hatIds: draftHats }]);
    setDraftId('');
    setDraftHats([]);
  };

  const removeEntry = (i) => setEntries((prev) => prev.filter((_, idx) => idx !== i));

  const stage = async () => {
    if (!entries.length) return toast({ title: 'Add at least one person or domain', status: 'error', duration: 3000 });
    if (!isReady || !factory) return toast({ title: 'Connect your wallet', status: 'error', duration: 3000 });
    if (!orgRegistryAddress) return toast({ title: 'Can’t reach your group’s registry on this network', status: 'error' });
    setSubmitting(true);
    try {
      // 1. Build the allowlist + its merkle tree, roleIndexes resolved for display.
      const withIdx = entries.map((e) => ({
        ...e,
        roleIndexes: e.hatIds.map((h) => roles.find((r) => r.hatId === h)?.index).filter((x) => x !== undefined),
      }));
      const { json, root } = await buildAllowlist({ orgId, entries: withIdx });

      // 2. Upload the allowlist file.
      const alRes = await addToIpfs(json);
      if (!alRes?.path) throw new Error('Couldn’t save the list. Please try again.');

      // 3. Re-fetch the FULL current metadata so we never clobber other fields, then merge one field.
      let meta = {};
      try {
        if (metadataHash && metadataHash !== ZERO_ROOT) {
          meta = (await safeFetchFromIpfs(bytes32ToIpfsCid(metadataHash))) || {};
        }
      } catch (_) {
        meta = {};
      }
      meta = {
        ...meta,
        zkEmailAllowlist: { cid: alRes.path, root, entryCount: entries.length },
      };

      // 4. Upload metadata + write its hash on-chain (metadata-admin gated; no governance vote).
      const metaRes = await addToIpfs(JSON.stringify(meta));
      const newMetadataHash = ipfsCidToBytes32(metaRes.path);
      const nameBytes = stringToBytes((currentName || '').trim() || 'Organization');

      if (!isPasskeyUser && orgChainId && connectedChain?.id !== orgChainId) {
        toast({ title: `Switching to ${getNetworkByChainId(orgChainId)?.name || 'the org network'}…`, status: 'info' });
        await switchChainAsync({ chainId: orgChainId });
      }

      const contract = factory.createWritable(orgRegistryAddress, OrgRegistryABI);
      await executeWithNotification(
        () => txManager.execute(contract, 'updateOrgMetaAsAdmin', [orgId, nameBytes, newMetadataHash]),
        {
          pendingMessage: 'Saving the list…',
          successMessage: 'List saved. Ask the group to approve it to turn it on.',
          errorMessage: 'Couldn’t save the list',
          refreshEvent: RefreshEvent.METADATA_UPDATED,
        },
      );
      // Reflect the save immediately. `staged` is driven by a subgraph query that
      // lags the tx by seconds, so without this the plate says "Not set up" and the
      // "Ask the group to approve" button never appears after a first save.
      setStaged({ cid: alRes.path, root, entryCount: entries.length });
      setBaseline(signature(entries));
    } catch (e) {
      toast({ title: 'Error', description: e.message || String(e), status: 'error', duration: 5000 });
    } finally {
      setSubmitting(false);
    }
  };

  const isActive =
    staged && activeRoot && staged.root && activeRoot.toLowerCase() === String(staged.root).toLowerCase();

  // The list is only "saved" in a way the group can act on once it differs from what
  // is live. Everything the plate says keys off these three facts.
  const savedCount = staged?.entryCount ?? null;
  const hasLive = Boolean(activeRoot && activeRoot !== ZERO_ROOT);
  const awaitingVote = Boolean(staged && !isActive);
  // Edited since it was loaded — the list on screen is no longer the saved one,
  // so neither "waiting on the group" nor "in use" is honest about it any more.
  const isDirty = baseline !== null
    ? signature(entries) !== baseline
    : entries.length > 0 && savedCount === null;

  const goToVote = () =>
    router.push(
      `/voting/?${new URLSearchParams({
        org: currentName || '',
        propose: 'email-invites',
        prefill_root: staged.root,
        prefill_cid: ipfsCidToBytes32(staged.cid),
      })}`,
    );

  const openRoles = [...draftHats, ...entries.flatMap((e) => e.hatIds || [])]
    .some((h) => openHatIds.has(String(h)));

  return (
    <Card variant="elevated" borderRadius="2xl">
      <CardBody>
        <VStack align="stretch" spacing={6}>
          {/* Header — quiet. The plate below carries the state. */}
          <Box>
            <Heading size="md" fontWeight="600">Who can join by email</Heading>
            <Text mt={1} color="warmGray.600" fontSize="sm">
              People on this list can join your group by proving they own their email address.
              They don’t need a wallet to start.
            </Text>
          </Box>

          <StatusPlate
            savedCount={savedCount}
            awaitingVote={awaitingVote}
            isActive={isActive}
            hasLive={hasLive}
            draftCount={entries.length}
            isDirty={isDirty}
            onPropose={staged?.cid ? goToVote : null}
          />

          {/* The list, as a ruled document. Adding someone writes the next line. */}
          <Box>
            <HStack justify="space-between" align="baseline" mb={1}>
              <Text {...EYEBROW} color="warmGray.500">On the list</Text>
              <Text fontSize="sm" color="warmGray.500" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {entries.length}
              </Text>
            </HStack>

            {prefilledCount > 0 && (
              <Text fontSize="xs" color="warmGray.500" mb={2}>
                {isActive
                  ? `${prefilledCount === 1 ? 'This is the person' : `These are the ${prefilledCount} people and domains`} invited today.`
                  : `${prefilledCount === 1 ? 'This is the person' : `These are the ${prefilledCount} people and domains`} on your saved list.`}
                {' '}Anyone you remove loses their invite when the group approves the new list.
              </Text>
            )}

            {entries.length === 0 ? (
              <Box py={6} textAlign="center" borderTop="1px solid" borderColor="warmGray.200">
                <Text fontSize="sm" color="warmGray.500">
                  No one invited yet. Add a domain or an address below.
                </Text>
              </Box>
            ) : (
              <Box>
                {entries.map((e, i) => (
                  <InviteRow
                    key={inviteKey(e)}
                    entry={e}
                    roleCtx={roleCtx}
                    onRemove={() => removeEntry(i)}
                  />
                ))}
              </Box>
            )}

            {/* Composer, docked as the next row of the same document. */}
            <Box borderTop="1px solid" borderColor="warmGray.200" pt={4} mt={0}>
              <Stack direction={{ base: 'column', md: 'row' }} spacing={2} align={{ md: 'center' }}>
                <Select
                  size="sm" w={{ md: '13.5rem' }} borderRadius="lg" flexShrink={0}
                  value={draftType}
                  onChange={(e) => setDraftType(e.target.value)}
                >
                  <option value="domain">Everyone at a domain</option>
                  <option value="email">One person</option>
                </Select>
                <Input
                  size="sm" borderRadius="lg"
                  placeholder={draftType === 'domain' ? 'acme.com' : 'alice@acme.com'}
                  value={draftId}
                  onChange={(e) => setDraftId(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEntry(); } }}
                />
              </Stack>
              {draftType === 'domain' && (
                <Text fontSize="xs" color="warmGray.500" mt={1}>
                  Anyone with an email at this domain can join.
                </Text>
              )}

              <Text fontSize="sm" color="warmGray.600" mt={3} mb={1}>
                They arrive as
              </Text>
              <CheckboxGroup value={draftHats} onChange={(v) => setDraftHats(v.map(String))}>
                <Wrap spacing={3}>
                  {roles.map((r) => (
                    <Checkbox key={r.hatId} value={r.hatId} size="sm">
                      {r.name}
                      {r.isOpen && (
                        <Text as="span" fontSize="xs" color="coral.600" ml={1}>
                          (already open to everyone)
                        </Text>
                      )}
                    </Checkbox>
                  ))}
                </Wrap>
              </CheckboxGroup>

              {openRoles && (
                <Alert status="warning" mt={3} borderRadius="lg" fontSize="sm">
                  <AlertIcon />
                  <Box>
                    Anyone can already take that role without an invite, so this one wouldn’t do
                    anything. Require vouches for the role first, or invite people into a different one.
                  </Box>
                </Alert>
              )}

              <Button mt={3} size="sm" variant="outline" borderRadius="lg" onClick={addEntry}>
                Add to the list
              </Button>
            </Box>
          </Box>

          {/* Save + the one sentence that prevents the commonest mistake. */}
          <Box borderTop="1px solid" borderColor="warmGray.200" pt={4}>
            <Stack direction={{ base: 'column', sm: 'row' }} justify="space-between" align={{ sm: 'center' }} spacing={3}>
              <Box>
                <Text fontSize="xs" color="warmGray.600">
                  Approving replaces the whole list. Anyone you take off loses their invite.
                  They keep any role they already claimed.
                </Text>
              </Box>
              <Box textAlign={{ sm: 'right' }}>
                <Button
                  colorScheme="coral" borderRadius="lg"
                  onClick={stage}
                  isDisabled={submitting || entries.length === 0}
                >
                  {submitting ? <Spinner size="sm" /> : 'Save the list'}
                </Button>
                <Text fontSize="xs" color="warmGray.500" mt={1} whiteSpace="nowrap">
                  Saving doesn’t turn it on.
                </Text>
              </Box>
            </Stack>

            {staged?.cid && (
              <Box mt={4}>
                <Button
                  size="xs" variant="link" color="warmGray.500"
                  onClick={() => setShowDetails((v) => !v)}
                >
                  {showDetails ? 'Hide the details' : 'Check the details'}
                </Button>
                <Collapse in={showDetails} animateOpacity>
                  <VStack align="stretch" spacing={1} mt={2}>
                    <Text fontSize="xs" color="warmGray.500">
                      These go with the vote so the list can’t be swapped after it passes.
                    </Text>
                    <Text fontSize="xs" fontFamily="mono" color="warmGray.600" wordBreak="break-all">
                      Fingerprint of this list  {staged.root}
                    </Text>
                    <Text fontSize="xs" fontFamily="mono" color="warmGray.600" wordBreak="break-all">
                      Stored copy  {staged.cid}
                    </Text>
                  </VStack>
                </Collapse>
              </Box>
            )}
          </Box>
        </VStack>
      </CardBody>
    </Card>
  );
}
