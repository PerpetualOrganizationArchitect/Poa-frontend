import React from 'react';
import {
  Box,
  HStack,
  VStack,
  Heading,
  SimpleGrid,
  Skeleton,
  Text,
} from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';
import { glassLayerStyle } from '@/components/shared/glassStyles';
import { useVotingPower } from '@/hooks/useVotingPower';
import { useTreasuryShare } from '@/hooks/useTreasuryShare';
import { usePOContext } from '@/context/POContext';

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const currencyFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function ContributionStat({ label, value, isLoading }) {
  const available = value !== null && value !== undefined && Number.isFinite(Number(value));
  return (
    <Box>
      <Skeleton isLoaded={!isLoading} w="fit-content" minW="36px" mb={1}>
        <Text fontSize="3xl" fontWeight="semibold" letterSpacing="-0.04em" lineHeight="1.2" color="white">
          {available ? numberFormat.format(Number(value)) : '—'}
        </Text>
      </Skeleton>
      <Text fontSize="sm" color="gray.400">{label}</Text>
    </Box>
  );
}

/** Balances are already converted to display units by UserContext. */
export function TokenActivityCard({
  ptBalance,
  tasksCompleted,
  totalVotes,
  isLoading = false,
  children,
}) {
  const {
    isHybrid,
    isLoading: votingLoading,
    totalSharePct,
    classBreakdown,
    breakdownStatus,
    status: votingStatus,
  } = useVotingPower();
  const { treasuryShare, isLoading: treasuryLoading, isHidden: treasuryHidden } = useTreasuryShare();
  const { tokenLabel, paymentManagerAddress, orgChainId } = usePOContext();

  const balanceAvailable = ptBalance !== null && ptBalance !== undefined && Number.isFinite(Number(ptBalance));
  const votingAvailable = breakdownStatus === 'ready' && votingStatus === 'ready'
    && (!isHybrid || (totalSharePct !== null && Number.isFinite(totalSharePct)));
  const votingApproximate = classBreakdown?.some((entry) => entry.approximate);
  const treasuryConfigured = !!paymentManagerAddress && !!orgChainId;
  const treasuryAvailable = treasuryShare !== null && Number.isFinite(treasuryShare);

  return (
    <Box
      as="section"
      aria-labelledby="profile-contribution-heading"
      w="100%"
      h="100%"
      borderRadius="2xl"
      bg="transparent"
      boxShadow="lg"
      position="relative"
      zIndex={2}
      borderWidth="1px"
      borderColor="whiteAlpha.200"
    >
      <div style={glassLayerStyle} />
      <VStack align="stretch" spacing={5} p={{ base: 5, md: 6 }}>
        <Box>
          <Heading as="h2" id="profile-contribution-heading" fontSize="lg" fontWeight="semibold" color="white" letterSpacing="-0.02em">
            Your contribution
          </Heading>
        </Box>

        <SimpleGrid columns={2} spacing={5}>
          <ContributionStat label="Tasks done" value={tasksCompleted} isLoading={isLoading} />
          <ContributionStat label="Votes cast" value={totalVotes} isLoading={isLoading} />
        </SimpleGrid>

        <Box borderTopWidth="1px" borderColor="whiteAlpha.200" pt={5}>
          <Text fontSize="xs" color="gray.400" mb={2}>Contribution balance</Text>
          <HStack align="baseline" spacing={2} flexWrap="wrap">
            <Skeleton isLoaded={!isLoading} minW="40px">
              <Text fontSize="2xl" fontWeight="semibold" color="white" letterSpacing="-0.03em" lineHeight="short">
                {balanceAvailable ? numberFormat.format(Number(ptBalance)) : 'Unavailable'}
              </Text>
            </Skeleton>
            <Text fontSize="sm" color="gray.300">{tokenLabel || 'Shares'}</Text>
          </HStack>
          <Text fontSize="xs" color="gray.400" mt={2} lineHeight="tall">
            Your recorded contribution to this organization.
          </Text>
        </Box>

        {children}

        <Box
          as="details"
          borderTopWidth="1px"
          borderColor="whiteAlpha.200"
          pt={1}
          sx={{ '&[open] .participation-chevron': { transform: 'rotate(180deg)' } }}
        >
          <Box
            as="summary"
            cursor="pointer"
            listStyleType="none"
            color="gray.300"
            fontSize="sm"
            borderRadius="md"
            _hover={{ color: 'white' }}
            _focusVisible={{ outline: '2px solid', outlineColor: 'amethyst.300', outlineOffset: '4px' }}
            sx={{ '&::-webkit-details-marker': { display: 'none' } }}
          >
            <HStack as="span" justify="space-between" minH={10}>
              <Text as="span">Participation details</Text>
              <ChevronDownIcon className="participation-chevron" aria-hidden="true" boxSize={4} />
            </HStack>
          </Box>
          <VStack align="stretch" spacing={5} pt={5}>
            <Box>
              <HStack justify="space-between" align="baseline" spacing={3}>
                <Text fontSize="sm" color="gray.300">Your voice in decisions</Text>
                <Text fontSize="sm" color="white" fontWeight="medium" textAlign="right">
                  {votingLoading
                    ? 'Loading…'
                    : !votingAvailable
                      ? votingStatus === 'not_member' ? 'Membership needed' : 'Unavailable'
                      : isHybrid
                        ? `${votingApproximate ? '≈ ' : ''}${numberFormat.format(totalSharePct)}%`
                        : 'Equal vote'}
                </Text>
              </HStack>
              <Text fontSize="xs" color="gray.400" lineHeight="tall" mt={2}>
                {isHybrid
                  ? 'An estimate based on current participation and the organization’s voting rules. Your influence can differ by decision.'
                  : 'Each eligible member has an equal vote.'}
              </Text>
            </Box>
            {!treasuryHidden && (
              <Box>
                <HStack justify="space-between" align="baseline" spacing={3}>
                  <Text fontSize="sm" color="gray.300">Treasury estimate</Text>
                  <Text fontSize="sm" color="white" fontWeight="medium" textAlign="right">
                    {!treasuryConfigured
                      ? 'Unavailable'
                      : treasuryLoading
                        ? 'Loading…'
                        : treasuryAvailable
                          ? `≈ ${currencyFormat.format(treasuryShare)}`
                          : 'Unavailable'}
                  </Text>
                </HStack>
                <Text fontSize="xs" color="gray.400" lineHeight="tall" mt={2}>
                  Your proportional share of the treasury’s dollar-pegged funds. An estimate, not money available to spend or withdraw.
                </Text>
              </Box>
            )}
          </VStack>
        </Box>
      </VStack>
    </Box>
  );
}

export default TokenActivityCard;
