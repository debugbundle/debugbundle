import { dirname, relative, resolve } from "node:path";
import { lstat, readlink, unlink } from "node:fs/promises";
import { digest, isMissing, readManaged, safePath, writeManaged } from "./files.js";
import { CANONICAL, END, START, type Agent, type Manifest, type State } from "./model.js";

type Owned = NonNullable<Manifest["instructions"][Agent]>;
const DEFAULTS = {
  codex: "AGENTS.md",
  "claude-code": "CLAUDE.md",
  "gemini-cli": "GEMINI.md",
  "muse-code": "AGENTS.md"
} as const;

async function instructionExists(root: string, path: string): Promise<boolean> {
  try {
    return (await lstat(await safePath(root, path, true))).size > 0;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

export async function instructionPath(root: string, agent: Agent): Promise<Owned["path"]> {
  if (agent === "muse-code") {
    // Muse uses the first existing file, including an empty file; it has no Codex override.
    for (const path of [
      "AGENTS.md",
      "CLAUDE.md",
      ".agents/AGENTS.md",
      ".claude/CLAUDE.md"
    ] as const) {
      try {
        await lstat(await safePath(root, path, true));
        return path;
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
    }
  }
  if (agent === "codex" && (await instructionExists(root, "AGENTS.override.md")))
    return "AGENTS.override.md";
  if (
    agent === "claude-code" &&
    !(await instructionExists(root, "CLAUDE.md")) &&
    (await instructionExists(root, ".claude/CLAUDE.md"))
  )
    return ".claude/CLAUDE.md";
  return DEFAULTS[agent];
}

async function linkedInstructions(root: string, path: string): Promise<boolean | undefined> {
  const absolute = await safePath(root, path, true);
  const info = await lstat(absolute).catch((error: unknown) => {
    if (!isMissing(error)) throw error;
    return undefined;
  });
  if (!info?.isSymbolicLink()) return undefined;
  const destination = relative(
    root,
    resolve(dirname(absolute), await readlink(absolute))
  ).replaceAll("\\", "/");
  if (!["AGENTS.md", "AGENTS.override.md", `${CANONICAL}/SKILL.md`].includes(destination))
    return false;
  const text = await readManaged(root, destination);
  return (
    text !== undefined &&
    (destination === `${CANONICAL}/SKILL.md` || text.includes(`${CANONICAL}/SKILL.md`))
  );
}

function managedRange(text: string): { start: number; end: number; section: string } | undefined {
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  if (start === -1 && end === -1) return undefined;
  if (
    start < 0 ||
    end < start ||
    text.indexOf(START, start + 1) !== -1 ||
    text.indexOf(END, end + 1) !== -1
  )
    throw new Error("Ambiguous instruction markers.");
  return { start, end: end + END.length, section: text.slice(start, end + END.length) };
}

async function alreadyReferences(root: string, path: string, text: string): Promise<boolean> {
  if (text.includes(`${CANONICAL}/SKILL.md`)) return true;
  // Only recognize a complete, local import whose destination actually carries guidance.
  const imports =
    path === ".claude/CLAUDE.md"
      ? ["@../AGENTS.md", "@./../AGENTS.md"]
      : ["@AGENTS.md", "@./AGENTS.md"];
  if (text.split(/\r?\n/u).some((line) => imports.includes(line.trim()))) {
    const agents = await readManaged(root, "AGENTS.md");
    return agents?.includes(`${CANONICAL}/SKILL.md`) === true;
  }
  return false;
}

export async function syncInstruction(
  root: string,
  agent: Agent,
  section: string,
  manifest: Manifest,
  fix: boolean
): Promise<{ status: State; message: string }> {
  try {
    let path = await instructionPath(root, agent);
    let owned = manifest.instructions[agent];
    // Recreate a previously selected missing alternate only when no competing file exists.
    if (
      owned &&
      owned.path !== path &&
      (await readManaged(root, path)) === undefined &&
      (await readManaged(root, owned.path)) === undefined
    )
      path = owned.path;
    owned ??= Object.values(manifest.instructions).find((record) => record.path === path);
    const linked = await linkedInstructions(root, path);
    if (linked !== undefined)
      return {
        status: linked ? "ok" : "conflict",
        message: linked
          ? `${agent}: existing project-local instruction link in ${path}; preserved without taking ownership.`
          : `${agent}: preserved untrusted or unconfigured instruction link in ${path}.`
      };
    const current = await readManaged(root, path);
    if (owned && owned.path !== path)
      return {
        status: "conflict",
        message: `${agent}: instruction precedence changed; review ${owned.path} and ${path}.`
      };
    const range = managedRange(current ?? "");
    if (!range && current !== undefined && (await alreadyReferences(root, path, current)))
      return { status: "ok", message: `${agent}: existing instruction reference in ${path}.` };
    if (range && owned && digest(range.section) !== owned.hash)
      return {
        status: "conflict",
        message: `${agent}: preserved edited managed instructions in ${path}.`
      };
    // Pre-manifest blocks can only be adopted when identical to this generator.
    if (range && !owned && range.section !== section)
      return {
        status: "conflict",
        message: `${agent}: review unowned managed instructions in ${path}.`
      };
    let status: State = range?.section === section ? "ok" : range ? "stale" : "missing";
    if (fix) {
      const prefix =
        owned?.prefix ??
        (current === undefined || current === ""
          ? ""
          : /(?:\r?\n){2}$/u.test(current)
            ? ""
            : current.endsWith("\n")
              ? "\n"
              : "\n\n");
      const next = range
        ? `${current!.slice(0, range.start)}${section}${current!.slice(range.end)}`
        : `${current ?? ""}${prefix}${section}\n`;
      if (next !== current) await writeManaged(root, path, next, current);
      const record: Owned = {
        path,
        hash: digest(section),
        prefix: range && !owned ? "" : prefix,
        created: owned?.created ?? current === undefined,
        suffix: owned?.suffix ?? (range ? "" : "\n")
      };
      // Several agents can consume one block. Keep its removal boundaries and hash identical.
      for (const owner of Object.keys(manifest.instructions) as Agent[]) {
        if (manifest.instructions[owner]?.path === path)
          manifest.instructions[owner] = { ...record };
      }
      manifest.instructions[agent] = record;
      status = "ok";
    }
    return { status, message: `${agent}: ${status} instructions in ${path}.` };
  } catch {
    return {
      status: "conflict",
      message: `${agent}: cannot safely update native instructions; review links, permissions, and managed markers.`
    };
  }
}

export async function removeInstruction(
  root: string,
  agent: Agent,
  manifest: Manifest,
  retained: Agent[] = []
): Promise<string | undefined> {
  const owned = manifest.instructions[agent];
  if (!owned) return undefined;
  try {
    for (const other of retained) {
      const otherOwned = manifest.instructions[other];
      if (
        otherOwned?.path === owned.path ||
        (!otherOwned && (await instructionPath(root, other)) === owned.path)
      ) {
        // Transfer proven ownership before removing an agent, including direct agent switches.
        manifest.instructions[other] ??= { ...owned };
        delete manifest.instructions[agent];
        return undefined;
      }
    }
    const anotherOwner = Object.entries(manifest.instructions).find(
      ([owner, record]) => owner !== agent && record.path === owned.path
    );
    if (anotherOwner) {
      delete manifest.instructions[agent];
      return undefined;
    }
    const current = await readManaged(root, owned.path);
    if (current !== undefined) {
      const range = managedRange(current);
      if (!range || digest(range.section) !== owned.hash)
        return `${agent}: preserved edited instructions during removal.`;
      const prefixStart = range.start - owned.prefix.length;
      if (prefixStart < 0 || current.slice(prefixStart, range.start) !== owned.prefix)
        return `${agent}: preserved changed instruction spacing during removal.`;
      // The appended trailing newline is owned; other text remains byte-identical.
      if (current.slice(range.end, range.end + owned.suffix.length) !== owned.suffix)
        return `${agent}: preserved changed instruction spacing during removal.`;
      const end = range.end + owned.suffix.length;
      const next = current.slice(0, prefixStart) + current.slice(end);
      if (owned.created && next === "") await unlink(await safePath(root, owned.path));
      else await writeManaged(root, owned.path, next, current);
    }
    delete manifest.instructions[agent];
    return undefined;
  } catch {
    return `${agent}: cannot safely remove native instructions; manual review required.`;
  }
}
