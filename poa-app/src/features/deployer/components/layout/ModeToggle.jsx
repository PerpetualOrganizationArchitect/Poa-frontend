/**
 * ModeToggle - Switch between Simple and Advanced modes
 */

import React from 'react';
import {
  HStack,
  Button,
  ButtonGroup,
  Text,
  Tooltip,
  useColorModeValue,
} from '@chakra-ui/react';
import { useDeployer, UI_MODES } from '../../context/DeployerContext';

export function ModeToggle({ size = 'sm' }) {
  const { state, actions } = useDeployer();
  const currentMode = state.ui.mode;

  const activeBg = useColorModeValue('blue.500', 'blue.400');
  const activeColor = 'white';
  const inactiveBg = useColorModeValue('gray.100', 'gray.700');
  const inactiveColor = useColorModeValue('gray.600', 'gray.300');

  const handleModeChange = (mode) => {
    actions.setUIMode(mode);
  };

  return (
    <HStack spacing={2}>
      <Text fontSize="xs" color="gray.500">
        Mode:
      </Text>
      <ButtonGroup size={size} isAttached variant="outline">
        <Tooltip label="Simplified interface with guided setup" placement="top">
          <Button
            onClick={() => handleModeChange(UI_MODES.SIMPLE)}
            bg={currentMode === UI_MODES.SIMPLE ? activeBg : inactiveBg}
            color={currentMode === UI_MODES.SIMPLE ? activeColor : inactiveColor}
            borderColor={currentMode === UI_MODES.SIMPLE ? activeBg : 'gray.200'}
            _hover={{
              bg: currentMode === UI_MODES.SIMPLE ? activeBg : 'gray.200',
            }}
          >
            Simple
          </Button>
        </Tooltip>
        <Tooltip label="Full control over all settings" placement="top">
          <Button
            onClick={() => handleModeChange(UI_MODES.ADVANCED)}
            bg={currentMode === UI_MODES.ADVANCED ? activeBg : inactiveBg}
            color={currentMode === UI_MODES.ADVANCED ? activeColor : inactiveColor}
            borderColor={currentMode === UI_MODES.ADVANCED ? activeBg : 'gray.200'}
            _hover={{
              bg: currentMode === UI_MODES.ADVANCED ? activeBg : 'gray.200',
            }}
          >
            Advanced
          </Button>
        </Tooltip>
      </ButtonGroup>
    </HStack>
  );
}

export default ModeToggle;
