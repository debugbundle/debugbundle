import type { CliCommandResult } from "./token-commands.js";
import legacyHashes from "./legacy-skill-hashes.json" with { type: "json" };
export { legacyHashes };
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import {
  AGENTS,
  detectAgents,
  loadManifest,
  parseAgents,
  type Agent,
  type Report
} from "../../../packages/agent-setup/src/index.js";
import {
  buildBundleSchemaReference,
  buildCliReference,
  buildImprovementAnalysisRecipe,
  buildMcpReference,
  buildPerformanceAnalysisRecipe,
  buildProfileEnrichmentReference,
  buildSkill,
  buildSkillEvals
} from "./local-scaffold.js";

const MANAGED_AGENTS_START = "<!-- debugbundle:start -->";
const MANAGED_AGENTS_END = "<!-- debugbundle:end -->";

export function buildManagedAgentsSection(): string {
  return [
    MANAGED_AGENTS_START,
    "## DebugBundle",
    "- Use DebugBundle for runtime error reporting, crash reporting, incident reporting, incident response, and live app monitoring when the task concerns runtime failures, production/customer-facing incidents, endpoint health, notification/webhook delivery failures, or captured events; it is not a generic infrastructure-monitoring platform.",
    "- Use DebugBundle product analytics for visits, active users, routes, devices, actions, funnels, journeys, friction, and analytics opportunities; start with aggregate reads and generate an analytics bundle only for a bounded durable analysis.",
    "- For deterministic local code, UI, layout, copy, calculation, refactor, or test-only issues, inspect source and tests first; do not check DebugBundle incidents unless runtime evidence is needed or the user asks.",
    "- Read `.agents/skills/debugbundle/SKILL.md` for the full DebugBundle workflow.",
    MANAGED_AGENTS_END
  ].join("\n");
}

export function canonicalFiles(): Record<string, string> {
  return {
    "SKILL.md": buildSkill(),
    "references/cli.md": buildCliReference(),
    "references/mcp.md": buildMcpReference(),
    "references/bundle-schema.md": buildBundleSchemaReference(),
    "references/profile-enrichment.md": buildProfileEnrichmentReference(),
    "assets/schemas/improvement-analysis.json": buildImprovementAnalysisRecipe(),
    "assets/schemas/performance-analysis.json": buildPerformanceAnalysisRecipe(),
    "evals/evals.json": buildSkillEvals()
  };
}

export async function chooseAgents(
  root: string,
  input: { agents?: string[]; json?: boolean; nonInteractive?: boolean },
  dependencies: { isInteractive?: () => boolean; promptUser?: (prompt: string) => Promise<string> }
): Promise<Agent[] | undefined> {
  if (input.agents !== undefined) return parseAgents(input.agents);
  const { manifest } = await loadManifest(root);
  if (
    input.json ||
    input.nonInteractive ||
    !(dependencies.isInteractive?.() ?? (stdin.isTTY === true && stdout.isTTY === true))
  )
    return undefined;
  const detected = await detectAgents(root);
  const defaults = manifest.selection_declared ? manifest.selected_agents : detected;
  const prompt = `Select agents (${AGENTS.join(", ")}); enter comma-separated names or none (default: ${defaults.join(", ") || "none"}): `;
  let answer: string;
  if (dependencies.promptUser) answer = await dependencies.promptUser(prompt);
  else {
    const terminal = createInterface({ input: stdin, output: stdout });
    try {
      answer = await terminal.question(prompt);
    } finally {
      terminal.close();
    }
  }
  return answer.trim()
    ? parseAgents(answer.split(",").map((value) => value.trim().toLowerCase()))
    : defaults;
}

export function agentChecks(
  report: Report
): Array<{ name: string; status: "ok" | "warning" | "error"; message: string }> {
  return [
    ...report.canonical
      .filter((file) => file.status !== "ok")
      .map((file) => ({
        name: "canonical-skill",
        status: file.status === "stale" ? ("warning" as const) : ("error" as const),
        message: file.message
      })),
    ...report.agents.map((agent) => ({
      name: `agent-${agent.agent}`,
      status:
        agent.instruction === "ok" && agent.discovery === "ok"
          ? ("ok" as const)
          : ("error" as const),
      message: agent.messages.join(" ")
    })),
    ...report.messages
      .filter((message) => !message.startsWith("Portable plugin"))
      .map((message) => ({ name: "agent-setup", status: "error" as const, message }))
  ];
}

export function appendAgentReport(output: string, report: Report, json: boolean): string {
  if (json) {
    if (!report.selection_declared) return output;
    const parsed = JSON.parse(output) as Record<string, unknown>;
    return JSON.stringify({ ...parsed, agent_setup: report });
  }
  if (
    !report.selection_declared &&
    report.canonical.every((file) => file.status === "ok") &&
    report.messages.length === 0
  )
    return output;
  return `${output}\nAgent setup:\n${[...agentChecks(report).map((check) => check.message), ...report.messages.filter((message) => message.startsWith("Portable plugin"))].map((message) => `- ${message}`).join("\n")}`;
}

/** Keep local setup failures parseable for CLI automation and the MCP adapters. */
export function localScaffoldFailure(error: unknown, json = false): CliCommandResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    exitCode: 1,
    output: json
      ? JSON.stringify({
          status: "error",
          checks: [{ name: "local-scaffold", status: "error", message }],
          warnings: [],
          errors: [message],
          suggested_actions: ["Review the reported local file or configuration before retrying."],
          auto_fix_available: false
        })
      : message
  };
}
