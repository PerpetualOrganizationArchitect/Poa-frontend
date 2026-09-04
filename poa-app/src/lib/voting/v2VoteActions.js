/**
 * lib/voting/v2VoteActions — the Create-a-Vote wizard's ELECTION arm for an access-v2 org.
 *
 * PURE. This is the ELECTION arm of `useProposalForm.buildProposalData` for an org that has cut
 * over to a MembershipAuthority. It exists because the legacy arm is not merely sub-optimal on a
 * v2 org, it is WRONG: the legacy batch calls `EligibilityModule.setWearerEligibility` /
 * `clearWearerVouches` / `mintHatToAddress` and `Hats.transferHat` against a role hat that cutover
 * DEACTIVATED. Every one of those reverts `HatNotActive`, inside `announceWinner`'s try/catch: the
 * vote passes, the winner is announced, and nothing happens. Silent.
 *
 * CREATE ROLE used to live here too. It now has ONE encoder shared with /team's create-role modal
 * — `lib/accessV2/roleFormBatch` — because two doors that build a role differently is how a role
 * ends up with permissions on one path and voting power on neither.
 *
 * Three contract facts drive the shape of everything below. All three are silent when violated,
 * because `announceWinner` swallows a reverting batch and still reports the vote as executed:
 *
 * 1. `grant` REVERTS `AlreadyMember` when the user is already accepted on the subject
 *    (MembershipAuthorityLogic.grant). The legacy arm skipped its mint for a candidate who already
 *    held the hat; here that skip is not an optimisation, it is what keeps the batch alive.
 * 2. `remove` REVERTS `NotMember` for anyone not currently accepted — so an incumbent who left
 *    since the ballot was drafted must be dropped from the batch, not "revoked anyway".
 * 3. A SOFT remove (`ban = false`) additionally reverts `RemovalIneffective` when the member has
 *    any surviving eligibility source — an open role, a met vouch quorum. Those are exactly the
 *    orgs that hold elections, so the loser's removal is written as a BAN: a durable governance
 *    rule that both removes the seat and blocks a self-re-claim. That is the faithful port of what
 *    the legacy arm did with `setWearerEligibility(false, false)` + `clearWearerVouches` — and it
 *    is reversible: a later governance `grant` overwrites the ban rule in one call.
 *
 * GRANT vs OFFER is decided by the contract's own `_isInOrg` (accepted ANYWHERE), which is what
 * `normalizeAuthorityMemberships().inOrgUsers` computes — never by the active-member set.
 */

import {
  buildMemberActionsBatch,
  estimateBatchGas,
} from '@/lib/accessV2/proposalBuilders';

/**
 * An elected seat is held by the GROUP, not by the person: `delegable: false` (sticky) means the
 * winner cannot hand it on or drop it, and only another vote can move it. That is the whole point
 * of electing someone, and it matches the legacy arm, whose explicit `setWearerEligibility` rule
 * likewise survived any attempt by the wearer to re-arrange it.
 */
export const ELECTED_SEAT_STICKY = true;

const lower = (v) => String(v ?? '').toLowerCase();
const isAddress = (a) => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);

/**
 * Coerce whatever the caller has into a Set of lowercased addresses.
 * `inOrgUsers` arrives from `normalizeAuthorityMemberships` as a Set; a caller that defaulted it
 * to `[]` (or hands over membership rows) must not silently become "nobody is in the org", which
 * would turn every governance ADD into an invitation nobody asked for.
 */
export function toAddressSet(input) {
  if (!input) return new Set();
  if (input instanceof Set) return new Set([...input].map(lower));
  if (Array.isArray(input)) {
    return new Set(input.map((x) => lower(x?.address ?? x?.user ?? x)).filter(Boolean));
  }
  return new Set();
}

/**
 * The addresses the fold mirror says are ACCEPTED on a subject.
 *
 * Deliberately `accepted`, not `isMember` (accepted && eligible): `remove` only requires
 * acceptance, so an accepted-but-lapsed incumbent is still removable — and a candidate who is
 * accepted-but-lapsed would still blow up a `grant` with `AlreadyMember`.
 *
 * @param {Array} memberships - normalised `SubjectMembership` rows (accessV2/normalize)
 * @param {string} subjectId
 * @returns {Set<string>} lowercased addresses
 */
export function acceptedHoldersOf(memberships = [], subjectId) {
  const id = String(subjectId ?? '');
  if (!id) return new Set();
  const out = new Set();
  for (const m of memberships || []) {
    if (!m || String(m.subjectId) !== id) continue;
    if (!m.accepted) continue;
    out.add(lower(m.user));
  }
  return out;
}

/**
 * ELECTION -> one authority batch per candidate option.
 *
 * Option order is the legacy order exactly: one batch per candidate in `candidates` order, with
 * the optional "No One" option appended LAST as an empty batch, so an existing ballot's indices
 * never shift.
 *
 * @param {object} opts
 * @param {string} opts.authority - MembershipAuthority address
 * @param {string} opts.subjectId - the ROLE being elected (a subject id on a v2 org)
 * @param {string} [opts.subjectName]
 * @param {Array<{name: string, address: string}>} opts.candidates
 * @param {Array<{name: string, address: string}>} [opts.selectedIncumbents] - seats at stake
 * @param {Set<string>|Array} [opts.acceptedHolders] - who currently holds the elected role
 * @param {boolean} [opts.includeNoOneOption]
 * @param {Set<string>|Array} [opts.inOrgUsers] - the contract's `_isInOrg` set
 * @param {string} [opts.fallbackSubjectId] - consolation role for the incumbents who lose
 * @param {string} [opts.fallbackSubjectName]
 * @param {Set<string>|Array} [opts.fallbackAcceptedHolders]
 * @param {boolean} [opts.sticky=ELECTED_SEAT_STICKY]
 * @param {boolean} [opts.banLosers=true] - see the header note on `RemovalIneffective`
 * @returns {{batches: Array, optionNames: string[], summaries: string[], warnings: string[], gasLimit: number}}
 */
export function buildV2ElectionBatches({
  authority,
  subjectId,
  subjectName = 'this role',
  candidates = [],
  selectedIncumbents = [],
  acceptedHolders = null,
  includeNoOneOption = false,
  inOrgUsers = null,
  fallbackSubjectId = '',
  fallbackSubjectName = '',
  fallbackAcceptedHolders = null,
  sticky = ELECTED_SEAT_STICKY,
  banLosers = true,
} = {}) {
  if (!authority) throw new Error('This group’s roles contract hasn’t loaded yet — please try again in a moment.');
  if (!subjectId) throw new Error('Pick which role this election fills.');

  const roster = toAddressSet(acceptedHolders);
  const fallbackRoster = toAddressSet(fallbackAcceptedHolders);
  const inOrg = toAddressSet(inOrgUsers);

  const runners = (candidates || []).filter((c) => c && isAddress(c.address));
  if (runners.length === 0) throw new Error('An election needs at least one candidate.');

  const atStake = (selectedIncumbents || []).filter((i) => i && isAddress(i.address));
  const nameOf = (p) => (p?.name && String(p.name).trim()) || shortAddress(p?.address);

  const warnings = [];
  const stale = atStake.filter((i) => !roster.has(lower(i.address)));
  for (const s of stale) {
    warnings.push(`${nameOf(s)} no longer holds ${subjectName}, so this vote can’t remove them from it.`);
  }
  if (fallbackSubjectId && String(fallbackSubjectId) === String(subjectId)) {
    warnings.push('The fallback role is the same as the role being elected — it has been left out.');
  }
  const useFallback = Boolean(fallbackSubjectId) && String(fallbackSubjectId) !== String(subjectId);

  const optionNames = runners.map((c) => c.name);
  const batches = runners.map((candidate) => {
    const candidateLower = lower(candidate.address);
    const losers = atStake.filter(
      (i) => lower(i.address) !== candidateLower && roster.has(lower(i.address))
    );

    const actions = [];
    for (const loser of losers) {
      actions.push({ action: banLosers ? 'ban' : 'remove', address: loser.address });
    }
    // The elected seat is granted LAST, mirroring the legacy arm. That order is load-bearing, not
    // cosmetic: `_flipOn` reverts `SubjectFull` once `maxMembers` is reached, so on a capped role
    // (the normal shape for an elected seat) the winner can only be added after the loser is out.
    const elected = buildMemberActionsBatch({
      authority,
      subjectId,
      subjectName,
      actions,
    });

    const batch = [...elected.batch];

    // Consolation role for the incumbents who just lost their seat. Expressible on the authority
    // as an ordinary add/invite, so it is NOT dropped on v2 — but it is DELEGABLE (not sticky):
    // a fallback role is theirs to keep or drop, unlike the elected seat.
    if (useFallback && losers.length > 0) {
      const fallbackActions = losers
        .filter((l) => !fallbackRoster.has(lower(l.address)))
        .map((l) => ({
          action: inOrg.has(lower(l.address)) ? 'grant' : 'offer',
          address: l.address,
          sticky: false,
        }));
      if (fallbackActions.length > 0) {
        batch.push(
          ...buildMemberActionsBatch({
            authority,
            subjectId: fallbackSubjectId,
            subjectName: fallbackSubjectName || 'the fallback role',
            actions: fallbackActions,
          }).batch
        );
      }
    }

    // `grant` reverts AlreadyMember, and a reverting batch is SILENTLY skipped by announceWinner —
    // so a candidate who already holds the role gets no call at all.
    if (!roster.has(candidateLower)) {
      batch.push(
        ...buildMemberActionsBatch({
          authority,
          subjectId,
          subjectName,
          actions: [
            {
              action: inOrg.has(candidateLower) ? 'grant' : 'offer',
              address: candidate.address,
              sticky,
            },
          ],
        }).batch
      );
    }

    return batch;
  });

  if (includeNoOneOption) {
    optionNames.push('No One');
    batches.push([]);
  }

  const summaries = electionSummaries({
    subjectName,
    runners,
    atStake: atStake.filter((i) => roster.has(lower(i.address))),
    roster,
    inOrg,
    includeNoOneOption,
    fallbackSubjectName: useFallback ? (fallbackSubjectName || 'the fallback role') : '',
    fallbackRoster,
    sticky,
    banLosers,
    nameOf,
  });

  return {
    batches,
    optionNames,
    summaries,
    warnings,
    // announceWinner runs ONE winning batch, so the floor has to cover the biggest option.
    gasLimit: Math.max(...batches.map((b) => estimateBatchGas(b || [])), estimateBatchGas([])),
  };
}

function shortAddress(address) {
  const a = String(address || '');
  return a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

/** The sentences voters read on the review screen and in the proposal's metadata. */
function electionSummaries({
  subjectName,
  runners,
  atStake,
  roster,
  inOrg,
  includeNoOneOption,
  fallbackSubjectName,
  fallbackRoster,
  sticky,
  banLosers,
  nameOf,
}) {
  const summaries = [];
  const names = runners.map(nameOf);
  summaries.push(
    `Elect ${names.join(' or ')} as ${subjectName}. The winner is added to the role automatically.`
  );

  for (const runner of runners) {
    const key = lower(runner.address);
    if (roster.has(key)) {
      summaries.push(`${nameOf(runner)} already holds ${subjectName}, so nothing changes for them if they win.`);
    } else if (!inOrg.has(key)) {
      summaries.push(
        `${nameOf(runner)} isn’t in this group yet, so winning sends them an invitation they accept themselves.`
      );
    }
  }

  for (const incumbent of atStake) {
    const tail = fallbackSubjectName
      ? fallbackRoster.has(lower(incumbent.address))
        ? ` They keep ${fallbackSubjectName}.`
        : ` They are added to ${fallbackSubjectName} instead.`
      : '';
    summaries.push(
      banLosers
        ? `If ${nameOf(incumbent)} doesn’t win, they lose ${subjectName} and can’t re-claim it without another vote.${tail}`
        : `If ${nameOf(incumbent)} doesn’t win, they lose ${subjectName}.${tail}`
    );
  }

  if (sticky) {
    summaries.push(
      `The seat stays with the group: the winner can’t hand it to someone else, and no manager can take it away — only another vote can.`
    );
  }
  if (includeNoOneOption) {
    summaries.push('Voters can also choose “No One” — if that wins, nothing changes.');
  }
  return summaries;
}


export default { buildV2ElectionBatches, acceptedHoldersOf, toAddressSet };
