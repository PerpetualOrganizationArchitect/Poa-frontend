import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useDataBaseContext } from '@/context/dataBaseContext';
import { useProjectContext } from '@/context/ProjectContext';
import { usePOContext } from '@/context/POContext';
import { useOrgName } from '@/hooks/useOrgName';
import { getInitialTaskSelection } from '@/components/TaskManager/taskViewIds';

export function useTaskRoute() {
  const router = useRouter();
  const org = useOrgName();
  const { projects, setSelectedProjectId } = useDataBaseContext();
  const { projectsLoading } = useProjectContext();
  const { poContextLoading } = usePOContext();
  const [viewport, setViewport] = useState({ mounted: false, isMobile: false });

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 47.99em)');
    const sync = () => setViewport({ mounted: true, isMobile: mq.matches });
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!router.isReady || !viewport.mounted || !org || poContextLoading || projectsLoading) return;
    const selection = getInitialTaskSelection({ query: router.query, projects, isMobile: viewport.isMobile });
    if (!selection) return;

    setSelectedProjectId(selection.projectId);
    if (selection.query) {
      // replace keeps default selection out of browser history and carries any
      // task, search, filters, and explicit task view through normalization.
      router.replace({ pathname: router.pathname, query: { ...selection.query, org } }, undefined, { shallow: true });
    }
  }, [router, viewport, org, projects, poContextLoading, projectsLoading, setSelectedProjectId]);
}
