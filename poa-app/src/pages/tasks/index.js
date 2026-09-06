import SEOHead from "@/components/common/SEOHead";
import React, { useRef } from 'react';
import { Box, Center } from '@chakra-ui/react';
import CommunityLoadingState from "@/components/shared/CommunityLoadingState";
import MainLayout from '@/components/TaskManager/MainLayout';
import { useProjectContext } from '@/context/ProjectContext';
import Navbar from "@/templateComponents/studentOrgDAO/NavBar";
import { usePOContext } from '@/context/POContext';
import { useOrgTheme } from '@/hooks';
import { useTaskRoute } from '@/hooks/useTaskRoute';
import { useOrgGate } from "@/components/shared/OrgDeadEnd";

const Tasks = () => {
  useTaskRoute();
  const { projectsLoading } = useProjectContext();
  const { poContextLoading } = usePOContext();
  const { pageBackground } = useOrgTheme();
  const orgGate = useOrgGate();
  const containerRef = useRef();

  // No org to render: a dead end, not a pending state. After every hook.
  if (orgGate) return orgGate;
  return (
    <>
      <SEOHead
        title="A Task for You"
        description="You've been shared a task on Poa."
        path="/tasks"
      />
      <Navbar />
      {poContextLoading || projectsLoading ? (
        <Center minH="90vh" background={pageBackground()}>
          <CommunityLoadingState label="Loading your task board…" />
        </Center>
      ) : (
        <Box minH="90vh" position="relative" bg="blackAlpha.600" ref={containerRef} background={pageBackground()}>
          <MainLayout />
        </Box>
      )}
    </>
  );
};

export default Tasks;
