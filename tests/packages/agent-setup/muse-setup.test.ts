import { mkdtemp, mkdir, readFile, writeFile, rm, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  detectAgents,
  manageAgentSetup,
  parseAgents,
  type Agent
} from "../../../packages/agent-setup/src/index.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "muse-agent-setup-"));
  roots.push(root);
  return root;
}
const files = {
  "SKILL.md": "---\nname: debugbundle\ndescription: Debug incidents\n---\nCanonical\n"
};
const instruction =
  "<!-- debugbundle:start -->\nRead .agents/skills/debugbundle/SKILL.md\n<!-- debugbundle:end -->";
const run = (root: string, selected?: Agent[], section = instruction) =>
  manageAgentSetup({
    root,
    files,
    instruction: section,
    fix: true,
    ...(selected ? { selected } : {})
  });

it("accepts Muse Code explicitly and detects only Muse-specific project evidence", async () => {
  const root = await fixture();
  expect(parseAgents(["muse-code"])).toEqual(["muse-code"]);
  await writeFile(join(root, "AGENTS.md"), "Shared rules\n");
  expect(await detectAgents(root)).not.toContain("muse-code");
  await mkdir(join(root, ".muse"));
  expect(await detectAgents(root)).toContain("muse-code");
});

it.each(["AGENTS.md", "CLAUDE.md", ".agents/AGENTS.md", ".claude/CLAUDE.md"])(
  "uses Muse's existing native instruction path %s",
  async (path) => {
    const root = await fixture();
    await mkdir(join(root, ".agents"));
    await mkdir(join(root, ".claude"));
    const original = "User rules\r\n\r\n";
    await writeFile(join(root, path), original);
    const report = await run(root, ["muse-code"]);
    expect(report.agents).toEqual([
      expect.objectContaining({ agent: "muse-code", instruction: "ok", discovery: "ok" })
    ]);
    expect(await readFile(join(root, path), "utf8")).toBe(`${original}${instruction}\n`);
    if (path !== "AGENTS.md")
      await expect(lstat(join(root, "AGENTS.md"))).rejects.toMatchObject({ code: "ENOENT" });
    await run(root, []);
    expect(await readFile(join(root, path), "utf8")).toBe(original);
  }
);

it("uses an empty first-precedence Muse file and ignores Codex's override", async () => {
  const root = await fixture();
  await writeFile(join(root, "AGENTS.md"), "");
  await writeFile(join(root, "AGENTS.override.md"), "Codex rules\n");
  await writeFile(join(root, "CLAUDE.md"), "Claude rules\n");
  await run(root, ["codex", "muse-code"]);
  expect(await readFile(join(root, "AGENTS.md"), "utf8")).toContain(instruction);
  expect(await readFile(join(root, "AGENTS.override.md"), "utf8")).toContain(instruction);
  expect(await readFile(join(root, "CLAUDE.md"), "utf8")).toBe("Claude rules\n");
});

it.each(["codex", "muse-code"] as const)(
  "retains shared guidance when only %s remains, then restores original bytes",
  async (retained) => {
    const root = await fixture();
    const original = "# Owner rules\r\nKeep these\r\n";
    await writeFile(join(root, "AGENTS.md"), original);
    await run(root, ["codex", "muse-code"]);
    const both = await readFile(join(root, "AGENTS.md"), "utf8");
    expect(both.split("<!-- debugbundle:start -->")).toHaveLength(2);
    await run(root, [retained]);
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe(both);
    await run(root, []);
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe(original);
  }
);

it("upgrades a shared owned block once and synchronizes all ownership hashes", async () => {
  const root = await fixture();
  await run(root, ["codex", "muse-code"]);
  const updated = instruction.replace("Read", "Consult");
  const report = await run(root, undefined, updated);
  expect(report.agents.every((agent) => agent.instruction === "ok")).toBe(true);
  const before = await readFile(join(root, ".debugbundle/agent-setup.json"), "utf8");
  await run(root, undefined, updated);
  expect(await readFile(join(root, ".debugbundle/agent-setup.json"), "utf8")).toBe(before);
  await run(root, [], updated);
  await expect(lstat(join(root, "AGENTS.md"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("transfers existing Codex ownership when switching directly to Muse", async () => {
  const root = await fixture();
  const original = "Owner rules\n";
  await writeFile(join(root, "AGENTS.md"), original);
  await run(root, ["codex"]);
  const before = await readFile(join(root, "AGENTS.md"), "utf8");
  await run(root, ["muse-code"]);
  expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe(before);
  await run(root, []);
  expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe(original);
});

it("preserves edited shared blocks through deselection and reports the remaining conflict", async () => {
  const root = await fixture();
  await run(root, ["codex", "muse-code"]);
  const edited = instruction.replace("Read", "User edit: Read");
  await writeFile(join(root, "AGENTS.md"), edited);
  const report = await run(root, ["muse-code"]);
  expect(report.agents[0]?.instruction).toBe("conflict");
  expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe(edited);
});

it("retains shared Claude fallback instructions after Claude is deselected", async () => {
  const root = await fixture();
  await writeFile(join(root, "CLAUDE.md"), "Owner Claude rules\n");
  await run(root, ["claude-code", "muse-code"]);
  const before = await readFile(join(root, "CLAUDE.md"), "utf8");
  await run(root, ["muse-code"]);
  expect(await readFile(join(root, "CLAUDE.md"), "utf8")).toBe(before);
  await run(root, []);
  expect(await readFile(join(root, "CLAUDE.md"), "utf8")).toBe("Owner Claude rules\n");
});
