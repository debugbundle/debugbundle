import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, readFile, rm, lstat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { manageAgentSetup } from "../../../packages/agent-setup/src/index.js";
import { readManaged } from "../../../packages/agent-setup/src/files.js";

const exec = promisify(execFile);
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "agent-audit-"));
  roots.push(root);
  return root;
}
const files = { "SKILL.md": "Canonical\n", "assets/schemas/test.json": "{}\n" };
const instruction =
  "<!-- debugbundle:start -->\nRead .agents/skills/debugbundle/SKILL.md\n<!-- debugbundle:end -->";

it.skipIf(process.platform === "win32")(
  "rejects a FIFO promptly rather than waiting for a writer",
  async () => {
    const root = await fixture();
    await exec("mkfifo", [join(root, "pipe")]);
    const modulePath = resolve("packages/agent-setup/src/files.ts");
    const script = `import {readManaged} from ${JSON.stringify(modulePath)}; try { await readManaged(process.argv[1], "pipe"); process.exitCode=1; } catch { process.stdout.write("rejected"); }`;
    const result = await exec(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", script, root],
      { timeout: 2000 }
    );
    expect(result.stdout).toBe("rejected");
  }
);

it("preserves invalid UTF-8 instruction bytes and reports a conflict", async () => {
  const root = await fixture();
  const original = Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x0a]);
  await writeFile(join(root, "AGENTS.md"), original);
  const result = await manageAgentSetup({
    root,
    files,
    instruction,
    selected: ["codex"],
    fix: true
  });
  expect(result.agents[0]?.instruction).toBe("conflict");
  expect(await readFile(join(root, "AGENTS.md"))).toEqual(original);
});

it("preserves a UTF-8 BOM and recognizes relative native imports", async () => {
  const root = await fixture();
  await writeFile(join(root, "AGENTS.md"), `\uFEFF${instruction}\n`);
  await writeFile(join(root, "CLAUDE.md"), "@./AGENTS.md\nUser rules\n");
  await manageAgentSetup({
    root,
    files,
    instruction,
    selected: ["codex", "claude-code"],
    fix: true
  });
  expect(await readManaged(root, "AGENTS.md")).toBe(`\uFEFF${instruction}\n`);
  expect(await readFile(join(root, "CLAUDE.md"), "utf8")).toBe("@./AGENTS.md\nUser rules\n");
});

it("restores a selected alternate instruction path when neither native path remains", async () => {
  const root = await fixture();
  await mkdir(join(root, ".claude"));
  await writeFile(join(root, ".claude/CLAUDE.md"), "Project rules\n");
  await manageAgentSetup({ root, files, instruction, selected: ["claude-code"], fix: true });
  await rm(join(root, ".claude/CLAUDE.md"));
  const result = await manageAgentSetup({ root, files, instruction, fix: true });
  expect(result.agents[0]?.instruction).toBe("ok");
  expect(await readFile(join(root, ".claude/CLAUDE.md"), "utf8")).toContain(instruction);
  await expect(lstat(join(root, "CLAUDE.md"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("does not partially remove a copied skill containing unowned directories", async () => {
  const root = await fixture();
  await manageAgentSetup({
    root,
    files,
    instruction,
    selected: ["claude-code"],
    fix: true,
    writeLink: async () => {
      throw Object.assign(new Error("denied"), { code: "EPERM" });
    }
  });
  await mkdir(join(root, ".claude/skills/debugbundle/user-notes"));
  const result = await manageAgentSetup({ root, files, instruction, selected: [], fix: true });
  expect(result.messages.join(" ")).toContain("preserved");
  expect(await readFile(join(root, ".claude/skills/debugbundle/SKILL.md"), "utf8")).toBe(
    files["SKILL.md"]
  );
});

it("rejects a symlinked canonical file without changing its destination", async () => {
  const root = await fixture();
  const outside = await fixture();
  await mkdir(join(root, ".agents/skills/debugbundle"), { recursive: true });
  await writeFile(join(outside, "skill"), "User content");
  await symlink(join(outside, "skill"), join(root, ".agents/skills/debugbundle/SKILL.md"));
  const result = await manageAgentSetup({ root, files, instruction, fix: true });
  expect(result.canonical[0]?.status).toBe("conflict");
  expect(await readFile(join(outside, "skill"), "utf8")).toBe("User content");
});
