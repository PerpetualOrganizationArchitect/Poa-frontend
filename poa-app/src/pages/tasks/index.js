import SEOHead from "@/components/common/SEOHead";
import React, { useRef, useEffect, useState } from 'react';
import { Box, Center } from '@chakra-ui/react';
import PulseLoader from "@/components/shared/PulseLoader";
import MainLayout, { ALL_TASKS_ID } from '../../components/TaskManager/MainLayout';
import { useDataBaseContext } from '@/context/dataBaseContext';
import { useProjectContext } from '@/context/ProjectContext';
import { useRouter } from 'next/router';
import Navbar from "@/templateComponents/studentOrgDAO/NavBar";
import { usePOContext } from '@/context/POContext';
import { useOrgTheme } from '@/hooks';
import { useOrgName } from '@/hooks/useOrgName';
import { orgUrl } from '@/util/orgUrl';
import { useOrgGate } from "@/components/shared/OrgDeadEnd";

const Tasks = () => {
  const router = useRouter();
  const userDAO = useOrgName();
  const { setSelectedProjectId, projects } = useDataBaseContext();
  const { projectsLoading } = useProjectContext();
  const { poContextLoading } = usePOContext();
  const { pageBackground } = useOrgTheme();
  const orgGate = useOrgGate();
  const containerRef = useRef();

  // Resolve viewport client-side only — window.matchMedia is unavailable during
  // SSR / static export, so this must live in an effect (Chakra md = 48em).
  // `mounted` flips together with `isMobile`, so the default below never runs
  // with a stale viewport (which would flash a project board before redirecting
  // on a phone).
  const [viewport, setViewport] = useState({ mounted: false, isMobile: false });
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 47.99em)');
    const sync = () => setViewport({ mounted: true, isMobile: mq.matches });
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (router.query.projectId !== undefined) {
      const rawProjectId = decodeURIComponent(router.query.projectId); // Decode the query parameter
      setSelectedProjectId(rawProjectId);
    }
    else if (viewport.mounted && userDAO && projects && projects.length > 0) {
      if (viewport.isMobile) {
        // Mobile defaults to the All Tasks board (a cross-project list) rather
        // than dropping into one arbitrary project. replace() so this default
        // doesn't add a back-history entry.
        router.replace(orgUrl(userDAO, 'tasks', { projectId: ALL_TASKS_ID, view: 'list' }));
      } else {
        setSelectedProjectId(projects[0].id);
      }
    }
  }, [router.query.projectId, projects, viewport, userDAO]);

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
        <Center height="90vh" background={pageBackground()}>
          <PulseLoader size="xl" />
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
