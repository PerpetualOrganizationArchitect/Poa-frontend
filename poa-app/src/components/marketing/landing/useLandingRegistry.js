import { useMemo } from "react";
import { useprofileHubContext } from "@/context/profileHubContext";
import { isHiddenOrg } from "@/util/hiddenOrgs";

// Known-real orgs referenced elsewhere in the repo; preferred for the
// featured charter card. Matched case-insensitively (the directory stores
// e.g. "KUBI").
const PREFERRED_FEATURED = ["kubi", "poa"];

// A display name a stranger should never meet on the front door.
const isPresentableName = (name) =>
  typeof name === "string" && name.trim().length > 0 && name.length <= 40;

// The landing always links orgs through the internal route. Some orgs have
// external white-label domains (getVisitUrlForOrg would prefer those), but
// the banned-vocabulary rule is absolute INCLUDING URLs, and external
// domains are outside our control (e.g. one contains "dao.").
// Trailing slash matches next.config's trailingSlash:true, so the link
// never takes a 308 on static hosting (and NextLink and plain anchors
// produce the same URL).
export const internalOrgUrl = (orgId) => `/home/?org=${encodeURIComponent(orgId)}`;

// Live data for the landing page, from the same public registry /explore
// reads. Calling useprofileHubContext() is the lazy opt-in that triggers
// the (deduped) cross-chain fetch; during static export and first paint it
// returns defaults, so the page renders its fallbacks with no hydration
// mismatch and upgrades in place once the registry answers.
export default function useLandingRegistry() {
  const { perpetualOrganizations = [], isLoading = true } = useprofileHubContext() || {};

  const orgs = useMemo(
    () => perpetualOrganizations.filter((po) => !isHiddenOrg(po.id)),
    [perpetualOrganizations]
  );

  const featuredOrg = useMemo(() => {
    if (!orgs.length) return null;
    for (const wanted of PREFERRED_FEATURED) {
      const hit = orgs.find((po) => po.id?.toLowerCase() === wanted);
      if (hit) return hit;
    }
    const presentable = orgs.filter((po) => isPresentableName(po.id));
    if (!presentable.length) return null;
    return presentable.reduce((best, po) =>
      (parseInt(po.totalMembers, 10) || 0) > (parseInt(best.totalMembers, 10) || 0) ? po : best
    );
  }, [orgs]);

  const counts = useMemo(
    () => ({
      orgs: orgs.length,
      members: orgs.reduce((sum, po) => sum + (parseInt(po.totalMembers, 10) || 0), 0),
    }),
    [orgs]
  );

  return { isLoading, orgs, featuredOrg, counts };
}
