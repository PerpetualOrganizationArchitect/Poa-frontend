/**
 * The Identity step pins org metadata early (step 2) and the deploy page pins the
 * final version. Both must build it from the same place, or settings chosen on
 * later steps get silently dropped — which is exactly what happened to
 * `hideTreasury` and `useTokenSymbol`.
 */

import { describe, it, expect } from 'vitest';
import { buildOrgMetadata } from './orgMetadata';
import { initialState } from '../context/deployerReducer';

const clone = (o) => JSON.parse(JSON.stringify(o));

const stateWith = (mutate) => {
  const s = clone(initialState);
  s.organization.name = 'Sunrise Bakery Collective';
  s.organization.description = 'We bake together.';
  mutate?.(s);
  return s;
};

describe('buildOrgMetadata', () => {
  it('carries every key POContext reads back', () => {
    const meta = buildOrgMetadata(stateWith());
    expect(Object.keys(meta).sort()).toEqual(
      ['description', 'hideTreasury', 'links', 'logo', 'template', 'useTokenSymbol'].sort()
    );
  });

  it('carries Hide Treasury, which is chosen after the Identity step', () => {
    const meta = buildOrgMetadata(stateWith((s) => { s.features.hideTreasury = true; }));
    expect(meta.hideTreasury).toBe(true);
  });

  it('opts into the ticker when the founder set one', () => {
    const meta = buildOrgMetadata(stateWith((s) => { s.organization.tokenSymbol = 'COMFY'; }));
    expect(meta.useTokenSymbol).toBe(true);
  });

  it('leaves the ticker opt-in off when no ticker was chosen', () => {
    expect(buildOrgMetadata(stateWith()).useTokenSymbol).toBe(false);
    // Whitespace is not a ticker.
    const blank = buildOrgMetadata(stateWith((s) => { s.organization.tokenSymbol = '   '; }));
    expect(blank.useTokenSymbol).toBe(false);
  });

  it('records the template the user actually picked', () => {
    const meta = buildOrgMetadata(stateWith((s) => { s.ui.selectedTemplate = 'community-dao'; }));
    // `organization.template` never leaves its 'default' initial value, so reading
    // it (as the deploy page used to) labelled every org 'default'.
    expect(meta.template).toBe('community-dao');
  });

  it('is stable for identical state, so re-pinning at deploy is a no-op', () => {
    const a = JSON.stringify(buildOrgMetadata(stateWith()));
    const b = JSON.stringify(buildOrgMetadata(stateWith()));
    expect(a).toBe(b);
  });

  it('survives a partial state without throwing', () => {
    expect(() => buildOrgMetadata({})).not.toThrow();
    expect(buildOrgMetadata({}).links).toEqual([]);
  });
});
