# Contributing to Poa-frontend

Thanks for considering a contribution. Poa is built by and for its members, and that includes the people who contribute code. This guide will get you from a clean clone to a merged PR.

If you haven't already, skim the [README](README.md) first. It explains how this repo slots into the broader [Poa stack](https://github.com/poa-box) (POP contracts, subgraph-pop indexer, poa-cli) and where the architectural seams are. That context will save you time here.

## How to get involved

The path in mirrors the rest of the Poa org:

1. **Pick up an issue.** Browse [open issues](https://github.com/poa-box/Poa-frontend/issues) and pick one that matches your interest. If you don't see anything obvious, search across the four active repos, since frontend work often involves contract or subgraph changes too.
2. **Open a PR.** Discussion is welcome, but a working diff is the fastest way to be taken seriously. Small, focused PRs get merged quickly; large refactors should be flagged in Discord first.
3. **Optional: join the Poa organization on-chain.** [Apply here](https://poa.box/home/?org=Poa). Members earn Participation Tokens for shipped work, vote on direction, and share treasury access. Poa runs on Poa, so you can govern the project that built the project.

For protocol-level discussion, ABI changes, security questions, or any change that crosses repo boundaries, [Discord](https://discord.gg/9SD6u4QjTt) first is the right move.

## Setup

```bash
# Volta is recommended; it auto-pins Node 22.23.2 from poa-app/package.json.
# (Or install Node 22.23.2 by hand.)

git clone https://github.com/poa-box/Poa-frontend.git
cd Poa-frontend/poa-app
yarn install
yarn dev          # http://localhost:3000
```

That's it for read-only browsing. The app ships hardcoded fallbacks for every RPC and subgraph, so no `.env` file is required to load org pages, view tasks, browse proposals, or read treasury data.

If you want to test passkey auth (ERC-4337 UserOps), set `NEXT_PUBLIC_PIMLICO_API_KEY` in a `.env.local` inside `poa-app/`. Without it the bundler calls fail and the app falls back to the EOA path.

Browser support targets are pinned in `poa-app/package.json` `browserslist`:

- Chrome ≥ 111
- Firefox ≥ 111
- Safari ≥ 16.4
- Edge ≥ 111

## Project layout

```
poa-app/
├── abi/                       # Contract ABIs. Imported as ../../abi/Foo.json.
├── posts/                     # In-app blog markdown.
└── src/
    ├── components/            # UI components, organized by feature area.
    ├── config/                # networks.js, contracts.js, theme. Source of truth.
    ├── context/               # React contexts. POContext is the multi-chain router.
    ├── features/              # Larger feature bundles (org deployer, tour).
    ├── hooks/                 # Custom hooks (useWeb3Services, useTx…).
    ├── lib/                   # Shared libs. errors/ErrorParser.js maps revert reasons.
    ├── pages/                 # Next.js routes. Keep them as thin wrappers.
    ├── services/web3/
    │   ├── core/              # ContractFactory, TransactionManager (EOA),
    │   │                      # SmartAccountTransactionManager (ERC-4337),
    │   │                      # eip7702/EOA7702TransactionManager.
    │   ├── domain/            # UserService, VotingService, TaskService, …
    │   └── utils/             # encoding.js (CID/ID parsing), chainClients.js.
    ├── styles/                # Global CSS + Chakra theme.
    ├── util/                  # queries, apolloClient, formatToken, permissions.
    └── utils/                 # Just profileUtils.js. Confusingly named, see below.
```

## Conventions

These are the rules that aren't obvious from the code. Some have history behind them; the short version is in each bullet, the long version is in [`CLAUDE.md`](CLAUDE.md) under the corresponding gotcha heading.

### Architecture rules

- **Pages are thin wrappers.** Files in `src/pages/` should set up routing and import a feature component. Logic and UI go in `src/components/` or `src/features/`. Keeps page-level rendering easy to reason about.
- **Service layer is mandatory for contract calls.** Components get services through `useWeb3Services()`. Don't import ethers or viem in a component; go through the right service. This keeps the EOA, passkey, and EIP-7702 logic in one place and lets `useWeb3Services()` swap the right `TransactionManager` in transparently.
- **Use `useTransactionWithNotification().executeWithNotification(...)`** for any user-initiated transaction. It handles the pending, success, and error toast flow consistently.
- **Cross-context updates go through `RefreshContext`.** Emit a `RefreshEvent` (e.g. `TASK_CREATED`, `PROPOSAL_VOTED`) after a transaction; subscribers refetch via `useRefreshSubscription`. Don't import contexts into each other to trigger refetches; that creates circular dependencies.
- **Provider order matters.** The provider tree in `_app.js` is dependency-sensitive: inner contexts depend on outer ones (e.g. `UserProvider` needs `POProvider`, `POProvider` needs `RefreshProvider`). Look before you reorder.

### Data plumbing

- **Subgraph queries use an endpoint-specific client.** `POContext` exposes `subgraphUrl` resolved from the org's chain. In React components, pass `useSubgraphClient(subgraphUrl)` as the query's `client`; use `getClient(subgraphUrl)` for imperative queries. Each endpoint has its own `ApolloClient` and cache, so no `fetchPolicy: 'no-cache'` workaround is needed. The deprecated `context: { subgraphUrl }` plumbing must not be used in new code.
- **Token amounts are 18-decimal wei.** Format with `formatTokenAmount` / `parseTokenAmount` from `src/util/formatToken.js`. Getting it wrong produces numbers that are 10^18 too large or too small and looks indistinguishable from a backend bug.
- **Composite IDs need parsing.** Subgraph entity IDs are `{contractAddress}-{numericId}`. Pass them through `parseTaskId`, `parseProjectId`, or `parseModuleId` from `src/services/web3/utils/encoding.js` before calling a contract. Wrong format = silent revert.
- **IPFS uses CIDv0 + bytes32.** Convert with `ipfsCidToBytes32` / `bytes32ToIpfsCid` from the same `encoding.js`. CIDv1 (`bafy…`) does not round-trip and will not work.
- **Optimistic updates have grace periods.** `UserContext` (15s) and `TaskBoardContext` (65s) hold an `optimisticLockRef` to prevent stale subgraph data from clobbering a just-applied optimistic update. The subgraph has indexing latency; these timeouts mask it. Don't reduce them without understanding the race.
- **Never hardcode chain IDs.** `src/config/networks.js` is the source of truth for chain IDs, RPC URLs, subgraph URLs, native currencies, and bounty token addresses. Add a chain there, not at the call site.

### Three util directories

```
src/util/                       queries.js, apolloClient.js, formatToken.js,
                                permissions.js, tokens.js, crossChainUsername.js, …
src/utils/                      profileUtils.js (and only profileUtils.js)
src/services/web3/utils/        encoding.js (CID + ID parsing), chainClients.js
```

`encoding.js` is in `services/web3/utils/`, not `src/util/`. If you go looking for `parseTaskId` and can't find it, that's why.

### Imports

- Use the `@/*` path alias for everything inside `src/`. It resolves to `poa-app/src/*` per `poa-app/jsconfig.json`.
- ABIs live at `poa-app/abi/`, outside `src/`. Import them with relative paths: `import TaskManagerNew from '../../abi/TaskManagerNew.json'`.

### Permissions

Task permissions are hat-based (Hats Protocol), tracking the contract-side `TaskPerm.sol`. Use the helpers in `src/util/permissions.js`:

- `projectTaskPermissions(project, userHatIds, address)` — resolves every bit for one project, mirroring TaskManager's `_checkPerm` (the per-hat mask, where a non-zero project mask *replaces* the hat's global mask, OR being one of that project's managers).
- `taskEditRights(perms, columnId)` — the status half of `updateTask` / `updateTaskMetadata`.
- `BUDGET` is the one permission with **no** project-manager bypass (`_requireBudgetEditor`).
- Never gate on a `roleHatIds` index. Role order carries no authority — on an org whose senior role deployed first, `roleHatIds[1]` is the *junior* role.

### Styling

- Chakra UI 2 with custom palettes (`coral`, `rose`, `amethyst`, `warmGray`) and custom variants (`glass`, `elevated`, `primary`). The theme is defined inline in `_app.js`.
- Use `glassLayerStyle` / `glassLayerLightStyle` from `@/components/shared/glassStyles` for glass-morphism surfaces (40+ files use them). Do **not** add `backdrop-filter: blur()`; it was removed for Safari CPU performance and the existing constants use opacity-based fallbacks.

### Errors

`ErrorParser.js` (in `src/lib/errors/`) maps 26+ custom contract error selectors and revert strings to user-friendly messages. Let the service layer catch and parse contract errors; don't catch and reformat them in components.

## Cross-repo flow

A frontend feature often needs contract changes too. The order is:

1. **POP.** Write and test the contract change. Foundry, AGPL-3.0, upgradeable beacon. PR there.
2. **subgraph-pop.** Sync the new ABI, contract address, and start block. Adjust mappings and schema if the contract emits new events. PR there.
3. **Poa-frontend.** Bump the ABI under `poa-app/abi/`, add or update queries in `src/util/queries.js`, and wire the new flow through the appropriate domain service. PR here.

When you open a frontend PR that depends on POP and/or subgraph-pop changes, link the related PRs in the description. If your changes can't merge until the others land, mark the PR as draft.

If you're a member of the Poa org and the existing `subgraph-updater` automation applies to your change, use it. It handles the routine ABI and address sync after a contracts deploy.

## Code style

- **JavaScript, not TypeScript.** Despite TS being installed (it powers path resolution and types for editor support), source files are `.js` / `.jsx`. Don't migrate files to TypeScript without prior agreement; the project is intentionally JS.
- **No Prettier, no formatter.** Match the surrounding code's style. `yarn lint` runs ESLint with the Next.js Core Web Vitals rules.
- **Pure logic is unit tested with Vitest.** Colocate `*.test.js` files with pure modules, primarily under `src/lib/**` and `src/util/**`, and run them with `yarn test`. React-coupled and transaction flows are verified through the Test6 E2E harness described in `CLAUDE.md`.
- **No emoji in source files.** Comments and code stay text-only.
- **Comments only when the *why* is non-obvious.** Don't restate what the code does. If a comment would say "this is a workaround because X", "this timeout exists because the subgraph lags", or "Safari needs this", that's the kind of comment to write.

## PR process

1. **Branch off `main`.** Use a short, specific name (e.g. `fix/voting-tally-rounding`, not `feature/stuff`).
2. **Run `yarn lint` and `yarn build` locally before requesting review.** The build catches static-export breakers (`output: 'export'` is strict about unsupported APIs); lint catches the rest.
3. **For UI changes, include a screenshot or short video.** If you can, include before/after.
4. **Manual test plan in the PR description.** For UI and transaction flows, state what you clicked, on what chain, with what auth method, and what you saw.
5. **Cross-repo links** if applicable: POP and/or subgraph-pop PRs that this depends on.
6. **Squash-merge** is the default. Keep your commit messages focused; they become the squashed message.

## Reporting bugs and requesting features

Open an issue. For bugs, please include:

- The chain (Arbitrum, Gnosis, Sepolia, Base Sepolia)
- The auth method (passkey, or name the EOA wallet)
- The org slug if relevant
- Steps to reproduce, expected vs actual
- Browser console errors and a screenshot

For feature requests, describe the problem first, then the proposed solution, then alternatives you considered. Cross-repo implications (does this need POP or subgraph-pop changes?) should be called out up front.

## Security

For anything that could let an attacker trick a user's wallet or passkey into signing something unintended, exfiltrate secrets, or route traffic to an attacker-controlled subgraph or RPC: **do not file a public issue**. Email [hudson@poa.community](mailto:hudson@poa.community) with subject prefix `[security]`. We may publish a formal `SECURITY.md` later.

## License

AGPL-3.0. See [`LICENSE`](LICENSE). By submitting a pull request you agree to license your contribution under the same terms. The AGPL is the right fit here because Poa is software run as a service for end users, and we want any downstream operator who modifies the frontend to share their changes back.
