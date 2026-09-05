// smithers-source: custom
//
// Pure, dependency-light helpers + output schemas for the test6-verify workflow.
//
// WHY this file exists separately from the workflow .tsx:
//   - It imports ONLY `zod` + node builtins, so `bun test` can import it directly
//     without pulling the full `smithers-orchestrator` runtime (which drags in the
//     effect/* server stack and is only reliably loadable through the CLI). That
//     keeps the deterministic unit tests fast and portable on macOS + Linux.
//   - The workflow imports its schemas + logic from here, so the tests assert the
//     SAME objects the real run uses — not a hand-built stand-in.
//
// The dev-server reuse decision (`decideDevServer`) is the canonical spec that
// `scripts/ensure-dev.sh` mirrors in bash; the unit tests pin the logic here.
import { z } from "zod/v4";
import { createHash } from "node:crypto";
import { join, resolve, sep } from "node:path";

// ---------------------------------------------------------------------------
// Output schemas (each is a distinct object so createSmithers maps it to its own
// durable table — a single Zod object can only bind to one output key).
// ---------------------------------------------------------------------------

export const buildOutputSchema = z.object({
  passed: z.boolean(),
  summary: z.string(),
  failingLog: z.string().nullable().default(null),
});

// One structured record per on-chain mutation (create / each vote / finalize), so
// a run that fires several transactions keeps EVERY hash instead of clobbering a
// single field (lesson 8).
export const onchainActionSchema = z.object({
  kind: z.string(), // "create" | "vote" | "finalize" | free-form
  txHash: z.string().nullable().default(null),
  userOpHash: z.string().nullable().default(null),
  at: z.string().nullable().default(null),
});

export const verifyOutputSchema = z.object({
  verified: z.boolean(),
  flowsTested: z.array(z.string()).default([]),
  gifPath: z.string().nullable().default(null),
  screenshotPaths: z.array(z.string()).default([]),
  issues: z.string().nullable().default(null),
  touchedMainnet: z.boolean().default(false),
  // Persisted-as-early-as-possible identifiers for on-chain recovery/idempotence.
  runMarker: z.string().nullable().default(null),
  proposalId: z.string().nullable().default(null),
  // A single on-chain flow fires MANY transactions/user-ops (create + N votes +
  // finalize). Collect them all (lesson 8) — the singular fields below are kept
  // for backwards compatibility and hold the FIRST / most-recent of each.
  txHashes: z.array(z.string()).default([]),
  userOpHashes: z.array(z.string()).default([]),
  actions: z.array(onchainActionSchema).default([]),
  userOpHash: z.string().nullable().default(null),
  txHash: z.string().nullable().default(null),
  sourceStable: z.boolean().default(true),
});

// Distinct object from reviewOutputSchema (same shape) so it registers under its
// own `designReview` table.
export const designReviewOutputSchema = z.object({
  reviewer: z.string(),
  approved: z.boolean(),
  feedback: z.string(),
  issues: z
    .array(
      z.object({
        severity: z.enum(["critical", "major", "minor", "nit"]),
        title: z.string(),
        file: z.string().nullable().default(null),
        description: z.string(),
      }),
    )
    .default([]),
});

export const devUpSchema = z.object({
  baseUrl: z.string(),
  port: z.number().int().positive(),
  decision: z.enum(["reuse", "restart", "start-fresh"]).default("start-fresh"),
  started: z.boolean().default(false),
});

export const diffSchema = z.object({ diff: z.string() });

// Frozen source-revision + dirty-diff fingerprint captured before live verification.
export const fingerprintSchema = z.object({
  rev: z.string(),
  dirtyHash: z.string(),
  fingerprint: z.string(),
  workspace: z.string(),
  snapshotFile: z.string(),
  capturedAt: z.string(),
});

// Run-stable on-chain marker (lesson 1/3) + the file where the verifier records
// on-chain ids. The marker does NOT vary per loop iteration — it identifies the
// single proposal this whole run is allowed to touch, so a retry recovers it
// instead of minting a duplicate. `attempt` is purely informational (the loop
// iteration during which the mark node last ran); it does not feed the marker.
// NB: `iteration` is a reserved output-table column, so the loop pass is `attempt`.
export const markerSchema = z.object({
  marker: z.string(),
  attempt: z.number().int().nonnegative(),
  idsFile: z.string(),
  markerFile: z.string(),
});

// ---------------------------------------------------------------------------
// Port resolution (lesson 1): Conductor allocated port when available, with a
// configurable safe fallback. Priority is explicit override → Conductor → generic
// → hard fallback, so an operator can always force a known-free port.
// ---------------------------------------------------------------------------

export const DEV_PORT_FALLBACK = 3100;

export function resolveDevPort(env: Record<string, string | undefined> = process.env): number {
  const candidates = [env.TEST6_DEV_PORT, env.CONDUCTOR_PORT, env.DEV_PORT];
  for (const raw of candidates) {
    if (raw == null || String(raw).trim() === "") continue;
    const n = Number(raw);
    if (Number.isInteger(n) && n > 0 && n < 65536) return n;
  }
  return DEV_PORT_FALLBACK;
}

// ---------------------------------------------------------------------------
// Artifact paths (lesson 5): everything lands under a gitignored .context path,
// scoped by runId so concurrent runs never collide.
// ---------------------------------------------------------------------------

export function sanitizeSegment(value: string): string {
  const cleaned = String(value ?? "")
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/\.{2,}/g, "-") // collapse ".." so a runId can never traverse out of .context
    .replace(/^[.\-]+|[.\-]+$/g, "");
  return cleaned || "run";
}

export function artifactRoot(repoRoot: string, runId: string): string {
  return join(repoRoot, ".context", "test6-verify", sanitizeSegment(runId));
}

export interface ArtifactPaths {
  root: string;
  screenshots: string;
  gifs: string;
  logs: string;
  ids: string;
  marker: string;
  fingerprint: string;
}

export function artifactPaths(repoRoot: string, runId: string): ArtifactPaths {
  const root = artifactRoot(repoRoot, runId);
  return {
    root,
    screenshots: join(root, "screenshots"),
    gifs: join(root, "gifs"),
    logs: join(root, "logs"),
    ids: join(root, "ids.json"),
    marker: join(root, "marker.json"),
    fingerprint: join(root, "source-fingerprint.json"),
  };
}

// A path is "safe" for artifacts if it lives under a gitignored .context/.smithers
// tree — used by tests to guarantee we never write screenshots to the repo root.
export function isGitignoredArtifactPath(repoRoot: string, candidate: string): boolean {
  const abs = resolve(repoRoot, candidate);
  const ctx = resolve(repoRoot, ".context") + sep;
  const smi = resolve(repoRoot, ".smithers") + sep;
  return abs.startsWith(ctx) || abs.startsWith(smi);
}

// ---------------------------------------------------------------------------
// Source fingerprint helpers (lesson 2).
// ---------------------------------------------------------------------------

export function fingerprintsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return String(a).trim() === String(b).trim();
}

// ---------------------------------------------------------------------------
// Marker + recovery/idempotence helpers (lesson 1/3).
//
// deriveMarker is deterministic in the runId ALONE (the salt only namespaces
// unrelated runs that happen to share an id): it is STABLE FOR THE ENTIRE RUN and
// does NOT vary per loop iteration. That is the whole point — a crash, a retry, or
// a later loop pass all recover the SAME on-chain proposal instead of minting a
// duplicate. When the code changes between iterations the run must ABORT (see
// proposalRecoveryAction), never fork a second proposal under a new marker.
// ---------------------------------------------------------------------------

export function deriveMarker(opts: { runId: string; salt?: string }): string {
  const { runId, salt } = opts;
  const digest = createHash("sha256")
    .update(`${runId} ${salt ?? ""}`)
    .digest("hex")
    .slice(0, 12);
  return `t6v-${sanitizeSegment(runId)}-${digest}`;
}

// Create a proposal ONLY when no proposal has already been recorded for this
// marker. The verifier calls this after loading its ids file / querying the
// subgraph so an interrupted run resumes instead of duplicating.
export function shouldCreateProposal(state: { existingProposalId?: string | null }): boolean {
  const id = state.existingProposalId;
  return !(id != null && String(id).trim() !== "");
}

// What the on-chain verifier must do when it (re)enters the create phase:
//   "create"      — no proposal recorded yet for this run's marker -> make exactly one.
//   "resume"      — a proposal exists AND was created against the SAME frozen source
//                   we are testing now -> operate on THAT proposal (cast missing
//                   votes / finalize); never make another.
//   "abort-stale" — a proposal exists but the source has since changed (a later loop
//                   iteration re-implemented). The existing proposal can no longer
//                   represent the code under test. FAIL and require a fresh run
//                   rather than creating a duplicate (lesson 1/3).
export type ProposalRecoveryAction = "create" | "resume" | "abort-stale";

export function proposalRecoveryAction(state: {
  existingProposalId?: string | null;
  recordedFingerprint?: string | null;
  currentFingerprint?: string | null;
}): ProposalRecoveryAction {
  if (shouldCreateProposal(state)) return "create";
  // A proposal already exists for this run's marker. Only resume it when it was
  // created against the exact source we're verifying now; otherwise it is stale.
  return fingerprintsMatch(state.recordedFingerprint, state.currentFingerprint) ? "resume" : "abort-stale";
}

// ---------------------------------------------------------------------------
// Review gate (lesson 4). The approval that unblocks the loop must come from the
// CURRENT iteration's review of the CURRENT code — pass the per-node LATEST rows
// (ctx.latest("review", "t6:review:<i>")). A stale approval from an earlier loop
// pass, or a stale rejection, must never leak in.
// ---------------------------------------------------------------------------

export function reviewsApproved(currentReviews: Array<{ approved?: boolean } | null | undefined>): boolean {
  const present = currentReviews.filter((r): r is { approved?: boolean } => r != null);
  return present.length > 0 && present.every((r) => r.approved === true);
}

// ---------------------------------------------------------------------------
// Dev-server reuse decision (lesson 1). Canonical spec mirrored by ensure-dev.sh.
// ---------------------------------------------------------------------------

export type DevServerDecision = "reuse" | "restart" | "start-fresh" | "refuse-foreign" | "refuse-drift";

export interface DevServerState {
  /** The process currently listening on the port, or null if the port is free. */
  listener: { pid: number; cwd: string } | null;
  /** Absolute path of THIS workspace (repo root). */
  workspaceRoot: string;
  /** Whether the listener answers HTTP 200. */
  healthy: boolean;
  /** Frozen verification snapshot fingerprint (null = no fingerprint gate). */
  expectedFingerprint?: string | null;
  /** Current on-disk fingerprint. */
  currentFingerprint?: string | null;
  /**
   * The exact app dir `next dev` runs in. Defaults to `<workspaceRoot>/poa-app`
   * because ensure-dev.sh `cd`s there before spawning the server, so a server we
   * own has that precise cwd — not the repo root, not a nested source dir.
   */
  appDir?: string;
}

export function isWithin(child: string, parent: string): boolean {
  const c = resolve(child);
  const p = resolve(parent);
  return c === p || c.startsWith(p.endsWith(sep) ? p : p + sep);
}

// Exact path equality after normalization (lesson 2 isolation). Reuse/restart is
// gated on the listener cwd being THIS workspace's poa-app dir precisely — a
// listener merely somewhere under the repo (repo root, poa-app/src, …) is treated
// as foreign so we never reuse or kill it.
export function pathsEqual(a: string, b: string): boolean {
  return resolve(a) === resolve(b);
}

export function appDirFor(workspaceRoot: string): string {
  return join(workspaceRoot, "poa-app");
}

export function decideDevServer(state: DevServerState): DevServerDecision {
  const { listener, workspaceRoot, healthy, expectedFingerprint, currentFingerprint } = state;
  const appDir = state.appDir ?? appDirFor(workspaceRoot);
  const fingerprintOk = !expectedFingerprint || fingerprintsMatch(expectedFingerprint, currentFingerprint);

  if (!listener) {
    // Even a fresh start must not serve code that drifted from the frozen snapshot.
    return fingerprintOk ? "start-fresh" : "refuse-drift";
  }
  // Only a listener whose cwd is EXACTLY our poa-app dir is ours. Anything else —
  // another checkout, an unknown process, or even our own repo root — is refused:
  // never silently reused, never killed.
  if (!pathsEqual(listener.cwd, appDir)) return "refuse-foreign";
  // Our own server: gate on the frozen snapshot, then on health.
  if (!fingerprintOk) return "refuse-drift";
  return healthy ? "reuse" : "restart";
}
