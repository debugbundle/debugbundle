import { z } from "zod";
import { readManaged } from "./files.js";

const ClaudeSettings = z
  .object({ enabledPlugins: z.record(z.string(), z.boolean()).optional() })
  .passthrough();
/** Project configuration is a hint, not proof of an installed or running plugin. */
export async function pluginHints(root: string): Promise<string[]> {
  const hints: string[] = [];
  let claudeSource: string | undefined;
  for (const path of [".claude/settings.json", ".claude/settings.local.json"]) {
    try {
      const raw = await readManaged(root, path);
      if (!raw) continue;
      const parsed = ClaudeSettings.safeParse(JSON.parse(raw));
      if (parsed.success && parsed.data.enabledPlugins?.["debugbundle@debugbundle"] !== undefined)
        claudeSource = parsed.data.enabledPlugins["debugbundle@debugbundle"] ? path : undefined;
      else if (!parsed.success) claudeSource = undefined;
    } catch {
      claudeSource = undefined;
      /* Optional hints never expose settings or change project setup. */
    }
  }
  if (claudeSource)
    hints.push(
      `Portable plugin hint: ${claudeSource} enables the DebugBundle Claude Code plugin. Its portable skill complements the project profile; installed runtime state is not verified.`
    );
  try {
    const raw = await readManaged(root, ".codex/config.toml");
    // Recognize the documented table form only; do not approximate a general TOML parser.
    const table = raw?.match(
      /^\s*\[plugins\.["']debugbundle-codex@debugbundle["']\]\s*(?:#[^\n]*)?\n([^]*?)(?=^\s*\[|$(?![\s\S]))/mu
    )?.[1];
    if (table && /^\s*enabled\s*=\s*true\s*(?:#[^\n]*)?$/mu.test(table))
      hints.push(
        "Portable plugin hint: .codex/config.toml enables the DebugBundle Codex plugin. Its portable skill complements the project profile; installed runtime state is not verified."
      );
  } catch {
    /* Home directories and credentials are deliberately outside discovery. */
  }
  return hints;
}
