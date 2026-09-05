// smithers-source: custom
// smithers-metadata-version: 1
// smithers-display-name: Test6 Verify
// smithers-description: Implement a poa-app change, then gate on yarn build + a Playwright verification (fast read-only UI by default, full on-chain Test6 create→vote→wait→finalize opt-in) + independent code review + independent design review of the screenshots. Loops until all pass.
// smithers-tags: poa, frontend, verify, test6, loop
/** @jsxImportSource smithers-orchestrator */
import { Sequence, Parallel, Loop, Task, Timer } from "smithers-orchestrator";
import { createSmithers } from "smithers-orchestrator";
import { z } from "zod/v4";
import { providers } from "../agents";
import { implementOutputSchema } from "../components/ValidationLoop";
import { Review, reviewOutputSchema } from "../components/Review";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildOutputSchema,
  verifyOutputSchema,
  designReviewOutputSchema,
  devUpSchema,
  diffSchema,
  fingerprintSchema,
  markerSchema,
  resolveDevPort,
  artifactPaths,
  deriveMarker,
  reviewsApproved,
} from "../lib/test6";

const inputSchema = z.object({
  prompt: z.string().default("Implement and verify the requested poa-app change."),
  // "ui" (default) = fast read-only browser check, no tx. "onchain" = full Test6
  // create → vote → durable wait → finalize flow with real tx.
  verifyDepth: z.enum(["ui", "onchain"]).default("ui"),
  maxIterations: z.number().int().positive().default(2),
  // Durable wait between casting votes and finalizing (lesson 4). Defaults to the
  // real Test6 E2E voting minimum (10 minutes) so the durable timer sleeps out the
  // whole window instead of waking early to burn agent time polling; override for
  // an org with a different window. The run parks as waiting-timer and survives a
  // crash across the wait.
  voteWindow: z.string().default("10m"),
  // Explicit port override; when null the resolver prefers the Conductor allocated
  // port (CONDUCTOR_PORT) with a safe fallback (lesson 1).
  devPort: z.number().int().positive().nullable().default(null),
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
  fingerprint: fingerprintSchema,
  marker: markerSchema,
});

const LONG = 1_800_000; // 30 min cap — dev server + Playwright runs are slow
const HEARTBEAT = 600_000;
// Verify boots a dev server (cold compile) + (onchain) waits on tx + subgraph
// re-index, so long quiet stretches are normal — give it a longer heartbeat.
const VERIFY_HEARTBEAT = 1_200_000; // 20 min
const repoRoot = join(import.meta.dir, "..", "..");
const scriptsDir = join(import.meta.dir, "..", "scripts");
const ensureDevScript = join(scriptsDir, "ensure-dev.sh");
const fingerprintScript = join(scriptsDir, "source-fingerprint.sh");
// One source of truth for the code-review agents: both the <Review> node and the
// approval gate (which reads each node's LATEST row) iterate this list, so the
// gate can never fall out of sync with the nodes that actually ran (lesson 4).
const reviewAgents = [providers.claudeSonnet];

export default smithers((ctx) => {
  // Apply defaults defensively: `smithers graph` (and any raw --input) does NOT
  // run values through the input schema's zod defaults, so read them safely here.
  const prompt = ctx.input.prompt ?? "Implement and verify the requested poa-app change.";
  const depth = ctx.input.verifyDepth ?? "ui";
  const maxIterations = ctx.input.maxIterations ?? 2;
  const voteWindow = ctx.input.voteWindow ?? "10m";
  const onchain = depth === "onchain";
  const devPort = ctx.input.devPort ?? resolveDevPort(process.env);
  const arts = artifactPaths(repoRoot, ctx.runId);

  // The final verify node differs by depth: onchain finishes at verify-finalize.
  const verifyNodeId = onchain ? "t6:verify-finalize" : "t6:verify";

  // Gate reads use ctx.latest (the loop node's highest iteration) per the Smithers
  // loop-binding rule — outputMaybe's ambient iteration is unreliable inside a loop.
  const build = ctx.latest("build", "t6:build");
  const verify = ctx.latest("verify", verifyNodeId);
  const design = ctx.latest("designReview", "t6:design-review");
  const devUp = ctx.latest("devUp", "t6:dev-up");
  const marker = ctx.latest("marker", "t6:mark");
  // Gate on the CURRENT iteration's review of the CURRENT code (lesson 4): read the
  // LATEST row of each review node, NOT ctx.outputs.review (which is EVERY row across
  // ALL loop iterations — an approval from an earlier pass would wrongly satisfy a
  // later one, and a stale rejection would contaminate this iteration's feedback).
  const reviews = reviewAgents
    .map((_, i) => ctx.latest("review", `t6:review:${i}`))
    .filter((r): r is NonNullable<typeof r> => r != null);

  const buildPassed = build?.passed === true;
  const verified = verify?.verified === true;
  const reviewApproved = reviewsApproved(reviews);
  const designApproved = design?.approved === true;
  const done = buildPassed && verified && reviewApproved && designApproved;

  const baseUrl = devUp?.baseUrl ?? `http://localhost:${devPort}`;

  // Aggregate failures into feedback the next implement attempt must fix first.
  const feedbackParts: string[] = [];
  if (build && !buildPassed && build.failingLog) {
    feedbackParts.push(`BUILD FAILED:\n${build.failingLog}`);
  }
  if (verify && !verified) {
    if (verify.touchedMainnet) {
      feedbackParts.push("STOPPED: the flow would touch a mainnet org / multisig. Do not execute; this needs human approval.");
    } else if (verify.sourceStable === false) {
      feedbackParts.push("STOPPED: tested source drifted from the frozen snapshot mid-run (HMR or an edit). The verifier aborted before mutating chain state. Re-run so a fresh snapshot is frozen.");
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

  const implementPrompt = `You are implementing a focused frontend change in the poa-app/ Next.js app. This repo's CLAUDE.md is authoritative — follow it exactly (service layer for ALL contract calls via useWeb3Services, @/ imports never relative, Chakra theme + glassLayerStyle, no backdrop-filter, token amounts via formatTokenAmount, subgraph queries use the endpoint-specific client from useSubgraphClient/getClient, parseTaskId/parseProjectId for composite ids).

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
1. A single clean dev server is expected at ${baseUrl}. Check it first: \`curl -s -o /dev/null -w '%{http_code}' ${baseUrl}\`.
2. If it returns 200, drive ALL Playwright navigation against ${baseUrl} (browser_navigate / browser_snapshot / browser_take_screenshot / browser_click / browser_fill_form).
3. If it does NOT return 200, STOP and report: set verified=false and issues="dev server on ${baseUrl} not healthy — operator must start one clean node dev server". Do NOT start your own: this repo's next dev servers share poa-app/.next/, so a second one races and corrupts webpack chunks (Cannot find module .../react-icons.js) — which is exactly what breaks pages in Chromium. Never spawn a competing server.
4. Save ALL screenshots/gifs UNDER ${arts.screenshots} (mkdir -p it first). NEVER write artifacts to the repo root — only .context/.smithers paths are gitignored. Return absolute screenshot paths in screenshotPaths for the design-review step.
5. Your FINAL message must be ONLY the JSON object — no prose, no code fences, no trailing text.

CHANGE TO VERIFY:
${prompt}`;

  // Deterministic preflight shared by both on-chain phases.
  const fingerprintCheck = `bash ${fingerprintScript} check ${arts.fingerprint}`;
  const fingerprintCompute = `bash ${fingerprintScript} compute`;
  const preflight = `DETERMINISTIC PREFLIGHT (run these first, fast, before any browser work):
- Confirm the dev server: \`curl -s -o /dev/null -w '%{http_code}' ${baseUrl}\` must be 200.
- Confirm the tested source is unchanged: \`${fingerprintCheck}\` must exit 0. If it exits non-zero the tested code drifted from the frozen snapshot (HMR or an edit) — STOP immediately, set verified=false and sourceStable=false, and explain. Do NOT mutate chain state on drifted code.
- SOURCE RE-CHECK RULE: re-run \`${fingerprintCheck}\` again immediately BEFORE every on-chain mutation (each proposal creation, each vote, the finalize). If it ever fails, abort with verified=false and sourceStable=false — never sign a tx after drift.`;

  const uiVerifyPrompt = `Verify the change in the browser — FAST and READ-ONLY. Do NOT send any on-chain transaction in this mode.

${verifyCommon}

Navigate to the relevant screen(s) and confirm the change renders and behaves correctly. If seeing the change requires specific existing data (e.g. an existing record/state), navigate to an org that already has it (read-only) rather than creating it. Do not click Save / Submit / Publish or anything that signs a tx.

Set verified=true only if the change renders and behaves correctly read-only. Put what you checked in flowsTested, problems in issues. (If the change genuinely cannot be verified without an on-chain write, say so in issues and set verified=false — the run can be re-launched with verifyDepth="onchain".)`;

  const runMarker = marker?.marker ?? "";
  const idsFile = marker?.idsFile ?? arts.ids;

  const createPrompt = `Verify the change on Test6 — the authorized Gnosis sandbox — by CREATING the proposal and CASTING the votes. Fire real tx there. This is phase 1 of 2 (a durable wait + finalize step follows).

${verifyCommon}

${preflight}

RUN MARKER (idempotence — lesson 1/3): this ENTIRE run's stable marker is:
  ${runMarker}
It is fixed for the whole run — a crash, this step re-running, or a later loop pass all reuse the SAME marker to recover the SAME proposal. NEVER derive a new marker or create a second proposal.
Persist on-chain identifiers to ${idsFile} as JSON the MOMENT each is known — before waiting on anything — so an interrupted run resumes. Use ARRAYS so multiple votes never clobber each other (lesson 8):
  {
    "marker": "${runMarker}",
    "proposalId": "<id once created>",
    "sourceFingerprint": "<output of: ${fingerprintCompute} at creation time>",
    "txHashes": ["<create tx>", "<vote tx>", ...],
    "userOpHashes": ["<create userOp>", "<vote userOp>", ...],
    "actions": [{ "kind": "create|vote|finalize", "txHash": "0x..", "userOpHash": "0x..", "at": "<iso>" }]
  }

RECOVER-BEFORE-CREATE (never duplicate a proposal):
1. First read ${idsFile} if it exists, and query the org's subgraph for a proposal whose title/description carries the marker "${runMarker}".
2. If such a proposal already exists AND its recorded "sourceFingerprint" equals the CURRENT one (\`${fingerprintCompute}\`): DO NOT create another. Resume it — cast any missing votes, then report its ids.
3. If a proposal exists but the recorded fingerprint DIFFERS from the current source (a later loop iteration re-implemented the code), the existing proposal can no longer represent the code under test: ABORT — set verified=false, sourceStable=false, explain that a FRESH run is required, and do NOT create a duplicate.
4. Only if NO proposal exists yet: create exactly one — put the marker "${runMarker}" in its title or description so it is discoverable on resume, and record its "sourceFingerprint" (\`${fingerprintCompute}\`) to ${idsFile} immediately.

FLOW (begin the browser tx PROMPTLY once preflight passes — do not linger exploring):
- Seed any required on-chain state on Test6 if the flow needs it.
- Create the proposal (re-check source first), append its tx/userOp hashes + an "actions" entry to ${idsFile}.
- Cast the votes needed to reach quorum (re-check source before each vote), appending each vote's hashes to the arrays.
- Capture screenshots of the created proposal + cast votes under ${arts.screenshots}.

HARD STOP: if the flow would touch a mainnet org, a multi-sig broadcast, or anything that burns real value, set verified=false and touchedMainnet=true and explain — do NOT execute it.

Set verified=false at THIS phase (finalization + assertions happen in phase 2). Return proposalId, the FULL txHashes/userOpHashes arrays and actions list (plus the singular txHash/userOpHash for the create tx for backwards compat), runMarker="${runMarker}", the screenshotPaths, flowsTested, and set sourceStable to reflect the source re-checks. Put problems in issues.`;

  const finalizePrompt = `Finalize and ASSERT the Test6 proposal created in phase 1. This is phase 2 of 2; a durable timer already waited out the voting window.

${verifyCommon}

${preflight}

RESUME (never re-create): read ${idsFile} and locate the proposal by its recorded proposalId or by the marker "${runMarker}" in the subgraph. Operate on THAT proposal only. If the recorded "sourceFingerprint" no longer matches the current source (\`${fingerprintCompute}\`), the proposal is stale — set verified=false, sourceStable=false, and require a fresh run instead of finalizing stale code.

FINALIZE:
- Confirm the voting window has elapsed and the proposal is finalizable. If not quite ready, poll briefly.
- Re-check source (\`${fingerprintCheck}\`) immediately before finalizing, then finalize/execute (e.g. announceWinner) and watch the tx.
- Append the finalize tx/userOp hashes to the txHashes/userOpHashes arrays and add an "actions" entry (kind="finalize") in ${idsFile} (lesson 8) — do not overwrite the create/vote hashes.

ASSERTIONS — set verified=true ONLY if ALL hold (report each in flowsTested; any failure → verified=false + issues):
1. The finalize tx has a SUCCESSFUL receipt.
2. NO ProposalExecutionFailed event was emitted for this proposal.
3. The intended on-chain post-state change was actually applied (read it back on-chain) AND is reflected in the subgraph after re-index.
4. An UNRELATED piece of state was left unchanged (negative control).
5. The subgraph is internally consistent for this proposal (status/votes/execution match chain).

Capture finalize screenshots under ${arts.screenshots}. Return screenshotPaths INCLUDING the phase-1 shots (${arts.screenshots}), proposalId, the FULL txHashes/userOpHashes arrays and actions list (plus singular txHash = the finalize tx for backwards compat), runMarker="${runMarker}", flowsTested, sourceStable, and any issues.`;

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

  // Feed the reviewer the actual diff so it reviews changed lines instead of
  // re-exploring the whole repo (the slow part of the run).
  const diffRow = ctx.latest("diff", "t6:diff");
  const reviewPrompt = diffRow?.diff
    ? `${prompt}\n\n--- REVIEW THIS DIFF (focus ONLY on the changed lines below; do not re-audit unrelated code or re-explore the whole repo) ---\n${diffRow.diff}`
    : prompt;

  return (
    <Workflow name="test6-verify">
      <Loop id="t6:loop" until={done} maxIterations={maxIterations} onMaxReached="return-last">
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
          {/* Freeze the tested source revision + dirty-diff fingerprint (lesson 2)
              AFTER build so it captures exactly what gets served + verified. */}
          <Task id="t6:freeze" output={fingerprintSchema}>
            {() => {
              mkdirSync(arts.root, { recursive: true });
              mkdirSync(arts.screenshots, { recursive: true });
              mkdirSync(arts.logs, { recursive: true });
              const out = execFileSync("bash", [fingerprintScript, "freeze", arts.fingerprint], {
                cwd: repoRoot, encoding: "utf8", timeout: 120_000,
              });
              return JSON.parse(out);
            }}
          </Task>
          {/* Deterministically ensure exactly ONE clean node-20.10 dev server. Reuse
              only when the listener's cwd is THIS workspace AND the served source
              still matches the frozen snapshot; refuse a foreign checkout (lesson 1). */}
          <Task id="t6:dev-up" output={devUpSchema}>
            {() => {
              const out = execFileSync("bash", [ensureDevScript, String(devPort), arts.fingerprint], {
                cwd: repoRoot, encoding: "utf8", timeout: 400_000,
              });
              process.stdout.write(out);
              const decision = /reusing/.test(out) ? "reuse" : /restarting/.test(out) ? "restart" : "start-fresh";
              return { baseUrl: `http://localhost:${devPort}`, port: devPort, decision, started: !/reusing/.test(out) };
            }}
          </Task>
          {/* On-chain only: derive the RUN-STABLE marker for idempotent recovery
              (lesson 1/3). It is keyed on runId alone, so every loop iteration / retry
              recomputes the SAME value and recovers the SAME proposal — it never
              mints a per-iteration duplicate. `attempt` is informational only. */}
          {onchain ? (
            <Task id="t6:mark" output={markerSchema}>
              {() => {
                const attempt = ctx.iterations?.["t6:loop"] ?? ctx.iteration ?? 0;
                const value = deriveMarker({ runId: ctx.runId, salt: prompt });
                mkdirSync(arts.root, { recursive: true });
                // Write the marker file with node fs (lesson 5) — no bash -c string
                // interpolation, which mangles JSON and is injection-prone.
                writeFileSync(
                  arts.marker,
                  JSON.stringify({ marker: value, attempt, createdAt: new Date().toISOString() }, null, 2),
                );
                return { marker: value, attempt, idsFile: arts.ids, markerFile: arts.marker };
              }}
            </Task>
          ) : null}
          {/* verify (browser) and the code review (reads the diff) are independent —
              run them concurrently to overlap the two slow steps. For on-chain, the
              parallel verify only CREATES + votes; finalize happens after a durable wait. */}
          <Parallel>
            <Task id={onchain ? "t6:verify-create" : "t6:verify"} output={verifyOutputSchema} agent={[providers.claude]} timeoutMs={LONG} heartbeatTimeoutMs={VERIFY_HEARTBEAT}>
              {onchain ? createPrompt : uiVerifyPrompt}
            </Task>
            <Review idPrefix="t6:review" prompt={reviewPrompt} agents={reviewAgents} />
          </Parallel>
          {/* Durable split between voting and finalization (lesson 4): the run parks
              as waiting-timer and survives a crash/redeploy during the vote window. */}
          {onchain ? <Timer id="t6:vote-window" duration={voteWindow} /> : null}
          {onchain ? (
            <Task id="t6:verify-finalize" output={verifyOutputSchema} agent={[providers.claude]} timeoutMs={LONG} heartbeatTimeoutMs={VERIFY_HEARTBEAT}>
              {finalizePrompt}
            </Task>
          ) : null}
          {/* design review reads the final verify's screenshots, so it stays last */}
          <Task id="t6:design-review" output={designReviewOutputSchema} agent={[providers.claudeSonnet]} continueOnFail timeoutMs={LONG} heartbeatTimeoutMs={HEARTBEAT}>
            {designReviewPrompt}
          </Task>
        </Sequence>
      </Loop>
    </Workflow>
  );
});
