import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  VStack,
  Text,
  SimpleGrid,
  Box,
} from '@chakra-ui/react';
import { FiInbox } from 'react-icons/fi';
import { useQuery } from '@apollo/client';
import { useWeb3 } from '@/hooks/useWeb3Services';
import { useAuth } from '@/context/AuthContext';
import { useIPFScontext } from '@/context/ipfsContext';
import { RefreshEvent } from '@/context/RefreshContext';
import { FETCH_DISTRIBUTION_PROPOSALS } from '@/util/queries';
import { getClaimData } from '@/util/merkleDistribution';
import { useSubgraphClient } from '@/util/apolloClient';
import DistributionCard from './DistributionCard';

/**
 * Extract IPFS CID from a proposal description that contains "Merkle tree: ipfs://QmXxx..."
 */
function extractTreeCid(description) {
  if (!description) return null;
  const match = description.match(/ipfs:\/\/(Qm[A-Za-z0-9]{44})/);
  return match ? match[1] : null;
}

/**
 * Find all tree CIDs from executed proposals.
 * Returns array of { cid, rootInDesc } where rootInDesc is the merkle root
 * found in the description (if present), or null for older proposals.
 */
function extractAllTreeCids(proposals) {
  if (!proposals) return [];
  const results = [];
  for (const proposal of proposals) {
    const desc = proposal.metadata?.description || '';
    const cid = extractTreeCid(desc);
    if (!cid) continue;
    // Check if the description also contains "Root: 0x..."
    const rootMatch = desc.match(/Root:\s*(0x[a-fA-F0-9]{64})/);
    results.push({ cid, rootInDesc: rootMatch ? rootMatch[1].toLowerCase() : null });
  }
  return results;
}

/**
 * Find the tree CID for a distribution by matching its merkleRoot.
 * New proposals include "Root: 0x..." in the description for fast matching.
 * For older proposals without the root, returns all CIDs for the caller to verify.
 */
function findTreeCidForDistribution(distribution, treeCids) {
  if (!distribution?.merkleRoot || !treeCids.length) return null;
  const rootHex = distribution.merkleRoot.toLowerCase();

  // Fast path: match by root in description
  const exactMatch = treeCids.find(t => t.rootInDesc === rootHex);
  if (exactMatch) return exactMatch.cid;

  // Slow path: return all CIDs without root info (caller must fetch and verify)
  return treeCids.filter(t => !t.rootInDesc).map(t => t.cid);
}

const CurrentDistributions = ({
  distributions = [],
  paymentManagerAddress,
  hybridVotingId,
  subgraphUrl,
  refetch,
}) => {
  const { treasury, executeWithNotification, isReady } = useWeb3();
  const { accountAddress } = useAuth();
  const { safeFetchFromIpfs } = useIPFScontext();

  const client = useSubgraphClient(subgraphUrl);

  // Fetch executed proposals to find merkle tree CIDs
  const { data: proposalData } = useQuery(FETCH_DISTRIBUTION_PROPOSALS, {
    variables: { hybridVotingId: hybridVotingId?.toLowerCase() },
    skip: !hybridVotingId || distributions.length === 0,
    fetchPolicy: 'no-cache',
    client,
  });

  const proposals = proposalData?.proposals || [];
  const treeCids = React.useMemo(() => extractAllTreeCids(proposals), [proposals]);

  // Claim data cache: { [distributionId]: { amount, proof } | 'loading' | 'not-found' | 'error' }
  const [claimDataMap, setClaimDataMap] = useState({});

  // Fetch claim data for a single distribution (caller must set 'loading' state first)
  const fetchClaimData = useCallback(async (distribution) => {
    const distId = distribution.distributionId;

    try {
      const rootHex = distribution.merkleRoot?.toLowerCase();
      const result = findTreeCidForDistribution(distribution, treeCids);

      // result is either a string (exact CID match) or array of CIDs to try
      const cidsToTry = typeof result === 'string' ? [result] : (result || []);

      if (cidsToTry.length === 0) {
        setClaimDataMap(prev => ({ ...prev, [distId]: 'not-found' }));
        return;
      }

      // Try each CID until we find one whose merkleRoot matches
      for (const cid of cidsToTry) {
        const treeData = await safeFetchFromIpfs(cid);
        if (!treeData?.claims) continue;

        // For slow-path CIDs, verify the root matches
        if (treeData.merkleRoot && treeData.merkleRoot.toLowerCase() !== rootHex) continue;

        const userClaimData = getClaimData(treeData.claims, accountAddress);
        if (userClaimData) {
          setClaimDataMap(prev => ({ ...prev, [distId]: userClaimData }));
          return;
        }
      }

      setClaimDataMap(prev => ({ ...prev, [distId]: 'not-found' }));
    } catch (error) {
      console.error('[Claim] Failed to fetch claim data for dist', distId, error);
      setClaimDataMap(prev => ({ ...prev, [distId]: 'error' }));
    }
  }, [accountAddress, treeCids, safeFetchFromIpfs]);

  // Fetch claim data when proposals load
  useEffect(() => {
    if (!accountAddress || treeCids.length === 0) return;

    const toFetch = distributions.filter(dist => {
      const userClaim = dist.claims?.find(
        c => c.claimer?.toLowerCase() === accountAddress?.toLowerCase()
      );
      return !userClaim; // Only unclaimed distributions
    });

    // Use a ref-like check via functional state to avoid duplicates
    setClaimDataMap(prev => {
      const needsFetch = toFetch.filter(d => !prev[d.distributionId]);
      if (needsFetch.length === 0) return prev;
      // Mark as loading, then trigger fetches outside setState
      const next = { ...prev };
      needsFetch.forEach(d => { next[d.distributionId] = 'loading'; });
      // Schedule fetches (after render)
      setTimeout(() => needsFetch.forEach(d => fetchClaimData(d)), 0);
      return next;
    });
  }, [distributions, treeCids, accountAddress, fetchClaimData]);

  // Handle claim
  const handleClaim = async (distributionId) => {
    const claimData = claimDataMap[distributionId];
    if (!claimData || typeof claimData === 'string') {
      throw new Error('Claim data not available. Please try refreshing the page.');
    }

    if (!treasury || !isReady) {
      throw new Error('Still getting things ready — give it a moment, then try again.');
    }

    const result = await executeWithNotification(
      () => treasury.claimDistribution(
        paymentManagerAddress,
        distributionId,
        claimData.amount,
        claimData.proof
      ),
      {
        pendingMessage: 'Claiming your distribution share...',
        successMessage: 'Distribution claimed successfully!',
        refreshEvent: RefreshEvent.TREASURY_DEPOSITED,
      }
    );

    if (result.success) {
      refetch?.();
    } else {
      throw new Error('We couldn’t claim your share. Please try again.');
    }
  };

  if (distributions.length === 0) {
    return (
      <VStack py={8} spacing={3}>
        <Box p={4} borderRadius="full" bg="rgba(148, 115, 220, 0.1)">
          <FiInbox size={32} color="rgba(148, 115, 220, 0.5)" />
        </Box>
        <Text color="gray.400" textAlign="center">
          No active distributions
        </Text>
        <Text fontSize="sm" color="gray.500" textAlign="center">
          Distributions are created to share profits with members based on their participation.
        </Text>
      </VStack>
    );
  }

  return (
    <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4}>
      {distributions.map((distribution) => {
        const distId = distribution.distributionId;
        const rawClaim = claimDataMap[distId];
        const claimData = rawClaim && typeof rawClaim === 'object' ? rawClaim : null;
        const isLoadingClaim = rawClaim === 'loading';
        const claimNotFound = rawClaim === 'not-found';

        return (
          <DistributionCard
            key={distribution.id}
            distribution={distribution}
            paymentManagerAddress={paymentManagerAddress}
            refetch={refetch}
            onClaim={handleClaim}
            claimData={claimData}
            isLoadingClaim={isLoadingClaim}
            claimNotFound={claimNotFound}
          />
        );
      })}
    </SimpleGrid>
  );
};

export default CurrentDistributions;
