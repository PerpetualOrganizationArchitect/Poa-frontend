import { useMemo } from 'react';
import { useUserContext } from '@/context/UserContext';
import { projectTaskPermissions } from '@/util/permissions';

/**
 * Every TaskManager gate for one project, plus whether that answer is complete
 * enough to DENY on.
 *
 * `projectTaskPermissions` is a faithful `_checkPerm` mirror, but it reads from
 * three sources that resolve independently — the board document (hat masks), the
 * separate managers document (`_isPM`), and the visitor's own hats. Surfaces that
 * merely *reveal* an affordance can ignore that: the button simply appears a beat
 * late. Surfaces that *refuse* an action cannot, because a half-loaded answer
 * denies a project manager their own project.
 *
 * `resolved` needs both halves that can arrive late:
 *   - `project.managersLoaded` — the managers document actually delivered THIS
 *     project's row. Deliberately per-project, not per-org: the board can know
 *     about a project the managers document has not returned yet, and an org-wide
 *     "loaded" flag would certify that project's empty manager list as fact. It is
 *     also, conveniently, false for a `project` that did not resolve at all — and
 *     an unresolved project yields all-false permissions, so refusing on one would
 *     deny everyone on any lookup miss.
 *   - `!userDataLoading` — the visitor's hats are in, so an empty `hatIds` means
 *     "wears nothing" rather than "not fetched".
 *
 * Pair with `permissionGate(perms.canX, resolved)` at the call site, which keeps
 * grants immediate and holds only denials back.
 *
 * @param {Object|undefined} project - Transformed project from ProjectContext.
 * @param {string|undefined} address - The connected account, i.e. the tx's msg.sender
 *   (the ERC-4337 smart account for passkey users, the EOA otherwise). Passed in
 *   rather than read here because callers already hold it from different sources.
 * @returns {{perms: ReturnType<typeof projectTaskPermissions>, resolved: boolean}}
 */
export function useProjectTaskAuthority(project, address) {
  const { userData, userDataLoading } = useUserContext() || {};

  const userHatIds = useMemo(() => userData?.hatIds || [], [userData]);

  const perms = useMemo(
    () => projectTaskPermissions(project, userHatIds, address),
    [project, userHatIds, address],
  );

  const resolved = !!project?.managersLoaded && !userDataLoading;

  return { perms, resolved };
}

export default useProjectTaskAuthority;
