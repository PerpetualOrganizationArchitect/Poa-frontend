import { describe, expect, it } from 'vitest';
import {
  buildContributionReason,
  getContributionQuote,
  MAX_CONTRIBUTION_AMOUNT,
  MAX_REASON_LENGTH,
} from './contributionRequest';

describe('hourly contribution requests', () => {
  it.each([
    [10, 2, '20', false],
    [10, 0.25, '3', true],
    [10, 0.5, '5', false],
    [12.5, 1.5, '19', true],
    [1, 0.75, '1', true],
  ])('uses the task payout for %s per hour and %s hours', (hourlyRate, hours, amount, rounded) => {
    expect(getContributionQuote({ hoursOnly: true, hourlyRate, hours, amount: '999' }))
      .toEqual({ amount, hours, hourlyRate, rounded, error: null });
  });

  it.each([undefined, null, '', 'broken', 0, -1, Infinity])('uses the shared default for invalid rate %s', (hourlyRate) => {
    expect(getContributionQuote({ hoursOnly: true, hourlyRate, hours: 2 }))
      .toEqual({ amount: '20', hours: 2, hourlyRate: 10, rounded: false, error: null });
  });

  it.each([undefined, null, '', 0, -1, NaN, Infinity, 'broken'])('requires a positive finite duration (%s)', (hours) => {
    expect(getContributionQuote({ hoursOnly: true, hours }).error).toBe('timeRequired');
  });

  it.each([0.1, 0.3, 1.1])('rejects duration %s outside the quarter-hour grid', (hours) => {
    expect(getContributionQuote({ hoursOnly: true, hours }).error).toBe('timeIncrement');
  });

  it('rejects a positive duration when the configured rate rounds the request to zero', () => {
    expect(getContributionQuote({ hoursOnly: true, hourlyRate: 0.5, hours: 0.25 }))
      .toEqual({ amount: null, hours: 0.25, hourlyRate: 0.5, rounded: true, error: 'roundsToZero' });
  });

  it('enforces the request contract limit after rounding and rejects arithmetic overflow', () => {
    expect(getContributionQuote({ hoursOnly: true, hourlyRate: 1, hours: MAX_CONTRIBUTION_AMOUNT }).amount)
      .toBe(String(MAX_CONTRIBUTION_AMOUNT));
    for (const [hourlyRate, hours] of [[1, MAX_CONTRIBUTION_AMOUNT + 0.5], [Number.MAX_VALUE, 2]]) {
      const quote = getContributionQuote({ hoursOnly: true, hourlyRate, hours });
      expect(quote.amount).toBeNull();
      expect(quote.error).toBe('amountTooLarge');
    }
  });
});

describe('direct contribution requests', () => {
  it('keeps the requested amount when the org uses legacy difficulty-based task rewards', () => {
    expect(getContributionQuote({ hoursOnly: false, hourlyRate: 900, hours: 2, amount: '42' }))
      .toEqual({ amount: '42', hours: null, hourlyRate: null, rounded: false, error: null });
    expect(getContributionQuote({ amount: ' 0042 ' }).amount).toBe('42');
  });

  it.each([undefined, null, '', 0, -1, NaN, Infinity, 'broken'])('requires a positive finite amount (%s)', (amount) => {
    expect(getContributionQuote({ amount }).error).toBe('amountRequired');
  });

  it('rejects fractional amounts instead of silently rounding a direct request', () => {
    expect(getContributionQuote({ amount: '2.5' }).error).toBe('amountWhole');
  });

  it('accepts the largest whole uint96 amount and rejects the next unit', () => {
    expect(BigInt(MAX_CONTRIBUTION_AMOUNT) * 10n ** 18n).toBeLessThan(2n ** 96n);
    expect(BigInt(MAX_CONTRIBUTION_AMOUNT + 1) * 10n ** 18n).toBeGreaterThanOrEqual(2n ** 96n);
    expect(getContributionQuote({ amount: MAX_CONTRIBUTION_AMOUNT }).amount).toBe(String(MAX_CONTRIBUTION_AMOUNT));
    expect(getContributionQuote({ amount: MAX_CONTRIBUTION_AMOUNT + 1 }).error).toBe('amountTooLarge');
  });
});

describe('contribution request reason', () => {
  it('preserves the original contribution and exact hourly calculation for the reviewer', () => {
    const quote = getContributionQuote({ hoursOnly: true, hourlyRate: 12.5, hours: 1.5 });
    expect(buildContributionReason('  Hosted the member workshop.\nShared follow-up notes.  ', quote, 'POINTS'))
      .toBe('Hosted the member workshop.\nShared follow-up notes.\n\nTime contributed: 1h 30m\nRate: 12.5 POINTS per hour\nRequested: 19 POINTS');
  });

  it('formats grouped numbers and quarter-hour durations for people', () => {
    const quote = getContributionQuote({ hoursOnly: true, hourlyRate: 10000, hours: 0.25 });
    expect(buildContributionReason('Contribution', quote, 'Shares'))
      .toContain('Time contributed: 15m\nRate: 10,000 Shares per hour\nRequested: 2,500 Shares');
  });

  it('adds no invented calculation to a direct or invalid quote', () => {
    expect(buildContributionReason('  Direct request.  ', getContributionQuote({ amount: 20 }))).toBe('Direct request.');
    expect(buildContributionReason('  Still editing.  ', getContributionQuote({ hoursOnly: true, hours: 0 }))).toBe('Still editing.');
  });

  it('keeps all allowed user text while appending the generated review context', () => {
    const reason = 'x'.repeat(MAX_REASON_LENGTH);
    const quote = getContributionQuote({ hoursOnly: true, hourlyRate: 10, hours: 2 });
    const result = buildContributionReason(reason, quote);
    expect(result.startsWith(`${reason}\n\nTime contributed: 2h`)).toBe(true);
    expect(result.length).toBeGreaterThan(MAX_REASON_LENGTH);
  });
});
