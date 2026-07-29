import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { Box, Center, Container, Spinner } from '@chakra-ui/react';
import Navbar from '@/templateComponents/studentOrgDAO/NavBar';
import SEOHead from '@/components/common/SEOHead';
import { usePOContext } from '@/context/POContext';
import { useOrgName } from '@/hooks/useOrgName';
import { useOrgGate } from '@/components/shared/OrgDeadEnd';
import ZkEmailClaimFlow from '@/components/zkEmail/ZkEmailClaimFlow';

/**
 * /claim — claim a role by proving control of an allowlisted email.
 * ZkEmailInvites is an OPTIONAL per-org module, so (mirroring /learn for EducationHub) this page
 * redirects to the dashboard for orgs that don't have it enabled.
 */
const ClaimByEmail = () => {
  const router = useRouter();
  const { poContextLoading, orgStatus, zkEmailInvitesEnabled } = usePOContext();
  const userDAO = useOrgName();
  const orgGate = useOrgGate();

  // Gated on orgStatus === 'ready', NOT on `userDAO` being truthy: a name that
  // resolves to nothing is still truthy, so an unknown org would be bounced off
  // its dead end onto /dashboard — which shows its own. "This org has no
  // zk-email module" is only a fact once there is an org.
  useEffect(() => {
    if (orgStatus !== 'ready') return;
    if (!poContextLoading && !zkEmailInvitesEnabled && userDAO) {
      router.replace(`/dashboard/?org=${encodeURIComponent(userDAO)}`);
    }
  }, [orgStatus, poContextLoading, zkEmailInvitesEnabled, userDAO, router]);

  // No org to render: a dead end, not a pending state. After every hook.
  if (orgGate) return orgGate;

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
