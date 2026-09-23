import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  symlink,
  lstat,
  readlink,
  rm
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  manageAgentSetup,
  parseAgents,
  projectRoot
} from "../../../packages/agent-setup/src/index.js";
import { digest, readManaged, writeManaged } from "../../../packages/agent-setup/src/files.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "agent-setup-test-"));
  roots.push(root);
  return root;
}
const files = { "SKILL.md": "Canonical skill\n", "references/cli.md": "CLI reference\n" };
const instruction =
  "<!-- debugbundle:start -->\nRead .agents/skills/debugbundle/SKILL.md\n<!-- debugbundle:end -->";
const deniedLink = (): Promise<void> =>
  Promise.reject(Object.assign(new Error("Unsupported"), { code: "EPERM" }));

it("falls back to an owned copy, upgrades it, repairs missing files, and preserves edits", async () => {
  const root = await fixture();
  const input = {
    root,
    files,
    instruction,
    selected: ["claude-code"] as const,
    fix: true,
    writeLink: deniedLink
  };
  // Mutable selection is the same public domain input used by the CLI.
  const run = { ...input, selected: [...input.selected] };
  expect((await manageAgentSetup(run)).agents[0]?.discovery).toBe("ok");
  expect((await lstat(join(root, ".claude/skills/debugbundle"))).isDirectory()).toBe(true);
  const updated = { ...files, "SKILL.md": "New canonical skill\n" };
  expect(
    (await manageAgentSetup({ ...run, files: updated, fix: false })).canonical[0]?.status
  ).toBe("stale");
  await manageAgentSetup({ ...run, files: updated });
  const copied = join(root, ".claude/skills/debugbundle/SKILL.md");
  expect(await readFile(copied, "utf8")).toBe(updated["SKILL.md"]);
  await rm(copied);
  expect(
    (await manageAgentSetup({ ...run, files: updated, fix: false })).agents[0]?.discovery
  ).toBe("missing");
  await manageAgentSetup({ ...run, files: updated });
  await writeFile(copied, "User copy edits\n");
  expect((await manageAgentSetup({ ...run, files: updated })).agents[0]?.discovery).toBe(
    "conflict"
  );
  expect(await readFile(copied, "utf8")).toBe("User copy edits\n");
  const removed = await manageAgentSetup({ ...run, selected: [], files: updated });
  expect(removed.messages.join(" ")).toContain("preserved edited");
  expect(await readFile(copied, "utf8")).toBe("User copy edits\n");
});

it("removes an unchanged managed copy but keeps unrelated native skills", async () => {
  const root = await fixture();
  await manageAgentSetup({
    root,
    files,
    instruction,
    selected: ["claude-code"],
    fix: true,
    writeLink: deniedLink
  });
  await mkdir(join(root, ".claude/skills/user-skill"));
  await manageAgentSetup({ root, files, instruction, selected: [], fix: true });
  await expect(lstat(join(root, ".claude/skills/debugbundle"))).rejects.toMatchObject({
    code: "ENOENT"
  });
  expect((await lstat(join(root, ".claude/skills/user-skill"))).isDirectory()).toBe(true);
});

it.each([".agents", ".claude", ".debugbundle"])(
  "refuses external parent links at %s without writing outside the project",
  async (parent) => {
    const root = await fixture();
    const outside = await fixture();
    await symlink(outside, join(root, parent), "dir");
    const attempt = manageAgentSetup({
      root,
      files,
      instruction,
      selected: ["claude-code"],
      fix: true
    });
    if (parent === ".debugbundle") await expect(attempt).rejects.toThrow("Unsafe symbolic link");
    else expect(JSON.stringify(await attempt)).toContain("conflict");
    await expect(lstat(join(outside, "skills"))).rejects.toMatchObject({ code: "ENOENT" });
  }
);

it("reports a changed or broken native link and never follows or replaces it", async () => {
  const root = await fixture();
  const outside = await fixture();
  const run = {
    root,
    files,
    instruction,
    selected: ["claude-code"] as Array<"claude-code">,
    fix: true
  };
  await manageAgentSetup(run);
  const link = join(root, ".claude/skills/debugbundle");
  await rm(link);
  await symlink(join(outside, "missing"), link);
  expect((await manageAgentSetup(run)).agents[0]?.discovery).toBe("conflict");
  expect(await readlink(link)).toBe(join(outside, "missing"));
  await manageAgentSetup({ ...run, selected: [] });
  expect(await readlink(link)).toBe(join(outside, "missing"));
});

it("repairs an owned link whose canonical destination was deleted", async () => {
  const root = await fixture();
  const run = {
    root,
    files,
    instruction,
    selected: ["claude-code"] as Array<"claude-code">,
    fix: true
  };
  await manageAgentSetup(run);
  await rm(join(root, ".agents/skills/debugbundle"), { recursive: true });
  expect((await manageAgentSetup({ ...run, fix: false })).agents[0]?.discovery).toBe(
    "undiscoverable"
  );
  expect((await manageAgentSetup(run)).agents[0]?.discovery).toBe("ok");
});

it("preserves user-authored native directories, malformed blocks, and instruction links", async () => {
  const root = await fixture();
  const outside = await fixture();
  await mkdir(join(root, ".claude/skills/debugbundle"), { recursive: true });
  await writeFile(join(root, ".claude/skills/debugbundle/SKILL.md"), "User skill");
  await writeFile(join(root, "CLAUDE.md"), "<!-- debugbundle:start -->\nMissing closing marker");
  let report = await manageAgentSetup({
    root,
    files,
    instruction,
    selected: ["claude-code"],
    fix: true
  });
  expect(report.agents[0]).toMatchObject({ instruction: "conflict", discovery: "conflict" });
  await rm(join(root, "CLAUDE.md"));
  await writeFile(join(outside, "instructions"), "Outside");
  await symlink(join(outside, "instructions"), join(root, "CLAUDE.md"));
  report = await manageAgentSetup({ root, files, instruction, fix: true });
  expect(report.agents[0]?.instruction).toBe("conflict");
  expect(await readFile(join(outside, "instructions"), "utf8")).toBe("Outside");
});

it("adopts exact legacy generated files without a manifest, but preserves unknown content", async () => {
  const root = await fixture();
  await mkdir(join(root, ".agents/skills/debugbundle"), { recursive: true });
  await writeFile(join(root, ".agents/skills/debugbundle/SKILL.md"), files["SKILL.md"]);
  let report = await manageAgentSetup({ root, files, instruction, selected: ["codex"], fix: true });
  expect(report.canonical.every((file) => file.status === "ok")).toBe(true);
  await rm(join(root, ".debugbundle/agent-setup.json"));
  await writeFile(join(root, ".agents/skills/debugbundle/SKILL.md"), "User legacy skill");
  report = await manageAgentSetup({ root, files, instruction, fix: true });
  expect(report.canonical[0]?.status).toBe("conflict");
});

it("does not mutate on inspection and rejects malformed ownership metadata", async () => {
  const root = await fixture();
  const report = await manageAgentSetup({ root, files, instruction });
  expect(report.canonical.every((file) => file.status === "missing")).toBe(true);
  await expect(lstat(join(root, ".debugbundle"))).rejects.toMatchObject({ code: "ENOENT" });
  await mkdir(join(root, ".debugbundle"));
  await writeFile(join(root, ".debugbundle/agent-setup.json"), '{"version":999}');
  await expect(manageAgentSetup({ root, files, instruction, fix: true })).rejects.toThrow(
    "Invalid .debugbundle/agent-setup.json"
  );
});

it("honors instruction precedence and flags customized Gemini context discovery", async () => {
  const root = await fixture();
  await mkdir(join(root, ".claude"));
  await mkdir(join(root, ".gemini"));
  await writeFile(join(root, ".claude/CLAUDE.md"), "Existing Claude rules\n");
  await writeFile(join(root, "AGENTS.override.md"), "Existing override\n");
  await writeFile(join(root, ".gemini/settings.json"), '{"context":{"fileName":"CUSTOM.md"}}');
  const report = await manageAgentSetup({
    root,
    files,
    instruction,
    selected: ["codex", "claude-code", "gemini-cli"],
    fix: true
  });
  expect(await readFile(join(root, "AGENTS.override.md"), "utf8")).toContain(instruction);
  expect(await readFile(join(root, ".claude/CLAUDE.md"), "utf8")).toContain(instruction);
  await expect(lstat(join(root, "CLAUDE.md"))).rejects.toMatchObject({ code: "ENOENT" });
  expect(report.agents[2]?.instruction).toBe("undiscoverable");
});

it("preserves surrounding content when updating and removing owned instructions", async () => {
  const root = await fixture();
  const original = "# Rules\r\nKeep these.\r\n\r\n";
  await writeFile(join(root, "AGENTS.md"), original);
  await manageAgentSetup({ root, files, instruction, selected: ["codex"], fix: true });
  const nextInstruction = instruction.replace("Read", "Consult");
  await manageAgentSetup({ root, files, instruction: nextInstruction, fix: true });
  await manageAgentSetup({ root, files, instruction: nextInstruction, selected: [], fix: true });
  expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe(original);
});

it("rejects traversal, oversized files, and compare-before-write conflicts", async () => {
  const root = await fixture();
  await expect(readManaged(root, "../escape")).rejects.toThrow("Invalid managed path");
  await writeFile(join(root, "large"), "x".repeat(1024 * 1024 + 1));
  await expect(readManaged(root, "large")).rejects.toThrow("oversized");
  await writeFile(join(root, "changed"), "New user content");
  await expect(writeManaged(root, "changed", "Replacement", "Old")).rejects.toThrow("File changed");
  expect(await readFile(join(root, "changed"), "utf8")).toBe("New user content");
});

it("does not escape nested repository boundaries when locating a profile", async () => {
  const root = await fixture();
  await mkdir(join(root, ".debugbundle"));
  await writeFile(join(root, ".debugbundle/profile.json"), "{}");
  const nested = join(root, "nested");
  await mkdir(join(nested, ".git"), { recursive: true });
  expect(await projectRoot(nested)).toBe(nested);
  expect(parseAgents(["gemini-cli", "codex", "codex"])).toEqual(["codex", "gemini-cli"]);
  expect(() => parseAgents(["none", "codex"])).toThrow("Use none alone");
  expect(digest("stable")).toHaveLength(64);
});

it("blocks concurrent repairs and clears the lock after failure", async () => {
  const root = await fixture();
  let release!: () => void;
  let entered!: () => void;
  const enteredPromise = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = manageAgentSetup({
    root,
    files,
    instruction,
    selected: ["claude-code"],
    fix: true,
    writeLink: async (target, path, type) => {
      entered();
      await gate;
      await symlink(target, path, type);
    }
  });
  await enteredPromise;
  await expect(manageAgentSetup({ root, files, instruction, fix: true })).rejects.toThrow("locked");
  release();
  await first;
  await expect(lstat(join(root, ".debugbundle/agent-setup.lock"))).rejects.toMatchObject({
    code: "ENOENT"
  });
});

it("reports project plugin hints without touching authentication or adding MCP configuration", async () => {
  const root = await fixture();
  await mkdir(join(root, ".claude"));
  await mkdir(join(root, ".codex"));
  const settings =
    '{"enabledPlugins":{"debugbundle@debugbundle":true},"secret":"must-not-be-reported"}';
  const config = '[plugins."debugbundle-codex@debugbundle"]\nenabled = true\n';
  await writeFile(join(root, ".claude/settings.json"), settings);
  await writeFile(join(root, ".codex/config.toml"), config);
  const report = await manageAgentSetup({
    root,
    files,
    instruction,
    selected: ["claude-code", "codex"],
    fix: true
  });
  expect(
    report.messages.filter((message) => message.startsWith("Portable plugin hint:"))
  ).toHaveLength(2);
  expect(JSON.stringify(report)).not.toContain("must-not-be-reported");
  expect(await readFile(join(root, ".claude/settings.json"), "utf8")).toBe(settings);
  expect(await readFile(join(root, ".codex/config.toml"), "utf8")).toBe(config);
  await expect(lstat(join(root, ".mcp.json"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("upgrades only exact known shipped legacy template fingerprints", async () => {
  const root = await fixture();
  await mkdir(join(root, ".agents/skills/debugbundle"), { recursive: true });
  await writeFile(join(root, ".agents/skills/debugbundle/SKILL.md"), "Old shipped template\n");
  const report = await manageAgentSetup({
    root,
    files,
    instruction,
    legacyHashes: { "SKILL.md": digest("Old shipped template\n") },
    fix: true
  });
  expect(report.canonical[0]?.status).toBe("ok");
  expect(await readFile(join(root, ".agents/skills/debugbundle/SKILL.md"), "utf8")).toBe(
    files["SKILL.md"]
  );
});

it("keeps an adopted legacy block's surrounding bytes during removal", async () => {
  const root = await fixture();
  await writeFile(join(root, "AGENTS.md"), `Before\n${instruction}\nAfter\n`);
  await manageAgentSetup({ root, files, instruction, selected: ["codex"], fix: true });
  await manageAgentSetup({ root, files, instruction, selected: [], fix: true });
  expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe("Before\n\nAfter\n");
});

it("recognizes a safe existing native instruction link without owning it", async () => {
  const root = await fixture();
  await writeFile(join(root, "AGENTS.md"), instruction);
  await symlink("AGENTS.md", join(root, "CLAUDE.md"));
  const report = await manageAgentSetup({
    root,
    files,
    instruction,
    selected: ["claude-code"],
    fix: true
  });
  expect(report.agents[0]?.instruction).toBe("ok");
  await manageAgentSetup({ root, files, instruction, selected: [], fix: true });
  expect(await readlink(join(root, "CLAUDE.md"))).toBe("AGENTS.md");
  expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe(instruction);
});

it("does not activate an empty Codex override over user AGENTS instructions", async () => {
  const root = await fixture();
  await writeFile(join(root, "AGENTS.override.md"), "");
  await writeFile(join(root, "AGENTS.md"), "User rules\n");
  await manageAgentSetup({ root, files, instruction, selected: ["codex"], fix: true });
  expect(await readFile(join(root, "AGENTS.override.md"), "utf8")).toBe("");
  expect(await readFile(join(root, "AGENTS.md"), "utf8")).toContain(instruction);
});

it("respects a project-local plugin disable override", async () => {
  const root = await fixture();
  await mkdir(join(root, ".claude"));
  await writeFile(
    join(root, ".claude/settings.json"),
    '{"enabledPlugins":{"debugbundle@debugbundle":true}}'
  );
  await writeFile(
    join(root, ".claude/settings.local.json"),
    '{"enabledPlugins":{"debugbundle@debugbundle":false}}'
  );
  const report = await manageAgentSetup({
    root,
    files,
    instruction,
    selected: ["claude-code"],
    fix: true
  });
  expect(report.messages.some((message) => message.startsWith("Portable plugin hint:"))).toBe(
    false
  );
});

it("preserves existing instruction permissions during atomic replacement", async () => {
  const root = await fixture();
  const path = join(root, "AGENTS.md");
  await writeFile(path, "User rules\n");
  await chmod(path, 0o640);
  await manageAgentSetup({ root, files, instruction, selected: ["codex"], fix: true });
  expect((await lstat(path)).mode & 0o777).toBe(0o640);
});
