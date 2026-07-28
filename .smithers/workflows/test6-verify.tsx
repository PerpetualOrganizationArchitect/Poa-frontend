// smithers-source: custom
// smithers-metadata-version: 1
// smithers-display-name: Test6 Verify
// smithers-description: Implement a poa-app change, then gate on yarn build + a Playwright verification (fast read-only UI by default, full on-chain Test6 opt-in) + independent code review + independent design review of the screenshots. Loops until all pass.
// smithers-tags: poa, frontend, verify, test6, loop
/** @jsxImportSource smithers-orchestrator */
import { Sequence, Parallel, Loop, Task } from "smithers-orchestrator";
import { createSmithers } from "smithers-orchestrator";
import { z } from "zod/v4";
import { providers } from "../agents";
import { implementOutputSchema } from "../components/ValidationLoop";
import { Review, reviewOutputSchema } from "../components/Review";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const buildOutputSchema = z.object({
  passed: z.boolean(),
  summary: z.string(),
  failingLog: z.string().nullable().default(null),
});

const verifyOutputSchema = z.object({
  verified: z.boolean(),
  flowsTested: z.array(z.string()).default([]),
  gifPath: z.string().nullable().default(null),
  screenshotPaths: z.array(z.string()).default([]),
  issues: z.string().nullable().default(null),
  touchedMainnet: z.boolean().default(false),
});

// Distinct object from reviewOutputSchema (same shape) so it registers under its
// own `designReview` table — a Zod object can only map to one output key.
const designReviewOutputSchema = z.object({
  reviewer: z.string(),
  approved: z.boolean(),
  feedback: z.string(),
  issues: z.array(z.object({
    severity: z.enum(["critical", "major", "minor", "nit"]),
    title: z.string(),
    file: z.string().nullable().default(null),
    description: z.string(),
  })).default([]),
});

const devUpSchema = z.object({ baseUrl: z.string(), started: z.boolean().default(false) });
const diffSchema = z.object({ diff: z.string() });

const inputSchema = z.object({
  prompt: z.string().default("Implement and verify the requested poa-app change."),
  // "ui" (default) = fast read-only browser check, no tx. "onchain" = full Test6 flow with real tx.
  verifyDepth: z.enum(["ui", "onchain"]).default("ui"),
  maxIterations: z.number().int().positive().default(2),
});

const { Workflow, smithers } = createSmithers({
  input: inputSchema,
  implement: implementOutputSchema,
  build: buildOutputSchema,
  verify: verifyOutputSchema,
  review: reviewOutputSchema,
  designReview: designReviewOutputSchema,
  devUp: devUpSchema,
  diff: diffSchema,
});

const LONG = 1_800_000; // 30 min cap — dev server + Playwright runs are slow
const HEARTBEAT = 600_000;
// Verify boots a dev server (cold compile) + (onchain) waits on tx + subgraph
// re-index, so long quiet stretches are normal — give it a longer heartbeat.
const VERIFY_HEARTBEAT = 1_200_000; // 20 min
const DEV_PORT = 3100; // fixed port so dev servers are reused, not stacked
const repoRoot = join(import.meta.dir, "..", "..");
const ensureDevScript = join(import.meta.dir, "..", "scripts", "ensure-dev.sh");

export default smithers((ctx) => {
  const prompt = ctx.input.prompt;
  const depth = ctx.input.verifyDepth;

  // Gate reads (mirrors the seeded `implement` workflow: latest row per node).
  const build = ctx.outputMaybe("build", { nodeId: "t6:build" });
  const verify = ctx.outputMaybe("verify", { nodeId: "t6:verify" });
  const design = ctx.outputMaybe("designReview", { nodeId: "t6:design-review" });
  const reviews = ctx.outputs.review ?? [];

  const buildPassed = build?.passed === true;
  const verified = verify?.verified === true;
  const anyApproved = reviews.length > 0 && reviews.some((r: any) => r.approved === true);
  const designApproved = design?.approved === true;
  const done = buildPassed && verified && anyApproved && designApproved;

  // Aggregate failures into feedback the next implement attempt must fix first.
  const feedbackParts: string[] = [];
  if (build && !buildPassed && build.failingLog) {
    feedbackParts.push(`BUILD FAILED:\n${build.failingLog}`);
  }
  if (verify && !verified) {
    if (verify.touchedMainnet) {
      feedbackParts.push("STOPPED: the flow would touch a mainnet org / multisig. Do not execute; this needs human approval.");
    } else if (verify.issues) {
      feedbackParts.push(`VERIFICATION FAILED:\n${verify.issues}`);
    }
  }
  for (const review of reviews) {
    if (review.approved === false) {
      feedbackParts.push(`CODE REVIEWER REJECTED:\n${review.feedback}`);
      for (const issue of review.issues ?? []) {
        feedbackParts.push(`  [${issue.severity}] ${issue.title}: ${issue.description}${issue.file ? ` (${issue.file})` : ""}`);
      }
    }
  }
  if (design && !designApproved) {
    feedbackParts.push(`DESIGN REVIEWER REJECTED (visual/UX):\n${design.feedback}`);
    for (const issue of design.issues ?? []) {
      feedbackParts.push(`  [${issue.severity}] ${issue.title}: ${issue.description}${issue.file ? ` (${issue.file})` : ""}`);
    }
  }
  const feedback = feedbackParts.length > 0 ? feedbackParts.join("\n\n") : null;

  const implementPrompt = `You are implementing a focused frontend change in the poa-app/ Next.js app. This repo's CLAUDE.md is authoritative — follow it exactly (service layer for ALL contract calls via useWeb3Services, @/ imports never relative, Chakra theme + glassLayerStyle, no backdrop-filter, token amounts via formatTokenAmount, subgraph queries pass context:{subgraphUrl}, parseTaskId/parseProjectId for composite ids).

CHANGE REQUESTED:
${prompt}

Rules:
- Keep the diff focused and production-grade; touch only what the change needs.
- Do NOT start the dev server or a browser here — a later step verifies it.
- Return a summary and the exact list of files you changed.${feedback ? `\n\nPREVIOUS ATTEMPT FEEDBACK — fix every item before doing anything else:\n${feedback}` : ""}`;

  const buildPrompt = `Run this repo's compile + E2E-leak gate from the repo root. Do NOT edit code in this step.

  cd poa-app && yarn build

If any E2E-intercepted file changed (AuthContext.js, _app.js, passkeySign.js, passkeyCreate.js, ProviderConverter.jsx, or anything under src/services/e2e/), ALSO run:

  cd poa-app && yarn e2e:check

Set passed=true ONLY if \`yarn build\` exits 0 (and e2e:check passes when it was required). On failure, put the tail of the error output in failingLog so the next iteration can fix it.`;

  const verifyCommon = `See CLAUDE.md "Frontend changes: verify on Test6" for repo facts (Test6 authorization, identities).

DEV SERVER (operator-managed — do NOT start, restart, or kill one):
1. A single clean dev server is expected at http://localhost:${DEV_PORT}. Check it first: \`curl -s -o /dev/null -w '%{http_code}' http://localhost:${DEV_PORT}\`.
2. If it returns 200, drive ALL Playwright navigation against http://localhost:${DEV_PORT} (browser_navigate / browser_snapshot / browser_take_screenshot / browser_click / browser_fill_form).
3. If it does NOT return 200, STOP and report: set verified=false and issues="dev server on ${DEV_PORT} not healthy (HTTP <code>) — operator must start one clean node dev server". Do NOT start your own: this repo's next dev servers share poa-app/.next/, so a second one races and corrupts webpack chunks (Cannot find module .../react-icons.js) — which is exactly what breaks pages in Chromium. Never spawn a competing server.
4. Save screenshots with browser_take_screenshot into the .playwright-mcp/ directory (NEVER the repo root) and return their absolute paths in screenshotPaths for the design-review step.
5. Your FINAL message must be ONLY the JSON object — no prose, no code fences, no trailing text.

CHANGE TO VERIFY:
${prompt}`;

  const verifyPrompt = depth === "onchain"
    ? `Verify the change END-TO-END on Test6 — the authorized Gnosis sandbox. Fire real tx there.

${verifyCommon}

Drive the REAL flow: actually click Save / Submit / Publish and watch the tx land + the subgraph re-index — do NOT stop at "the diff looks right". Seed any required on-chain state on Test6 if the flow needs it.

HARD STOP: if the flow would touch a mainnet org, a multi-sig broadcast, or anything that burns real value, set verified=false and touchedMainnet=true and explain — do NOT execute it.

Set verified=true only if the flow works end-to-end. Put exercised flows in flowsTested, problems in issues.`
    : `Verify the change in the browser — FAST and READ-ONLY. Do NOT send any on-chain transaction in this mode.

${verifyCommon}

Navigate to the relevant screen(s) and confirm the change renders and behaves correctly. If seeing the change requires specific existing data (e.g. an existing record/state), navigate to an org that already has it (read-only) rather than creating it. Do not click Save / Submit / Publish or anything that signs a tx.

Set verified=true only if the change renders and behaves correctly read-only. Put what you checked in flowsTested, problems in issues. (If the change genuinely cannot be verified without an on-chain write, say so in issues and set verified=false — the run can be re-launched with verifyDepth="onchain".)`;

  const shots = verify?.screenshotPaths ?? [];
  const designReviewPrompt = `You are an INDEPENDENT design reviewer. You did not build this change. The implementation was just verified and captured these screenshots${verify?.gifPath ? ` plus a gif (${verify.gifPath})` : ""}:
${shots.length ? shots.map((p) => `- ${p}`).join("\n") : "(no screenshots captured — if so, set approved=false and say the verify step produced no visual evidence)"}

Read EACH screenshot image with the Read tool (it renders images visually). Judge ONLY the visual / UX quality of the change below:
- Does it look polished and production-grade?
- Does it fit poa's EXISTING design system: glass morphism (glassLayerStyle / glassLayerLightStyle), the custom coral / rose / amethyst / warmGray palette, the typographic style already used on the page, consistent spacing & alignment?
- Does it match the surrounding existing UI rather than inventing a new visual language?
- Are empty states, loading states, and any cards visually clean and legible (incl. mobile if shown)?

CHANGE:
${prompt}

Set reviewer to "design-reviewer". Approve ONLY if the UI looks good AND fits existing patterns. Otherwise reject (approved=false) with specific, actionable visual fixes in feedback/issues.`;

  // HARDENING 1: feed the reviewer the actual diff so it reviews changed lines
  // instead of re-exploring the whole repo (the slow part of the run).
  const diffRow = ctx.outputMaybe("diff", { nodeId: "t6:diff" });
  const reviewPrompt = diffRow?.diff
    ? `${prompt}\n\n--- REVIEW THIS DIFF (focus ONLY on the changed lines below; do not re-audit unrelated code or re-explore the whole repo) ---\n${diffRow.diff}`
    : prompt;

  return (
    <Workflow name="test6-verify">
      <Loop id="t6:loop" until={done} maxIterations={ctx.input.maxIterations} onMaxReached="return-last">
        <Sequence>
          <Task id="t6:implement" output={implementOutputSchema} agent={[providers.claude]} timeoutMs={LONG} heartbeatTimeoutMs={HEARTBEAT}>
            {implementPrompt}
          </Task>
          {/* capture implement's diff (uncommitted, else branch-vs-main) for the reviewer */}
          <Task id="t6:diff" output={diffSchema}>
            {() => {
              let d = "";
              const args = (range: string) => ["--no-pager", "diff", range, "--", "poa-app/src"];
              try {
                d = execFileSync("git", args("HEAD"), { cwd: repoRoot, encoding: "utf8", maxBuffer: 20_000_000 });
                if (!d.trim()) d = execFileSync("git", args("origin/main...HEAD"), { cwd: repoRoot, encoding: "utf8", maxBuffer: 20_000_000 });
              } catch { /* git unavailable — reviewer falls back to the prompt */ }
              return { diff: d.slice(0, 60_000) || "(no diff captured — review the change described in the prompt)" };
            }}
          </Task>
          <Task id="t6:build" output={buildOutputSchema} agent={[providers.claudeSonnet]} timeoutMs={LONG} heartbeatTimeoutMs={HEARTBEAT}>
            {buildPrompt}
          </Task>
          {/* HARDENING 2: deterministically ensure exactly ONE clean node-20.10 dev
              server (reuse if healthy, else kill stale + clear .next + start one).
              Removes the agent from server lifecycle entirely. */}
          <Task id="t6:dev-up" output={devUpSchema}>
            {() => {
              execFileSync("bash", [ensureDevScript, String(DEV_PORT)], { stdio: "inherit", timeout: 400_000 });
              return { baseUrl: `http://localhost:${DEV_PORT}`, started: true };
            }}
          </Task>
          {/* verify (browser) and the code review (reads the diff) are independent —
              run them concurrently to overlap the two slow steps. */}
          <Parallel>
            <Task id="t6:verify" output={verifyOutputSchema} agent={[providers.claude]} timeoutMs={LONG} heartbeatTimeoutMs={VERIFY_HEARTBEAT}>
              {verifyPrompt}
            </Task>
            <Review idPrefix="t6:review" prompt={reviewPrompt} agents={[providers.claudeSonnet]} />
          </Parallel>
          {/* design review reads verify's screenshots, so it stays after the Parallel */}
          <Task id="t6:design-review" output={designReviewOutputSchema} agent={[providers.claudeSonnet]} continueOnFail timeoutMs={LONG} heartbeatTimeoutMs={HEARTBEAT}>
            {designReviewPrompt}
          </Task>
        </Sequence>
      </Loop>
    </Workflow>
  );
});
