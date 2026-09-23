import { z } from "zod";
import { readManaged, writeManaged } from "./files.js";

export const AGENTS = ["codex", "claude-code", "gemini-cli", "muse-code"] as const;
export type Agent = (typeof AGENTS)[number];
export const CANONICAL = ".agents/skills/debugbundle";
export const NATIVE = ".claude/skills/debugbundle";
export const LINK = "../../.agents/skills/debugbundle";
export const MANIFEST = ".debugbundle/agent-setup.json";
export const START = "<!-- debugbundle:start -->";
export const END = "<!-- debugbundle:end -->";
const Hash = z.string().regex(/^[a-f0-9]{64}$/u);
const Instruction = z
  .object({
    path: z.enum([
      "AGENTS.md",
      "AGENTS.override.md",
      ".agents/AGENTS.md",
      "CLAUDE.md",
      ".claude/CLAUDE.md",
      "GEMINI.md"
    ]),
    hash: Hash,
    prefix: z.enum(["", "\n", "\n\n"]),
    created: z.boolean(),
    suffix: z.enum(["", "\n"])
  })
  .strict();
const ManifestSchema = z
  .object({
    version: z.literal(1),
    selected_agents: z.array(z.enum(AGENTS)).max(AGENTS.length),
    selection_declared: z.boolean(),
    canonical: z.record(z.string(), Hash),
    instructions: z.record(z.enum(AGENTS), Instruction).default({}),
    claude: z
      .object({ mode: z.enum(["link", "copy"]), files: z.record(z.string(), Hash) })
      .strict()
      .optional()
  })
  .strict();
export type Manifest = z.infer<typeof ManifestSchema>;
export type State = "ok" | "missing" | "stale" | "conflict" | "undiscoverable";
export type FileReport = { path: string; status: State; message: string };
export type AgentReport = {
  agent: Agent;
  instruction: State;
  discovery: State;
  messages: string[];
};
export type Report = {
  canonical: FileReport[];
  agents: AgentReport[];
  selection_declared: boolean;
  messages: string[];
};

export function parseAgents(values: readonly string[]): Agent[] {
  if (values.length === 1 && values[0] === "none") return [];
  if (values.length === 0 || values.some((value) => !(AGENTS as readonly string[]).includes(value)))
    throw new Error(
      `Supported agents: ${AGENTS.join(", ")}. Use none alone to remove managed integrations.`
    );
  return AGENTS.filter((agent) => values.includes(agent));
}

export async function loadManifest(
  root: string
): Promise<{ manifest: Manifest; raw: string | undefined }> {
  const raw = await readManaged(root, MANIFEST);
  if (raw === undefined)
    return {
      raw,
      manifest: {
        version: 1,
        selected_agents: [],
        selection_declared: false,
        canonical: {},
        instructions: {}
      }
    };
  try {
    return { raw, manifest: ManifestSchema.parse(JSON.parse(raw)) };
  } catch {
    throw new Error(`Invalid ${MANIFEST}; review it manually before repair.`);
  }
}
export async function saveManifest(
  root: string,
  manifest: Manifest,
  raw: string | undefined
): Promise<void> {
  const value = `${JSON.stringify(manifest, null, 2)}\n`;
  if (value !== raw) await writeManaged(root, MANIFEST, value, raw);
}
