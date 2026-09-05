import React from 'react';
import {
  SimpleGrid,
  Box,
  HStack,
  VStack,
  Text,
  Icon,
  Tooltip,
} from '@chakra-ui/react';
import {
  FiHelpCircle,
  FiDollarSign,
  FiUserCheck,
  FiPlusCircle,
  FiSettings,
} from 'react-icons/fi';
import { BINDING_TYPES } from './wizardSteps';

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
    description: 'Pay someone or fund task rewards — passing the vote moves the money.',
    // A payout RUNS on-chain when it passes, so it is binding: it submits to
    // Blended voting (the only contract that can execute) and is gated on the
    // binding-creator permission. See wizardSteps.BINDING_TYPES.
    binding: true,
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
    // ACCESS V2 only: the same intent also creates a GROUP (a bundle of permissions roles go
    // into), because on an authority org that is one screen and one proposal. The legacy copy is
    // untouched — a legacy org has no groups to make.
    v2Title: 'Create a role or group',
    v2Description: 'Add a role or group and set what it can do.',
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

// The badge and the routing must never disagree: a card marked non-binding
// that submits a batch would be gated on the wrong creator permission and sent
// to a contract that cannot execute it.
for (const option of INTENT_OPTIONS) {
  if (option.binding !== BINDING_TYPES.has(option.type)) {
    throw new Error(`IntentGallery: "${option.type}" binding flag disagrees with wizardSteps.BINDING_TYPES`);
  }
}

const IntentCard = ({ option, onSelect, isDisabled = false, accessV2 = false }) => {
  const IconComponent = option.icon;
  // A card can carry ACCESS-V2 copy for the same intent (createRole also makes a group there).
  // Falls back to the legacy words, so a card without v2 copy is byte-identical on both orgs.
  const title = (accessV2 && option.v2Title) || option.title;
  const description = (accessV2 && option.v2Description) || option.description;
  const card = (
    <Box
      as="button"
      type="button"
      textAlign="left"
      p={4}
      borderRadius="md"
      cursor={isDisabled ? 'not-allowed' : 'pointer'}
      bg="whiteAlpha.50"
      border="1px solid"
      borderColor="rgba(148, 115, 220, 0.2)"
      opacity={isDisabled ? 0.45 : 1}
      // aria-disabled (not the native attr): native disabled buttons swallow
      // pointer/focus events, which would mute the explanatory Tooltip and
      // make the reason unreachable by keyboard. The onClick guard enforces.
      aria-disabled={isDisabled}
      onClick={() => { if (!isDisabled) onSelect(option.type); }}
      _hover={isDisabled ? {} : {
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
            {title}
          </Text>
          <Text fontSize="xs" color="gray.400">
            {description}
          </Text>
        </VStack>
      </HStack>
    </Box>
  );
  if (!isDisabled) return card;
  return (
    <Tooltip
      hasArrow
      label="Your roles can't start this kind of vote. Ask an admin to grant you a vote-creator role."
    >
      {card}
    </Tooltip>
  );
};

/**
 * `canCreatePoll` / `canCreateProposal` gate the cards by which contract each
 * intent submits to: binding intents go through Blended (Hybrid) governance,
 * the rest through the poll (DirectDemocracy) contract. The creator sets can
 * differ per contract, so a poll-only creator sees binding cards disabled
 * instead of walking the wizard into an Unauthorized revert.
 */
const IntentGallery = ({ onSelect, canCreatePoll = true, canCreateProposal = true, accessV2 = false }) => {
  return (
    <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3}>
      {INTENT_OPTIONS.map((option) => (
        <IntentCard
          key={option.type}
          option={option}
          onSelect={onSelect}
          isDisabled={option.binding ? !canCreateProposal : !canCreatePoll}
          accessV2={accessV2}
        />
      ))}
    </SimpleGrid>
  );
};

export default IntentGallery;
