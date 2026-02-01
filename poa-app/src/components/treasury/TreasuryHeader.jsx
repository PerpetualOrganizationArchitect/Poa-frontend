import React from 'react';
import {
  Box,
  Flex,
  Text,
  HStack,
  VStack,
  Button,
  Badge,
  useBreakpointValue,
  Tooltip,
  Icon,
} from '@chakra-ui/react';
import { FiUsers, FiDollarSign, FiTrendingUp, FiPlus } from 'react-icons/fi';
import { formatTokenAmount } from '@/util/formatToken';

const StatCard = ({ icon, label, value, tooltip }) => (
  <Tooltip label={tooltip} placement="top" hasArrow>
    <VStack
      spacing={1}
      p={3}
      bg="rgba(0, 0, 0, 0.3)"
      borderRadius="xl"
      minW={{ base: '100px', md: '140px' }}
      align="center"
    >
      <Icon as={icon} boxSize={5} color="purple.300" />
      <Text fontSize={{ base: 'lg', md: '2xl' }} fontWeight="bold" color="white">
        {value}
      </Text>
      <Text fontSize="xs" color="gray.400" textAlign="center">
        {label}
      </Text>
    </VStack>
  </Tooltip>
);

const TreasuryHeader = ({
  memberCount = 0,
  totalDistributed = '0',
  distributionCount = 0,
  isAdmin = false,
  onCreateDistribution,
  refetch,
}) => {
  const isMobile = useBreakpointValue({ base: true, md: false });
  const formattedTotal = formatTokenAmount(totalDistributed);

  return (
    <Box p={{ base: 4, md: 6 }}>
      <Flex
        direction={{ base: 'column', md: 'row' }}
        justify="space-between"
        align={{ base: 'flex-start', md: 'center' }}
        gap={4}
      >
        <VStack align="flex-start" spacing={1}>
          <HStack spacing={2}>
            <Text fontSize={{ base: '2xl', md: '3xl' }} fontWeight="bold">
              Our Shared Treasury
            </Text>
            <Badge colorScheme="purple" fontSize="sm">
              Community
            </Badge>
          </HStack>
          <Text fontSize="sm" color="gray.400">
            Transparent finances for all members. Major spending requires a vote.
          </Text>
        </VStack>

        {isAdmin && (
          <Button
            leftIcon={<FiPlus />}
            colorScheme="purple"
            size={{ base: 'sm', md: 'md' }}
            onClick={onCreateDistribution}
          >
            Create Distribution
          </Button>
        )}
      </Flex>

      <Flex
        mt={6}
        gap={4}
        wrap="wrap"
        justify={{ base: 'center', md: 'flex-start' }}
      >
        <StatCard
          icon={FiUsers}
          label="Members Sharing"
          value={memberCount}
          tooltip="Active members who share in profits"
        />
        <StatCard
          icon={FiDollarSign}
          label="Total Distributed"
          value={formattedTotal !== '0' ? `${formattedTotal}` : '0'}
          tooltip="Total tokens distributed to members"
        />
        <StatCard
          icon={FiTrendingUp}
          label="Distributions"
          value={distributionCount}
          tooltip="Number of profit-sharing rounds"
        />
      </Flex>
    </Box>
  );
};

export default TreasuryHeader;
