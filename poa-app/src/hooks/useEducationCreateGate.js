import { usePOContext } from '@/context/POContext';
import { useAuthorityPermission } from '@/hooks/useAuthorityPermission';
import { PERM_KEYS } from '@/lib/accessV2/permKeys';

export function useEducationCreateGate() {
  const { educationHubEnabled } = usePOContext();
  const { allowed, loading } = useAuthorityPermission(PERM_KEYS.EDU_CREATE);
  return { canCreateModule: educationHubEnabled && allowed, educationGateLoading: educationHubEnabled && loading };
}

export default useEducationCreateGate;
