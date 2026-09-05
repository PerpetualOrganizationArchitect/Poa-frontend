import React, { useState, useEffect, useRef } from 'react';
import { keyframes } from '@emotion/react';
import {
  Box,
  VStack,
  Heading,
  Text,
  Icon,
  Button,
} from '@chakra-ui/react';
import { PiSparkle } from 'react-icons/pi';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

const pulseGlow = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.3); }
  50% { box-shadow: 0 0 0 15px rgba(139, 92, 246, 0); }
`;

const subtlePulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
`;

const LOADING_MESSAGES = [
  "Indexing your organization on the blockchain...",
  "Setting up your governance structure...",
  "Preparing your task board...",
  "Configuring your voting system...",
  "Almost ready...",
];

const TIMEOUT_SECONDS = 60;

export default function PostDeployLoadingScreen({ orgName }) {
  const [msgIndex, setMsgIndex] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const elapsedRef = useRef(0);

  useEffect(() => {
    const msgInterval = setInterval(() => {
      setMsgIndex((prev) =>
        prev < LOADING_MESSAGES.length - 1 ? prev + 1 : prev
      );
    }, 3000);

    const elapsedInterval = setInterval(() => {
      elapsedRef.current += 1;
      if (elapsedRef.current >= TIMEOUT_SECONDS) {
        setTimedOut(true);
        clearInterval(elapsedInterval);
      }
    }, 1000);

    return () => {
      clearInterval(msgInterval);
      clearInterval(elapsedInterval);
    };
  }, []);

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <Box
      minH="100vh"
      display="flex"
      alignItems="center"
      justifyContent="center"
      bg="black"
      p={4}
    >
      <Box
        bg="rgba(255, 255, 255, 0.95)"
        borderRadius="2xl"
        p={{ base: 6, md: 8 }}
        maxW="480px"
        w="90%"
        textAlign="center"
        animation={`${fadeIn} 0.4s ease`}
        boxShadow="0 25px 50px -12px rgba(0, 0, 0, 0.25)"
      >
        <Box
          w={{ base: "80px", md: "100px" }}
          h={{ base: "80px", md: "100px" }}
          mx="auto"
          mb={5}
          borderRadius="full"
          bg="amethyst.50"
          display="flex"
          alignItems="center"
          justifyContent="center"
          animation={`${pulseGlow} 2s ease-in-out infinite`}
        >
          <Icon as={PiSparkle} boxSize={{ base: 10, md: 12 }} color="amethyst.500" />
        </Box>

        <Heading size={{ base: "md", md: "lg" }} mb={2} color="warmGray.800">
          {timedOut ? 'Taking longer than expected' : `Preparing ${orgName || 'your organization'}...`}
        </Heading>

        <Text color="warmGray.600" mb={5} fontSize={{ base: "sm", md: "md" }}>
          {timedOut
            ? 'Your organization was deployed successfully. The indexer may need more time to process it.'
            : 'Your organization is live — we\'re just waiting for the network to finish indexing'}
        </Text>

        {!timedOut && (
          <>
            <Box h="4px" bg="warmGray.100" borderRadius="full" overflow="hidden" mb={4}>
              <Box
                h="100%"
                bg="amethyst.500"
                borderRadius="full"
                animation={`${subtlePulse} 1.5s ease-in-out infinite`}
                w={`${Math.min(20 + (msgIndex * 20), 90)}%`}
                transition="width 0.5s ease"
              />
            </Box>

            <Text
              fontSize="sm"
              color="warmGray.500"
              key={msgIndex}
              animation={`${fadeIn} 0.3s ease`}
            >
              {LOADING_MESSAGES[msgIndex]}
            </Text>
          </>
        )}

        {timedOut && (
          <VStack spacing={3} mt={2}>
            <Button
              size="md"
              bg="amethyst.500"
              color="white"
              _hover={{ bg: 'amethyst.600' }}
              onClick={handleRefresh}
            >
              Refresh Page
            </Button>
            <Text fontSize="xs" color="warmGray.400">
              This usually resolves within a couple of minutes
            </Text>
          </VStack>
        )}
      </Box>
    </Box>
  );
}
