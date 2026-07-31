import { describe, it, expect } from 'vitest';
import {
  configError,
  detailsError,
  hasChosenIntent,
  isComplete,
} from './proposalChecks';

const RECIPIENT = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';
const OTHER = '0x0000000000000000000000000000000000000123';
const ZERO = '0x0000000000000000000000000000000000000000';
// Same address, every letter's case flipped — a checksum that cannot validate.
const BAD_CHECKSUM = '0x' + RECIPIENT.slice(2).replace(
  /[a-zA-Z]/g,
  (c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()),
);

/** The minimum a type needs before the wizard lets it off the config screen. */
const validConfig = {
  normal: {},
  transferFunds: { transferAddress: RECIPIENT, transferAmount: '250' },
  setter: { setterMode: 'template', setterTemplate: 'change-threshold-hybrid' },
  election: {
    electionRoleId: '0x01',
    electionCandidates: [
      { name: 'alice', address: RECIPIENT },
      { name: 'bob', address: OTHER },
    ],
  },
  createRole: { roleConfig: { parentHatId: '0x01', name: 'Treasurer', maxSupply: 100 } },
};

const withType = (type, overrides = {}) => ({ type, ...validConfig[type], ...overrides });

describe('configError — happy path', () => {
  it('returns null for every type once its config is present', () => {
    for (const type of Object.keys(validConfig)) {
      expect(configError(withType(type)), type).toBeNull();
    }
  });

  it('returns null for an unrecognised type and for a missing proposal', () => {
    expect(configError({ type: 'somethingNew' })).toBeNull();
    expect(configError({})).toBeNull();
    expect(configError(undefined)).toBeNull();
  });
});

describe('configError — transferFunds', () => {
  it('needs a recipient', () => {
    expect(configError(withType('transferFunds', { transferAddress: '' })))
      .toBe('Please enter a valid recipient address.');
  });

  it('rejects a malformed or mis-checksummed recipient', () => {
    for (const bad of ['0x123', 'not-an-address', BAD_CHECKSUM]) {
      expect(configError(withType('transferFunds', { transferAddress: bad })))
        .toBe('Please enter a valid recipient address.');
    }
  });

  it('needs a positive amount', () => {
    for (const bad of ['', '0', '-5', 'abc', undefined]) {
      expect(configError(withType('transferFunds', { transferAmount: bad })))
        .toBe('Please enter a valid transfer amount.');
    }
  });

  it('accepts a fractional amount', () => {
    expect(configError(withType('transferFunds', { transferAmount: '0.5' }))).toBeNull();
  });

  it('reports the address before the amount', () => {
    const broken = withType('transferFunds', { transferAddress: '', transferAmount: '' });
    expect(configError(broken)).toBe('Please enter a valid recipient address.');
  });
});

describe('configError — setter', () => {
  it('needs a template in template mode', () => {
    expect(configError(withType('setter', { setterTemplate: '' })))
      .toBe('Please select an action from the templates.');
  });

  it('defaults to template mode when no mode is set', () => {
    expect(configError({ type: 'setter' })).toBe('Please select an action from the templates.');
  });

  it('needs a contract and a function in advanced mode', () => {
    const advanced = { type: 'setter', setterMode: 'advanced' };
    expect(configError(advanced)).toBe('Please select a target contract.');
    expect(configError({ ...advanced, setterContract: 'hybridVoting' }))
      .toBe('Please select a function to call.');
    expect(configError({ ...advanced, setterContract: 'hybridVoting', setterFunction: 'setConfig' }))
      .toBeNull();
  });

  it('ignores a stale template when advanced mode is on', () => {
    expect(configError({ type: 'setter', setterMode: 'advanced', setterTemplate: 'change-threshold-hybrid' }))
      .toBe('Please select a target contract.');
  });

  // Per-input ranges and voting-class weights stay submit-side on purpose —
  // blocking a wizard step on them is follow-up work, not this gate's job.
  it('does not gate on unfilled template inputs', () => {
    expect(configError(withType('setter', { setterValues: {} }))).toBeNull();
  });
});

describe('configError — election', () => {
  it('needs a role', () => {
    expect(configError(withType('election', { electionRoleId: '' })))
      .toBe('Please select a role for this election.');
  });

  it('needs two candidates normally', () => {
    expect(configError(withType('election', { electionCandidates: [{ name: 'alice', address: RECIPIENT }] })))
      .toBe('An election needs at least 2 candidates.');
    expect(configError(withType('election', { electionCandidates: [] })))
      .toBe('An election needs at least 2 candidates.');
  });

  it('needs only one candidate when voters can reject them all', () => {
    const solo = withType('election', {
      electionIncludeNoOneOption: true,
      electionCandidates: [{ name: 'alice', address: RECIPIENT }],
    });
    expect(configError(solo)).toBeNull();
    expect(configError({ ...solo, electionCandidates: [] }))
      .toBe("An election with the 'No One' option needs at least 1 candidate.");
  });

  // The candidate list IS the config screen, so its row-level errors have to
  // surface here — not from a toast fired two screens later on review.
  it('rejects a candidate with an invalid address', () => {
    const p = withType('election', {
      electionCandidates: [{ name: 'alice', address: RECIPIENT }, { name: 'bob', address: '0xnope' }],
    });
    expect(configError(p)).toBe('"bob" has an invalid address.');
  });

  it('names an unnamed candidate "Unnamed" when its address is bad', () => {
    const p = withType('election', {
      electionCandidates: [{ name: '', address: '' }, { name: 'bob', address: OTHER }],
    });
    expect(configError(p)).toBe('"Unnamed" has an invalid address.');
  });

  it('points the zero address at the reject-all option instead', () => {
    const p = withType('election', {
      electionCandidates: [{ name: 'alice', address: RECIPIENT }, { name: 'bob', address: ZERO }],
    });
    expect(configError(p)).toBe(
      '"bob" uses the zero address. Use the "Allow voters to reject all candidates" option instead.',
    );
  });

  it('requires every candidate to have a name', () => {
    const p = withType('election', {
      electionCandidates: [{ name: 'alice', address: RECIPIENT }, { name: '   ', address: OTHER }],
    });
    expect(configError(p)).toBe('All candidates must have a name.');
  });
});

describe('configError — createRole', () => {
  it('needs a parent role', () => {
    expect(configError(withType('createRole', { roleConfig: { name: 'Treasurer', maxSupply: 1 } })))
      .toBe('Pick which role this new role should sit under.');
    expect(configError({ type: 'createRole' }))
      .toBe('Pick which role this new role should sit under.');
  });

  it('needs a name', () => {
    for (const name of ['', '   ', undefined]) {
      expect(configError(withType('createRole', { roleConfig: { parentHatId: '0x01', name, maxSupply: 1 } })))
        .toBe('Give the new role a name.');
    }
  });

  it('needs a max supply of at least 1 and at most uint32 max', () => {
    const rc = { parentHatId: '0x01', name: 'Treasurer' };
    for (const maxSupply of [0, -1, 'abc', undefined, 4294967296]) {
      expect(configError(withType('createRole', { roleConfig: { ...rc, maxSupply } })))
        .toBe('Max supply must be between 1 and 4,294,967,295.');
    }
    expect(configError(withType('createRole', { roleConfig: { ...rc, maxSupply: 1 } }))).toBeNull();
    expect(configError(withType('createRole', { roleConfig: { ...rc, maxSupply: 4294967295 } }))).toBeNull();
  });

  // Duplicate wearers and project-permission uniqueness stay submit-side.
  it('does not gate on wearer or project-permission rows', () => {
    const p = withType('createRole', {
      roleConfig: {
        parentHatId: '0x01',
        name: 'Treasurer',
        maxSupply: 100,
        initialWearers: [{ address: RECIPIENT }, { address: RECIPIENT }],
        projectPerms: [{ projectId: 'p1' }, { projectId: 'p1' }],
      },
    });
    expect(configError(p)).toBeNull();
  });
});

describe('detailsError', () => {
  const poll = { type: 'normal', name: 'Lunch?', time: 72, options: ['Tacos', 'Ramen'] };

  it('passes a filled-in poll', () => {
    expect(detailsError(poll)).toBeNull();
  });

  it('needs a title', () => {
    for (const name of ['', '   ', undefined]) {
      expect(detailsError({ ...poll, name })).toBe('Please enter a title for your proposal.');
    }
  });

  // Mirrors validateBasicFields: submit synthesises a title from the template
  // preview, so the wizard must not be stricter than submit.
  it('exempts a template setter from the title requirement', () => {
    expect(detailsError({ type: 'setter', setterMode: 'template', setterTemplate: 'x', time: 72 }))
      .toBeNull();
    expect(detailsError({ type: 'setter', setterMode: 'advanced', setterFunction: 'setConfig', time: 72 }))
      .toBe('Please enter a title for your proposal.');
  });

  it('needs a positive duration', () => {
    for (const time of [0, -1, '', 'abc', undefined]) {
      expect(detailsError({ ...poll, time }))
        .toBe('Please enter a valid duration in hours (must be greater than 0).');
    }
  });

  it('needs two non-blank options — but only for a basic poll', () => {
    expect(detailsError({ ...poll, options: ['Tacos', '  '] }))
      .toBe('Please provide at least 2 voting options.');
    expect(detailsError({ ...poll, options: [] }))
      .toBe('Please provide at least 2 voting options.');
    expect(detailsError({ type: 'transferFunds', name: 'Pay the auditor', time: 72, options: [] }))
      .toBeNull();
  });

  it('blocks a restriction with an empty allowlist, which would silently mean "everyone"', () => {
    expect(detailsError({ ...poll, isRestricted: true, restrictedHatIds: [] })).toBe(
      "You restricted who can vote but didn't pick any roles. Select at least one, or turn restriction off.",
    );
    expect(detailsError({ ...poll, isRestricted: true, restrictedHatIds: ['0x01'] })).toBeNull();
  });
});

describe('hasChosenIntent', () => {
  // defaultProposal.type is "normal", so Boolean(type) is true on a fresh form —
  // the exact reason the intent gallery never rendered.
  it('is false for the pristine default proposal', () => {
    expect(hasChosenIntent({ type: 'normal', name: '', description: '', options: ['', ''] }))
      .toBe(false);
  });

  it('is false when no type is set at all', () => {
    expect(hasChosenIntent({ type: '' })).toBe(false);
    expect(hasChosenIntent({})).toBe(false);
    expect(hasChosenIntent(undefined)).toBe(false);
  });

  it('is true for any type the user had to pick a card for', () => {
    for (const type of ['transferFunds', 'setter', 'election', 'createRole']) {
      expect(hasChosenIntent({ type }), type).toBe(true);
    }
  });

  it('is true once a basic poll carries any of the user\'s own content', () => {
    expect(hasChosenIntent({ type: 'normal', name: 'Lunch?' })).toBe(true);
    expect(hasChosenIntent({ type: 'normal', description: 'Pick one' })).toBe(true);
    expect(hasChosenIntent({ type: 'normal', options: ['Tacos', ''] })).toBe(true);
    expect(hasChosenIntent({ type: 'normal', name: '   ', options: ['  ', ''] })).toBe(false);
  });
});

describe('isComplete', () => {
  const done = { type: 'normal', name: 'Lunch?', time: 72, options: ['Tacos', 'Ramen'] };

  it('reads each step off the matching check', () => {
    expect(isComplete('intent', done)).toBe(true);
    expect(isComplete('config', done)).toBe(true);
    expect(isComplete('details', done)).toBe(true);
    expect(isComplete('review', done)).toBe(true);
  });

  it('is false for an unknown step', () => {
    expect(isComplete('nope', done)).toBe(false);
  });

  it('fails review when the config is broken, even though details are fine', () => {
    const p = { type: 'election', name: 'Election for Executive', time: 72, electionRoleId: '' };
    expect(isComplete('details', p)).toBe(true);
    expect(isComplete('config', p)).toBe(false);
    expect(isComplete('review', p)).toBe(false);
  });

  // detailsError lets a template setter submit without a hand-typed title
  // (submit synthesises one). Entry resolution must still stop on details, or a
  // `?propose=` deep link would jump the user straight to review.
  it('does not count details as done for a titleless setter, though submit would allow it', () => {
    const p = { type: 'setter', setterMode: 'template', setterTemplate: 'change-threshold-hybrid', time: 72, name: '' };
    expect(detailsError(p)).toBeNull();
    expect(isComplete('details', p)).toBe(false);
    expect(isComplete('details', { ...p, name: 'Change support threshold (Blended voting)' })).toBe(true);
  });

  it('fails review when the details are broken, even though config is fine', () => {
    const p = { ...withType('transferFunds'), name: '', time: 72 };
    expect(isComplete('config', p)).toBe(true);
    expect(isComplete('details', p)).toBe(false);
    expect(isComplete('review', p)).toBe(false);
  });
});
