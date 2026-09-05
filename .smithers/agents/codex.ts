import { CodexAgent as SmithersCodexAgent } from "smithers-orchestrator";

// Built-in Codex CLI agent (cliEngine: "codex").
// NB: do NOT pin `model` here. The installed ChatGPT-backed Codex CLI rejects an
// explicit `gpt-5.3-codex` pin ("unsupported model"), which hard-fails any step
// that routes to Codex. Leaving `model` unset lets Codex use the account-supported
// default; the workflows that use Codex still list Claude as a fallback provider
// (see agents.ts `smart`/`smartTool`). Add `model` back only once you've confirmed
// the exact id your Codex account accepts.
// Tweak `cwd`, or uncomment extra options below to match your setup.
export const CodexAgent = new SmithersCodexAgent({
  cwd: process.cwd(),
  skipGitRepoCheck: true,
  // model: "<an id your Codex account supports>",
  // systemPrompt: "Add shared instructions for every Codex run.",
  // sandbox: "workspace-write",
  // fullAuto: true,
});
