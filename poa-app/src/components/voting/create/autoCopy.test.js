import { describe, it, expect } from 'vitest';
import {
  applyAutoCopy,
  backfillProvenance,
  LEGACY_TITLE_PREFIXES,
  LEGACY_DESCRIPTION_PREFIXES,
} from './autoCopy';

const GENERATED = {
  title: 'Election for Executive',
  description: 'Election between alice, bob, and carol',
};

describe('applyAutoCopy idempotency (render-loop guard)', () => {
  it('returns {} when the generated copy is already in place', () => {
    const title = 'Send 250 xDAI to 0x71C7…976F';
    const description = 'If this vote passes: send 250 xDAI from the treasury to 0x71C7…976F.';
    const settled = {
      name: title, autoTitle: title,
      description, autoDescription: description,
    };
    expect(applyAutoCopy(settled, { title, description })).toEqual({});
  });

  it('is a fixed point — applying twice changes nothing the second time', () => {
    const title = 'Change support threshold (Blended voting)';
    let proposal = { name: '', autoTitle: '', description: '', autoDescription: '' };
    proposal = { ...proposal, ...applyAutoCopy(proposal, { title }) };
    expect(proposal.name).toBe(title);
    // The second pass is what an effect watching `proposal` would do. If it
    // emits a patch here, that effect never settles.
    expect(applyAutoCopy(proposal, { title })).toEqual({});
  });

  it('still emits when only the description changed', () => {
    const title = 'Change support threshold (Blended voting)';
    const settled = { name: title, autoTitle: title, description: 'old', autoDescription: 'old' };
    expect(applyAutoCopy(settled, { title, description: 'new' }))
      .toEqual({ description: 'new', autoDescription: 'new' });
  });
});

describe('applyAutoCopy', () => {
  it('fills an empty title and description, recording what it wrote', () => {
    expect(applyAutoCopy({ name: '', description: '' }, GENERATED)).toEqual({
      name: 'Election for Executive',
      autoTitle: 'Election for Executive',
      description: 'Election between alice, bob, and carol',
      autoDescription: 'Election between alice, bob, and carol',
    });
  });

  it('overwrites copy it generated itself', () => {
    const proposal = {
      name: 'Election for Treasurer',
      autoTitle: 'Election for Treasurer',
      description: 'Election between alice and bob',
      autoDescription: 'Election between alice and bob',
    };
    expect(applyAutoCopy(proposal, GENERATED)).toEqual({
      name: 'Election for Executive',
      autoTitle: 'Election for Executive',
      description: 'Election between alice, bob, and carol',
      autoDescription: 'Election between alice, bob, and carol',
    });
  });

  it('never overwrites copy the user edited', () => {
    const proposal = {
      name: 'Please vote!',
      autoTitle: 'Election for Treasurer',
      description: 'Whoever wins runs payroll.',
      autoDescription: 'Election between alice and bob',
    };
    expect(applyAutoCopy(proposal, GENERATED)).toEqual({});
  });

  // The live bug the sentinel-prefix test could not catch: appending to the
  // suggestion still passes startsWith(), so the next config toggle clobbered it.
  it('protects an edit that merely appends to the suggestion', () => {
    const proposal = {
      name: 'Create role: Treasurer — please approve by Friday',
      autoTitle: 'Create role: Treasurer',
    };
    expect(applyAutoCopy(proposal, { title: 'Create role: Treasurer (under Executive)' })).toEqual({});
  });

  it('treats the two fields independently', () => {
    const proposal = {
      name: 'Please vote!',
      autoTitle: 'Election for Treasurer',
      description: '',
      autoDescription: '',
    };
    expect(applyAutoCopy(proposal, GENERATED)).toEqual({
      description: 'Election between alice, bob, and carol',
      autoDescription: 'Election between alice, bob, and carol',
    });
  });

  it('leaves a field alone when nothing was generated for it', () => {
    const proposal = { name: '', description: '' };
    expect(applyAutoCopy(proposal, { title: 'Pause Blended voting' })).toEqual({
      name: 'Pause Blended voting',
      autoTitle: 'Pause Blended voting',
    });
    expect(applyAutoCopy(proposal, {})).toEqual({});
    expect(applyAutoCopy(proposal, { title: null, description: undefined })).toEqual({});
  });

  it('reclaims a field the user cleared', () => {
    const proposal = { name: '', autoTitle: 'Election for Treasurer' };
    expect(applyAutoCopy(proposal, { title: 'Election for Executive' })).toEqual({
      name: 'Election for Executive',
      autoTitle: 'Election for Executive',
    });
  });

  it('survives a proposal with no provenance fields at all', () => {
    expect(applyAutoCopy({}, GENERATED)).toEqual({
      name: 'Election for Executive',
      autoTitle: 'Election for Executive',
      description: 'Election between alice, bob, and carol',
      autoDescription: 'Election between alice, bob, and carol',
    });
    expect(applyAutoCopy(undefined, GENERATED).name).toBe('Election for Executive');
  });

  it('does not mutate the proposal it is given', () => {
    const proposal = { name: '', description: '' };
    applyAutoCopy(proposal, GENERATED);
    expect(proposal).toEqual({ name: '', description: '' });
  });

  // Edit → Back → reconfigure → Next is everyday navigation once Back exists.
  it('keeps a user edit across a reconfigure round-trip', () => {
    let proposal = { name: '', description: '', autoTitle: '', autoDescription: '' };
    proposal = { ...proposal, ...applyAutoCopy(proposal, GENERATED) };
    proposal = { ...proposal, name: 'Please vote!' };          // user edits the title
    proposal = {
      ...proposal,
      ...applyAutoCopy(proposal, {                              // adds a 4th candidate
        title: 'Election for Executive',
        description: 'Election between alice, bob, carol, and dave',
      }),
    };
    expect(proposal.name).toBe('Please vote!');
    expect(proposal.description).toBe('Election between alice, bob, carol, and dave');
  });
});

describe('backfillProvenance', () => {
  it('adopts a legacy election title and description', () => {
    const draft = { name: 'Election for Executive', description: 'Election between alice and bob' };
    expect(backfillProvenance(draft)).toEqual({
      name: 'Election for Executive',
      description: 'Election between alice and bob',
      autoTitle: 'Election for Executive',
      autoDescription: 'Election between alice and bob',
    });
  });

  it('adopts a legacy createRole title and description', () => {
    const draft = {
      name: 'Create role: Treasurer (under Executive)',
      description: 'New role "Treasurer" — vouching required (2).',
    };
    expect(backfillProvenance(draft)).toEqual({
      ...draft,
      autoTitle: 'Create role: Treasurer (under Executive)',
      autoDescription: 'New role "Treasurer" — vouching required (2).',
    });
  });

  it('covers every legacy prefix', () => {
    for (const prefix of LEGACY_TITLE_PREFIXES) {
      expect(backfillProvenance({ name: `${prefix}Something` }).autoTitle).toBe(`${prefix}Something`);
    }
    for (const prefix of LEGACY_DESCRIPTION_PREFIXES) {
      expect(backfillProvenance({ description: `${prefix}x and y` }).autoDescription)
        .toBe(`${prefix}x and y`);
    }
  });

  // After backfill the legacy draft regenerates on change, exactly as it did
  // before the provenance fields existed.
  it('restores regenerate-on-change for the draft it backfilled', () => {
    const draft = backfillProvenance({ name: 'Election for Executive', description: '' });
    expect(applyAutoCopy(draft, { title: 'Election for Treasurer' })).toEqual({
      name: 'Election for Treasurer',
      autoTitle: 'Election for Treasurer',
    });
  });

  it('leaves a modern draft untouched', () => {
    const draft = {
      name: 'Election for Executive',
      description: 'Election between alice and bob',
      autoTitle: 'Election for Executive',
      autoDescription: 'Election between alice and bob',
    };
    expect(backfillProvenance(draft)).toBe(draft);
  });

  it('leaves a hand-written legacy draft untouched, so the wizard cannot clobber it', () => {
    const draft = { name: 'Who should run payroll?', description: 'Pick one of the three.' };
    expect(backfillProvenance(draft)).toBe(draft);
    expect(applyAutoCopy(backfillProvenance(draft), GENERATED)).toEqual({});
  });

  it('does not resurrect provenance for a modern draft the user has since edited', () => {
    const draft = {
      name: 'Election for Executive — read the thread first',
      autoTitle: 'Election for Executive',
    };
    expect(backfillProvenance(draft)).toBe(draft);
  });

  it('backfills each field on its own', () => {
    const draft = { name: 'Election for Executive', description: 'Vote however you like.' };
    expect(backfillProvenance(draft)).toEqual({ ...draft, autoTitle: 'Election for Executive' });
  });

  it('shrugs off a missing or malformed draft', () => {
    expect(backfillProvenance(null)).toBeNull();
    expect(backfillProvenance(undefined)).toBeUndefined();
    expect(backfillProvenance('nope')).toBe('nope');
    expect(backfillProvenance({})).toEqual({});
  });

  it('does not mutate the draft it is given', () => {
    const draft = { name: 'Election for Executive' };
    backfillProvenance(draft);
    expect(draft).toEqual({ name: 'Election for Executive' });
  });
});
