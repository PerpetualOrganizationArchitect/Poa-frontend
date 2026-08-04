/**
 * txOutcome — how PollDetail reads the resolve of the transaction handlers it
 * is given (`onVote`, `onFinalize`).
 *
 * Neither action blocks on a spinner: casting swaps straight to VoteCelebration
 * and reconciles when the transaction settles, and "Count the votes" closes its
 * confirm dialog on the way out. That makes this one predicate the thing
 * standing between "your vote is in" and "your vote is in, but nothing
 * happened".
 *
 * The handler contract is `Promise<{ success: boolean }>` — exactly what
 * `executeWithNotification` returns. PollDetail used to treat any *falsy*
 * resolve as success, so a surface that mounted it without wiring `onVote`
 * (the /votes archive passed `onVote={undefined}`) turned `undefined` into a
 * confirmed celebration with no transaction behind it; the optimistic vote then
 * silently expired at the end of its grace window and the cast read as flaky.
 *
 * So: only an explicit `success === true` counts as done. The two mistakes are
 * not symmetric — a wrong "failed" rolls the optimistic vote back and offers a
 * retry (recoverable, and the real vote reappears on the next refetch), while a
 * wrong "confirmed" eats the action with no signal at all.
 *
 * Pure: no React, no toasts, never throws.
 */

/** Did a handler's resolve prove its transaction landed? */
export function txConfirmed(result) {
  return result?.success === true;
}

export default txConfirmed;
