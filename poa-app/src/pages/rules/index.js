/**
 * /rules — "Our rules" as a standalone page.
 *
 * Thin wrapper: Navbar + the OrgConstitution panel (opened by default). Org
 * context resolves from ?userDAO exactly like /votes and /voting (POContext
 * reads router.query.userDAO). "Propose a change" deep-links back to the board
 * at /voting?propose=<templateId>, which opens the create modal with that rule
 * template preselected.
 */

import React, { useCallback } from "react";
import { useRouter } from "next/router";
import { Box, Container, Center } from "@chakra-ui/react";
import SEOHead from "@/components/common/SEOHead";
import PulseLoader from "@/components/shared/PulseLoader";
import Navbar from "@/templateComponents/studentOrgDAO/NavBar";
import { usePOContext } from "@/context/POContext";
import { useUserContext } from "@/context/UserContext";
import { useOrgTheme } from "@/hooks";
import { useOrgName } from "@/hooks/useOrgName";
import OrgConstitution from "@/components/voting/OrgConstitution";

const RulesPage = () => {
  const router = useRouter();
  const userDAO = useOrgName();
  const { poContextLoading } = usePOContext();
  const { hasMemberRole } = useUserContext();
  const { pageBackground } = useOrgTheme();

  const handleProposeRuleChange = useCallback((templateId) => {
    router.push(
      `/voting?userDAO=${encodeURIComponent(userDAO || "")}&propose=${encodeURIComponent(templateId)}`
    );
  }, [router, userDAO]);

  const seoHead = (
    <SEOHead
      title="Our rules"
      description="How this group decides — and what it takes to change it."
      path="/rules"
      noIndex
    />
  );

  return (
    <>
      {seoHead}
      <Navbar />
      {poContextLoading ? (
        <Center height="90vh" background={pageBackground()}>
          <PulseLoader size="xl" />
        </Center>
      ) : (
        <Box position="relative" w="100%" minH="100vh" py={6} px={{ base: "1%", md: "3%" }} background={pageBackground()}>
          <Container maxW="1400px" mx="auto">
            <OrgConstitution
              defaultOpen
              hasMemberRole={hasMemberRole}
              onProposeRuleChange={handleProposeRuleChange}
            />
          </Container>
        </Box>
      )}
    </>
  );
};

export default RulesPage;
