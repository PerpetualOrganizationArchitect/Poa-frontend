/**
 * useVotingPower - Hook for calculating and displaying user's voting power
 * VERSION: 3.0 (truthful N-class breakdown)
 *
 * Provides a breakdown of how the user's vote is calculated in Blended voting
 * ("Hybrid" on-chain). Two shapes are returned:
 *
 *  - LEGACY fields (membershipPower, contributionPower, classWeights, isHybrid,
 *    hasVotingPower, message, status, orgStats, classConfig, isLoading) — kept
 *    working, with their historical 2-bucket collapse, so existing consumers
 *    (pollModal, TokenActivityCard, the education header's older widgets) keep
 *    rendering unchanged.
 *
 *  - classBreakdown[] — the TRUTHFUL per-class view. One entry per active
 *    voting class from VotingContext.votingClasses. This is null while classes
 *    are still loading; it is NEVER fabricated from a 50/50 default. New
 *    surfaces (VotePowerReceipt) render from this.
 *
 * See CLAUDE.md "Token amounts are always 18-decimal wei" — the ERC20_BAL math
 * intentionally mirrors the existing formatTokenAmount-based comparison so the
 * legacy fields stay byte-for-byte compatible.
 */

import { useMemo } from 'react';
import { usePOContext } from '../context/POContext';
import { useUserContext } from '../context/UserContext';
import { useVotingContext } from '../context/VotingContext';
import { formatTokenAmount } from '../util/formatToken';

// Voting strategy constants (matching subgraph enum)
const VOTING_STRATEGY = {
  DIRECT: 'DIRECT',
  ERC20_BAL: 'ERC20_BAL',
};

/**
 * Calculate square root for quadratic voting (matching contract logic)
 */
function sqrt(value) {
  if (value < 0n) return 0n;
  if (value === 0n) return 0n;

  let z = value;
  let x = value / 2n + 1n;

  while (x < z) {
    z = x;
    x = (value / x + x) / 2n;
  }

  return z;
}

/**
 * Parse a token balance string to BigInt (handles decimals)
 */
function parseTokenBalance(balanceString) {
  if (!balanceString) return 0n;

  // If it's already a number or BigInt-like
  if (typeof balanceString === 'number') {
    return BigInt(Math.floor(balanceString));
  }

  // Handle string with decimals (e.g., "123.45")
  const str = String(balanceString);
  const parts = str.split('.');

  if (parts.length === 1) {
    // No decimals
    return BigInt(parts[0] || '0');
  }

  // Has decimals - treat as whole units (the balance is already formatted)
  // For voting power calculation, use the raw integer value
  return BigInt(parts[0] || '0');
}

/**
 * Normalize a hat ID for set comparison (strings vs bigints vs hex).
 */
function normalizeHatId(id) {
  if (id === null || id === undefined) return '';
  const str = String(id).trim();
  if (!str) return '';
  try {
    // Collapse hex / decimal representations to a canonical decimal string.
    return BigInt(str).toString();
  } catch {
    return str.toLowerCase();
  }
}

/**
 * Does the user hold at least one of the class's gating hats?
 * An empty gate (hatIds === []) means "every member is eligible".
 */
function userHoldsGatingHat(classHatIds, userHatIds) {
  if (!classHatIds || classHatIds.length === 0) return true;
  const userSet = new Set((userHatIds || []).map(normalizeHatId));
  return classHatIds.map(normalizeHatId).some((h) => userSet.has(h));
}

/**
 * Count how many leaderboard members are eligible for a DIRECT class (hold a
 * gating hat). Returns { count, approximate } — approximate is true when we
 * could not compute a real holder count and fell back to poMembers.
 */
function countDirectHolders(cls, leaderboardData, poMembers) {
  const gateHats = (cls.hatIds || []).map(normalizeHatId).filter(Boolean);

  // Ungated class → every member is a holder.
  if (gateHats.length === 0) {
    return { count: poMembers || 0, approximate: !poMembers };
  }

  if (Array.isArray(leaderboardData) && leaderboardData.length > 0) {
    const gateSet = new Set(gateHats);
    let count = 0;
    for (const u of leaderboardData) {
      const userHats = (u.hatIds || []).map(normalizeHatId);
      if (userHats.some((h) => gateSet.has(h))) count += 1;
    }
    if (count > 0) return { count, approximate: false };
  }

  // No leaderboard data (or nobody matched) — approximate with member count.
  return { count: poMembers || 0, approximate: true };
}

/**
 * Compute a single class's per-user standing.
 */
function computeClassEntry({
  cls,
  userHatIds,
  userBalanceRaw,
  leaderboardData,
  poMembers,
  roleNames,
}) {
  const slicePct = Number(cls.slicePct) || 0;
  const base = {
    classIndex: Number(cls.classIndex ?? 0),
    strategy: cls.strategy,
    slicePct,
    quadratic: !!cls.quadratic,
    minBalance: cls.minBalance != null ? String(cls.minBalance) : '0',
    asset: cls.asset ?? null,
    hatIds: (cls.hatIds || []).map((h) => String(h)),
    roleNames: roleNames || [],
    label: '', // filled by the consumer via votingVocabulary.classLabel
    eligible: false,
    ineligibleReason: null,
    userRawPower: 0,
    userClassSharePct: 0, // this user's fraction of THIS class (0..1)
    contributionToTotalPct: 0, // userClassSharePct * slicePct, in percent (0..100)
    approximate: false,
  };

  if (cls.strategy === VOTING_STRATEGY.DIRECT) {
    const eligible = userHoldsGatingHat(cls.hatIds, userHatIds);
    if (!eligible) {
      return { ...base, eligible: false, ineligibleReason: 'no_role' };
    }
    const { count, approximate } = countDirectHolders(cls, leaderboardData, poMembers);
    const holders = count > 0 ? count : 1;
    const share = 1 / holders;
    return {
      ...base,
      eligible: true,
      userRawPower: 1, // one equal vote
      userClassSharePct: share,
      contributionToTotalPct: share * slicePct,
      approximate,
      _holders: holders,
    };
  }

  // ERC20_BAL (shares / token) class
  const balance = parseTokenBalance(userBalanceRaw || '0');
  const minBalance = parseTokenBalance(formatTokenAmount(cls.minBalance || '0'));

  if (balance <= 0n) {
    return { ...base, eligible: false, ineligibleReason: 'no_balance' };
  }
  if (balance < minBalance) {
    return { ...base, eligible: false, ineligibleReason: 'below_min_balance' };
  }

  const userPower = cls.quadratic ? sqrt(balance) : balance;

  // Sum eligible power across the org from leaderboard balances.
  let totalPower = 0n;
  if (Array.isArray(leaderboardData) && leaderboardData.length > 0) {
    for (const u of leaderboardData) {
      const b = parseTokenBalance(u.token || '0');
      if (b <= 0n || b < minBalance) continue;
      totalPower += cls.quadratic ? sqrt(b) : b;
    }
  }
  if (totalPower <= 0n) {
    // Leaderboard not loaded — the user is the only known holder.
    totalPower = userPower;
  }

  const share = totalPower > 0n ? Number(userPower) / Number(totalPower) : 0;
  return {
    ...base,
    eligible: true,
    userRawPower: Number(userPower),
    userClassSharePct: share,
    contributionToTotalPct: share * slicePct,
    approximate: !(Array.isArray(leaderboardData) && leaderboardData.length > 0),
  };
}

/**
 * Hook to calculate user's voting power breakdown
 */
export function useVotingPower() {
  const { poMembers, leaderboardData, roleNames: contextRoleNames } = usePOContext();
  const { userData, hasMemberRole } = useUserContext();
  const { votingType, votingClasses: subgraphClasses, loading: votingLoading } = useVotingContext();

  // Default class configuration for the LEGACY fallback path only. The new
  // classBreakdown never uses this — while classes load it stays null.
  const defaultClasses = [
    {
      strategy: 'DIRECT',
      slicePct: 50,
      quadratic: false,
      minBalance: '0',
      asset: null,
      hatIds: [],
    },
    {
      strategy: 'ERC20_BAL',
      slicePct: 50,
      quadratic: true,
      minBalance: '0',
      asset: null,
      hatIds: [],
    },
  ];

  // Use subgraph classes if available, otherwise use defaults (LEGACY only).
  const classConfig = useMemo(() => {
    if (votingType !== 'Hybrid') return null;

    // If we have classes from subgraph, use them (strategy is a string enum: 'DIRECT' or 'ERC20_BAL')
    if (subgraphClasses && subgraphClasses.length > 0) {
      return subgraphClasses.map(cls => ({
        ...cls,
        slicePct: Number(cls.slicePct),
      }));
    }

    // Fall back to defaults if subgraph doesn't have classes yet
    return defaultClasses;
  }, [votingType, subgraphClasses]);

  // Have the REAL classes loaded from the subgraph? (Not the fabricated default.)
  const hasRealClasses = !!(subgraphClasses && subgraphClasses.length > 0);

  // Derive loading state
  const isLoading = votingLoading;

  // Resolve role names for each DIRECT class's gating hats.
  const roleNameLookup = useMemo(() => {
    if (!contextRoleNames || typeof contextRoleNames !== 'object') return {};
    return contextRoleNames;
  }, [contextRoleNames]);

  const resolveRoleNames = useMemo(() => {
    return (hatIds) => {
      if (!Array.isArray(hatIds)) return [];
      return hatIds
        .map((h) => {
          const key = String(h);
          if (roleNameLookup[key]) return roleNameLookup[key];
          try {
            const dec = BigInt(key).toString();
            if (roleNameLookup[dec]) return roleNameLookup[dec];
          } catch {
            /* not numeric */
          }
          return null;
        })
        .filter(Boolean);
    };
  }, [roleNameLookup]);

  // ---------------------------------------------------------------------
  // TRUTHFUL per-class breakdown. Null until real classes have loaded.
  // ---------------------------------------------------------------------
  const classBreakdown = useMemo(() => {
    if (votingType !== 'Hybrid') return null;
    if (!hasRealClasses) return null; // never fabricate 50/50 here

    const userHatIds = userData?.hatIds || [];
    const userBalanceRaw = userData?.participationTokenBalance || '0';

    return subgraphClasses
      .map((cls) => {
        const roleNames = cls.strategy === VOTING_STRATEGY.DIRECT
          ? resolveRoleNames(cls.hatIds || [])
          : [];
        return computeClassEntry({
          cls,
          userHatIds,
          userBalanceRaw,
          leaderboardData,
          poMembers,
          roleNames,
        });
      })
      .sort((a, b) => a.classIndex - b.classIndex);
  }, [votingType, hasRealClasses, subgraphClasses, userData, leaderboardData, poMembers, resolveRoleNames]);

  // Headline: this user's total share of the decision, summed across eligible classes.
  const totalSharePct = useMemo(() => {
    if (!classBreakdown) return null;
    return classBreakdown.reduce((sum, c) => sum + (c.eligible ? c.contributionToTotalPct : 0), 0);
  }, [classBreakdown]);

  // Calculate voting power (LEGACY 2-bucket fields — unchanged behavior)
  const votingPower = useMemo(() => {
    // Default response for non-members or when data isn't loaded
    const defaultPower = {
      membershipPower: 0,
      contributionPower: 0,
      totalPower: 0,
      percentOfTotal: 0,
      classWeights: { democracy: 50, contribution: 50 },
      isHybrid: votingType === 'Hybrid',
      hasVotingPower: false,
      status: 'unknown',
    };

    if (!hasMemberRole) {
      return { ...defaultPower, message: 'Join to participate in voting', status: 'not_member' };
    }

    // Direct Democracy mode
    if (votingType !== 'Hybrid') {
      const memberCount = poMembers || 1;
      return {
        membershipPower: 100,
        contributionPower: 0,
        totalPower: 100,
        percentOfTotal: memberCount > 0 ? (100 / memberCount) : 0,
        classWeights: { democracy: 100, contribution: 0 },
        isHybrid: false,
        hasVotingPower: true,
        message: 'Equal voice with all members',
        status: 'ready',
      };
    }

    if (!classConfig || classConfig.length === 0) {
      return { ...defaultPower, message: 'Loading...', status: 'loading' };
    }

    // Calculate power from class config - read weights directly from subgraph
    let membershipPower = 0;
    let contributionPower = 0;
    let democracyWeight = 0;
    let contributionWeight = 0;

    classConfig.forEach((cls) => {
      if (cls.strategy === VOTING_STRATEGY.DIRECT) {
        membershipPower = 100;
        democracyWeight = Number(cls.slicePct);
      } else if (cls.strategy === VOTING_STRATEGY.ERC20_BAL) {
        contributionWeight = Number(cls.slicePct);

        // Get user's token balance
        const rawBalance = userData?.participationTokenBalance || '0';
        const balance = parseTokenBalance(rawBalance);

        // Check minimum balance — convert minBalance from wei to human-readable
        // units to match balance (which was already formatted by formatTokenAmount)
        const minBalance = parseTokenBalance(formatTokenAmount(cls.minBalance || '0'));
        if (balance < minBalance) {
          contributionPower = 0;
        } else {
          // Apply quadratic if enabled
          if (cls.quadratic) {
            contributionPower = Number(sqrt(balance) * 100n);
          } else {
            contributionPower = Number(balance * 100n);
          }
        }
      }
    });

    const totalPower = membershipPower + contributionPower;

    // Calculate comparative statistics for the org
    let orgStats = {
      averagePower: 0,
      maxPower: 0,
      totalOrgPower: 0,
      userRank: 0,
      membershipPercent: 0,
      contributionPercent: 0,
      percentOfTotal: 0,
      aboveAverage: false,
    };

    if (leaderboardData?.length > 0) {
      let totalMembershipPower = 0;
      let totalContributionPower = 0;

      const userPowers = leaderboardData.map(user => {
        const userBalance = parseTokenBalance(user.token || '0');
        let userContrib = 0;

        const contribClass = classConfig.find(c => c.strategy === VOTING_STRATEGY.ERC20_BAL);
        if (contribClass) {
          // Apply same minBalance check as personal power calculation
          const minBal = parseTokenBalance(formatTokenAmount(contribClass.minBalance || '0'));
          if (userBalance >= minBal) {
            if (contribClass.quadratic) {
              userContrib = Number(sqrt(userBalance) * 100n);
            } else {
              userContrib = Number(userBalance * 100n);
            }
          }
        }

        totalMembershipPower += 100;
        totalContributionPower += userContrib;
        return { membership: 100, contribution: userContrib, total: 100 + userContrib };
      });

      const totalRawPower = userPowers.reduce((a, b) => a + b.total, 0);

      // Calculate share per-class then weight — matches contract logic:
      // share = (userMembership/totalMembership) × membershipWeight
      //       + (userContribution/totalContribution) × contributionWeight
      const membershipShare = totalMembershipPower > 0
        ? (membershipPower / totalMembershipPower)
        : 0;
      // When no one has tokens, everyone is equally powerful in the contribution class
      const memberCount = userPowers.length || 1;
      const contributionShare = totalContributionPower > 0
        ? (contributionPower / totalContributionPower)
        : (1 / memberCount);

      orgStats.totalOrgPower = totalRawPower;
      orgStats.averagePower = totalRawPower / userPowers.length;
      orgStats.maxPower = Math.max(...userPowers.map(p => p.total));
      orgStats.membershipPercent = membershipShare * democracyWeight;
      orgStats.contributionPercent = contributionShare * contributionWeight;
      orgStats.percentOfTotal = orgStats.membershipPercent + orgStats.contributionPercent;
      orgStats.aboveAverage = totalPower > orgStats.averagePower;

      const sortedPowers = [...userPowers.map(p => p.total)].sort((a, b) => b - a);
      orgStats.userRank = sortedPowers.findIndex(p => p <= totalPower) + 1;
    }

    const result = {
      membershipPower,
      contributionPower,
      totalPower,
      percentOfTotal: Math.min(orgStats.percentOfTotal, 100),
      classWeights: {
        democracy: democracyWeight,
        contribution: contributionWeight,
      },
      orgStats,
      isHybrid: true,
      hasVotingPower: totalPower > 0,
      message: totalPower > 0
        ? `Your voice: ${democracyWeight}% membership + ${contributionWeight}% contribution`
        : 'You need membership or contributions to vote',
      status: 'ready',
    };

    return result;
  }, [classConfig, userData, hasMemberRole, votingType, poMembers, leaderboardData]);

  // While real Blended classes haven't loaded, report the truthful loading
  // status on the new surface without disturbing the legacy `status` above.
  const breakdownStatus = (() => {
    if (votingType !== 'Hybrid') return 'ready';
    if (!hasMemberRole) return 'not_member';
    if (!hasRealClasses) return 'loading';
    return 'ready';
  })();

  return {
    ...votingPower,
    classConfig,
    isLoading,
    // New truthful N-class fields (null-safe for old consumers that ignore them)
    classBreakdown,
    totalSharePct,
    breakdownStatus,
    hasRealClasses,
    votingType,
  };
}

export default useVotingPower;
