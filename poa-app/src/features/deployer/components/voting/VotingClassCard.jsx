/**
 * VotingClassCard - Displays a single voting class with inline weight slider
 *
 * Features proportional redistribution: when one class's weight changes,
 * other classes are adjusted proportionally to maintain 100% total.
 */

import React from 'react';
import {
  Box,
  HStack,
  VStack,
  Text,
  Badge,
  IconButton,
  Tooltip,
  Collapse,
  useDisclosure,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
} from '@chakra-ui/react';
import {
  EditIcon,
  DeleteIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@chakra-ui/icons';
import { useDeployer, VOTING_STRATEGY } from '../../context/DeployerContext';

export function VotingClassCard({
  votingClass,
  index,
  onEdit,
  onDelete,
  onWeightChange,
  totalClasses,
}) {
  const { state } = useDeployer();
  const { isOpen, onToggle } = useDisclosure();

  const isDirectVoting = votingClass.strategy === VOTING_STRATEGY.DIRECT;
  const strategyLabel = isDirectVoting ? 'Direct (Role)' : 'Participation Token';
  const strategyColor = isDirectVoting ? 'blue' : 'purple';

  const handleWeightChange = (newWeight) => {
    // Clamp between 1 and 99 (can't have 0% or 100% when multiple classes)
    const clampedWeight = Math.max(1, Math.min(99, newWeight));
    if (onWeightChange) {
      onWeightChange(index, clampedWeight);
    }
  };

  return (
    <Box
      borderWidth="1px"
      borderRadius="md"
      p={4}
      bg="white"
      boxShadow="sm"
      _hover={{ boxShadow: 'md' }}
      transition="box-shadow 0.2s"
    >
      {/* Header row */}
      <HStack justify="space-between" align="center" mb={3}>
        <HStack spacing={2}>
          <Text fontWeight="semibold" fontSize="md">
            Class {index + 1}
          </Text>
          <Badge colorScheme={strategyColor}>{strategyLabel}</Badge>
          {votingClass.quadratic && (
            <Badge colorScheme="green">Quadratic</Badge>
          )}
        </HStack>

        {/* Actions */}
        <HStack spacing={1}>
          <Tooltip label="Edit class settings">
            <IconButton
              aria-label="Edit voting class"
              icon={<EditIcon />}
              size="sm"
              variant="ghost"
              onClick={() => onEdit(index)}
            />
          </Tooltip>
          <Tooltip label="Delete voting class">
            <IconButton
              aria-label="Delete voting class"
              icon={<DeleteIcon />}
              size="sm"
              variant="ghost"
              colorScheme="red"
              onClick={() => onDelete(index)}
              isDisabled={totalClasses <= 1}
            />
          </Tooltip>
          <IconButton
            aria-label="Toggle details"
            icon={isOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
            size="sm"
            variant="ghost"
            onClick={onToggle}
          />
        </HStack>
      </HStack>

      {/* Weight slider - always visible */}
      <Box>
        <HStack justify="space-between" fontSize="sm" color="gray.600" mb={2}>
          <Text fontWeight="medium">Voting Weight</Text>
        </HStack>
        <HStack spacing={4}>
          <Slider
            value={votingClass.slicePct}
            onChange={handleWeightChange}
            min={1}
            max={totalClasses > 1 ? 99 : 100}
            flex={1}
            focusThumbOnChange={false}
            colorScheme={strategyColor}
          >
            <SliderTrack>
              <SliderFilledTrack />
            </SliderTrack>
            <SliderThumb boxSize={6}>
              <Text fontSize="xs" fontWeight="bold" color={`${strategyColor}.600`}>
                {votingClass.slicePct}
              </Text>
            </SliderThumb>
          </Slider>
          <NumberInput
            value={votingClass.slicePct}
            onChange={(_, val) => {
              if (!isNaN(val)) handleWeightChange(val);
            }}
            min={1}
            max={totalClasses > 1 ? 99 : 100}
            w="80px"
            size="sm"
          >
            <NumberInputField />
            <NumberInputStepper>
              <NumberIncrementStepper />
              <NumberDecrementStepper />
            </NumberInputStepper>
          </NumberInput>
          <Text fontSize="sm" fontWeight="bold" w="30px">%</Text>
        </HStack>
      </Box>

      {/* Expanded details */}
      <Collapse in={isOpen}>
        <Box mt={4} pt={3} borderTopWidth="1px" borderColor="gray.100">
          <VStack align="start" spacing={2} fontSize="sm" color="gray.600">
            <HStack>
              <Text fontWeight="medium">Strategy:</Text>
              <Text>{strategyLabel}</Text>
            </HStack>

            <HStack>
              <Text fontWeight="medium">Quadratic:</Text>
              <Text>{votingClass.quadratic ? 'Yes' : 'No'}</Text>
            </HStack>

            {!isDirectVoting && (
              <HStack>
                <Text fontWeight="medium">Min Balance:</Text>
                <Text>
                  {votingClass.minBalance > 0
                    ? `${votingClass.minBalance} participation tokens`
                    : 'No minimum'}
                </Text>
              </HStack>
            )}

            {isDirectVoting && votingClass.hatIds?.length > 0 && (
              <HStack>
                <Text fontWeight="medium">Eligible Roles:</Text>
                <Text>
                  {votingClass.hatIds
                    .map((idx) => state.roles[idx]?.name || `Role ${idx}`)
                    .join(', ')}
                </Text>
              </HStack>
            )}
          </VStack>
        </Box>
      </Collapse>
    </Box>
  );
}

export default VotingClassCard;
