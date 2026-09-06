import { Alert, AlertIcon, Box, Button, Center, Text, VStack } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { usePOContext } from '@/context/POContext';
import { useOrgAuthority } from '@/hooks/accessV2/useOrgAuthority';
import PulseLoader from '@/components/shared/PulseLoader';

/** Withhold all org controls until cutover is verified, including stale/degraded cached reads. */
export default function AuthorityBoundary({ children }) {
  const { orgName, orgId, orgStatus, loading: orgLoading, error: orgError } = usePOContext();
  const authority = useOrgAuthority();
  const router = useRouter();
  // Unscoped pages and positively resolved dead ends keep their normal page chrome.
  if (!orgName || orgStatus === 'missing' || orgStatus === 'notFound') return children;
  if (orgId && authority.enabled && !orgError) return children;
  const loading = !orgError && (orgLoading || authority.loading || orgStatus === 'loading');
  return (
    <Center minH="100vh" bg="warmGray.900" px={5}>
      <VStack spacing={5} maxW="560px" color="white" textAlign="center">
        {loading ? <><PulseLoader /><Text>Loading organization…</Text></> : <>
          <Alert status="info" borderRadius="lg" color="warmGray.900">
            <AlertIcon /><Box>This organization is unavailable. Its current roles and permissions could not be verified.</Box>
          </Alert>
          <Button onClick={() => router.reload()}>Try again</Button>
          <Button variant="link" color="white" onClick={() => router.push('/explore/')}>Browse organizations</Button>
        </>}
      </VStack>
    </Center>
  );
}
