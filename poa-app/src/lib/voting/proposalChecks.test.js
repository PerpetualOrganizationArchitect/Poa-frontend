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
  setter: {
    setterMode: 'template',
    setterTemplate: 'change-threshold-hybrid',
    // A template is not configured until its params are answered — submit
    // rejects an unfilled one, so the config gate matches submit rather than
    // waving it past and toasting a screen later.
    setterValues: { threshold: '60' },
  },
  election: {
    electionRoleId: '0x01',
    electionCandidates: [
      { name: 'alice', address: RECIPIENT },
      { name: 'bob', address: OTHER },
    ],
  },
  createRole: { roleConfig: { parentHatId: '0x01', name: 'Treasurer', maxSupply: 100 } },
  removeRoleMembers: {
    roleRemovalConfig: {
      subjectId: '1',
      subjectName: 'Contributors',
      members: [{ address: RECIPIENT, username: 'alice', ban: false }],
      liveReconciled: true,
    },
  },
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

  it('gates on unfilled template inputs, naming the missing one', () => {
    expect(configError(withType('setter', { setterValues: {} })))
      .toBe('Please provide a value for "Threshold Percentage".');
  });

  it('lets a zero-parameter template straight through', () => {
    // The Emergency Controls templates take no inputs; there is nothing to fill.
    expect(configError({
      type: 'setter', setterMode: 'template', setterTemplate: 'pause-hybrid-voting',
    })).toBeNull();
  });

  it('treats 0 as an answer, not an empty field', () => {
    expect(configError(withType('setter', { setterValues: { threshold: 0 } }))).toBeNull();
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

  // ACCESS V2 — the configurator stops rendering the parent picker (a subject has no hierarchy),
  // so gating on it would lock the step behind a field nobody can fill.
  const v2 = { accessV2: { enabled: true } };

  it('does not ask a v2 org for a parent role', () => {
    expect(configError(withType('createRole', { roleConfig: { name: 'Treasurer', maxSupply: 1 } }), v2))
      .toBeNull();
  });

  it('still needs a name on a v2 org', () => {
    expect(configError(withType('createRole', { roleConfig: { name: '  ', maxSupply: 1 } }), v2))
      .toBe('Give the new role a name.');
  });

  it('lets a v2 seat limit be 0 (no limit) but not negative or over uint32', () => {
    const rc = { name: 'Treasurer' };
    expect(configError(withType('createRole', { roleConfig: { ...rc, maxSupply: 0 } }), v2)).toBeNull();
    expect(configError(withType('createRole', { roleConfig: { ...rc, maxSupply: 4294967295 } }), v2)).toBeNull();
    // A draft that never carried a cap is “no limit” on v2 (0), not an error about a hidden input.
    expect(configError(withType('createRole', { roleConfig: { ...rc, maxSupply: undefined } }), v2)).toBeNull();
    for (const maxSupply of [-1, 'abc', 4294967296]) {
      expect(configError(withType('createRole', { roleConfig: { ...rc, maxSupply } }), v2))
        .toBe('The seat limit must be a whole number from 0 (no limit) to 4,294,967,295.');
    }
  });

  it('leaves the legacy gate exactly as it was when the flag is off or absent', () => {
    const legacy = withType('createRole', { roleConfig: { name: 'Treasurer', maxSupply: 1 } });
    for (const ctx of [null, {}, { accessV2: { enabled: false } }]) {
      expect(configError(legacy, ctx)).toBe('Pick which role this new role should sit under.');
    }
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

/**
 * ACCESS V2 — the config screen is `components/accessV2/RoleForm`, writing `proposal.roleFormV2`,
 * and it can make a GROUP as well as a role. The gate is `roleFormError` over the SAME form
 * `buildProposalData` encodes, so "the step says it's ready" and "the batch is buildable" cannot
 * come apart.
 */
describe('configError — createRole on an access-v2 org', () => {
  const v2 = { accessV2: { enabled: true } };
  const form = (overrides = {}) => withType('createRole', {
    roleConfig: {},
    roleFormV2: { kind: 'role', name: 'Treasurer', ...overrides },
  });

  it('passes a named role and a named group', () => {
    expect(configError(form(), v2)).toBeNull();
    expect(configError(form({ kind: 'group', memberRoleIds: ['1'] }), v2)).toBeNull();
  });

  it('asks for the name in the language of the thing being made', () => {
    expect(configError(form({ name: '  ' }), v2)).toBe('Give the new role a name.');
    expect(configError(form({ kind: 'group', name: '' }), v2)).toBe('Give the new group a name.');
  });

  it('gates the decisions that only exist on the new screen', () => {
    expect(configError(form({ limitSeats: true, maxMembers: -1 }), v2))
      .toBe('The seat limit must be a whole number from 0 (no limit) to 4,294,967,295.');
    expect(configError(form({ bindingVote: true, bindingClassIdx: null }), v2))
      .toBe('Pick which group of voters this role joins.');
    expect(configError(form({ vouching: { enabled: true, quorum: 1, voucherSubjectId: '' } }), v2))
      .toBe('Pick the role whose members can vouch, or let the new role vouch for itself.');
    expect(configError(form({ holders: [{ address: '0x123', name: 'Ann' }] }), v2))
      .toBe('"Ann" has an invalid address.');
  });

  it('judges a pre-v2 draft on the legacy fields it actually carries', () => {
    // `restoreProposal` merges an old draft over defaultProposal, so `roleFormV2` is present but
    // blank while `roleConfig` holds everything the member entered.
    const draft = withType('createRole', {
      roleConfig: { parentHatId: '0x01', name: 'Treasurer', maxSupply: 5 },
      roleFormV2: { kind: 'role', name: '' },
    });
    expect(configError(draft, v2)).toBeNull();
  });

  it('leaves the legacy gate exactly as it was when the flag is off', () => {
    const legacy = form();
    for (const ctx of [null, {}, { accessV2: { enabled: false } }]) {
      expect(configError(legacy, ctx)).toBe('Pick which role this new role should sit under.');
    }
  });
});

describe('configError — removeRoleMembers', () => {
  it('fails closed on a legacy or still-unresolved organization', () => {
    expect(configError(withType('removeRoleMembers'), { accessV2: { enabled: false } }))
      .toBe('Role-removal votes are available after this group moves to the new roles system.');
    expect(configError(withType('removeRoleMembers'), { accessV2: { enabled: true } })).toBeNull();
  });

  it('requires a role and at least one current role holder', () => {
    expect(configError(withType('removeRoleMembers', {
      roleRemovalConfig: { subjectId: '', members: [] },
    }))).toBe('Please select a role.');
    expect(configError(withType('removeRoleMembers', {
      roleRemovalConfig: { subjectId: '1', members: [], liveReconciled: true },
    }))).toBe('Select at least one person to remove.');
  });

  it('rejects malformed and duplicate member addresses from restored drafts', () => {
    expect(configError(withType('removeRoleMembers', {
      roleRemovalConfig: {
        subjectId: '1',
        members: [{ address: 'not-an-address' }],
        liveReconciled: true,
      },
    }))).toBe('One of the selected people has an invalid address.');
    expect(configError(withType('removeRoleMembers', {
      roleRemovalConfig: {
        subjectId: '1',
        members: [{ address: RECIPIENT }, { address: RECIPIENT.toLowerCase() }],
        liveReconciled: true,
      },
    }))).toBe('The same person cannot be selected twice.');
  });

  it('requires explicit confirmation before a governance-block removal can advance', () => {
    const roleRemovalConfig = {
      subjectId: '1',
      subjectName: 'Contributors',
      members: [{ address: RECIPIENT, username: 'alice', ban: true }],
      confirmBans: false,
      liveReconciled: true,
    };
    expect(configError(withType('removeRoleMembers', { roleRemovalConfig }))).toBe(
      'Confirm that the required blocks should prevent those people from reclaiming this role.',
    );
    expect(configError(withType('removeRoleMembers', {
      roleRemovalConfig: { ...roleRemovalConfig, confirmBans: true },
    }))).toBeNull();
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
    for (const type of ['transferFunds', 'setter', 'election', 'createRole', 'removeRoleMembers']) {
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

// ---------------------------------------------------------------------------
// transferFunds with live facts (asset precision + what the group can pay out)
// ---------------------------------------------------------------------------
describe('configError(transferFunds, ctx)', () => {
  const usdc = (extra = {}) => ({
    transfer: { decimals: 6, symbol: 'USDC', loading: false, availableWei: '5000000', overLimitMessage: 'Only 5 USDC can go out in one vote.', ...extra },
  });

  it('is unchanged without a ctx', () => {
    expect(configError(withType('transferFunds'))).toBeNull();
  });

  it('refuses an amount finer than the asset', () => {
    expect(configError(withType('transferFunds', { transferAmount: '0.0000001' }), usdc()))
      .toBe('USDC only supports 6 decimal places.');
  });

  it('refuses more than any pot holds, naming the ceiling', () => {
    expect(configError(withType('transferFunds', { transferAmount: '6' }), usdc()))
      .toBe('Only 5 USDC can go out in one vote.');
    expect(configError(withType('transferFunds', { transferAmount: '5' }), usdc())).toBeNull();
  });

  it('does not refuse while the balances are still loading or unknown', () => {
    expect(configError(withType('transferFunds', { transferAmount: '6' }), usdc({ loading: true }))).toBeNull();
    expect(configError(withType('transferFunds', { transferAmount: '6' }), usdc({ availableWei: null }))).toBeNull();
  });

  it('threads the ctx through isComplete for the config and review steps', () => {
    const p = withType('transferFunds', { transferAmount: '6', name: 'x', time: 24 });
    expect(isComplete('config', p)).toBe(true);
    expect(isComplete('config', p, usdc())).toBe(false);
    expect(isComplete('review', p, usdc())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// setter templates that this org can no longer propose
// ---------------------------------------------------------------------------
describe('configError(setter) on an access-v2 org', () => {
  it('refuses a legacy-only template once the authority is live, with the member-facing reason', () => {
    const p = withType('setter', { setterTemplate: 'allow-voter-dd', setterValues: { role: '1', hatType: '0', allowed: 'Grant' } });
    expect(configError(p)).toBeNull();
    expect(configError(p, { accessV2: { enabled: false } })).toBeNull();
    expect(configError(p, { accessV2: { enabled: true } })).toMatch(/no longer how this group works/);
  });

  it('refuses a v2-only template on a legacy org', () => {
    const p = withType('setter', { setterTemplate: 'edit-role-permissions', setterValues: { subjectId: '1', perms: { DD_VOTE: true }, permsCurrent: {} } });
    expect(configError(p, { accessV2: { enabled: false } })).toMatch(/hasn’t moved to yet/);
  });
});

describe('configError(transferFunds) when the balance read failed', () => {
  it('fails closed instead of guessing a pot', () => {
    const p = withType('transferFunds', { transferAmount: '1' });
    expect(configError(p, { transfer: { decimals: 18, symbol: 'BREAD', loading: false, readFailed: true, availableWei: '0' } }))
      .toBe("Couldn't read what the group holds — try again in a moment.");
  });

  it('fails closed when the treasury has more payout rounds than were read', () => {
    const p = withType('transferFunds', { transferAddress: '0x000000000000000000000000000000000000dEaD', transferAmount: '1' });
    expect(configError(p, { transfer: { decimals: 18, symbol: 'BREAD', loading: false, readFailed: false, roundsUnread: true, availableWei: '5000000000000000000' } }))
      .toMatch(/more payout rounds than can be checked/);
  });
});
