import React from 'react';
import {
  SimpleGrid,
  Box,
  HStack,
  VStack,
  Text,
  Icon,
} from '@chakra-ui/react';
import {
  FiHelpCircle,
  FiDollarSign,
  FiUserCheck,
  FiPlusCircle,
  FiSettings,
} from 'react-icons/fi';

/**
 * Intent-first entry for Create-a-Vote. Replaces the 5-option <Select> with a
 * card gallery, reusing the visual pattern of SetterActionSelector's category
 * cards (glass card, icon + title + one-line description, purple selection
 * accent). Picking a card sets proposal.type via the modal's type-change path.
 *
 * `binding` marks the choices that route through the org's official
 * Blended-voting governance (election / createRole / setter) — the modal shows
 * a one-line banner for those.
 */
export const INTENT_OPTIONS = [
  {
    type: 'normal',
    icon: FiHelpCircle,
    title: 'Ask the group a question',
    description: 'A simple poll with the options you write.',
    binding: false,
  },
  {
    type: 'transferFunds',
    icon: FiDollarSign,
    title: 'Send money from the treasury',
    description: 'Propose a payout — passes as a Yes/No vote.',
    binding: false,
  },
  {
    type: 'election',
    icon: FiUserCheck,
    title: 'Elect someone to a role',
    description: 'Candidates run; the winner receives the role.',
    binding: true,
  },
  {
    type: 'createRole',
    icon: FiPlusCircle,
    title: 'Create a new role',
    description: 'Add a role and set what it can do.',
    binding: true,
  },
  {
    type: 'setter',
    icon: FiSettings,
    title: "Change the group's rules",
    description: 'Update thresholds, permissions, and settings.',
    binding: true,
  },
];

const IntentCard = ({ option, onSelect }) => {
  const IconComponent = option.icon;
  return (
    <Box
      as="button"
      type="button"
      textAlign="left"
      p={4}
      borderRadius="md"
      cursor="pointer"
      bg="whiteAlpha.50"
      border="1px solid"
      borderColor="rgba(148, 115, 220, 0.2)"
      onClick={() => onSelect(option.type)}
      _hover={{
        borderColor: 'purple.400',
        bg: 'whiteAlpha.100',
      }}
      _focusVisible={{
        outline: '2px solid',
        outlineColor: 'purple.400',
        outlineOffset: '2px',
      }}
      transition="background 0.2s, border-color 0.2s"
    >
      <HStack spacing={3} align="flex-start">
        <Icon as={IconComponent} boxSize={5} color="purple.300" mt={0.5} flexShrink={0} />
        <VStack align="start" spacing={0.5}>
          <Text fontSize="sm" fontWeight="bold" color="white">
            {option.title}
          </Text>
          <Text fontSize="xs" color="gray.400">
            {option.description}
          </Text>
        </VStack>
      </HStack>
    </Box>
  );
};

const IntentGallery = ({ onSelect }) => {
  return (
    <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3}>
      {INTENT_OPTIONS.map((option) => (
        <IntentCard key={option.type} option={option} onSelect={onSelect} />
      ))}
    </SimpleGrid>
  );
};

export default IntentGallery;
