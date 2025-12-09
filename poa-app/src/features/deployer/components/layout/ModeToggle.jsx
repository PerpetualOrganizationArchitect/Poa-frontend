/**
 * ModeToggle - Switch between Simple and Advanced modes
 * Uses gear icon and coral color scheme
 */

import React from 'react';
import {
  HStack,
  Text,
  Switch,
  Icon,
} from '@chakra-ui/react';
import { PiGear } from 'react-icons/pi';
import { useDeployer, UI_MODES } from '../../context/DeployerContext';

export function ModeToggle() {
  const { state, actions } = useDeployer();
  const isAdvanced = state.ui.mode === UI_MODES.ADVANCED;

  const handleToggle = () => {
    const newMode = isAdvanced ? UI_MODES.SIMPLE : UI_MODES.ADVANCED;
    actions.setUIMode(newMode);
  };

  const handleSwitchChange = (e) => {
    // Prevent double-firing with parent onClick
    e.stopPropagation();
    handleToggle();
  };

  return (
    <HStack
      spacing={2}
      cursor="pointer"
      onClick={handleToggle}
      role="button"
      tabIndex={0}
      _hover={{ opacity: 0.8 }}
    >
      <Icon
        as={PiGear}
        boxSize={4}
        color={isAdvanced ? 'coral.500' : 'warmGray.400'}
      />
      <Text
        fontSize="sm"
        color={isAdvanced ? 'coral.600' : 'warmGray.500'}
        fontWeight="500"
        userSelect="none"
      >
        Advanced mode
      </Text>
      <Switch
        size="sm"
        isChecked={isAdvanced}
        onChange={handleSwitchChange}
        colorScheme="coral"
      />
    </HStack>
  );
}

export default ModeToggle;
