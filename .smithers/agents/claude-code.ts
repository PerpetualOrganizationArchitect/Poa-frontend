import { ClaudeCodeAgent as SmithersClaudeCodeAgent } from "smithers-orchestrator";
import { join } from "node:path";

// Repo root is two levels up from .smithers/agents/. Running the agent from the
// repo root means it picks up .mcp.json (Playwright MCP), CLAUDE.md, and can run
// the poa-app/ yarn commands + drive the Test6 browser verify loop.
const repoRoot = join(import.meta.dir, "..", "..");

// Built-in Claude Code CLI agent (cliEngine: "claude-code").
export const ClaudeCodeAgent = new SmithersClaudeCodeAgent({
  model: "claude-opus-4-8",
  cwd: repoRoot,
  // systemPrompt: "Add shared instructions for every Claude run.",
  // timeoutMs: 30 * 60 * 1000,
  // For true unattended runs (agent edits/bash without permission prompts),
  // flip this on — leave off until you want hands-off background execution:
  // dangerouslySkipPermissions: true,
});
