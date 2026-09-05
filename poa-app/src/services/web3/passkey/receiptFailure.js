/**
 * receiptFailure — the text a manager hands `_parseAAError` when a UserOp was MINED but its
 * execution reverted.
 *
 * Pimlico's receipt carries the revert as bare hex (`receipt.reason`). The shared decoder only
 * picks hex up after a "revert…"/"reason" marker, so a bare selector went undecoded and the
 * failure fell through to the generic (or, after a sponsorship fallback, the "no funds") copy.
 * Anchor it, so the real contract reason is what the member reads.
 */
export function describeReceiptFailure(reason, fallback) {
  if (!reason) return fallback;
  const text = String(reason);
  if (/^0x[0-9a-fA-F]{8,}$/.test(text)) return `Transaction was mined but reverted with reason: ${text}`;
  return text;
}
