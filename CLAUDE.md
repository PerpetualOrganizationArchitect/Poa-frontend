# POA Frontend

## Commands

All commands run from `poa-app/`:

```bash
cd poa-app && yarn dev              # dev server
cd poa-app && yarn dev:e2e          # dev server in E2E mode (burner EOA auto-connects)
cd poa-app && yarn dev:e2e-passkey  # dev server in E2E mode, passkey identity
cd poa-app && yarn build            # production build (static export to IPFS)
cd poa-app && yarn lint             # ESLint + Next.js Core Web Vitals rules
cd poa-app && yarn test             # vitest (unit tests for the pure `src/lib/**` layer)
cd poa-app && yarn e2e:setup        # one-time machine setup (writes ~/.poa/e2e.env)
cd poa-app && yarn e2e:check        # CI guard — fails if E2E code leaks into prod bundle
cd poa-app && yarn e2e:test-passkey # virtual-passkey crypto self-test
```

Automated coverage is vitest over the pure layer (colocated `*.test.js`, mostly
`src/lib/**` + `src/util/**`), React integration tests, and the E2E harness. The normal
`yarn test` command includes server-rendered tests of MainLayout's actual project
callback through TaskService and JoinPage's recipient display and vouch callbacks.
These mock data hooks and transaction transport; browser layout and live flows still
need Test6 verification. No Prettier. No formatting commands.

## Frontend changes: verify on Test6

To make AND verify a frontend change, drive it through the **`test6-verify`** Smithers
workflow (see the Smithers section) — it *enforces* the implement → build → Test6
Playwright verification (gif) → review loop. Doing it inline? Follow the same flow by
hand. Either way these repo facts hold:

- **Test6 (Gnosis) is the sandbox — fire real tx there.** Both agent identities (burner
  EOA + passkey) are authorized for every permission-gated flow. **Stop** for mainnet
  orgs, multi-sig broadcasts, or anything that would burn real value.
- Dev server: `cd poa-app && yarn dev:e2e-passkey` (passkey identity, full perms,
  auto-connects). Use `yarn dev:e2e` (burner EOA) only to test as an unvouched /
  minimal-permission user or the direct-EOA tx path. Never plain `yarn dev` for agent
  work. `yarn e2e:setup` is one-time per laptop (writes `~/.poa/e2e.env`).
- **Run ONE dev server, under Node 22.23.2 (not bun).** Multiple `next dev` processes
  share `poa-app/.next/` and corrupt each other's webpack chunks → `Cannot find
  module ./chunks/vendor-chunks/react-icons.js` → pages 500 in the browser (this is
  what breaks Playwright/Chromium). If chunks break: `lsof -ti:<port> | xargs kill -9`,
  `rm -rf poa-app/.next`, then start a single server.
- Browser testing uses the Playwright MCP (`.mcp.json`). Share a **gif** (gitignored:
  `/*.gif`, `/poa-app/*.gif`), not PNGs.
- Before a PR touching E2E-intercepted files (`AuthContext.js`, `_app.js`,
  `passkeySign.js`, `passkeyCreate.js`, `ProviderConverter.jsx`, anything under
  `src/services/e2e/`): `yarn build && yarn e2e:check` (no E2E symbols in the prod bundle).

Full E2E docs: `poa-app/scripts/e2e/README.md`. Known follow-ups: `BACKLOG.md` next to it.

## Smithers (durable agent orchestration)

`.smithers/` holds Smithers workflows that run long / multi-step / verify-heavy work
as durable, resumable runs. The agent operates Smithers on the user's behalf — don't
hand these commands to the user.

- **When to reach for it:** work with phases, iterate-until-pass loops, Test6
  verification, runs while the user is away, or that spans repos. Skip it for
  one-shot edits or quick questions — do those inline.
- **`test6-verify` is the standard verify loop.** It *automates* the "Default workflow
  for agents" Test6 flow above — implement → `yarn build` gate → Playwright
  verification on Test6 (real tx + a recorded gif) → independent code review →
  independent design review of the screenshots, looping until all pass:
  `bunx smithers-orchestrator workflow run test6-verify --prompt "<change>"`
- Spawned agents run at the repo root and **read this CLAUDE.md**, so the Test6 / E2E
  details above are the shared source of truth for both inline work and Smithers runs
  — keep them here rather than duplicating them into the workflow.
- **Catalog:** `bunx smithers-orchestrator workflow list`. **Watch a run:**
  `bunx smithers-orchestrator ps | inspect <id> | logs <id> -f | ui <id>`.
- Always invoke as `bunx smithers-orchestrator <cmd>` (never bare `smithers` — that's
  an unrelated npm package).

## Stack

Next.js 16, React 18, **JavaScript** (not TypeScript). Chakra UI 2. Wagmi 2 + ethers 5 + viem 2.
Static export (`output: 'export'`). Yarn. Node 22.23.2 (Volta).

## Path Aliases

`@/*` maps to `poa-app/src/*` (jsconfig.json). Always use `@/` imports, never relative `../../`.
ABIs live at `poa-app/abi/` (outside src) — import with `../../abi/FooBar.json`.

## Gotchas

### Three util directories — don't confuse them

- `src/util/` — queries, apolloClient, formatToken, permissions, tokens, crossChainUsername, etc.
- `src/utils/` — profileUtils.js only
- `src/services/web3/utils/` — encoding.js (IPFS CID conversion, parseTaskId, parseProjectId)

`encoding.js` is in `services/web3/utils/`, NOT in `src/util/`.

### Dual auth system

AuthContext unifies EOA (RainbowKit/wagmi) and Passkey (ERC-4337 smart accounts).
- EOA uses `TransactionManager` (direct ethers tx)
- Passkey uses `SmartAccountTransactionManager` (UserOp via Pimlico bundler)
- `useWeb3Services()` returns the correct manager based on auth type automatically
- **Never** call ethers/viem directly from components — always go through services

### Token amounts are always 18-decimal wei from subgraph

Use `formatTokenAmount()` / `parseTokenAmount()` from `src/util/formatToken.js`.
Getting this wrong produces numbers that are 10^18 too large or too small.

### Subgraph queries need chain routing

Org-scoped queries must pass a per-endpoint client: `useQuery(QUERY, { client:
useSubgraphClient(subgraphUrl) })` (subgraphUrl from POContext), or
`getClient(subgraphUrl)` for imperative queries. Without it, queries hit the
default (Arbitrum) subgraph and return wrong-chain data.

Each endpoint gets its OWN ApolloClient + InMemoryCache, so cross-chain cache
poisoning is structurally impossible — no `fetchPolicy: 'no-cache'` needed for
that. The old `context: { subgraphUrl }` plumbing is deprecated (apolloClient.js);
do not use it in new code. For query-all-chains fan-outs, use the helpers in
`src/util/crossChainUsername.js` (queryAllChains pattern).

### Subgraph IDs have composite format

Entity IDs from The Graph: `"{contractAddress}-{numericId}"`. Contracts expect
just the numeric part. Use `parseTaskId()`, `parseProjectId()`, `parseModuleId()`
from `services/web3/utils/encoding.js`. Wrong format = silent contract reverts.

### Org-scoped state via query param

All org pages read `router.query.userDAO`. POContext uses this to resolve `orgId`,
`subgraphUrl`, `orgChainId`. If `userDAO` is missing, POContext provides nulls —
this is expected on non-org pages.

### DirectDemocracy is polls-only — any executing proposal goes to HybridVoting

`OrgDeployer` sets `Executor.setCaller(hybridVoting)` on every org, and DirectDemocracy's
target allow-list is empty on every deploy, so a DD proposal carrying a batch reverts
`TargetNotAllowed` at creation (and could never execute anyway). Route on the BATCH, not the
intent name: `votingLaneForBatches(batches)` in `components/voting/create/wizardSteps.js`
(`BINDING_TYPES` there is the one list the gallery badges, creator gate and routing share).

### Three money pots, one word "treasury"

The Executor is what POContext aliases as `treasuryContractAddress` and is what a passed
batch spends directly, but "Deposit to treasury" lands in the **PaymentManager** (owner ==
Executor; `withdraw` only by vote) and task rewards are paid from the **TaskManager**'s own
balance. `lib/voting/treasuryBatches.js` encodes a payout from either source (PaymentManager
funds committed to an unfinalized distribution are NOT spendable — fully-claimed rounds get
closed in-batch first) and `hooks/useOrgPotBalances.js` reads all three.

### Wave G: authority-only organizations

An organization is supported only when its indexed `membershipAuthority` has a valid nonzero
address, `isRouterBound === true`, and a positive `cutoverAt`. Use
`lib/supportedOrganizations.js` for discovery, name lookup and cross-chain memberships.
Never substitute a name allowlist, filter historical activity by version/date, or retry an old
GraphQL schema to restore an organization. Kansas Blockchain (formerly KUBI), Decentral Park,
Poa and migrated Test6 retain all their pre-migration activity. Unmigrated orgs, including Argus,
are hidden. Native V2 orgs satisfy the same predicate without a legacy router-binding entity.

`AuthorityBoundary` withholds org pages until `useOrgAuthority().enabled` is verified; an
unavailable endpoint does not restore Hats controls. New org deployments require VERSION major 2.
Joining, vouching and membership management use MembershipAuthority. Retired EligibilityModule
applications and QuickJoin explicit hat-claim methods are removed.

Task masks come from authority permission rows, including groups and project context. A present
zero project row overrides global permission unless `inheritGlobal` is true. Project creation
passes empty retired role arrays; role-specific project permissions are changed through governance.
Education and token approval use `EDU_CREATE` / `PT_APPROVE`, never creator/approver hat tables.

### Optimistic updates have grace period locks

UserContext (15s) and TaskBoardContext (65s) use `optimisticLockRef` to prevent stale
subgraph data from overwriting optimistic state. The subgraph has indexing delay —
do not reduce these timeouts.

### IPFS CID ↔ bytes32 encoding

Contracts store IPFS content as bytes32. Use `ipfsCidToBytes32(cid)` and
`bytes32ToIpfsCid(hash)` from `services/web3/utils/encoding.js`.
CIDs must be CIDv0 (start with "Qm"). CIDv1 will not work.

### Pages are thin wrappers

Page files in `src/pages/` should only import components and set up routing. All
business logic and UI lives in `src/components/` or `src/features/`. Do not add
logic to page files.

## Conventions

### Service layer is mandatory for all contract calls

```
services/web3/core/    → ContractFactory, TransactionManager, SmartAccountTransactionManager
services/web3/domain/  → UserService, VotingService, TaskService, EducationService, etc.
```

Components use hooks (`useWeb3Services`, `useWeb3`) to get services. Use
`useTransactionWithNotification().executeWithNotification()` for the pending → success/error
notification flow.

### RefreshContext for cross-context data updates

After a transaction, emit a `RefreshEvent` (e.g., `TASK_CREATED`, `PROPOSAL_VOTED`).
Other contexts subscribe via `useRefreshSubscription`. Do NOT import contexts into
each other to trigger refetches — that creates circular dependencies.

### Error handling

`ErrorParser.js` in `src/lib/errors/` maps 26+ custom contract error selectors and
revert strings to user-friendly messages. Let the service layer's error parsing handle
contract errors — do not catch and reformat them in components.

### Multi-chain architecture

- **Arbitrum** (42161) = home chain (accounts, usernames, infrastructure)
- **Gnosis** (100) = default org deployment chain
- **Sepolia** / **Base Sepolia** = testnets

Config in `src/config/networks.js`. Never hardcode chain IDs.

### Chakra UI theme

Custom palettes: `coral`, `rose`, `amethyst`, `warmGray` — not standard Chakra colors.
Custom variants: `glass`, `elevated`, `primary`. Theme is defined inline in `_app.js`.

### Provider nesting order matters

The provider tree is dependency-sensitive: `CoreProviders.jsx` owns wallet/account
services, `RegistryProvider.jsx` supplies live public organization data, and
`OrganizationProviders.jsx` adds org-scoped data only on application routes. Fully
static reading routes skip all three async bundles. Check these provider modules and
`_app.js` before adding or reordering providers.

### Task permissions

`projectTaskPermissions(project, userHatIds, address)` consumes ProjectContext's current authority
projection. It resolves each role and its groups at the project context before adapting the mask
for board components. Project managers bypass task permission checks; `BUDGET` has no manager
bypass. Subject ids keep adopted hat ids verbatim, so a legacy-looking id is not legacy permission.
Do not source current grants from the graph's historical ProjectRolePermission/global tables.

### Glass morphism styling

Use `glassLayerStyle` / `glassLayerLightStyle` from `@/components/shared/glassStyles`.
These are used in 40+ files. Do NOT use `backdrop-filter: blur()` — it was removed
for Safari CPU performance. The constants use opacity-based fallbacks instead.

## Environment Variables

All prefixed `NEXT_PUBLIC_*`. `NEXT_PUBLIC_PIMLICO_API_KEY` is required for passkey auth.
RPCs and subgraph URLs have hardcoded fallbacks in `config/networks.js`.
No `.env` file is committed — defaults work for read-only browsing.

E2E mode (`NEXT_PUBLIC_E2E_MODE=true`) reads `~/.poa/e2e.env` (machine-level,
shared across workspaces). All `NEXT_PUBLIC_E2E_*` vars are force-inlined at
build time via webpack `DefinePlugin` in `next.config.mjs` so production builds
tree-shake every E2E branch. The `yarn e2e:check` guard verifies this on every
build. Never read these env vars at runtime in non-E2E code paths.
