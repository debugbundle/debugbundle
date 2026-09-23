import { lstat, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { buildAgentInterfaceGuidance } from "../apps/cli/src/agent-interface-guidance.js";

// These are source distributions only. Never edit installed plugin caches.
async function skills(root: string): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (["node_modules", "dist", ".git"].includes(entry.name)) continue;
    const path = join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Refusing source symlink: ${path}`);
    if (entry.isDirectory()) paths.push(...(await skills(path)));
    else if (entry.name === "SKILL.md") paths.push(path);
  }
  return paths.sort();
}

const block = buildAgentInterfaceGuidance().trimEnd();
const heading = "## CLI-first capability routing\n";
const paths = [...(await skills("plugins")), ...(await skills("apps/mcp"))];
const changes: Array<{ path: string; next: string }> = [];
for (const path of paths) {
  if (!(await lstat(path)).isFile()) throw new Error(`Not a regular source file: ${path}`);
  const text = await readFile(path, "utf8");
  const start = text.indexOf(heading);
  let next: string;
  if (start < 0) {
    const firstHeading = text.indexOf("\n## ");
    if (firstHeading < 0) throw new Error(`Missing section boundary: ${path}`);
    next = `${text.slice(0, firstHeading)}\n${block}\n${text.slice(firstHeading)}`;
  } else {
    if (text.indexOf(heading, start + heading.length) >= 0)
      throw new Error(`Duplicate routing section: ${path}`);
    const nextHeading = text.indexOf("\n## ", start + heading.length);
    next = `${text.slice(0, start)}${block}\n${nextHeading < 0 ? "" : text.slice(nextHeading)}`;
  }
  if (next !== text) changes.push({ path, next });
}
if (process.argv.slice(2).join(" ") === "--write") {
  for (const { path, next } of changes) await writeFile(path, next);
  process.stdout.write(
    `Synchronized CLI-first guidance in ${changes.length} of ${paths.length} skill sources.\n`
  );
} else if (process.argv.length !== 2) {
  throw new Error("Usage: sync-agent-interface-guidance.ts [--write]");
} else if (changes.length) {
  throw new Error(
    `Routing guidance drift: ${changes.map(({ path }) => path).join(", ")}; run make agent-guidance-sync`
  );
} else {
  process.stdout.write(`CLI-first guidance matches all ${paths.length} skill sources.\n`);
}
