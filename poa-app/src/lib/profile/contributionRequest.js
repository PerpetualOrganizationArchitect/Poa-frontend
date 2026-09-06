import { calculatePayout, formatEstTime, normalizeHourlyRate } from '@/util/taskUtils';

// The ParticipationToken request stores 18-decimal wei in a uint96. Requests
// use whole display units, so this is the largest amount the service can encode.
export const MAX_CONTRIBUTION_AMOUNT = 79228162514;
export const MAX_REASON_LENGTH = 2000;

const numberFormat = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 21 });

/** Quote display units; TokenRequestService performs the only conversion to wei. */
export function getContributionQuote({ hoursOnly = false, hourlyRate, hours, amount } = {}) {
  const quote = {
    amount: null,
    hours: null,
    hourlyRate: hoursOnly === true ? normalizeHourlyRate(hourlyRate) : null,
    rounded: false,
    error: null,
  };

  if (hoursOnly === true) {
    const duration = Number(hours);
    if (!Number.isFinite(duration) || duration <= 0) return { ...quote, error: 'timeRequired' };
    if (!Number.isInteger(duration * 4)) return { ...quote, error: 'timeIncrement' };

    quote.hours = duration;
    // Keep this identical to task rewards, including whole-unit rounding.
    const payout = calculatePayout('medium', duration, { hoursOnly: true, hourlyRate: quote.hourlyRate });
    quote.rounded = payout !== quote.hourlyRate * duration;
    if (payout <= 0) return { ...quote, error: 'roundsToZero' };
    if (!Number.isSafeInteger(payout) || payout > MAX_CONTRIBUTION_AMOUNT) {
      return { ...quote, error: 'amountTooLarge' };
    }
    return { ...quote, amount: String(payout) };
  }

  // Legacy organizations have no single hourly ratio. Preserve direct requests
  // instead of inventing a difficulty or applying the hours-only fallback rate.
  const requested = Number(amount);
  if (!Number.isFinite(requested) || requested <= 0) return { ...quote, error: 'amountRequired' };
  if (!Number.isInteger(requested)) return { ...quote, error: 'amountWhole' };
  if (!Number.isSafeInteger(requested) || requested > MAX_CONTRIBUTION_AMOUNT) {
    return { ...quote, error: 'amountTooLarge' };
  }
  return { ...quote, amount: String(requested) };
}

/**
 * The service and subgraph preserve reason text, but not arbitrary metadata.
 * Keep the calculation with the contribution so approvers can reconcile it.
 * MAX_REASON_LENGTH limits user input; this generated context may extend it.
 */
export function buildContributionReason(reason, quote, tokenLabel = 'Shares') {
  const description = String(reason ?? '').trim();
  if (quote?.error || quote?.amount == null || quote?.hours == null || quote?.hourlyRate == null) {
    return description;
  }
  const label = typeof tokenLabel === 'string' && tokenLabel.trim() ? tokenLabel.trim() : 'Shares';
  return `${description}\n\nTime contributed: ${formatEstTime(quote.hours)}\nRate: ${numberFormat.format(quote.hourlyRate)} ${label} per hour\nRequested: ${numberFormat.format(Number(quote.amount))} ${label}`;
}
