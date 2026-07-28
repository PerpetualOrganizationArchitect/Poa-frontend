// Repo-level commands surfaced to workflows as backpressure gates.
// All poa-app scripts run from poa-app/, so each command cd's in first.
//
// The real correctness gate for this static-export Next app is `yarn build`
// (compile), plus the Test6 browser verification driven via the Playwright MCP
// in the dedicated `test6-verify` workflow. See poa-app/package.json + CLAUDE.md.
//
//   build         cd poa-app && yarn build           # next build (hard compile gate)
//   e2e leak      cd poa-app && yarn e2e:check        # run when E2E-intercepted files change
//   browser/Test6 cd poa-app && yarn dev:e2e-passkey  # passkey identity, full perms on Test6
export const repoCommands = {
  lint: "cd poa-app && yarn lint",
  test: null, // no unit/integration tests yet; vitest is wired (`yarn test`) once specs exist
  coverage: null,
} as const;

export default { repoCommands };
