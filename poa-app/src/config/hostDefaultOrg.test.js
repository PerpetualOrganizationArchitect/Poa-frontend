import { describe, it, expect, afterEach, vi } from 'vitest';
import { getDefaultOrgForHost, getVisitUrlForOrg, resolveOrgAlias } from './hostDefaultOrg';

// jsdom gives us a real `window`; swap only the hostname per case.
const setHost = (hostname) => {
  vi.stubGlobal('window', { location: { hostname } });
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getDefaultOrgForHost', () => {
  it("resolves KUBI's white-label domain to the org's CURRENT on-chain name", () => {
    // The subgraph lookup is an exact name match — 'KUBI' here would 404 the
    // whole domain, which is exactly what the rename broke.
    setHost('dao.kublockchain.com');
    expect(getDefaultOrgForHost()).toBe('Kansas Blockchain');
  });

  it('returns empty for a host with no white-label mapping', () => {
    setHost('poa.box');
    expect(getDefaultOrgForHost()).toBe('');
  });
});

describe('resolveOrgAlias', () => {
  it('maps a retired org name onto the current one', () => {
    expect(resolveOrgAlias('KUBI')).toBe('Kansas Blockchain');
  });

  it('matches case-insensitively and ignores surrounding whitespace', () => {
    expect(resolveOrgAlias('kubi')).toBe('Kansas Blockchain');
    expect(resolveOrgAlias(' Kubi ')).toBe('Kansas Blockchain');
  });

  it('passes through names with no alias, including the current one', () => {
    expect(resolveOrgAlias('Kansas Blockchain')).toBe('Kansas Blockchain');
    expect(resolveOrgAlias('Argus')).toBe('Argus');
  });

  it('is a no-op on empty / non-string input', () => {
    // useOrgName feeds it '' before the name resolves, and router.query values
    // can be arrays when a param repeats.
    expect(resolveOrgAlias('')).toBe('');
    expect(resolveOrgAlias(undefined)).toBe(undefined);
    expect(resolveOrgAlias(['KUBI'])).toEqual(['KUBI']);
  });
});

describe('getVisitUrlForOrg', () => {
  it("sends the renamed org to its white-label domain", () => {
    expect(getVisitUrlForOrg('Kansas Blockchain')).toBe('https://dao.kublockchain.com');
  });

  it('falls back to the internal home route for orgs with no domain', () => {
    expect(getVisitUrlForOrg('Decentral Park')).toBe('/home?org=Decentral%20Park');
  });
});
