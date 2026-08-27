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

The requirement list is **generated from the documents** (`util/accessV2Requirements`), not written
by hand: the hand-written one claimed to name "the exact fields the v2 documents select" while
covering 13 of ~120 and omitting `ConfigLintEvent` entirely, so a partial publish read as CAPABLE
and then failed the whole query. Adding a field to a v2 query now adds it to the probe in the same
edit; a nested selection with no entity mapping throws rather than leaving a hole. Because the list
is large, over-strictness is the new risk — `queriesAccessV2.live.test.js` asserts the generated
requirements are satisfied by the endpoint that actually serves the documents.

---

## 2. Surfaces

### Data (`src/lib/accessV2/**` — pure, `src/hooks/accessV2/**` — thin wrappers)

| module | what it owns |
|---|---|
| `ids.js` | subject-id namespace arithmetic; `predictNextSubjectIds` (the v2 replacement for v1's `Hats.getNextId`) |
| `permKeys.js` | the semantic key table derived exactly as Solidity derives it, fold tags, 254-bit word packing, ctx resolution |
| `subjects.js` | Subject/GroupComposition normalisers, group derivation, blast-radius copy |
| `memberships.js` | the fold mirror, source-accurate copy, the electorate activation gate |
| `ballotGate.js` | the ballot's half of that gate: electorate scoping, and every degrade-to-silence case |
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
`useAccessV2Proposal`, `useActivationGate`.

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

One v2 read lives OUTSIDE that tree: `PollDetail` mounts `useActivationGate`, because the ballot is
the one legacy surface whose *existing* verdict a migrated org can contradict. It adds no query
(it reuses `useMyMemberships`) and returns the silent answer on every legacy org, so the rule in
§1 still holds — `enabled === false` renders exactly what renders today.

---

## 3. Things that will bite you if you change them

- **Batch cut-off.** `checkBatchSubmittable` refuses a batch over `MAX_SPONSORED_CALLS`, which is
  `config/contractLimits.MAX_CALLS_PER_BATCH` — **20, the chain's own limit** (Executor.sol:45 and
  `MAX_CALLS` in both voting modules, which revert `TooManyCalls` at PROPOSAL CREATION). It is not a
  frontend policy number and raising it does not raise anything: 21+ calls simply revert on chain,
  burning a UserOp for a sponsored user. (It read 24 until the reviewers caught it.) Seed/cutover
  ceremonies are far outside the paymaster rulebook's gas hints anyway and the runbook runs them
  **from a funded EOA**. A wizard batch that overflows should be split across two proposals.
- **`announceWinner` swallows reverts.** The winning batch runs inside a try/catch, so every
  estimator prices only the cheap caught-failure path and an under-funded batch silently no-ops
  while the transaction reports success. Every builder returns `gasLimit` — that floor belongs to
  `announceWinner`, **not** to `createProposal` (it used to be attached there, under a key neither
  transaction manager read, i.e. it did nothing at all). `useAccessV2Proposal` now parks it against
  the created proposal id (`lib/accessV2/gasFloors`) and `useVoteActions.handleFinalize` reads it
  back and applies it to the finalize transaction through both managers: `gasLimit` (EOA, a floor
  over the buffered estimate) and `callGasLimitFloor` (4337, a floor that composes with the existing
  3× Hats multiplier — do **not** switch it to `callGasLimit`, which replaces the multiplier). The
  store is per-browser; finalizing from another device just falls back to today's behaviour.
- **GRANT vs OFFER is decided per holder.** `grant` on an out-of-org address does **not** revert —
  the contract writes the rule and emits `RoleOffered` instead of flipping acceptance
  (`MembershipAuthorityLogic.grant`; the `NotInOrg` error is only a `canGrant` preflight reason
  code). So a wrong classification is not a dead batch, it is a UI that says "Added" about someone
  who still has to accept. The wizard decides from the fold mirror, never from a guess — and "in
  org" means the contract's `_isInOrg` (`userSubjectList.length > 0`: ACCEPTED anywhere, current
  eligibility irrelevant), which is `normalizeAuthorityMemberships().inOrgUsers`, not the
  active-member list.
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
- **graph-node's `where` grammar is not the GraphQL grammar.** A column filter may NOT sit beside
  `or`/`and` at the same level; the scope has to be distributed into every branch
  (`{ or: [{ authority, isMember: true }, { authority, claimable: true }] }`). This shipped wrong in
  `FETCH_AUTHORITY_MEMBERSHIPS` and failed **every** request on **every** migrated org while the
  suite stayed green — GraphQL validation accepts it, the introspection probe accepts it (all the
  fields exist), and the unit tests only ever ran the response transforms over fixtures. See the
  query-validity layer below.

---

## 3a. The query-validity layer (do not delete it)

Two paired checks, both derived FROM the exported documents so neither can drift as documents are
added:

| file | needs network | what it pins |
| --- | --- | --- |
| `util/queriesAccessV2.grammar.test.js` | no — runs in CI | lints every exported document against `util/graphNodeFilterGrammar` (the runtime `where`-grammar rules graph-node enforces and GraphQL validation does not) |
| `util/queriesAccessV2.live.test.js` | yes — opt-in | executes every document verbatim against a real graph-node and asserts no `errors` block |

The live half is **skipped unless `POA_LIVE_SUBGRAPH_TESTS=1`**, so `yarn test` stays offline and
deterministic. Run it before shipping any query change:

```sh
yarn test:live-subgraph
# or against another graph-node already serving the v2 schema:
POA_LIVE_SUBGRAPH_TESTS=1 POA_LIVE_SUBGRAPH_URL=https://… yarn test src/util/queriesAccessV2.live.test.js
```

It is read-only and side-effect free: variables are synthesised as zero values from each document's
own variable definitions, so every query matches nothing and returns empty collections. The
assertion is on the ABSENCE of a GraphQL error, not on data.

Both halves were verified to FAIL against the original `{ authority, or: [...] }` shape — a
query-validity check that cannot fail is the tautology this layer exists to close.

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
- **`hasExecRole` positional derivation** (`context/UserContext.js:107`) is still
  `roleHatIds[1]`. With groups this should become "is a member of the group holding permission X",
  via `hasPerm` / the perm rows. ~15 consumers.
- **Feed rendering of the seven lifecycle verbs.** `FETCH_MEMBERSHIP_EVENTS` is written; nothing
  consumes it yet. The verbs are disjoint on purpose (`RoleClaimed` ≠ `RoleGranted`,
  `MembershipReconciled` is an automatic lapse repair) and must be rendered verbatim.
- **Test6 verification.** Not run — this branch has never touched a live authority, because no org
  is cut over yet. Do it through the `test6-verify` Smithers workflow once one is.

### Closed

- ~~**Activation-gate copy on the ballot.**~~ `PollDetail` mounts `useActivationGate`, which folds
  the viewer's rows through the pure `lib/accessV2/ballotGate`. When the gate blocks, `canVote` goes
  false and the eligibility line carries `activationGateCopy` in place of "You're eligible ✓".
  The gate is deliberately one-sided: it reports ONLY `joined-after-proposal`, never
  `not-a-member` — that copy belongs to `votingDisplay.voterEligibility`, and an eager gate would
  flash "you are not a member" at a member whose rows have not arrived. Legacy orgs, an org
  mid-index and a proposal with no `startTimestamp` all read as silent.
- ~~**The `Executor.CallFailed` selector→copy table.**~~ `decodeRevertData` now unwraps
  `CallFailed(index, lowLevelData)` BEFORE the Interface branch (every voting ABI declares
  CallFailed, so an Interface-first decode resolves the wrapper and throws the cause away) and
  speaks about the inner revert: "Action 3 in this proposal failed: …", falling back to the
  4-byte selector. `lowLevelData == 0x` is reported as the swallowed out-of-gas with its remedy.
  The MembershipAuthority error selectors were added to `CONTRACT_ERROR_SELECTORS` with copy kept
  in step with `ACTION_REASON_COPY`, so the pre- and post-flight halves cannot contradict.
  Three surfaces consume it: both transaction paths via `parseError` / `_parseAAError`;
  `votingVocabulary.executionStatus`, which used to interpolate the raw `executionError` bytes into
  member-facing copy; and `useVoteActions.handleFinalize`, which reads
  `ProposalExecutionFailed` off the finalize receipt — a batch that reverts or runs out of gas
  leaves a SUCCESSFUL transaction, so the success toast alone was a lie.
