/**
 * StepHeader - Displays step title, description, and progress indicator
 */

import React from 'react';
import {
  Box,
  Text,
  Progress,
  HStack,
  useBreakpointValue,
} from '@chakra-ui/react';
import { useDeployer } from '../../context/DeployerContext';

export function StepHeader({ title, description, customProgress }) {
  const { state, STEP_NAMES } = useDeployer();

  const formPadding = useBreakpointValue({ base: 3, lg: 4, xl: 6 });
  const headerFontSize = useBreakpointValue({ base: 'lg', lg: 'xl', xl: '2xl' });
  const progressSize = useBreakpointValue({ base: 'sm', lg: 'md', xl: 'lg' });

  const totalSteps = STEP_NAMES.length;
  const currentStepNum = state.currentStep + 1;
  const progress = customProgress !== undefined
    ? customProgress
    : (currentStepNum / totalSteps) * 100;

  const stepTitle = title || STEP_NAMES[state.currentStep];

  return (
    <Box
      mt={{ base: '8', lg: '10', xl: '12' }}
      mb={4}
      p={formPadding}
      bg="white"
      border="1px solid"
      borderColor="gray.200"
      borderRadius="md"
      boxShadow="md"
    >
      <Text
        fontSize={headerFontSize}
        fontWeight="bold"
        mb={2}
        color="gray.700"
      >
        {stepTitle}
      </Text>
      {description && (
        <Text
          fontSize={{ base: 'sm', lg: 'md', xl: 'lg' }}
          color="gray.500"
          mb={4}
        >
          {description}
        </Text>
      )}
      <HStack justify="space-between">
        <Progress
          value={progress}
          size={progressSize}
          borderRadius="lg"
          colorScheme="blue"
          flex="1"
        />
        <Text
          fontSize="xs"
          color="gray.500"
          whiteSpace="nowrap"
          ml={2}
        >
          Step {currentStepNum} of {totalSteps}
        </Text>
      </HStack>
    </Box>
  );
}

export default StepHeader;
