// Deterministic tests for the source-fingerprint freeze/check contract (lesson 2/6).
// Exercises the real bash script against the real repo — no product source is
// mutated; drift is simulated by tampering with a frozen snapshot file.
import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const smithersRoot = resolve(import.meta.dir, "..");
const script = join(smithersRoot, "scripts", "source-fingerprint.sh");

function run(args: string[]): { stdout: string; status: number } {
  try {
    const stdout = execFileSync("bash", [script, ...args], { cwd: smithersRoot, encoding: "utf8", timeout: 60_000 });
    return { stdout, status: 0 };
  } catch (e: any) {
    return { stdout: String(e.stdout ?? ""), status: typeof e.status === "number" ? e.status : 1 };
  }
}

describe("source-fingerprint.sh", () => {
  test("compute is deterministic across back-to-back runs", () => {
    const a = run(["compute"]);
    const b = run(["compute"]);
    expect(a.status).toBe(0);
    expect(a.stdout.trim()).toBe(b.stdout.trim());
    expect(a.stdout.trim()).toMatch(/^[0-9a-f]+-[0-9a-f]{64}$/); // <rev>-<sha256>
  });

  test("freeze records the current fingerprint and check passes against it", () => {
    const dir = mkdtempSync(join(tmpdir(), "t6-fp-"));
    const snap = join(dir, "source-fingerprint.json");
    const frozen = run(["freeze", snap]);
    expect(frozen.status).toBe(0);
    const snapshot = JSON.parse(readFileSync(snap, "utf8"));
    const current = run(["compute"]).stdout.trim();
    expect(snapshot.fingerprint).toBe(current);
    expect(snapshot.rev).toBeTruthy();

    const checked = run(["check", snap]);
    expect(checked.status).toBe(0);
  });

  test("check FAILS closed when the frozen fingerprint drifts", () => {
    const dir = mkdtempSync(join(tmpdir(), "t6-fp-"));
    const snap = join(dir, "source-fingerprint.json");
    run(["freeze", snap]);
    const snapshot = JSON.parse(readFileSync(snap, "utf8"));
    snapshot.fingerprint = "deadbeef-" + "0".repeat(64); // simulate source drift
    writeFileSync(snap, JSON.stringify(snapshot));

    const checked = run(["check", snap]);
    expect(checked.status).toBe(1);
  });

  test("check errors on a missing snapshot", () => {
    const checked = run(["check", join(tmpdir(), "does-not-exist-t6.json")]);
    expect(checked.status).toBe(2);
  });

  test("scope covers served-app source + config, not just poa-app/src (lesson 7)", () => {
    const listed = run(["files"]);
    expect(listed.status).toBe(0);
    const files = listed.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
    // src is still covered...
    expect(files.some((f) => f.startsWith("poa-app/src/"))).toBe(true);
    // ...plus the config + assets that actually shape what the dev server serves.
    expect(files).toContain("poa-app/next.config.mjs");
    expect(files).toContain("poa-app/jsconfig.json");
    expect(files).toContain("poa-app/package.json");
    expect(files.some((f) => f.startsWith("poa-app/abi/"))).toBe(true);
    expect(files.some((f) => f.startsWith("poa-app/public/"))).toBe(true);
    // ...while ignored/generated/runtime artifacts stay OUT.
    expect(files.some((f) => f.includes("/.next/") || f.includes("/node_modules/"))).toBe(false);
  });

  test("$SOURCE_FP_SCOPE overrides the scope (space-separated)", () => {
    const scoped = spawnScoped(["files"], "poa-app/package.json");
    expect(scoped.status).toBe(0);
    const files = scoped.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
    expect(files).toEqual(["poa-app/package.json"]);
  });
});

function spawnScoped(args: string[], scope: string): { stdout: string; status: number } {
  try {
    const stdout = execFileSync("bash", [script, ...args], {
      cwd: smithersRoot,
      encoding: "utf8",
      timeout: 60_000,
      env: { ...process.env, SOURCE_FP_SCOPE: scope },
    });
    return { stdout, status: 0 };
  } catch (e: any) {
    return { stdout: String(e.stdout ?? ""), status: typeof e.status === "number" ? e.status : 1 };
  }
}
