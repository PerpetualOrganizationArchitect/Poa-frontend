import { describe, it, expect } from 'vitest';
import { SETTER_TEMPLATES, SETTER_TITLE_FALLBACK } from './setterDefinitions';

/** Every id the create-a-vote wizard can reach today. */
const TEMPLATE_IDS = [
  'activate-email-allowlist',
  'change-threshold-hybrid',
  'change-threshold-dd',
  'change-quorum-hybrid',
  'change-voting-split',
  'change-quorum-dd',
  'allow-proposal-creator-hybrid',
  'allow-voter-dd',
  'pause-hybrid-voting',
  'unpause-hybrid-voting',
  'pause-dd-voting',
  'unpause-dd-voting',
  'set-project-permissions',
  'allow-task-creator',
  'allow-organizer-hat',
  'change-token-metadata',
];

describe('SETTER_TEMPLATES autoTitle', () => {
  it('covers every template', () => {
    expect(SETTER_TEMPLATES.map(t => t.id)).toEqual(TEMPLATE_IDS);
    for (const t of SETTER_TEMPLATES) {
      expect(typeof t.autoTitle, t.id).toBe('string');
      expect(t.autoTitle.trim().length, t.id).toBeGreaterThan(0);
    }
  });

  it('stays short enough to sit in the title input', () => {
    for (const t of SETTER_TEMPLATES) {
      expect(t.autoTitle.length, `${t.id}: ${t.autoTitle}`).toBeLessThanOrEqual(60);
    }
  });

  it('never says "Hybrid" to a member — the system is called Blended voting', () => {
    for (const t of SETTER_TEMPLATES) {
      expect(t.autoTitle, t.id).not.toMatch(/hybrid/i);
    }
  });

  it('reads as a proposal, not a UI label — no "Rule change:" prefix, no contract names', () => {
    for (const t of SETTER_TEMPLATES) {
      expect(t.autoTitle, t.id).not.toMatch(/^Rule change/i);
      expect(t.autoTitle, t.id).not.toMatch(/setConfig|setClasses|hatId|bytes32|uint/i);
    }
  });

  it('gives each template a distinct title', () => {
    const titles = SETTER_TEMPLATES.map(t => t.autoTitle);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('keeps the on-chain encoding fields untouched', () => {
    for (const t of SETTER_TEMPLATES) {
      expect(typeof t.contract, t.id).toBe('string');
      expect(Array.isArray(t.inputs), t.id).toBe(true);
      expect(typeof t.preview, t.id).toBe('function');
    }
  });
});

describe('SETTER_TITLE_FALLBACK', () => {
  it('prefers the curated autoTitle', () => {
    expect(SETTER_TITLE_FALLBACK({ autoTitle: 'Pause Blended voting', name: 'Pause Blended Voting' }))
      .toBe('Pause Blended voting');
  });

  it('falls back to name for a template added later without one', () => {
    expect(SETTER_TITLE_FALLBACK({ name: 'Some New Action' })).toBe('Some New Action');
    expect(SETTER_TITLE_FALLBACK({ autoTitle: '', name: 'Some New Action' })).toBe('Some New Action');
  });

  it('never calls preview() — it is empty or wrong before params are filled', () => {
    let called = false;
    const template = { name: 'Some New Action', preview: () => { called = true; return ''; } };
    expect(SETTER_TITLE_FALLBACK(template)).toBe('Some New Action');
    expect(called).toBe(false);
  });

  it('resolves a real title for all 16 templates', () => {
    for (const t of SETTER_TEMPLATES) {
      expect(SETTER_TITLE_FALLBACK(t), t.id).toBe(t.autoTitle);
    }
  });
});
