/**
 * Philosophy Mapper
 *
 * Maps the "How democratic?" slider value (0-100) to concrete voting configuration.
 * This is the bridge between Simple mode (slider) and Advanced mode (voting classes).
 */

import { v4 as uuidv4 } from 'uuid';
import { VOTING_STRATEGY } from '../context/deployerReducer';

// Philosophy presets based on slider ranges
export const PHILOSOPHY_RANGES = {
  DELEGATED: { min: 0, max: 30 },
  HYBRID: { min: 31, max: 70 },
  DEMOCRATIC: { min: 71, max: 100 },
};

/**
 * Get the philosophy type from a slider value
 */
export function getPhilosophyType(sliderValue) {
  if (sliderValue <= PHILOSOPHY_RANGES.DELEGATED.max) {
    return 'delegated';
  }
  if (sliderValue <= PHILOSOPHY_RANGES.HYBRID.max) {
    return 'hybrid';
  }
  return 'democratic';
}

/**
 * Get philosophy display info
 */
export function getPhilosophyInfo(sliderValue) {
  const type = getPhilosophyType(sliderValue);

  switch (type) {
    case 'delegated':
      return {
        type: 'delegated',
        name: 'Leader-Led',
        shortDescription: 'Leaders make most decisions',
        description: 'Leadership makes day-to-day decisions quickly. Members vote on major changes and elections.',
        icon: '👔',
        color: 'orange',
      };
    case 'hybrid':
      return {
        type: 'hybrid',
        name: 'Balanced',
        shortDescription: 'Leaders propose, members decide',
        description: 'Leadership proposes ideas, but the community makes final decisions. Both participation and direct votes count.',
        icon: '⚖️',
        color: 'blue',
      };
    case 'democratic':
      return {
        type: 'democratic',
        name: 'Community-Led',
        shortDescription: 'Everyone has equal voice',
        description: 'Pure democracy where every member has equal voting power regardless of participation level.',
        icon: '🗳️',
        color: 'green',
      };
    default:
      return {
        type: 'hybrid',
        name: 'Balanced',
        shortDescription: 'Leaders propose, members decide',
        description: 'A balanced approach between leadership and community input.',
        icon: '⚖️',
        color: 'blue',
      };
  }
}

/**
 * Map slider value to voting configuration
 * Returns a voting object compatible with the deployer state
 */
export function sliderToVotingConfig(sliderValue) {
  const type = getPhilosophyType(sliderValue);

  switch (type) {
    case 'delegated':
      return {
        mode: 'HYBRID',
        hybridQuorum: 30,
        ddQuorum: 30,
        quadraticEnabled: false,
        democracyWeight: 30,
        participationWeight: 70,
        classes: [
          {
            id: uuidv4(),
            strategy: VOTING_STRATEGY.DIRECT,
            slicePct: 30,
            quadratic: false,
            minBalance: 0,
            asset: null,
            hatIds: [],
          },
          {
            id: uuidv4(),
            strategy: VOTING_STRATEGY.ERC20_BAL,
            slicePct: 70,
            quadratic: false,
            minBalance: 0,
            asset: null,
            hatIds: [],
          },
        ],
      };

    case 'hybrid':
      return {
        mode: 'HYBRID',
        hybridQuorum: 50,
        ddQuorum: 50,
        quadraticEnabled: false,
        democracyWeight: 50,
        participationWeight: 50,
        classes: [
          {
            id: uuidv4(),
            strategy: VOTING_STRATEGY.DIRECT,
            slicePct: 50,
            quadratic: false,
            minBalance: 0,
            asset: null,
            hatIds: [],
          },
          {
            id: uuidv4(),
            strategy: VOTING_STRATEGY.ERC20_BAL,
            slicePct: 50,
            quadratic: false,
            minBalance: 0,
            asset: null,
            hatIds: [],
          },
        ],
      };

    case 'democratic':
    default:
      return {
        mode: 'DIRECT',
        hybridQuorum: 60,
        ddQuorum: 60,
        quadraticEnabled: false,
        democracyWeight: 100,
        participationWeight: 0,
        classes: [
          {
            id: uuidv4(),
            strategy: VOTING_STRATEGY.DIRECT,
            slicePct: 100,
            quadratic: false,
            minBalance: 0,
            asset: null,
            hatIds: [],
          },
        ],
      };
  }
}

/**
 * Map voting configuration to slider value
 * Reverse mapping for displaying current state
 */
export function votingConfigToSlider(voting) {
  if (!voting) return 50;

  // Pure direct democracy
  if (voting.mode === 'DIRECT' || voting.democracyWeight >= 90) {
    return 85; // Democratic range
  }

  // High participation weight (delegated)
  if (voting.participationWeight >= 70) {
    return 15; // Delegated range
  }

  // Balanced (hybrid)
  if (voting.democracyWeight >= 40 && voting.democracyWeight <= 60) {
    return 50; // Hybrid center
  }

  // Map based on democracy weight
  // 0% democracy = 0 slider, 100% democracy = 100 slider
  return Math.round(voting.democracyWeight);
}

/**
 * Get permission adjustments based on philosophy
 * Returns which roles should have DD voting/creation permissions
 */
export function getPhilosophyPermissionHints(sliderValue, roles) {
  const type = getPhilosophyType(sliderValue);
  const roleCount = roles.length;

  // Find the "leader" role (first top-level role)
  const leaderRoleIndex = roles.findIndex(r => r.hierarchy.adminRoleIndex === null);

  switch (type) {
    case 'delegated':
      // Only leaders create polls, all can vote
      return {
        ddCreatorRoles: leaderRoleIndex >= 0 ? [leaderRoleIndex] : [roleCount - 1],
        ddVotingRoles: roles.map((_, i) => i),
      };

    case 'hybrid':
    case 'democratic':
    default:
      // Everyone can create and vote
      return {
        ddCreatorRoles: roles.map((_, i) => i),
        ddVotingRoles: roles.map((_, i) => i),
      };
  }
}

/**
 * Get a human-readable summary of the voting setup
 */
export function describeVotingSetup(voting) {
  if (!voting) return 'No voting configured';

  if (voting.mode === 'DIRECT') {
    return 'One person, one vote. Every member has equal say.';
  }

  const ddWeight = voting.democracyWeight || 50;
  const partWeight = voting.participationWeight || 50;

  if (ddWeight >= 70) {
    return `Mostly democratic (${ddWeight}% direct votes, ${partWeight}% participation).`;
  }

  if (partWeight >= 70) {
    return `Contribution-weighted (${partWeight}% participation, ${ddWeight}% direct votes).`;
  }

  return `Balanced (${ddWeight}% direct democracy, ${partWeight}% participation).`;
}

export default {
  PHILOSOPHY_RANGES,
  getPhilosophyType,
  getPhilosophyInfo,
  sliderToVotingConfig,
  votingConfigToSlider,
  getPhilosophyPermissionHints,
  describeVotingSetup,
};
