import { describe, it, expect } from 'vitest';
import {
  availableTemplates,
  availableRawFunctions,
  isTemplateAvailable,
  templateUnavailableReason,
  applyAccessCopy,
  resolveSetterTemplate,
  getAvailableTemplateById,
} from './setterAvailability';
import { OPEN_RIGHTS_TEMPLATE } from './voteOpenRights';
import {
  SETTER_TEMPLATES,
  RAW_FUNCTIONS,
  CONTRACT_MAP,
  getTemplateById,
} from '@/config/setterDefinitions';

/**
 * A migrated org's addresses. `membershipAuthorityAddress` is present ONLY when the authority is
 * live and router-bound — the caller derives it from `useOrgAuthority()`.
 */
const V2_ADDRESSES = {
  votingContractAddress: `0x${'aa'.repeat(20)}`,
  directDemocracyVotingContractAddress: `0x${'bb'.repeat(20)}`,
  taskManagerContractAddress: `0x${'cc'.repeat(20)}`,
  participationTokenAddress: `0x${'dd'.repeat(20)}`,
  zkEmailInvitesAddress: `0x${'ee'.repeat(20)}`,
  membershipAuthorityAddress: `0x${'11'.repeat(20)}`,
};

const LEGACY_ADDRESSES = { ...V2_ADDRESSES, membershipAuthorityAddress: undefined };

const idsFor = (ctx) => availableTemplates({ templates: SETTER_TEMPLATES, ...ctx }).map((t) => t.id);

/** The three that still succeed on a v2 org while changing nothing the contracts read. */
const DEAD_ON_V2 = ['allow-proposal-creator-hybrid', 'allow-voter-dd', 'set-project-permissions'];

describe('the flags are declared where the lib expects them', () => {
  it('marks exactly the three silently-dead templates legacyOnly', () => {
    const flagged = SETTER_TEMPLATES.filter((t) => t.legacyOnly).map((t) => t.id);
    expect(flagged.sort()).toEqual([...DEAD_ON_V2].sort());
  });

  it('marks exactly the authority template v2Only', () => {
    expect(SETTER_TEMPLATES.filter((t) => t.v2Only).map((t) => t.id))
      .toEqual(['edit-role-permissions']);
  });

  // These stay LIVE on v2, so they must NOT be filtered — but the ids they write are authority
  // subject ids, which is a copy problem, not an availability one.
  it('marks the live-but-subject-id templates idsAreSubjects and leaves them offered', () => {
    const flagged = SETTER_TEMPLATES.filter((t) => t.idsAreSubjects).map((t) => t.id);
    expect(flagged.sort()).toEqual(['allow-organizer-hat', 'allow-task-creator', 'change-voting-split']);
    for (const id of flagged) {
      expect(isTemplateAvailable(getTemplateById(id), {
        authorityEnabled: true, contractAddresses: V2_ADDRESSES,
      }), id).toBe(true);
    }
  });

  it('never flags a template both ways', () => {
    for (const t of SETTER_TEMPLATES) {
      expect(Boolean(t.legacyOnly && t.v2Only), t.id).toBe(false);
    }
  });
});

describe('availableTemplates', () => {
  it('hides the silently-dead actions once the authority is live', () => {
    const ids = idsFor({ authorityEnabled: true, contractAddresses: V2_ADDRESSES });
    for (const dead of DEAD_ON_V2) expect(ids, dead).not.toContain(dead);
  });

  it('still offers them on a legacy org — they work there', () => {
    const ids = idsFor({ authorityEnabled: false, contractAddresses: LEGACY_ADDRESSES });
    for (const dead of DEAD_ON_V2) expect(ids, dead).toContain(dead);
  });

  it('offers the v2 replacement only on a v2 org', () => {
    expect(idsFor({ authorityEnabled: true, contractAddresses: V2_ADDRESSES }))
      .toContain('edit-role-permissions');
    expect(idsFor({ authorityEnabled: false, contractAddresses: LEGACY_ADDRESSES }))
      .not.toContain('edit-role-permissions');
  });

  // The whole contract of useOrgAuthority: `enabled === false` renders exactly what shipped.
  it('changes nothing else for a legacy org', () => {
    const before = SETTER_TEMPLATES.filter((t) => !t.v2Only).map((t) => t.id);
    expect(idsFor({ authorityEnabled: false, contractAddresses: LEGACY_ADDRESSES })).toEqual(before);
  });

  it('keeps the deployed-contract check — an org without the module never sees it', () => {
    const ids = idsFor({
      authorityEnabled: false,
      contractAddresses: { ...LEGACY_ADDRESSES, zkEmailInvitesAddress: '' },
    });
    expect(ids).not.toContain('email-invites');
  });

  // The address is the ONLY thing that distinguishes "authority live" from "org still on hats"
  // for the contract check, so a v2 flag with no address must not sneak the template through.
  it('hides the v2 template when the authority address is missing', () => {
    expect(idsFor({ authorityEnabled: true, contractAddresses: LEGACY_ADDRESSES }))
      .not.toContain('edit-role-permissions');
  });

  it('treats a zero authority address as not deployed', () => {
    expect(idsFor({
      authorityEnabled: true,
      contractAddresses: { ...V2_ADDRESSES, membershipAuthorityAddress: `0x${'0'.repeat(40)}` },
    })).not.toContain('edit-role-permissions');
  });

  it('skips the contract check when no addresses are supplied, as callers already relied on', () => {
    const ids = idsFor({ authorityEnabled: false, contractAddresses: null });
    expect(ids).toContain('email-invites');
    expect(ids).not.toContain('edit-role-permissions'); // flags still apply
  });

  it('defaults to the shipped template list', () => {
    expect(availableTemplates().length).toBeGreaterThan(0);
    expect(availableTemplates().map((t) => t.id)).not.toContain('edit-role-permissions');
  });
});

describe('templateUnavailableReason', () => {
  it('explains a dead action in the member voice, and names the replacement', () => {
    const reason = templateUnavailableReason(getTemplateById('allow-voter-dd'), {
      authorityEnabled: true, contractAddresses: V2_ADDRESSES,
    });
    expect(reason).toMatch(/no longer/i);
    expect(reason).toContain('Change what a role can do');
  });

  it('explains a v2 action on a legacy org', () => {
    const reason = templateUnavailableReason(getTemplateById('edit-role-permissions'), {
      authorityEnabled: false, contractAddresses: LEGACY_ADDRESSES,
    });
    expect(reason).toMatch(/roles and permissions/i);
  });

  it('names the missing contract by its display name', () => {
    const reason = templateUnavailableReason(getTemplateById('email-invites'), {
      authorityEnabled: false, contractAddresses: { ...LEGACY_ADDRESSES, zkEmailInvitesAddress: '' },
    });
    expect(reason).toContain(CONTRACT_MAP.zkEmailInvites.displayName);
  });

  it('is null for an available template', () => {
    expect(templateUnavailableReason(getTemplateById('change-quorum-hybrid'), {
      authorityEnabled: true, contractAddresses: V2_ADDRESSES,
    })).toBeNull();
  });
});

// The /rules panel offers "Propose a change" buttons that deep-link straight to a template id.
// Both of its ids are silently dead on a v2 org, so the deep link has to resolve to a REFUSAL —
// not to a working wizard that stages a vote which passes and changes nothing.
describe('deep links (OPEN_RIGHTS_TEMPLATE and ?propose=)', () => {
  const v2 = { authorityEnabled: true, contractAddresses: V2_ADDRESSES };
  const legacy = { authorityEnabled: false, contractAddresses: LEGACY_ADDRESSES };

  it('both /rules deep links point at legacyOnly templates', () => {
    for (const id of Object.values(OPEN_RIGHTS_TEMPLATE)) {
      expect(getTemplateById(id)?.legacyOnly, id).toBe(true);
    }
  });

  it('resolves them as unavailable WITH a reason on a v2 org', () => {
    for (const id of Object.values(OPEN_RIGHTS_TEMPLATE)) {
      const resolved = resolveSetterTemplate(id, v2);
      expect(resolved.available, id).toBe(false);
      expect(typeof resolved.reason, id).toBe('string');
      // The template object is still returned so a caller can name it in the message.
      expect(resolved.template?.id, id).toBe(id);
    }
  });

  it('getAvailableTemplateById hands back a clear null, never a dead template', () => {
    for (const id of Object.values(OPEN_RIGHTS_TEMPLATE)) {
      expect(getAvailableTemplateById(id, v2), id).toBeNull();
      expect(getAvailableTemplateById(id, legacy)?.id, id).toBe(id);
    }
  });

  it('separates "unknown id" from "known but not here"', () => {
    const unknown = resolveSetterTemplate('no-such-template', v2);
    expect(unknown.template).toBeNull();
    expect(unknown.available).toBe(false);
    expect(unknown.reason).toMatch(/no longer available/i);
  });
});

describe('access-v2 copy', () => {
  const v2 = { authorityEnabled: true, contractAddresses: V2_ADDRESSES };

  it('corrects the legend on the live-but-subject-id templates', () => {
    const t = getAvailableTemplateById('allow-task-creator', v2);
    expect(t.inputs.find((i) => i.name === 'role').helpText)
      .toBe(getTemplateById('allow-task-creator').inputs.find((i) => i.name === 'role').v2HelpText);
    expect(t.description).toBe(getTemplateById('allow-task-creator').v2Description);
  });

  it('leaves the legacy copy untouched on a legacy org', () => {
    const shipped = getTemplateById('allow-task-creator');
    const t = getAvailableTemplateById('allow-task-creator', {
      authorityEnabled: false, contractAddresses: LEGACY_ADDRESSES,
    });
    // Referentially identical: a legacy render must not even churn a useMemo.
    expect(t).toBe(shipped);
    expect(t.inputs.find((i) => i.name === 'role').helpText).toBe('Select which role to modify');
  });

  it('never mutates the shipped definitions', () => {
    const shipped = getTemplateById('allow-organizer-hat');
    const before = JSON.stringify(shipped.inputs.map((i) => i.helpText));
    applyAccessCopy(shipped, true);
    expect(JSON.stringify(shipped.inputs.map((i) => i.helpText))).toBe(before);
  });

  it('returns the original object when there is nothing to swap', () => {
    const shipped = getTemplateById('change-quorum-dd');
    expect(applyAccessCopy(shipped, true)).toBe(shipped);
  });
});

describe('availableRawFunctions', () => {
  it('drops the dead raw entries on a v2 org', () => {
    const fns = availableRawFunctions({ rawFunctions: RAW_FUNCTIONS, authorityEnabled: true });
    expect(fns.hybridVoting.map((f) => f.name)).not.toContain('setCreatorHatAllowed');
    expect(fns.taskManager.map((f) => f.name)).not.toContain('setProjectRolePerm');
  });

  it('keeps them on a legacy org', () => {
    const fns = availableRawFunctions({ rawFunctions: RAW_FUNCTIONS, authorityEnabled: false });
    expect(fns.hybridVoting.map((f) => f.name)).toContain('setCreatorHatAllowed');
    expect(fns.taskManager.map((f) => f.name)).toContain('setProjectRolePerm');
    for (const [key, list] of Object.entries(RAW_FUNCTIONS)) {
      expect(fns[key].map((f) => f.name), key).toEqual(list.map((f) => f.name));
    }
  });

  // setConfig is only PARTLY dead — dropping it would take THRESHOLD and QUORUM with it.
  it('annotates the partly-dead setConfig entries instead of removing them', () => {
    const fns = availableRawFunctions({ rawFunctions: RAW_FUNCTIONS, authorityEnabled: true });
    const dd = fns.directDemocracyVoting.find((f) => f.name === 'setConfig');
    const tm = fns.taskManager.find((f) => f.name === 'setConfig');
    expect(dd.description).toContain('HAT_ALLOWED');
    expect(tm.description).toContain('ROLE_PERM');
    // …and the annotation never leaks onto a legacy org.
    const legacy = availableRawFunctions({ rawFunctions: RAW_FUNCTIONS, authorityEnabled: false });
    expect(legacy.directDemocracyVoting.find((f) => f.name === 'setConfig').description)
      .toBe('Set a configuration value');
  });

  it('keeps every contract key so the caller can do its own emptiness check', () => {
    const fns = availableRawFunctions({ rawFunctions: RAW_FUNCTIONS, authorityEnabled: true });
    expect(Object.keys(fns)).toEqual(Object.keys(RAW_FUNCTIONS));
  });

  it('leaves the shipped definitions unmutated', () => {
    availableRawFunctions({ rawFunctions: RAW_FUNCTIONS, authorityEnabled: true });
    expect(RAW_FUNCTIONS.taskManager.find((f) => f.name === 'setConfig').description)
      .toBe('Set a configuration value');
  });
});
