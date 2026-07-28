// smithers-source: generated
import { type AgentLike, ClaudeCodeAgent as SmithersClaudeCodeAgent } from "smithers-orchestrator";
import { join } from "node:path";
import { ClaudeCodeAgent } from "./agents/claude-code";
import { CodexAgent } from "./agents/codex";

export { ClaudeCodeAgent } from "./agents/claude-code";
export { CodexAgent } from "./agents/codex";

const repoRoot = join(import.meta.dir, "..");

export const providers = {
  claude: ClaudeCodeAgent,
  codex: CodexAgent,
  claudeSonnet: new SmithersClaudeCodeAgent({ model: "claude-sonnet-4-6", cwd: repoRoot }),
} as const;

export const agents = {
  // cheapFast: Smithers would normally suggest Kimi here, but Kimi is not available: missing `kimi` on PATH; missing credentials (~/.kimi).
  // cheapFast: Smithers would normally suggest Vibe here, but Vibe is not available: missing `vibe` on PATH; missing credentials (~/.vibe/.env or ~/.vibe/config.toml or $MISTRAL_API_KEY).
  cheapFast: [providers.claudeSonnet],
  smart: [providers.codex, providers.claude],
  smartTool: [providers.claude, providers.codex],
} as const satisfies Record<string, AgentLike[]>;
