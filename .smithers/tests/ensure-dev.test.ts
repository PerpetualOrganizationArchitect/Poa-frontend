// Deterministic tests for ensure-dev.sh's fail-closed behaviour (lesson 1 + 2).
//
// The reuse/refuse DECISION logic (foreign checkout vs our own, drift, health) is
// unit tested against its canonical spec `decideDevServer` in test6-lib.test.ts;
// the fingerprint freeze/check contract is in test6-scripts.test.ts. Here we
// exercise the REAL bash entrypoint on the paths that run WITHOUT a live listener:
// the usage guard and the drift-refusal. No dev server, browser, or tx is started.
import { describe, expect, test, afterAll } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const scriptsDir = resolve(import.meta.dir, "..", "scripts");
const repoRoot = resolve(import.meta.dir, "..", "..");
const ENSURE = join(scriptsDir, "ensure-dev.sh");
const FP = join(scriptsDir, "source-fingerprint.sh");

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) {
    try {
      fn();
    } catch {
      /* best effort */
    }
  }
});

function run(args: string[]) {
  return spawnSync("bash", [ENSURE, ...args], { cwd: repoRoot, encoding: "utf8", timeout: 60_000 });
}

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const srv = createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as any).port as number;
      srv.close(() => resolvePort(port));
    });
  });
}

function waitUntil(cond: () => boolean, timeoutMs = 5000, stepMs = 40): Promise<void> {
  return new Promise((res, rej) => {
    const t0 = Date.now();
    const tick = () => {
      if (cond()) return res();
      if (Date.now() - t0 > timeoutMs) return rej(new Error("waitUntil timeout"));
      setTimeout(tick, stepMs);
    };
    tick();
  });
}

describe("ensure-dev.sh — fail-closed guards", () => {
  test("both support scripts are syntactically valid bash", () => {
    for (const s of [ENSURE, FP]) {
      const r = spawnSync("bash", ["-n", s], { encoding: "utf8" });
      expect(r.status).toBe(0);
    }
  });

  test("refuses to run without a resolved port (usage guard)", () => {
    const r = run([]);
    expect(r.status).not.toBe(0);
    expect(`${r.stdout}${r.stderr}`).toMatch(/usage: ensure-dev\.sh/);
  });

  test("refuses (exit 4) and starts NOTHING when the frozen snapshot no longer matches", async () => {
    const port = await freePort();
    const dir = mkdtempSync(join(tmpdir(), "t6-snap-"));
    const snap = join(dir, "source-fingerprint.json");
    // A snapshot whose fingerprint cannot match the real current source => drift.
    writeFileSync(snap, JSON.stringify({ fingerprint: "deadbeef-" + "0".repeat(64) }));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));

    const r = run([String(port), snap]);
    expect(r.status).toBe(4);
    expect(`${r.stdout}${r.stderr}`).toMatch(/REFUSE/);

    // The refusal must be pre-emptive: no server may be left listening on the port.
    const check = spawnSync("bash", ["-c", `lsof -ti tcp:${port} -sTCP:LISTEN 2>/dev/null || true`], { encoding: "utf8" });
    expect(check.stdout.trim()).toBe("");
  });

  test("refuses (exit 3) and does NOT kill a listener whose cwd is not our poa-app (lesson 2)", async () => {
    const port = await freePort();
    const dir = mkdtempSync(join(tmpdir(), "t6-foreign-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));

    // A foreign listener: a plain node net server whose cwd is a tmpdir, NOT poa-app.
    const child = spawn(
      process.execPath,
      ["-e", `require('net').createServer(()=>{}).listen(${port},'127.0.0.1',()=>console.log('LISTENING'))`],
      { cwd: dir, stdio: ["ignore", "pipe", "ignore"] },
    );
    let ready = false;
    let exited = false;
    child.stdout?.on("data", (b) => { if (String(b).includes("LISTENING")) ready = true; });
    child.on("exit", () => { exited = true; });
    cleanups.push(() => { try { child.kill("SIGKILL"); } catch { /* already gone */ } });

    await waitUntil(() => ready);

    // No snapshot -> the fingerprint gate is a no-op, so ONLY the cwd isolation
    // decides the outcome: the listener isn't ours, so refuse and leave it alone.
    const r = run([String(port)]);
    expect(r.status).toBe(3);
    expect(`${r.stdout}${r.stderr}`).toMatch(/REFUSE/);

    // The foreign listener must be untouched — never killed by us.
    expect(exited).toBe(false);
    expect(child.killed).toBe(false);
  });
});
