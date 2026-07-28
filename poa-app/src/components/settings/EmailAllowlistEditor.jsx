/**
 * EmailAllowlistEditor — admin UI to curate an org's ZK Email allowlist and STAGE it.
 *
 * Staging (this component): build the allowlist (whole domains + specific addresses -> roles), upload
 * the JSON to IPFS, and record `{ cid, root }` in the org metadata via `updateOrgMetaAsAdmin` — the
 * exact non-clobbering pattern OrgMetadataEditor uses (re-fetch the full metadata, merge one field).
 * No governance vote here. ACTIVATING the staged allowlist (writing the root the contract verifies)
 * is a separate governance step (AllowlistActivationPanel).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  CheckboxGroup,
  Code,
  Divider,
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
import { useAuth } from '@/context/AuthContext';
import { ipfsCidToBytes32, stringToBytes } from '@/services/web3/utils/encoding';
import { RefreshEvent } from '@/context/RefreshContext';
import { buildAllowlist } from '@/lib/zkemail/allowlist';
import { getClient } from '@/util/apolloClient';
import { FETCH_INFRASTRUCTURE_ADDRESSES, FETCH_ORG_BY_ID } from '@/util/queries';
import { getSubgraphUrl, getNetworkByChainId } from '@/config/networks';
import OrgRegistryABI from '../../../abi/OrgRegistry.json';

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

  const roles = useMemo(
    () =>
      (roleHatIds || []).map((hatId, index) => ({
        hatId: String(hatId),
        index,
        name: roleNames?.[hatId] || roleNames?.[String(hatId)] || `Role ${index + 1}`,
      })),
    [roleHatIds, roleNames],
  );

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
  const [activeRoot, setActiveRoot] = useState(null);
  const [prefilledCount, setPrefilledCount] = useState(0);
  const prefilledRef = useRef(false);

  // Live on-chain active root (so the admin sees staged-vs-active) — AND prefill the editor with the
  // currently-ACTIVE entries. Staging always builds a WHOLE replacement list; starting from an empty
  // editor made "add one email" silently drop every existing domain from the new root.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!zkEmailInvites || !zkEmailInvitesAddress) return;
      try {
        const { root, cid } = await zkEmailInvites.getActiveAllowlist(zkEmailInvitesAddress);
        if (!alive) return;
        setActiveRoot(root);
        if (prefilledRef.current || !root || root === ZERO_ROOT || !cid || cid === ZERO_ROOT) return;
        const doc = await safeFetchFromIpfs(bytes32ToIpfsCid(cid));
        if (!alive || prefilledRef.current) return;
        // Only trust a doc that matches the on-chain root, and never clobber manual edits.
        if (doc?.root?.toLowerCase() === String(root).toLowerCase() && Array.isArray(doc.entries)) {
          const current = doc.entries
            .filter((e) => (e.type === 'domain' || e.type === 'email') && e.identifier && e.hatIds?.length)
            .map((e) => ({ type: e.type, identifier: e.identifier, hatIds: e.hatIds }));
          if (current.length) {
            prefilledRef.current = true;
            setEntries((prev) => (prev.length ? prev : current));
            setPrefilledCount(current.length);
          }
        }
      } catch (_) {
        /* dormant / not deployed / doc unavailable — start empty as before */
      }
    })();
    return () => {
      alive = false;
    };
  }, [zkEmailInvites, zkEmailInvitesAddress, safeFetchFromIpfs, bytes32ToIpfsCid]);

  const addEntry = () => {
    const id = draftId.trim().toLowerCase();
    if (draftType === 'domain' && !DOMAIN_RE.test(id)) {
      return toast({ title: 'Enter a valid domain (e.g. acme.com)', status: 'error', duration: 3000 });
    }
    if (draftType === 'email' && !EMAIL_RE.test(id)) {
      return toast({ title: 'Enter a valid email address', status: 'error', duration: 3000 });
    }
    if (!draftHats.length) return toast({ title: 'Pick at least one role', status: 'error', duration: 3000 });
    if (entries.some((e) => e.type === draftType && e.identifier === id)) {
      return toast({ title: 'Already added', status: 'warning', duration: 2000 });
    }
    setEntries((prev) => [...prev, { type: draftType, identifier: id, hatIds: draftHats }]);
    setDraftId('');
    setDraftHats([]);
  };

  const removeEntry = (i) => setEntries((prev) => prev.filter((_, idx) => idx !== i));

  const stage = async () => {
    if (!entries.length) return toast({ title: 'Add at least one entry', status: 'error', duration: 3000 });
    if (!isReady || !factory) return toast({ title: 'Connect your wallet', status: 'error', duration: 3000 });
    if (!orgRegistryAddress) return toast({ title: 'OrgRegistry not found for this chain', status: 'error' });
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
      if (!alRes?.path) throw new Error('Failed to upload the allowlist to IPFS');

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
          pendingMessage: 'Staging the email allowlist…',
          successMessage: 'Allowlist staged. Activate it with a governance vote to make it live.',
          errorMessage: 'Failed to stage the allowlist',
          refreshEvent: RefreshEvent.METADATA_UPDATED,
        },
      );
      setEntries([]);
    } catch (e) {
      toast({ title: 'Error', description: e.message || String(e), status: 'error', duration: 5000 });
    } finally {
      setSubmitting(false);
    }
  };

  const isActive =
    staged && activeRoot && staged.root && activeRoot.toLowerCase() === String(staged.root).toLowerCase();

  return (
    <VStack align="stretch" spacing={5}>
      <Box>
        <Heading size="md">Email invites (allowlist)</Heading>
        <Text mt={1} color="gray.600" fontSize="sm">
          Invite whole domains or specific addresses to claim org roles by proving control of their email.
          Staging records the list in your org metadata; a governance vote activates it on-chain.
        </Text>
      </Box>

      {staged && (
        <Alert status={isActive ? 'success' : 'info'} borderRadius="lg" fontSize="sm">
          <AlertIcon />
          <Box>
            <Text>
              {isActive
                ? 'Active'
                : activeRoot && activeRoot !== ZERO_ROOT
                  ? 'Staged change — pending governance vote'
                  : 'Staged — not yet active (needs a governance vote)'}
              {` · ${staged.entryCount ?? '?'} entries`}
            </Text>
            {!isActive && staged.cid && (
              <Box mt={2}>
                <Button
                  size="sm"
                  colorScheme="teal"
                  onClick={() =>
                    router.push(
                      `/voting/?${new URLSearchParams({
                        org: currentName || '',
                        propose: 'activate-email-allowlist',
                        prefill_root: staged.root,
                        prefill_cid: ipfsCidToBytes32(staged.cid),
                      })}`,
                    )
                  }
                >
                  Create activation proposal →
                </Button>
                <Text color="gray.600" fontSize="xs" mt={2}>
                  Opens Voting with the “Activate Email Allowlist” proposal pre-filled (root + CID below) —
                  review, create, members vote, then it goes live.
                </Text>
                <Code fontSize="xs" display="block" w="full" whiteSpace="pre-wrap" mt={1}>
                  {`root: ${staged.root}\ncid:  ${ipfsCidToBytes32(staged.cid)}`}
                </Code>
              </Box>
            )}
          </Box>
        </Alert>
      )}

      <Box p={4} borderWidth="1px" borderRadius="lg">
        <Text fontWeight="semibold" mb={2}>
          Add an entry
        </Text>
        {prefilledCount > 0 && (
          <Text fontSize="xs" color="gray.500" mb={2}>
            Loaded the {prefilledCount} currently-active entr{prefilledCount === 1 ? 'y' : 'ies'} below — staging
            replaces the WHOLE allowlist, so keep them unless you mean to revoke access.
          </Text>
        )}
        <Stack direction={{ base: 'column', md: 'row' }} spacing={3}>
          <Select w={{ md: '8rem' }} value={draftType} onChange={(e) => setDraftType(e.target.value)}>
            <option value="domain">Domain</option>
            <option value="email">Address</option>
          </Select>
          <Input
            placeholder={draftType === 'domain' ? 'acme.com' : 'alice@acme.com'}
            value={draftId}
            onChange={(e) => setDraftId(e.target.value)}
          />
        </Stack>
        <Text fontSize="sm" color="gray.600" mt={3} mb={1}>
          Grants role(s):
        </Text>
        <CheckboxGroup value={draftHats} onChange={(v) => setDraftHats(v.map(String))}>
          <Wrap>
            {roles.map((r) => (
              <Checkbox key={r.hatId} value={r.hatId}>
                {r.name}
              </Checkbox>
            ))}
          </Wrap>
        </CheckboxGroup>
        <Button mt={3} size="sm" onClick={addEntry}>
          Add
        </Button>
      </Box>

      {entries.length > 0 && (
        <Box p={4} borderWidth="1px" borderRadius="lg">
          <Text fontWeight="semibold" mb={2}>
            New allowlist ({entries.length})
          </Text>
          <VStack align="stretch" spacing={2}>
            {entries.map((e, i) => (
              <HStack key={`${e.type}-${e.identifier}`} justify="space-between">
                <HStack>
                  <Badge colorScheme={e.type === 'domain' ? 'purple' : 'blue'}>{e.type}</Badge>
                  <Text>{e.identifier}</Text>
                  {e.hatIds.map((h) => (
                    <Tag key={h} size="sm">
                      {roles.find((r) => r.hatId === h)?.name || 'role'}
                    </Tag>
                  ))}
                </HStack>
                <IconButton aria-label="remove" icon={<CloseIcon />} size="xs" variant="ghost" onClick={() => removeEntry(i)} />
              </HStack>
            ))}
          </VStack>
          <Divider my={3} />
          <Button colorScheme="blue" onClick={stage} isDisabled={submitting}>
            {submitting ? <Spinner size="sm" /> : 'Stage allowlist'}
          </Button>
        </Box>
      )}
    </VStack>
  );
}
