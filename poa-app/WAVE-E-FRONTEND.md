# Wave E — Access v2 frontend (MembershipAuthority)

What this branch adds, what it is gated on, and what is still open.

Design ground truth is `ACCESS-V2-SPEC.md` §1–§6 in the contracts repo; the read shapes come from
`pop-subgraph/schema.graphql` on the `access-v2/subgraph` branch; the write surface is
`abi/MembershipAuthority.json`, copied from the contracts artifact.

This supersedes the v1 `rolemanager/frontend` attempt (PR poa-box/Poa-frontend#482). None of that
branch's code is carried over — only its structural precedents: capability-gated queries, pure
`src/lib/**` logic with colocated vitest, and service-layer-only contract access.

---

## 1. The gate — read this before touching anything

Access v2 rolls out **org by org**, and the app reads the **decentralised gateway** subgraphs
(`config/networks.js`), which lag Studio by a manual publish. Two independent conditions must both
hold before a single v2 query goes on the wire:

1. **The endpoint serves the schema.** `CAPABILITY.ACCESS_V2` in `util/subgraphCapabilities.js`
   introspects for the exact fields the v2 documents select. One unknown field fails the WHOLE
   GraphQL document, so a partial deployment must read as *absent*, not *half working*.
2. **The org is cut over.** `organization.membershipAuthority` exists **and** `isRouterBound` is
   true. Deployed-but-unbound is `pending`: the authority answers reads, but the modules still
   resolve legacy Hats, so the v2 panels would show a roster nothing is using.

`useOrgAuthority()` folds both into `{ state, enabled, migrated, paused, address, statusCopy }`:

| state     | `migrated` | `enabled` | what renders                       |
|-----------|-----------|-----------|------------------------------------|
| `legacy`  | false     | false     | **nothing** — legacy page untouched |
| `pending` | true      | false     | status banner only                  |
| `active`  | true      | true      | every v2 surface                    |

`AccessV2TeamSection` is the only component a page mounts, and it returns `null` on `legacy`. That
is the whole contract with the unmigrated orgs.

**A paused authority still renders.** Pause gates WRITES only — reads stay live, which is
load-bearing for the cutover ordering. The panels show a warning and disable the buttons.

Pinned by `src/lib/accessV2/featureDetection.test.js`: legacy org untouched, migrated org on a
pre-publish endpoint reads as legacy, every single required field individually flips the capability
false.

---

## 2. Surfaces

### Data (`src/lib/accessV2/**` — pure, `src/hooks/accessV2/**` — thin wrappers)

| module | what it owns |
|---|---|
| `ids.js` | subject-id namespace arithmetic; `predictNextSubjectIds` (the v2 replacement for v1's `Hats.getNextId`) |
| `permKeys.js` | the semantic key table derived exactly as Solidity derives it, fold tags, 254-bit word packing, ctx resolution |
| `subjects.js` | Subject/GroupComposition normalisers, group derivation, blast-radius copy |
| `memberships.js` | the fold mirror, source-accurate copy, the electorate activation gate |
| `rules.js` | the one rule slot, sticky, removal-blocker copy, preflight reason codes |
| `pendingActions.js` | the review window, countdowns, ManagerConfig |
| `vouch.js` | epoch-aware vouch counting, `canVouch`, config lints |
| `authority.js` | feature detection |
| `normalize.js` | the transforms the hooks run (kept pure so they are testable) |
| `txBuilders.js` | one `{target,value,data}` builder per authority verb |
| `proposalBuilders.js` | Executor batch composers |
| `submission.js` | the pre-flight every batch goes through |

Hooks: `useOrgAuthority`, `useAuthoritySubjects`, `useAuthorityMemberships`, `useMyMemberships`,
`usePendingActions`, `useSubjectVouches`, `useVouchCandidates`, `useAuthorityActions`,
`useAccessV2Proposal`.

**Every hook returns a legacy-compatible shape where a legacy equivalent exists.** A migrated org
adopts its hatIds verbatim as subject ids, so roles carry `hatId` / `name` / `image` / `canVote` and
there is a `roleNames` map — an existing consumer can be pointed at the v2 source with no render
change.

**ZERO eth_calls on the read path.** The subgraph recomputes the eligibility fold in-mapping on
every relevant event, including across the event-lag window (a vouch epoch reset or a default flip
emits only a config event on chain — the mapping re-folds the accepted rows itself).

### Writes

- `MembershipAuthorityService` (`services/web3/domain/`) — the direct verbs plus the
  `canClaim`/`canGrant`/`canRemove` preflights. Registered in `useWeb3Services` as
  `membershipAuthority`.
- `useAuthorityActions` wraps them with notifications and refuses to fire while paused.
- Governance goes through `proposalBuilders` → `useAccessV2Proposal` → `VotingService`.

### UI (`src/components/accessV2/**`)

`AccessV2TeamSection` (the gate) mounts `PendingActionsPanel`, `ClaimableRolesPanel` and
`RolesGroupsPanel`; `RolesGroupsPanel` opens `CreateRoleWizard` and `SubjectDetailPanel`.
`SubjectRestrictionPicker` is wired into `CreateVoteModal`'s existing restricted-poll block.

Mounted at `pages/team/index.js`, above the legacy sections.

---

## 3. Things that will bite you if you change them

- **Sponsorship cut-off.** `checkBatchSubmittable` refuses a batch over `MAX_SPONSORED_CALLS` (24).
  Seed/cutover ceremonies are far outside the paymaster rulebook's gas hints and the runbook runs
  them **from a funded EOA**. Ordinary role-creation proposals are ~7–13 calls and go through the
  normal sponsored flow like any other proposal. Do not "fix" this by raising the ceiling.
- **`announceWinner` swallows reverts.** The winning batch runs inside a try/catch, so wallets price
  only the cheap caught-failure path and an under-funded batch silently no-ops while the proposal
  reports success. Every builder returns `gasLimit`; `useAccessV2Proposal` passes it through. Keep
  it.
- **GRANT vs OFFER is decided per holder.** `grant` on an out-of-org address reverts `NotInOrg`
  inside that try/catch. The wizard decides from the fold mirror (`inOrg`), never from a guess.
- **The id-prediction race.** New subject ids come from a `localSeq` counter with no public getter,
  reconstructed from indexed subjects. Another subject-creating proposal executing first shifts the
  ids and every permission in the batch lands on the wrong subject. `buildCreateRoleBatch` returns
  the warning; the review step shows it. (Same race v1 had with `Hats.getNextId`.)
- **`force` on a default flip.** Closing an open role lapses every member held only by the default.
  The contract demands the flag; the builder passes it only when members exist, and says how many.
- **Stale vouch epochs.** `resetVouchEpoch` / `clearUserVouches` strand records with **no
  per-record event**. Never count raw rows — `vouchProgress` filters on the config epoch and the
  panel reports how many were stranded.
- **Groups are not tokens.** No per-user group enumeration exists on chain and groups emit no
  `TransferSingle`. Group rosters are derived client-side exactly as the contract derives them.
- **`memberCount` vs `activeMemberCount`.** The first mirrors accepted flips; the second is the fold
  mirror. Render the second — a lapsed member is not a member.

---

## 4. Dependency: the gateway publish

**Nothing in section 2 renders until the access-v2 subgraph is published to the decentralised
gateway endpoints in `config/networks.js`** (Studio deploys are not enough — see
`subgraph-frontend-endpoints`). Until then `CAPABILITY.ACCESS_V2` probes false everywhere and every
org, migrated or not, takes the legacy path. That is the designed behaviour, not a bug, and it means
this branch is safe to ship ahead of the publish.

Positive capability answers are cached in `localStorage`; negatives are re-probed per session, so an
endpoint lights up on the next page load after the publish with no frontend change.

---

## 5. Open items

- **Edit-role / edit-group UI.** `buildEditPermsBatch`, `buildGroupCompositionBatch`,
  `buildManagerConfigBatch`, `buildVouchConfigBatch`, `buildEditSubjectBatch`,
  `buildSubjectDefaultBatch` and `buildMemberActionsBatch` are all built and tested, but only
  create-role has a wizard. The remaining ones need forms (a `setterDefinitions`-style template set
  is the natural fit).
- **`canRemove` preflight in the removal dialog.** The service method and the source-accurate copy
  (`removalBlockers`) exist; the member-removal dialog that calls them does not. Until it lands, a
  soft removal of a member held by an open default or a live vouch quorum will revert
  `RemovalIneffective` rather than explaining itself.
- **The `Executor.CallFailed` selector→copy table.** The spec pairs the preflights with bubbling the
  inner revert selector out of `ProposalExecutionFailed`. `ACTION_REASON_COPY` covers the preflight
  half; the failed-execution half needs a selector map in `lib/errors/ErrorParser.js`.
- **`hasExecRole` positional derivation** (`context/UserContext.js:107`) is still
  `roleHatIds[1]`. With groups this should become "is a member of the group holding permission X",
  via `hasPerm` / the perm rows. ~15 consumers.
- **Activation-gate copy on the ballot.** `activationGate` / `activationGateCopy` are implemented
  and tested but not yet rendered in `PollDetail` / `WeightedBallot`. Until they are, a member who
  joined mid-proposal sees a vote button that reverts instead of the "you can vote on proposals
  created after…" explanation.
- **Feed rendering of the seven lifecycle verbs.** `FETCH_MEMBERSHIP_EVENTS` is written; nothing
  consumes it yet. The verbs are disjoint on purpose (`RoleClaimed` ≠ `RoleGranted`,
  `MembershipReconciled` is an automatic lapse repair) and must be rendered verbatim.
- **Test6 verification.** Not run — this branch has never touched a live authority, because no org
  is cut over yet. Do it through the `test6-verify` Smithers workflow once one is.
