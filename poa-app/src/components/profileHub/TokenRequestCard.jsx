/** Contribution requests, with history available when it is needed. */

import React, { useId, useState } from 'react';
import { Box, VStack, Text, Button, Collapse, useDisclosure } from '@chakra-ui/react';
import { AddIcon, ChevronDownIcon, ChevronUpIcon } from '@chakra-ui/icons';
import { glassLayerStyle } from '@/components/shared/glassStyles';
import { TokenRequestModal, UserRequestHistory } from '@/components/tokenRequest';
import { usePOContext } from '@/context/POContext';

export function TokenRequestCard({ hasMemberRole, embedded = false }) {
  const [showHistory, setShowHistory] = useState(false);
  const historyId = useId();
  const { isOpen: isModalOpen, onOpen: openModal, onClose: closeModal } = useDisclosure();
  const { tokenLabel = 'Shares' } = usePOContext() || {};

  if (!hasMemberRole) return null;

  return (
    <>
      <Box
        as={embedded ? 'div' : 'section'}
        aria-label="Contribution requests"
        w="100%"
        borderRadius={embedded ? undefined : '2xl'}
        border={embedded ? undefined : '1px solid'}
        borderColor="whiteAlpha.100"
        position="relative"
        zIndex={embedded ? undefined : 2}
      >
        {!embedded && <div style={glassLayerStyle} />}
        <VStack spacing={embedded ? 3 : 5} align="stretch" p={embedded ? 0 : { base: 5, md: 6 }}>
          {!embedded && <Box>
            <Text as="h2" fontWeight="semibold" fontSize="lg" color="white" letterSpacing="-0.02em">
              Get recognized
            </Text>
            <Text mt={2} color="gray.400" fontSize="sm" lineHeight="tall">
              Request {tokenLabel} for a contribution you’ve made.
            </Text>
          </Box>}

          <Button
            leftIcon={<AddIcon boxSize={3} />}
            colorScheme="purple"
            variant="outline"
            borderColor="purple.400"
            color="purple.100"
            _hover={{ bg: 'whiteAlpha.100', borderColor: 'purple.300' }}
            size="md"
            onClick={openModal}
            w="100%"
            fontSize="sm"
            whiteSpace="normal"
            height="auto"
            minH={11}
            py={3}
          >
            Request {tokenLabel}
          </Button>

          <Box w="100%" borderTop="1px solid" borderColor="whiteAlpha.100" pt={embedded ? 1 : 3}>
            <Button
              variant="unstyled"
              display="flex"
              alignItems="center"
              justifyContent="space-between"
              w="100%"
              h="auto"
              minH={10}
              fontSize="sm"
              fontWeight="normal"
              color="gray.300"
              onClick={() => setShowHistory((current) => !current)}
              aria-expanded={showHistory}
              aria-controls={historyId}
              rightIcon={showHistory ? <ChevronUpIcon boxSize={5} /> : <ChevronDownIcon boxSize={5} />}
              _hover={{ color: 'white' }}
            >
              Request history
            </Button>
            <Collapse in={showHistory} id={historyId}>
              <Box pt={3}>
                <UserRequestHistory />
              </Box>
            </Collapse>
          </Box>
        </VStack>
      </Box>

      <TokenRequestModal isOpen={isModalOpen} onClose={closeModal} />
    </>
  );
}

export default TokenRequestCard;
