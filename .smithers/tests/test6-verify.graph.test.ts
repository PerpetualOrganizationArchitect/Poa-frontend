// Registered graph test for the REAL test6-verify workflow module (lesson 6).
//
// Renders the workflow through the shipped `smithers graph` extractor — the exact
// path a real `smithers up` run uses — for both verifyDepth modes, then asserts the
// node ids, dependency order, branch shape, the Timer split, and on-chain vs
// read-only behavior. Rendering via the CLI (rather than importing the module in
// process) is deliberate: the module pulls the full effect/* runtime that only
// loads reliably through the packaged bin.
import { describe, expect, test, beforeAll } from "bun:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const smithersRoot = resolve(import.meta.dir, "..");
const smithersBin = join(smithersRoot, "node_modules", ".bin", "smithers");
const workflowPath = join(smithersRoot, "workflows", "test6-verify.tsx");

type XmlNode =
  | { kind: "element"; tag: string; props: Record<string, string>; children: XmlNode[] }
  | { kind: "text"; text: string };

interface Rendered {
  order: string[]; // preorder task/timer ids
  byId: Map<string, { tag: string; props: Record<string, string>; text: string }>;
}

function renderGraph(input: Record<string, unknown>): Rendered {
  const out = execFileSync(
    process.execPath,
    [smithersBin, "graph", workflowPath, "--format", "json", "--input", JSON.stringify(input)],
    { cwd: smithersRoot, encoding: "utf8", timeout: 180_000, env: { ...process.env, TEST6_DEV_PORT: "3199" } },
  );
  const parsed = JSON.parse(out);
  if (!parsed.xml) throw new Error(`graph render produced no xml: ${out.slice(0, 300)}`);

  const order: string[] = [];
  const byId = new Map<string, { tag: string; props: Record<string, string>; text: string }>();
  const textOf = (n: XmlNode): string => {
    if (n.kind === "text") return n.text;
    return (n.children ?? []).map(textOf).join("");
  };
  const walk = (n: XmlNode) => {
    if (n.kind !== "element") return;
    const id = n.props?.id;
    if (id) {
      const tag = n.tag.replace("smithers:", "");
      order.push(id);
      byId.set(id, { tag, props: n.props, text: textOf(n) });
    }
    (n.children ?? []).forEach(walk);
  };
  walk(parsed.xml);
  return { order, byId };
}

/** True when `subseq` appears in `seq` in order (other ids may fall between). */
function isSubsequence(seq: string[], subseq: string[]): boolean {
  let i = 0;
  for (const s of seq) if (i < subseq.length && s === subseq[i]) i++;
  return i === subseq.length;
}

let ui: Rendered;
let onchain: Rendered;

beforeAll(() => {
  ui = renderGraph({ verifyDepth: "ui", prompt: "demo change" });
  onchain = renderGraph({ verifyDepth: "onchain", prompt: "demo change" });
}, 180_000); // two cold `smithers graph` renders (mdx compile) — give them room

describe("test6-verify graph — shared shape", () => {
  test("wrapped in the loop node", () => {
    expect(ui.byId.get("t6:loop")?.tag).toBe("ralph");
    expect(onchain.byId.get("t6:loop")?.tag).toBe("ralph");
  });
  test("common pipeline nodes exist in both modes", () => {
    for (const id of ["t6:implement", "t6:diff", "t6:build", "t6:freeze", "t6:dev-up", "t6:review:0", "t6:design-review"]) {
      expect(ui.byId.has(id)).toBe(true);
      expect(onchain.byId.has(id)).toBe(true);
    }
  });
  test("design review is the final task in both modes", () => {
    expect(ui.order[ui.order.length - 1]).toBe("t6:design-review");
    expect(onchain.order[onchain.order.length - 1]).toBe("t6:design-review");
  });
  test("freeze runs after build and before dev-up (source frozen before serving)", () => {
    for (const g of [ui, onchain]) {
      expect(isSubsequence(g.order, ["t6:build", "t6:freeze", "t6:dev-up"])).toBe(true);
    }
  });
  test("the loop gates on each current review node, not historical review rows", () => {
    const source = readFileSync(workflowPath, "utf8");
    expect(source).toContain('ctx.latest("review", `t6:review:${i}`)');
    expect(source).toContain("reviewsApproved(reviews)");
  });
});

describe("test6-verify graph — read-only (ui) branch", () => {
  test("has a single read-only verify task and none of the on-chain nodes", () => {
    expect(ui.byId.has("t6:verify")).toBe(true);
    for (const id of ["t6:mark", "t6:verify-create", "t6:verify-finalize", "t6:vote-window"]) {
      expect(ui.byId.has(id)).toBe(false);
    }
  });
  test("dependency order", () => {
    expect(isSubsequence(ui.order, [
      "t6:implement", "t6:diff", "t6:build", "t6:freeze", "t6:dev-up", "t6:verify", "t6:design-review",
    ])).toBe(true);
  });
  test("verify prompt is explicitly read-only", () => {
    const t = ui.byId.get("t6:verify")!.text;
    expect(t).toContain("READ-ONLY");
    expect(t).toContain("Do NOT send any on-chain transaction");
  });
});

describe("test6-verify graph — on-chain branch (create → wait → finalize)", () => {
  test("has the marker, split verify, and durable timer; no single read-only verify", () => {
    for (const id of ["t6:mark", "t6:verify-create", "t6:verify-finalize", "t6:vote-window"]) {
      expect(onchain.byId.has(id)).toBe(true);
    }
    expect(onchain.byId.has("t6:verify")).toBe(false);
  });
  test("timer is a durable Timer sitting BETWEEN create and finalize (lesson 4)", () => {
    const timer = onchain.byId.get("t6:vote-window");
    expect(timer?.tag).toBe("timer");
    expect(timer?.props.duration).toBe("10m");
    expect(isSubsequence(onchain.order, ["t6:verify-create", "t6:vote-window", "t6:verify-finalize"])).toBe(true);
  });
  test("full dependency order incl. marker before create", () => {
    expect(isSubsequence(onchain.order, [
      "t6:implement", "t6:diff", "t6:build", "t6:freeze", "t6:dev-up", "t6:mark",
      "t6:verify-create", "t6:vote-window", "t6:verify-finalize", "t6:design-review",
    ])).toBe(true);
  });
  test("create phase fires real tx, recovers-before-creating, and re-checks source", () => {
    const t = onchain.byId.get("t6:verify-create")!.text;
    expect(t).toContain("Fire real tx");
    expect(t).toContain("RECOVER-BEFORE-CREATE");
    expect(t).toMatch(/never re-?create|DO NOT create another/);
    expect(t).toContain("source-fingerprint.sh check");
    // The concrete marker is injected by the t6:mark compute task at RUN time; a
    // static graph render only shows the marker MECHANISM, which must be present.
    expect(t).toContain("RUN MARKER (idempotence");
    expect(t).toContain("ids.json");
    expect(t).toContain("sourceFingerprint");
    expect(t).toContain("txHashes");
    expect(t).toContain("FRESH run is required");
  });
  test("finalize phase keeps all the assertions (lesson 4)", () => {
    const t = onchain.byId.get("t6:verify-finalize")!.text;
    expect(t).toContain("SUCCESSFUL receipt");
    expect(t).toContain("ProposalExecutionFailed");
    expect(t).toContain("subgraph");
    expect(t).toContain("negative control");
    expect(t).toContain("source-fingerprint.sh check");
    expect(t).toContain("txHashes/userOpHashes arrays");
  });
});
