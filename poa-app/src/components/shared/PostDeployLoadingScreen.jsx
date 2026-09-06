import { useState, useEffect } from 'react';
import { Button, Text, VStack } from '@chakra-ui/react';
import CommunityLoadingState from '@/components/shared/CommunityLoadingState';

const TIMEOUT_SECONDS = 60;

export default function PostDeployLoadingScreen({ orgName }) {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setTimedOut(true), TIMEOUT_SECONDS * 1000);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <CommunityLoadingState
      fullScreen
      label={timedOut ? 'Taking a little longer than expected' : `Preparing ${orgName || 'your organization'}…`}
      description={timedOut
        ? 'Your organization was deployed successfully. The network needs a little more time before it appears here.'
        : 'Your organization is live. We’re waiting for the network to finish indexing so you can begin.'}
    >
      {timedOut && (
        <VStack spacing={3}>
          <Button
            size="md"
            bg="amethyst.500"
            color="white"
            _hover={{ bg: 'amethyst.600' }}
            onClick={() => window.location.reload()}
          >
            Refresh Page
          </Button>
          <Text fontSize="xs" color="warmGray.600">
            This usually resolves within a couple of minutes
          </Text>
        </VStack>
      )}
    </CommunityLoadingState>
  );
}
