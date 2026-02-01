/**
 * TokenRequestCard - Dedicated card for token request functionality
 * Contains Request Tokens button and collapsible request history
 */

import React, { useState } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Collapse,
  useDisclosure,
} from '@chakra-ui/react';
import { AddIcon, ChevronDownIcon, ChevronUpIcon } from '@chakra-ui/icons';
import { glassLayerStyle } from '@/components/shared/glassStyles';
import { TokenRequestModal, UserRequestHistory } from '@/components/tokenRequest';

/**
 * TokenRequestCard component
 * @param {Object} props
 * @param {boolean} props.hasMemberRole - Whether user can request tokens
 */
export function TokenRequestCard({ hasMemberRole }) {
  const [showHistory, setShowHistory] = useState(false);
  const { isOpen: isModalOpen, onOpen: openModal, onClose: closeModal } = useDisclosure();

  // Don't render if user doesn't have member role
  if (!hasMemberRole) {
    return null;
  }

  return (
    <>
      <Box
        w="100%"
        h="100%"
        borderRadius="2xl"
        bg="transparent"
        boxShadow="lg"
        position="relative"
        zIndex={2}
      >
        <div style={glassLayerStyle} />

        {/* Darker header section */}
        <VStack pb={2} align="flex-start" position="relative" borderTopRadius="2xl">
          <div style={glassLayerStyle} />
          <Text pl={6} pt={2} fontWeight="bold" fontSize={{ base: 'xl', md: '2xl' }} color="white">
            Token Requests
          </Text>
        </VStack>

        {/* Content */}
        <VStack spacing={4} align="stretch" p={4} pt={2}>
          {/* Request Tokens Button */}
          <Button
            leftIcon={<AddIcon />}
            colorScheme="purple"
            size="md"
            onClick={openModal}
            w="100%"
          >
            Request Tokens
          </Button>

          {/* Collapsible History Section */}
          <Box>
            <HStack
              cursor="pointer"
              onClick={() => setShowHistory(!showHistory)}
              justify="space-between"
              py={2}
              _hover={{ color: 'purple.300' }}
              transition="color 0.2s"
            >
              <Text fontSize="sm" fontWeight="medium" color="gray.300">
                My Request History
              </Text>
              {showHistory ? (
                <ChevronUpIcon boxSize={5} color="gray.400" />
              ) : (
                <ChevronDownIcon boxSize={5} color="gray.400" />
              )}
            </HStack>
            <Collapse in={showHistory}>
              <Box pt={2}>
                <UserRequestHistory />
              </Box>
            </Collapse>
          </Box>
        </VStack>
      </Box>

      {/* Modal */}
      <TokenRequestModal isOpen={isModalOpen} onClose={closeModal} />
    </>
  );
}

export default TokenRequestCard;
