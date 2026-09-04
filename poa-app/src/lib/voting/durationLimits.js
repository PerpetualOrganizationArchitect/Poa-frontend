/**
 * durationLimits — how short a vote's window may be.
 *
 * Product floor: ONE HOUR. The contracts allow 10 minutes (HybridVoting.MIN_DURATION), and in
 * E2E mode the wizard allows that too, so an executable vote can be created, voted, counted and
 * asserted on Test6 in one sitting instead of an hour per flow.
 *
 * The flag is compared INSIDE each function, on purpose: webpack's DefinePlugin only folds the
 * literal `process.env.NEXT_PUBLIC_E2E_MODE`, so each comparison becomes `'false' === 'true'`
 * in a production build and the 10-minute branch is dead code in that function. Hoisting it to a
 * module-level const (or importing `E2E_ENABLED` from e2eMode) does NOT fold — a `let` read across
 * a module boundary stays a runtime read and the branch, with its copy, ships merely switched
 * off. Verified by grepping the built bundle for the 10-minute copy.
 */

export const MIN_VOTE_HOURS = 1;
export const MIN_VOTE_HOURS_E2E = 10 / 60;

export function minVoteHours() {
  return process.env.NEXT_PUBLIC_E2E_MODE === 'true' ? MIN_VOTE_HOURS_E2E : MIN_VOTE_HOURS;
}

export function durationTooShortMessage() {
  return process.env.NEXT_PUBLIC_E2E_MODE === 'true'
    ? 'Voting must run for at least 10 minutes.'
    : 'Voting must run for at least 1 hour.';
}

/** Is `hours` at or above the floor? Non-numbers are not. */
export function isDurationAllowed(hours) {
  const h = Number(hours);
  if (!Number.isFinite(h)) return false;
  // A hair of tolerance so 10/60 typed as 0.1667 still passes in E2E mode.
  return h + 1e-9 >= minVoteHours();
}
