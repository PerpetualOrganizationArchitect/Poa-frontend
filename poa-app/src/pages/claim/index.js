import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { Box, Center, Container, Spinner } from '@chakra-ui/react';
import Navbar from '@/templateComponents/studentOrgDAO/NavBar';
import SEOHead from '@/components/common/SEOHead';
import { usePOContext } from '@/context/POContext';
import { useOrgName } from '@/hooks/useOrgName';
import ZkEmailClaimFlow from '@/components/zkEmail/ZkEmailClaimFlow';

/**
 * /claim — claim a role by proving control of an allowlisted email.
 * ZkEmailInvites is an OPTIONAL per-org module, so (mirroring /learn for EducationHub) this page
 * redirects to the dashboard for orgs that don't have it enabled.
 */
const ClaimByEmail = () => {
  const router = useRouter();
  const { poContextLoading, zkEmailInvitesEnabled } = usePOContext();
  const userDAO = useOrgName();

  useEffect(() => {
    if (!poContextLoading && !zkEmailInvitesEnabled && userDAO) {
      router.replace(`/dashboard/?org=${encodeURIComponent(userDAO)}`);
    }
  }, [poContextLoading, zkEmailInvitesEnabled, userDAO, router]);

  return (
    <>
      <SEOHead
        title="Claim a role by email"
        description="Claim a role in your organization by proving control of an allowlisted email."
        path="/claim"
        noIndex
      />
      <Navbar />
      <Container maxW="container.md" py={8}>
        {poContextLoading ? (
          <Center py={16}>
            <Spinner />
          </Center>
        ) : zkEmailInvitesEnabled ? (
          <ZkEmailClaimFlow />
        ) : (
          <Box />
        )}
      </Container>
    </>
  );
};

export default ClaimByEmail;
