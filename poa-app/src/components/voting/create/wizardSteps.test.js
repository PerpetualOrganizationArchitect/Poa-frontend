import { describe, it, expect } from 'vitest';
import {
  STEP_INTENT,
  STEP_CONFIG,
  STEP_DETAILS,
  STEP_REVIEW,
  CONFIG_TYPES,
  STEP_ERROR_KEYS,
  stepsForType,
  resolveEntryStep,
} from './wizardSteps';
import { isComplete } from '@/lib/voting/proposalChecks';

/** Mirrors `defaultProposal` in useProposalForm — the state of a freshly opened modal. */
const defaultProposal = {
  name: '',
  description: '',
  execution: '',
  time: 72,
  options: ['', ''],
  type: 'normal',
  transferAddress: '',
  transferAmount: '',
  electionCandidates: [],
  electionRoleId: '',
  electionCurrentHolders: [],
  electionSelectedIncumbents: [],
  electionFallbackRoleId: '',
  electionFallbackHolders: [],
  electionIncludeNoOneOption: false,
  isRestricted: false,
  restrictedHatIds: [],
  setterMode: 'template',
  setterTemplate: '',
  setterContract: '',
  setterFunction: '',
  setterValues: {},
  setterParams: [],
  roleConfig: { parentHatId: '', name: '', maxSupply: 100 },
  autoTitle: '',
  autoDescription: '',
  id: 0,
};

const proposal = (overrides) => ({ ...defaultProposal, ...overrides });
const entry = (p) => resolveEntryStep(p, { isComplete });

describe('stepsForType', () => {
  it('gives the basic poll three steps — its options live beside the title', () => {
    expect(stepsForType('normal')).toEqual([STEP_INTENT, STEP_DETAILS, STEP_REVIEW]);
  });

  it('gives every other type a config step of its own', () => {
    for (const type of ['transferFunds', 'setter', 'election', 'createRole']) {
      expect(stepsForType(type)).toEqual([STEP_INTENT, STEP_CONFIG, STEP_DETAILS, STEP_REVIEW]);
    }
  });

  it('stops at the gallery for an unknown or empty type', () => {
    for (const type of ['', null, undefined]) {
      expect(stepsForType(type)).toEqual([STEP_INTENT]);
    }
  });

  it('agrees with CONFIG_TYPES', () => {
    expect([...CONFIG_TYPES].sort()).toEqual(
      ['createRole', 'election', 'setter', 'transferFunds'],
    );
    for (const type of CONFIG_TYPES) {
      expect(stepsForType(type)).toContain(STEP_CONFIG);
    }
    expect(stepsForType('normal')).not.toContain(STEP_CONFIG);
  });

  it('returns a fresh array each call, so callers can never mutate the machine', () => {
    const a = stepsForType('setter');
    a.push('bogus');
    expect(stepsForType('setter')).toEqual([STEP_INTENT, STEP_CONFIG, STEP_DETAILS, STEP_REVIEW]);
  });
});

describe('resolveEntryStep', () => {
  // The regression guard for the original bug: defaultProposal.type is "normal",
  // so anything keying off Boolean(type) skips the gallery on a fresh open.
  it('opens a pristine form on the intent gallery', () => {
    expect(entry(defaultProposal)).toBe(STEP_INTENT);
  });

  it('opens on the gallery when no type has been chosen at all', () => {
    expect(entry(proposal({ type: '' }))).toBe(STEP_INTENT);
    expect(entry(undefined)).toBe(STEP_INTENT);
    expect(entry({})).toBe(STEP_INTENT);
  });

  it('stops a bare ?propose= deep link ON config, where its params are entered', () => {
    // change-threshold-hybrid needs a threshold. Landing past this screen would
    // hide the only field the link left blank.
    const step = entry(proposal({
      type: 'setter', setterMode: 'template', setterTemplate: 'change-threshold-hybrid',
    }));
    expect(step).toBe(STEP_CONFIG);
  });

  it('carries a fully-specified deep link past config to details', () => {
    const step = entry(proposal({
      type: 'setter',
      setterMode: 'template',
      setterTemplate: 'change-threshold-hybrid',
      setterValues: { threshold: '60' },
    }));
    expect(step).toBe(STEP_DETAILS);
  });

  it('carries a setter whose copy is already prefilled all the way to review', () => {
    const p = proposal({
      type: 'setter',
      setterMode: 'template',
      setterTemplate: 'change-threshold-hybrid',
      setterValues: { threshold: '60' },
      name: 'Change support threshold (Blended voting)',
      autoTitle: 'Change support threshold (Blended voting)',
    });
    expect(entry(p)).toBe(STEP_REVIEW);
  });

  it('drops a half-configured setter back on the config screen', () => {
    expect(entry(proposal({ type: 'setter' }))).toBe(STEP_CONFIG);
  });

  it('lands a restored election draft back on its candidate list', () => {
    const draft = proposal({
      type: 'election',
      electionRoleId: '0x01',
      electionCandidates: [{ name: 'alice', address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F' }],
    });
    expect(entry(draft)).toBe(STEP_CONFIG); // one candidate, needs two
  });

  it('carries a complete election draft to details when its title is still empty', () => {
    const draft = proposal({
      type: 'election',
      electionRoleId: '0x01',
      electionCandidates: [
        { name: 'alice', address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F' },
        { name: 'bob', address: '0x0000000000000000000000000000000000000123' },
      ],
    });
    expect(entry(draft)).toBe(STEP_DETAILS);
  });

  it('clamps a fully-complete proposal to the review step', () => {
    const done = proposal({ name: 'Pick a lunch spot', options: ['Tacos', 'Ramen'] });
    expect(entry(done)).toBe(STEP_REVIEW);
  });

  it('stops on the first incomplete step even when a later one is complete', () => {
    // transferFunds with a title but no recipient: details would pass, config does not.
    const p = proposal({ type: 'transferFunds', name: 'Pay the auditor' });
    expect(entry(p)).toBe(STEP_CONFIG);
  });

  it('walks the injected isComplete and never inspects the proposal itself', () => {
    const seen = [];
    const stub = (step) => {
      seen.push(step);
      return step !== STEP_DETAILS;
    };
    expect(resolveEntryStep({ type: 'election' }, { isComplete: stub })).toBe(STEP_DETAILS);
    expect(seen).toEqual([STEP_INTENT, STEP_CONFIG, STEP_DETAILS]);
  });

  it('never asks whether the last step is complete — there is nowhere further to go', () => {
    const seen = [];
    const stub = (step) => { seen.push(step); return true; };
    expect(resolveEntryStep({ type: 'normal' }, { isComplete: stub })).toBe(STEP_REVIEW);
    expect(seen).toEqual([STEP_INTENT, STEP_DETAILS]);
  });
});

describe('STEP_ERROR_KEYS', () => {
  it('covers every step', () => {
    expect(Object.keys(STEP_ERROR_KEYS).sort()).toEqual(
      [STEP_CONFIG, STEP_DETAILS, STEP_INTENT, STEP_REVIEW].sort(),
    );
  });

  it('surfaces nothing on the gallery — there is no field to be wrong', () => {
    expect(STEP_ERROR_KEYS[STEP_INTENT]).toEqual([]);
  });

  it('keeps the transfer fields off the details screen, where they are no longer edited', () => {
    expect(STEP_ERROR_KEYS[STEP_DETAILS]).not.toContain('transferAddress');
    expect(STEP_ERROR_KEYS[STEP_DETAILS]).not.toContain('transferAmount');
    expect(STEP_ERROR_KEYS[STEP_CONFIG]).toEqual(['transferAddress', 'transferAmount']);
  });

  it('makes review the catch-all, so nothing can slip through to submit', () => {
    const everything = new Set([
      ...STEP_ERROR_KEYS[STEP_INTENT],
      ...STEP_ERROR_KEYS[STEP_CONFIG],
      ...STEP_ERROR_KEYS[STEP_DETAILS],
    ]);
    for (const key of everything) {
      expect(STEP_ERROR_KEYS[STEP_REVIEW]).toContain(key);
    }
  });
});

// ---------------------------------------------------------------------------
// Routing: the batch decides the contract, and the intent gallery's badge must
// agree with it.
// ---------------------------------------------------------------------------
import { BINDING_TYPES, isBindingType, votingLaneForBatches } from './wizardSteps';

describe('BINDING_TYPES', () => {
  it('includes every type whose passing option runs a batch — transferFunds too', () => {
    expect([...BINDING_TYPES].sort()).toEqual(['createRole', 'election', 'setter', 'transferFunds']);
    expect(isBindingType('transferFunds')).toBe(true);
    expect(isBindingType('normal')).toBe(false);
  });

  // The intent gallery's `binding` badges are checked against this set at module
  // load (IntentGallery.js throws on a mismatch) — it is JSX, so not imported here.
});

describe('votingLaneForBatches', () => {
  it('sends anything that would execute a call to Blended (Hybrid) voting', () => {
    expect(votingLaneForBatches([[{ target: '0x1', value: '0', data: '0x' }], []])).toBe('hybrid');
    expect(votingLaneForBatches([[], [{ target: '0x1', value: '0', data: '0x' }]])).toBe('hybrid');
  });

  it('sends a batch-less poll to DirectDemocracy', () => {
    expect(votingLaneForBatches([])).toBe('dd');
    expect(votingLaneForBatches([[], []])).toBe('dd');
    expect(votingLaneForBatches(undefined)).toBe('dd');
  });
});
