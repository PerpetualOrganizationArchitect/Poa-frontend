import React from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  Box,
  HStack,
  VStack,
  Text,
  Grid,
  GridItem,
  Icon,
  Avatar,
  Badge,
  useClipboard,
  Tooltip,
} from '@chakra-ui/react';
import {
  FiCheckSquare,
  FiThumbsUp,
  FiAward,
  FiCopy,
  FiCheck,
} from 'react-icons/fi';
import { PiCoinVerticalBold } from 'react-icons/pi';
import { glassLayerStyle } from '@/components/shared/glassStyles';

const getMedalColor = (rank) => {
  switch (rank) {
    case 1:
      return 'gold';
    case 2:
      return 'silver';
    case 3:
      return '#cd7f32';
    default:
      return null;
  }
};

const getRankLabel = (rank) => {
  switch (rank) {
    case 1:
      return '1st Place';
    case 2:
      return '2nd Place';
    case 3:
      return '3rd Place';
    default:
      return `Rank #${rank}`;
  }
};

function truncateAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function StatBox({ icon, label, value, color = 'purple.300' }) {
  return (
    <Box
      p={4}
      borderRadius="lg"
      bg="rgba(40, 40, 50, 0.5)"
      border="1px solid rgba(148, 115, 220, 0.15)"
    >
      <VStack spacing={1} align="center">
        <Icon as={icon} color={color} boxSize={5} />
        <Text fontSize="2xl" fontWeight="bold" color="white">
          {value}
        </Text>
        <Text fontSize="xs" color="gray.400" textTransform="uppercase">
          {label}
        </Text>
      </VStack>
    </Box>
  );
}

function LeaderboardUserModal({ isOpen, onClose, user, rank, roleNames = {} }) {
  const { hasCopied, onCopy } = useClipboard(user?.address || '');

  if (!user) return null;

  const medalColor = getMedalColor(rank);
  const userRoles = (user.hatIds || [])
    .map((hatId) => roleNames[hatId])
    .filter(Boolean);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" isCentered>
      <ModalOverlay bg="blackAlpha.700" backdropFilter="blur(8px)" />
      <ModalContent
        bg="transparent"
        borderRadius="2xl"
        mx={4}
        overflow="hidden"
        position="relative"
      >
        <Box
          style={{
            ...glassLayerStyle,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
          }}
        />

        <ModalCloseButton color="white" zIndex={1} />

        <ModalHeader pt={8} pb={4}>
          <VStack spacing={4} align="center">
            {/* Rank badge */}
            <Badge
              px={4}
              py={1}
              borderRadius="full"
              bg={medalColor ? `${medalColor}20` : 'rgba(148, 115, 220, 0.2)'}
              color={medalColor || 'purple.300'}
              border={`1px solid ${medalColor || 'rgba(148, 115, 220, 0.5)'}`}
              fontSize="sm"
              fontWeight="bold"
            >
              {getRankLabel(rank)}
            </Badge>

            {/* Avatar */}
            <Avatar
              size="xl"
              name={user.name}
              bg="purple.500"
              border={`3px solid ${medalColor || 'purple.400'}`}
            />

            {/* Username */}
            <Text fontSize="2xl" fontWeight="bold" color="white">
              {user.name}
            </Text>

            {/* Address with copy */}
            <Tooltip label={hasCopied ? 'Copied!' : 'Click to copy'} placement="top">
              <HStack
                spacing={2}
                cursor="pointer"
                onClick={onCopy}
                _hover={{ color: 'purple.300' }}
                transition="color 0.2s"
              >
                <Text fontSize="sm" color="gray.400">
                  {truncateAddress(user.address)}
                </Text>
                <Icon
                  as={hasCopied ? FiCheck : FiCopy}
                  color={hasCopied ? 'green.400' : 'gray.400'}
                  boxSize={4}
                />
              </HStack>
            </Tooltip>
          </VStack>
        </ModalHeader>

        <ModalBody pb={8}>
          <VStack spacing={6}>
            {/* Stats grid */}
            <Grid templateColumns="repeat(2, 1fr)" gap={4} w="100%">
              <GridItem>
                <StatBox
                  icon={PiCoinVerticalBold}
                  label="Tokens"
                  value={user.token}
                  color="yellow.400"
                />
              </GridItem>
              <GridItem>
                <StatBox
                  icon={FiAward}
                  label="Rank"
                  value={`#${rank}`}
                  color={medalColor || 'purple.300'}
                />
              </GridItem>
              <GridItem>
                <StatBox
                  icon={FiCheckSquare}
                  label="Tasks Completed"
                  value={user.totalTasksCompleted}
                  color="green.300"
                />
              </GridItem>
              <GridItem>
                <StatBox
                  icon={FiThumbsUp}
                  label="Votes Cast"
                  value={user.totalVotes}
                  color="blue.300"
                />
              </GridItem>
            </Grid>

            {/* Role badges */}
            {userRoles.length > 0 && (
              <VStack spacing={2} align="center" w="100%">
                <Text fontSize="xs" color="gray.500" textTransform="uppercase">
                  Roles
                </Text>
                <HStack flexWrap="wrap" justify="center" spacing={2}>
                  {userRoles.map((roleName, idx) => (
                    <Badge
                      key={idx}
                      colorScheme="purple"
                      borderRadius="full"
                      px={3}
                      py={1}
                    >
                      {roleName}
                    </Badge>
                  ))}
                </HStack>
              </VStack>
            )}
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

export default LeaderboardUserModal;
