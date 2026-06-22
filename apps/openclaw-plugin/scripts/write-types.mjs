import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputPath = join(packageRoot, "dist", "index.d.ts");

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(
  outputPath,
  `export type DebugBundleOpenClawToolMapEntry = {
  mcpToolName: string;
  openClawToolName: string;
  description: string;
  optional: boolean;
  parameters: unknown;
};

export declare const DEBUGBUNDLE_OPENCLAW_TOOL_MAP: readonly DebugBundleOpenClawToolMapEntry[];
export declare const DEBUGBUNDLE_OPENCLAW_TOOL_NAMES: string[];
export declare const DEBUGBUNDLE_OPENCLAW_OPTIONAL_TOOL_NAMES: string[];
export declare function executeDebugBundleOpenClawTool(
  mcpToolName: string,
  params: Record<string, unknown>,
  input?: { apiBaseUrl?: string }
): Promise<unknown>;

declare const plugin: unknown;
export default plugin;
`
);
