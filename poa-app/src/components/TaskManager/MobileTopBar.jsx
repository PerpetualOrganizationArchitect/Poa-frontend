// Sticky 44px header for the mobile Task Manager: tap-target on the
// left opens the project drawer; ViewSwitcher sits inline on the right.

import { Box, Flex, HStack, Text, Icon } from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';
import { FiLayers, FiBriefcase } from 'react-icons/fi';
import ViewSwitcher from './ViewSwitcher';
import { mobileNavGlassStyle } from './styles/taskBoardStyles';

const MobileTopBar = ({ variant, projectName, onOpen, allowBoard }) => {
  const isAllTasks = variant === 'allTasks';
  const isMyWork = variant === 'myWork';
  const isSystemView = isAllTasks || isMyWork;

  return (
    <Box
      sx={mobileNavGlassStyle}
      mx={2}
      mt={1}
      mb={2}
      position="sticky"
      top={0}
      zIndex={5}
    >
      <Flex
        align="center"
        justify="space-between"
        gap={2}
        px={2}
        py={1.5}
        h="44px"
        w="100%"
      >
        {/* Left: context tap-target — opens the project switcher drawer */}
        <Flex
          as="button"
          type="button"
          onClick={onOpen}
          align="center"
          gap={2}
          flex="1"
          minW={0}
          h="100%"
          px={2}
          borderRadius="md"
          _hover={{ bg: 'whiteAlpha.100' }}
          _active={{ bg: 'whiteAlpha.200' }}
          aria-label={
            isMyWork
              ? 'Switch from My Work'
              : isAllTasks
              ? 'Switch from All Tasks'
              : `Switch project (${projectName || 'no project'})`
          }
        >
          {isSystemView ? (
            <HStack
              spacing={1.5}
              px={2}
              py={0.5}
              borderRadius="full"
              bgGradient="linear(135deg, rgba(159,122,234,0.35) 0%, rgba(66,153,225,0.25) 100%)"
              border="1px solid rgba(159,122,234,0.45)"
            >
              <Icon as={isMyWork ? FiBriefcase : FiLayers} color="whiteAlpha.900" boxSize="12px" />
              <Text
                fontSize="sm"
                fontWeight="700"
                color="white"
                lineHeight="1"
              >
                {isMyWork ? 'My Work' : 'All Tasks'}
              </Text>
            </HStack>
          ) : (
            <Text
              fontSize="sm"
              fontWeight="600"
              color="white"
              noOfLines={1}
              flex="1"
              textAlign="left"
            >
              {projectName || 'Select a project'}
            </Text>
          )}
          <ChevronDownIcon color="whiteAlpha.800" boxSize="16px" flexShrink={0} />
        </Flex>

        {/* Right: view switcher (Board / List on mobile; Gantt is hidden).
            My Work is List-only, so it has no switcher. */}
        {!isMyWork && (
          <Box flexShrink={0}>
            <ViewSwitcher isMobile size="sm" allowBoard={allowBoard} />
          </Box>
        )}
      </Flex>
    </Box>
  );
};

export default MobileTopBar;
