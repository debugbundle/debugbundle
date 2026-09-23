export { ensureGitignore } from "./gitignore.js";
import { pluginHints } from "./plugin-hints.js";
import { lstat, mkdir, open, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { syncFiles } from "./canonical.js";
import { syncDiscovery, removeDiscovery, type LinkWriter } from "./discovery.js";
import { isMissing, readManaged, safePath } from "./files.js";
import { removeInstruction, syncInstruction } from "./instructions.js";
import { AGENTS, loadManifest, saveManifest, type Agent, type Report } from "./model.js";
export { AGENTS, CANONICAL, MANIFEST, parseAgents, loadManifest } from "./model.js";
export type { Agent, Report } from "./model.js";
export { projectRoot, readManaged, safePath, writeManaged } from "./files.js";

export async function detectAgents(root: string): Promise<Agent[]> {
  const detected: Agent[] = [];
  for (const agent of AGENTS) {
    const hints =
      agent === "codex"
        ? ["AGENTS.md", "AGENTS.override.md", ".codex"]
        : agent === "claude-code"
          ? ["CLAUDE.md", ".claude"]
          : agent === "gemini-cli"
            ? ["GEMINI.md", ".gemini"]
            : [".muse"];
    for (const hint of hints) {
      try {
        await lstat(join(root, hint));
        detected.push(agent);
        break;
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
    }
  }
  return detected;
}

async function discoveryOverride(root: string, agent: Agent): Promise<string | undefined> {
  if (agent !== "gemini-cli") return undefined;
  try {
    const raw = await readManaged(root, ".gemini/settings.json");
    if (!raw) return undefined;
    const settings: unknown = JSON.parse(raw);
    if (typeof settings !== "object" || settings === null || !("context" in settings))
      return undefined;
    const context = settings.context;
    if (typeof context !== "object" || context === null || !("fileName" in context))
      return undefined;
    const names = Array.isArray(context.fileName) ? context.fileName : [context.fileName];
    if (!names.includes("GEMINI.md"))
      return "gemini-cli: custom context.fileName excludes GEMINI.md; configure an import manually or include GEMINI.md in the agent settings.";
  } catch {
    return "gemini-cli: review invalid project settings before relying on native instruction discovery.";
  }
  return undefined;
}

type ManageInput = {
  root: string;
  files: Record<string, string>;
  legacyHashes?: Record<string, string>;
  instruction: string;
  selected?: Agent[];
  fix?: boolean;
  legacyInstructions?: boolean;
  writeLink?: LinkWriter;
};

export async function manageAgentSetup(input: ManageInput): Promise<Report> {
  if (!input.fix) return manage(input);
  const lockPath = await safePath(input.root, ".debugbundle/agent-setup.lock");
  await mkdir(dirname(lockPath), { recursive: true });
  await safePath(input.root, ".debugbundle/agent-setup.lock");
  let lock;
  try {
    lock = await open(lockPath, "wx", 0o600);
  } catch {
    throw new Error(
      "Agent setup is locked or not writable. Wait for the active setup to finish; after a crashed process, remove .debugbundle/agent-setup.lock only after confirming no setup is running."
    );
  }
  try {
    return await manage(input);
  } finally {
    await lock.close();
    await unlink(await safePath(input.root, ".debugbundle/agent-setup.lock"));
  }
}

async function manage(input: ManageInput): Promise<Report> {
  const { root, files } = input;
  const fix = input.fix === true;
  const { manifest, raw } = await loadManifest(root);
  const messages: string[] = [];
  if (input.selected !== undefined && fix) {
    for (const agent of AGENTS.filter((agent) => !input.selected!.includes(agent))) {
      const warning = await removeInstruction(root, agent, manifest, input.selected);
      if (warning) messages.push(warning);
      if (agent === "claude-code") {
        const discoveryWarning = await removeDiscovery(root, files, manifest);
        if (discoveryWarning) messages.push(discoveryWarning);
      }
    }
    manifest.selected_agents = input.selected;
    manifest.selection_declared = true;
  }
  const canonical = await syncFiles(
    root,
    files,
    manifest.canonical,
    fix,
    undefined,
    input.legacyHashes
  );
  const agents: Report["agents"] = [];
  for (const agent of manifest.selected_agents) {
    const instruction = await syncInstruction(root, agent, input.instruction, manifest, fix);
    const override = await discoveryOverride(root, agent);
    const validCanonical = canonical.every((file) => file.status === "ok");
    const discovery = validCanonical
      ? agent === "claude-code"
        ? await syncDiscovery(root, files, manifest, fix, input.writeLink)
        : {
            status: "ok" as const,
            message: `${agent}: canonical .agents/skills/debugbundle is discoverable.`
          }
      : {
          status: "undiscoverable" as const,
          message: `${agent}: repair canonical skill files before native discovery.`
        };
    agents.push({
      agent,
      instruction: override ? "undiscoverable" : instruction.status,
      discovery: discovery.status,
      messages: [instruction.message, discovery.message, ...(override ? [override] : [])]
    });
  }
  if (!manifest.selection_declared && input.legacyInstructions) {
    // Legacy non-interactive setup only updates an existing AGENTS.md.
    if ((await readManaged(root, "AGENTS.md")) !== undefined) {
      const result = await syncInstruction(root, "codex", input.instruction, manifest, fix);
      if (result.status !== "ok") messages.push(result.message);
    }
  }
  if (manifest.selection_declared) {
    messages.push(...(await pluginHints(root)));
    messages.push(
      "Portable plugin skills provide general DebugBundle guidance; this project skill adds the local profile and workflows. Setup does not install plugins or configure MCP authentication."
    );
    if (!manifest.selected_agents.includes("claude-code") && manifest.claude)
      messages.push("claude-code: edited discovery remains after deselection; review it manually.");
    for (const agent of AGENTS) {
      if (!manifest.selected_agents.includes(agent) && manifest.instructions[agent])
        messages.push(
          `${agent}: edited integration remains after deselection; review it manually or retry setup --agent none after restoring the managed block.`
        );
    }
  }
  if (fix) await saveManifest(root, manifest, raw);
  return { canonical, agents, selection_declared: manifest.selection_declared, messages };
}
