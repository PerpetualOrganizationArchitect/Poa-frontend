import { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useProjectContext } from './ProjectContext';

const DataBaseContext = createContext();

export const useDataBaseContext = () => {
  return useContext(DataBaseContext);
};

export const DataBaseProvider = ({ children }) => {
    const {projectsData}= useProjectContext();


    useEffect(()=>{
        // Sync arrays INCLUDING empty ones: an org with zero projects must clear
        // the previous org's board, otherwise actions pair the new org's
        // TaskManager address with stale composite ids (silent wrong-task hits
        // or reverts). ProjectContext resets projectsData to [] on org change.
        if (!Array.isArray(projectsData)) return;
        setProjects(projectsData);

        // Only set selectedProject if:
        // 1. No project is currently selected, OR
        // 2. The currently selected project is no longer in the list
        // This preserves the user's selection when data is refreshed
        setSelectedProject(prev => {
            // If we have a selection and it still exists in the new data, update it with fresh data
            if (prev && prev.id) {
                const updatedProject = projectsData.find(p => p.id === prev.id);
                if (updatedProject) {
                    return updatedProject;
                }
            }
            // Otherwise default to first project (undefined when the org has none)
            return projectsData[0];
        });
    },[projectsData])


    // Projects are populated from ProjectContext via useEffect
    const [projects, setProjects] = useState([]);

    // Ref-stabilize projects so setSelectedProjectId doesn't re-create on every data update
    const projectsRef = useRef(projects);
    projectsRef.current = projects;

    const [selectedProject,setSelectedProject] = useState('')

    const setSelectedProjectId = useCallback((projectId) => {
      const project = projectsRef.current.find(project => project.id === projectId);
      setSelectedProject(project);
    }, []);

    // Placeholder function - username lookup should use subgraph data
    const getUsernameByAddress = useCallback(async (address) => {
      if (!address) return 'Unknown';
      return `${address.substring(0, 6)}...${address.substring(38)}`;
    }, []);

    // Handle column updates from TaskBoard.
    // Accepts an optional projectId to guard against stale updates when the user
    // switches projects while a transaction is still in-flight.
    const handleUpdateColumns = useCallback((newColumns, projectId) => {
      setSelectedProject(prev => {
        if (!prev) return prev;
        if (projectId && prev.id !== projectId) return prev;
        return { ...prev, columns: newColumns };
      });

      if (projectId) {
        setProjects(prev => prev.map(p =>
          p.id === projectId ? { ...p, columns: newColumns } : p
        ));
      }
    }, []);

    const contextValue = useMemo(() => ({
      projects,
      setSelectedProjectId,
      selectedProject,
      setSelectedProject,
      handleUpdateColumns,
      getUsernameByAddress,
    }), [projects, setSelectedProjectId, selectedProject, handleUpdateColumns, getUsernameByAddress]);

    return (
        <DataBaseContext.Provider value={contextValue}>
          {children}
        </DataBaseContext.Provider>
      );
    };