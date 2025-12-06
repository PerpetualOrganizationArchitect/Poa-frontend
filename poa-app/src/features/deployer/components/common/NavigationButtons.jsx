/**
 * NavigationButtons - Back/Next buttons for wizard navigation
 */

import React from 'react';
import {
  Flex,
  Button,
  useBreakpointValue,
} from '@chakra-ui/react';
import { useDeployer } from '../../context/DeployerContext';

export function NavigationButtons({
  onNext,
  onBack,
  nextLabel = 'Next',
  backLabel = 'Back',
  nextDisabled = false,
  backDisabled = false,
  showBack = true,
  showNext = true,
  nextColorScheme = 'blue',
  isLoading = false,
}) {
  const { state, actions, STEPS } = useDeployer();
  const buttonSize = useBreakpointValue({ base: 'md', lg: 'lg', xl: 'lg' });

  const isFirstStep = state.currentStep === STEPS.ORGANIZATION;
  const isLastStep = state.currentStep === STEPS.REVIEW;

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      actions.prevStep();
    }
  };

  const handleNext = () => {
    if (onNext) {
      onNext();
    } else {
      actions.nextStep();
    }
  };

  return (
    <Flex
      justifyContent="space-between"
      mt={4}
      direction={{ base: 'column', md: 'row' }}
    >
      {showBack && (
        <Button
          size={buttonSize}
          colorScheme="gray"
          onClick={handleBack}
          isDisabled={backDisabled || isFirstStep}
          mb={{ base: 2, md: 0 }}
        >
          {backLabel}
        </Button>
      )}
      {!showBack && <div />}

      {showNext && (
        <Button
          size={buttonSize}
          colorScheme={nextColorScheme}
          onClick={handleNext}
          isDisabled={nextDisabled}
          isLoading={isLoading}
        >
          {isLastStep ? 'Deploy' : nextLabel}
        </Button>
      )}
    </Flex>
  );
}

export default NavigationButtons;
