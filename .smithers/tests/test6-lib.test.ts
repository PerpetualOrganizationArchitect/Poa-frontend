// Deterministic unit tests for the pure test6-verify helpers (lib/test6.ts).
// These import ONLY zod + node builtins (no smithers runtime), so they are fast
// and portable on macOS + Linux. Run: `bun test tests/test6-lib.test.ts`.
import { describe, expect, test } from "bun:test";
import { join, resolve } from "node:path";
import {
  DEV_PORT_FALLBACK,
  resolveDevPort,
  sanitizeSegment,
  artifactRoot,
  artifactPaths,
  isGitignoredArtifactPath,
  fingerprintsMatch,
  deriveMarker,
  shouldCreateProposal,
  proposalRecoveryAction,
  reviewsApproved,
  decideDevServer,
  isWithin,
  pathsEqual,
  appDirFor,
  verifyOutputSchema,
  devUpSchema,
  fingerprintSchema,
  markerSchema,
  type DevServerState,
} from "../lib/test6";

const REPO = "/tmp/example-workspace";

describe("resolveDevPort — port precedence (lesson 1)", () => {
  test("prefers TEST6_DEV_PORT over everything", () => {
    expect(resolveDevPort({ TEST6_DEV_PORT: "3210", CONDUCTOR_PORT: "4000", DEV_PORT: "5000" })).toBe(3210);
  });
  test("falls back to CONDUCTOR_PORT when no explicit override", () => {
    expect(resolveDevPort({ CONDUCTOR_PORT: "4123", DEV_PORT: "5000" })).toBe(4123);
  });
  test("falls back to DEV_PORT, then to the hard fallback", () => {
    expect(resolveDevPort({ DEV_PORT: "5321" })).toBe(5321);
    expect(resolveDevPort({})).toBe(DEV_PORT_FALLBACK);
    expect(DEV_PORT_FALLBACK).toBe(3100);
  });
  test("ignores blank / non-numeric / out-of-range values and moves on", () => {
    expect(resolveDevPort({ TEST6_DEV_PORT: "  ", CONDUCTOR_PORT: "not-a-port", DEV_PORT: "3300" })).toBe(3300);
    expect(resolveDevPort({ TEST6_DEV_PORT: "0", CONDUCTOR_PORT: "70000", DEV_PORT: "-5" })).toBe(DEV_PORT_FALLBACK);
  });
});

describe("artifact paths — hygiene (lesson 5)", () => {
  test("everything lands under a per-run .context/test6-verify/<runId> tree", () => {
    const p = artifactPaths(REPO, "run-XYZ");
    const root = join(REPO, ".context", "test6-verify", "run-XYZ");
    expect(artifactRoot(REPO, "run-XYZ")).toBe(root);
    expect(p.root).toBe(root);
    expect(p.screenshots).toBe(join(root, "screenshots"));
    expect(p.gifs).toBe(join(root, "gifs"));
    expect(p.logs).toBe(join(root, "logs"));
    expect(p.ids).toBe(join(root, "ids.json"));
    expect(p.marker).toBe(join(root, "marker.json"));
    expect(p.fingerprint).toBe(join(root, "source-fingerprint.json"));
  });
  test("runId is sanitized so a hostile runId cannot escape the artifact tree", () => {
    expect(sanitizeSegment("../../etc/passwd")).not.toContain("..");
    const p = artifactPaths(REPO, "../../etc/passwd");
    expect(resolve(p.root).startsWith(resolve(REPO, ".context"))).toBe(true);
  });
  test("all artifact targets are recognized as gitignored, repo root is NOT", () => {
    const p = artifactPaths(REPO, "run1");
    for (const target of [p.root, p.screenshots, p.gifs, p.logs, p.ids, p.marker, p.fingerprint]) {
      expect(isGitignoredArtifactPath(REPO, target)).toBe(true);
    }
    expect(isGitignoredArtifactPath(REPO, join(REPO, "shot.png"))).toBe(false);
    expect(isGitignoredArtifactPath(REPO, join(REPO, "poa-app", "shot.gif"))).toBe(false);
  });
});

describe("source fingerprint match (lesson 2)", () => {
  test("matches only exact (trimmed) fingerprints; null/undefined never match", () => {
    expect(fingerprintsMatch("abc", "abc")).toBe(true);
    expect(fingerprintsMatch(" abc ", "abc")).toBe(true);
    expect(fingerprintsMatch("abc", "abd")).toBe(false);
    expect(fingerprintsMatch(null, "abc")).toBe(false);
    expect(fingerprintsMatch("abc", undefined)).toBe(false);
    expect(fingerprintsMatch("", "")).toBe(false);
  });
});

describe("marker derivation + recovery (lesson 1/3)", () => {
  test("deriveMarker is stable for a runId — enables resume within the run", () => {
    const a = deriveMarker({ runId: "run-1", salt: "prompt" });
    const b = deriveMarker({ runId: "run-1", salt: "prompt" });
    expect(a).toBe(b);
    expect(a.startsWith("t6v-")).toBe(true);
  });
  test("deriveMarker is STABLE FOR THE ENTIRE RUN — it does NOT vary per loop iteration", () => {
    // The marker must recover the SAME proposal on every retry / later loop pass, so
    // nothing iteration-like may change it (lesson 1). Same run + same salt = same marker.
    const first = deriveMarker({ runId: "run-1", salt: "same-prompt" });
    const later = deriveMarker({ runId: "run-1", salt: "same-prompt" });
    expect(later).toBe(first);
    // The marker embeds NO per-iteration segment: it is exactly t6v-<runId>-<digest>.
    expect(first).toBe(`t6v-run-1-${first.split("-").pop()}`);
  });
  test("different runs get different markers", () => {
    expect(deriveMarker({ runId: "run-A" })).not.toBe(deriveMarker({ runId: "run-B" }));
  });
  test("shouldCreateProposal is false once a proposal id exists (never duplicate)", () => {
    expect(shouldCreateProposal({ existingProposalId: null })).toBe(true);
    expect(shouldCreateProposal({ existingProposalId: "" })).toBe(true);
    expect(shouldCreateProposal({ existingProposalId: "  " })).toBe(true);
    expect(shouldCreateProposal({ existingProposalId: "42" })).toBe(false);
  });
  test("proposalRecoveryAction: create / resume / abort-stale (never duplicate on drift)", () => {
    // No proposal recorded yet -> create exactly one.
    expect(proposalRecoveryAction({ existingProposalId: null })).toBe("create");
    expect(proposalRecoveryAction({ existingProposalId: "" })).toBe("create");
    // Proposal exists AND was created against the same source -> resume it.
    expect(
      proposalRecoveryAction({ existingProposalId: "7", recordedFingerprint: "fp", currentFingerprint: "fp" }),
    ).toBe("resume");
    // Proposal exists but a later loop iteration re-implemented -> it is stale ->
    // fail and require a fresh run rather than duplicating (lesson 1/3).
    expect(
      proposalRecoveryAction({ existingProposalId: "7", recordedFingerprint: "OLD", currentFingerprint: "NEW" }),
    ).toBe("abort-stale");
    // An unprovable fingerprint (missing recorded) can't be resumed safely either.
    expect(proposalRecoveryAction({ existingProposalId: "7", currentFingerprint: "NEW" })).toBe("abort-stale");
  });
});

describe("review gate — current iteration only (lesson 4)", () => {
  test("reviewsApproved requires at least one present review and ALL present to approve", () => {
    // No current-iteration review yet -> not approved (never coast on an empty gate).
    expect(reviewsApproved([])).toBe(false);
    expect(reviewsApproved([null, undefined])).toBe(false);
    // The current review approves -> approved.
    expect(reviewsApproved([{ approved: true }])).toBe(true);
    // The current review rejects -> not approved (a stale approval must not leak in).
    expect(reviewsApproved([{ approved: false }])).toBe(false);
    // Any current reviewer rejecting blocks the gate.
    expect(reviewsApproved([{ approved: true }, { approved: false }])).toBe(false);
    expect(reviewsApproved([{ approved: true }, null])).toBe(true);
  });
});

describe("decideDevServer — workspace isolation (lesson 1/2)", () => {
  const base: DevServerState = {
    listener: null,
    workspaceRoot: REPO,
    healthy: false,
  };
  const APP = join(REPO, "poa-app");
  test("no listener + fingerprint ok => start-fresh; drift => refuse", () => {
    expect(decideDevServer({ ...base, listener: null })).toBe("start-fresh");
    expect(decideDevServer({ ...base, listener: null, expectedFingerprint: "x", currentFingerprint: "y" })).toBe("refuse-drift");
  });
  test("a foreign checkout's server is REFUSED (never reused, never killed)", () => {
    const foreign = { pid: 5, cwd: "/tmp/other-workspace/poa-app" };
    expect(decideDevServer({ ...base, listener: foreign, healthy: true })).toBe("refuse-foreign");
  });
  test("a listener under the repo but NOT exactly poa-app is REFUSED (not merely 'within')", () => {
    // The tightened rule (lesson 2): reuse/restart requires the EXACT poa-app cwd.
    // The repo root itself, or a nested source dir, must be treated as foreign.
    for (const cwd of [REPO, join(APP, "src"), join(APP, "src", "components")]) {
      expect(decideDevServer({ ...base, listener: { pid: 9, cwd }, healthy: true })).toBe("refuse-foreign");
    }
  });
  test("our own healthy server (cwd == exactly poa-app) with matching fingerprint => reuse", () => {
    const mine = { pid: 5, cwd: APP };
    expect(
      decideDevServer({ ...base, listener: mine, healthy: true, expectedFingerprint: "fp", currentFingerprint: "fp" }),
    ).toBe("reuse");
  });
  test("explicit appDir override is honoured for the exact-match check", () => {
    const mine = { pid: 5, cwd: "/custom/app" };
    expect(decideDevServer({ ...base, listener: mine, healthy: true, appDir: "/custom/app" })).toBe("reuse");
    expect(decideDevServer({ ...base, listener: mine, healthy: true, appDir: "/custom/other" })).toBe("refuse-foreign");
  });
  test("our own server that drifted from the frozen snapshot => refuse-drift (no silent pass)", () => {
    const mine = { pid: 5, cwd: APP };
    expect(
      decideDevServer({ ...base, listener: mine, healthy: true, expectedFingerprint: "fp", currentFingerprint: "STALE" }),
    ).toBe("refuse-drift");
  });
  test("our own UNHEALTHY server (current fingerprint) => restart", () => {
    const mine = { pid: 5, cwd: APP };
    expect(decideDevServer({ ...base, listener: mine, healthy: false })).toBe("restart");
  });
  test("pathsEqual / appDirFor: exact-match semantics", () => {
    expect(appDirFor(REPO)).toBe(APP);
    expect(pathsEqual(APP, APP)).toBe(true);
    expect(pathsEqual(APP + "/", APP)).toBe(true); // normalized
    expect(pathsEqual(join(APP, "src"), APP)).toBe(false);
    expect(pathsEqual(REPO, APP)).toBe(false);
  });
  test("isWithin still scopes child paths to a parent (used elsewhere)", () => {
    expect(isWithin(join(REPO, "poa-app"), REPO)).toBe(true);
    expect(isWithin(REPO, REPO)).toBe(true);
    expect(isWithin("/tmp/other/poa-app", REPO)).toBe(false);
    // sibling prefix must not count as "within"
    expect(isWithin(REPO + "-sibling/poa-app", REPO)).toBe(false);
  });
});

describe("output schemas capture recovery identifiers (lesson 3)", () => {
  test("verifyOutputSchema carries marker/proposalId + hash ARRAYS/actions with safe defaults (lesson 8)", () => {
    const parsed = verifyOutputSchema.parse({ verified: true });
    expect(parsed.runMarker).toBeNull();
    expect(parsed.proposalId).toBeNull();
    expect(parsed.userOpHash).toBeNull();
    expect(parsed.txHash).toBeNull();
    // Arrays default to empty so a multi-tx flow never clobbers hashes.
    expect(parsed.txHashes).toEqual([]);
    expect(parsed.userOpHashes).toEqual([]);
    expect(parsed.actions).toEqual([]);
    expect(parsed.sourceStable).toBe(true);
    expect(parsed.touchedMainnet).toBe(false);
    const full = verifyOutputSchema.parse({
      verified: true,
      proposalId: "0xabc-7",
      userOpHash: "0xdead",
      txHash: "0xbeef",
      txHashes: ["0xcreate", "0xvote1", "0xvote2", "0xfinalize"],
      userOpHashes: ["0xop1", "0xop2"],
      actions: [
        { kind: "create", txHash: "0xcreate", userOpHash: "0xop1", at: "2026-01-01T00:00:00Z" },
        { kind: "vote", txHash: "0xvote1" },
        { kind: "finalize", txHash: "0xfinalize" },
      ],
      runMarker: "t6v-run-abc",
      sourceStable: false,
    });
    expect(full.proposalId).toBe("0xabc-7");
    expect(full.sourceStable).toBe(false);
    // Every transaction is retained, not overwritten.
    expect(full.txHashes).toHaveLength(4);
    expect(full.userOpHashes).toEqual(["0xop1", "0xop2"]);
    expect(full.actions[0].kind).toBe("create");
    expect(full.actions[1].userOpHash).toBeNull(); // per-action defaults fill in
  });
  test("devUp / fingerprint / marker schemas validate their runtime shapes", () => {
    expect(devUpSchema.parse({ baseUrl: "http://localhost:3100", port: 3100 }).decision).toBe("start-fresh");
    expect(
      fingerprintSchema.parse({
        rev: "abc",
        dirtyHash: "d",
        fingerprint: "abc-d",
        workspace: REPO,
        snapshotFile: "/x.json",
        capturedAt: "now",
      }).fingerprint,
    ).toBe("abc-d");
    expect(markerSchema.parse({ marker: "t6v-x", attempt: 0, idsFile: "/i.json", markerFile: "/m.json" }).attempt).toBe(0);
  });
});
