import { readManaged, writeManaged } from "./files.js";

/** Old managed sections had no closing marker: append missing rules, never infer an end. */
export async function ensureGitignore(
  root: string,
  section: string,
  fix: boolean
): Promise<{ present: boolean; changed: boolean }> {
  const current = await readManaged(root, ".gitignore");
  const existing = new Set((current ?? "").split(/\r?\n/u));
  const lines = section.trimEnd().split("\n");
  const missing = lines.filter((line) => !existing.has(line));
  if (missing.length === 0) return { present: true, changed: false };
  if (!fix) return { present: false, changed: false };
  const separator =
    !current || current.endsWith("\n\n") ? "" : current.endsWith("\n") ? "\n" : "\n\n";
  await writeManaged(
    root,
    ".gitignore",
    `${current ?? ""}${separator}${missing.join("\n")}\n`,
    current
  );
  return { present: true, changed: true };
}
