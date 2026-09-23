import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, lstat, readlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { setupCommand } from "../../../apps/cli/src/setup-command.js";
import { validateCommand } from "../../../apps/cli/src/validate-command.js";
import { doctorCommand } from "../../../apps/cli/src/doctor-command.js";
import { runCli } from "../../../apps/cli/src/main.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "debugbundle agent setup "));
  roots.push(root);
  await writeFile(join(root, "package.json"), '{"name":"agent-fixture"}');
  return root;
}

it("parses repeatable agents and rejects unknown selections before invoking setup", async () => {
  const setup = vi.fn().mockResolvedValue({ exitCode: 0, output: "ok" });
  expect(
    (
      await runCli(
        [
          "setup",
          "--agent",
          "codex",
          "--agent=claude-code",
          "--agent=muse-code",
          "--non-interactive"
        ],
        {
          setupCommand: setup
        }
      )
    ).exitCode
  ).toBe(0);
  expect(setup).toHaveBeenCalledWith({
    agents: ["codex", "claude-code", "muse-code"],
    nonInteractive: true
  });
  setup.mockClear();
  const result = await runCli(["setup", "--agent", "muse"], { setupCommand: setup });
  expect(result.exitCode).toBe(4);
  expect(result.output).toContain("codex, claude-code, gemini-cli");
  expect(setup).not.toHaveBeenCalled();
});

it.each([
  [["codex"], ["AGENTS.md"]],
  [["claude-code"], ["CLAUDE.md"]],
  [["gemini-cli"], ["GEMINI.md"]],
  [
    ["codex", "claude-code"],
    ["AGENTS.md", "CLAUDE.md"]
  ],
  [
    ["codex", "gemini-cli"],
    ["AGENTS.md", "GEMINI.md"]
  ],
  [
    ["claude-code", "gemini-cli"],
    ["CLAUDE.md", "GEMINI.md"]
  ],
  [
    ["codex", "claude-code", "gemini-cli"],
    ["AGENTS.md", "CLAUDE.md", "GEMINI.md"]
  ],
  [["muse-code"], ["AGENTS.md"]],
  [["codex", "muse-code"], ["AGENTS.md"]],
  [
    ["claude-code", "muse-code"],
    ["AGENTS.md", "CLAUDE.md"]
  ],
  [
    ["gemini-cli", "muse-code"],
    ["AGENTS.md", "GEMINI.md"]
  ],
  [
    ["codex", "claude-code", "muse-code"],
    ["AGENTS.md", "CLAUDE.md"]
  ],
  [
    ["codex", "gemini-cli", "muse-code"],
    ["AGENTS.md", "GEMINI.md"]
  ],
  [
    ["claude-code", "gemini-cli", "muse-code"],
    ["AGENTS.md", "CLAUDE.md", "GEMINI.md"]
  ],
  [
    ["codex", "claude-code", "gemini-cli", "muse-code"],
    ["AGENTS.md", "CLAUDE.md", "GEMINI.md"]
  ]
])(
  "prepares only the selected agents %j and preserves surrounding instructions",
  async (agents, instructions) => {
    const root = await fixture();
    for (const file of ["AGENTS.md", "CLAUDE.md", "GEMINI.md"])
      await writeFile(join(root, file), `# ${file}\r\nUser rules.\r\n\r\n`);
    const result = await setupCommand(
      { agents, json: true, nonInteractive: true },
      { cwd: () => root }
    );
    expect(result.exitCode).toBe(0);
    for (const file of ["AGENTS.md", "CLAUDE.md", "GEMINI.md"]) {
      const text = await readFile(join(root, file), "utf8");
      expect(text.startsWith(`# ${file}\r\nUser rules.\r\n\r\n`)).toBe(true);
      expect(text.includes("<!-- debugbundle:start -->")).toBe(instructions.includes(file));
    }
    if (agents.includes("claude-code")) {
      expect((await lstat(join(root, ".claude/skills/debugbundle"))).isSymbolicLink()).toBe(true);
      expect(await readlink(join(root, ".claude/skills/debugbundle"))).toBe(
        "../../.agents/skills/debugbundle"
      );
    }
  }
);

it("does not infer vendors or create native files in legacy non-interactive setup", async () => {
  const root = await fixture();
  await writeFile(join(root, "CLAUDE.md"), "Keep this unchanged.\n");
  const result = await setupCommand({ json: true }, { cwd: () => root });
  expect(result.exitCode).toBe(0);
  expect(await readFile(join(root, "CLAUDE.md"), "utf8")).toBe("Keep this unchanged.\n");
  await expect(lstat(join(root, "GEMINI.md"))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(lstat(join(root, ".claude/skills/debugbundle"))).rejects.toMatchObject({
    code: "ENOENT"
  });
});

it("defaults interactive selection to detected agents without prompting JSON runs", async () => {
  const root = await fixture();
  await writeFile(join(root, "CLAUDE.md"), "# Claude\n");
  const promptUser = vi.fn().mockResolvedValue("");
  expect(
    (await setupCommand({}, { cwd: () => root, isInteractive: () => true, promptUser })).exitCode
  ).toBe(0);
  expect(promptUser.mock.calls.some(([prompt]) => String(prompt).includes("claude-code"))).toBe(
    true
  );
  expect((await lstat(join(root, ".claude/skills/debugbundle"))).isSymbolicLink()).toBe(true);
  promptUser.mockClear();
  await setupCommand({ json: true }, { cwd: () => root, isInteractive: () => true, promptUser });
  expect(promptUser).not.toHaveBeenCalled();
});

it("offers Muse in interactive setup and reports missing Muse instructions through doctor and validate", async () => {
  const root = await fixture();
  await mkdir(join(root, ".muse"));
  const promptUser = vi.fn().mockResolvedValue("");
  expect(
    (await setupCommand({}, { cwd: () => root, isInteractive: () => true, promptUser })).exitCode
  ).toBe(0);
  expect(
    promptUser.mock.calls.some(([prompt]) => String(prompt).includes("default: muse-code"))
  ).toBe(true);
  await rm(join(root, "AGENTS.md"));
  const doctor = await doctorCommand(
    { json: true },
    { cwd: () => root, readAuthState: vi.fn().mockRejectedValue(new Error("no-auth")) }
  );
  expect(JSON.parse(doctor.output).agent_setup.agents).toContainEqual(
    expect.objectContaining({ agent: "muse-code", instruction: "missing", discovery: "ok" })
  );
  const validation = await validateCommand({ json: true, fix: true }, { cwd: () => root });
  expect(validation.exitCode).toBe(0);
  expect(JSON.parse(validation.output).agent_setup.agents).toContainEqual(
    expect.objectContaining({ agent: "muse-code", instruction: "ok", discovery: "ok" })
  );
  expect(await readFile(join(root, "AGENTS.md"), "utf8")).toContain("debugbundle:start");
});

it("preserves reviewed profiles, cloud connections, and byte-identical guidance on repeat setup", async () => {
  const root = await fixture();
  await setupCommand({ agents: ["claude-code"], json: true }, { cwd: () => root });
  const profilePath = join(root, ".debugbundle/profile.json");
  const profile = JSON.parse(await readFile(profilePath, "utf8"));
  profile.debugbundle.validation_status = "agent-validated";
  await writeFile(profilePath, JSON.stringify(profile));
  const connectionPath = join(root, ".debugbundle/local/connection.json");
  await writeFile(connectionPath, '{"mode":"connected","cloud_project_id":"keep-me"}');
  const paths = [
    profilePath,
    connectionPath,
    join(root, "CLAUDE.md"),
    join(root, ".debugbundle/agent-setup.json")
  ];
  const before = await Promise.all(paths.map((path) => readFile(path, "utf8")));
  expect((await setupCommand({ json: true }, { cwd: () => root })).exitCode).toBe(0);
  expect(await Promise.all(paths.map((path) => readFile(path, "utf8")))).toEqual(before);
});

it("recognizes native imports and discovers the existing project from a nested directory", async () => {
  const root = await fixture();
  await writeFile(join(root, "CLAUDE.md"), "@AGENTS.md\nUser rules\n");
  await setupCommand({ agents: ["codex", "claude-code"], json: true }, { cwd: () => root });
  expect(await readFile(join(root, "CLAUDE.md"), "utf8")).toBe("@AGENTS.md\nUser rules\n");
  const nested = join(root, "apps/web");
  await mkdir(nested, { recursive: true });
  const result = await validateCommand({ fix: true, json: true }, { cwd: () => nested });
  expect(result.exitCode).toBe(0);
  await expect(lstat(join(nested, ".debugbundle"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("reports and repairs missing selected-agent discovery without altering user edits", async () => {
  const root = await fixture();
  await setupCommand({ agents: ["claude-code"], json: true }, { cwd: () => root });
  await rm(join(root, ".claude/skills/debugbundle"));
  const doctor = await doctorCommand(
    { json: true },
    { cwd: () => root, readAuthState: vi.fn().mockRejectedValue(new Error("no-auth")) }
  );
  expect(JSON.parse(doctor.output).agent_setup.agents).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ agent: "claude-code", discovery: "missing" })
    ])
  );
  await validateCommand({ fix: true, json: true }, { cwd: () => root });
  expect((await lstat(join(root, ".claude/skills/debugbundle"))).isSymbolicLink()).toBe(true);
  const skill = join(root, ".agents/skills/debugbundle/SKILL.md");
  await writeFile(skill, "User-authored skill.\n");
  const validation = await validateCommand({ fix: true, json: true }, { cwd: () => root });
  expect(validation.exitCode).toBe(4);
  expect(await readFile(skill, "utf8")).toBe("User-authored skill.\n");
});

it("removes only owned integration artifacts when selecting none", async () => {
  const root = await fixture();
  await writeFile(join(root, "CLAUDE.md"), "Keep my rules.\n");
  await setupCommand({ agents: ["claude-code"], json: true }, { cwd: () => root });
  const result = await setupCommand({ agents: ["none"], json: true }, { cwd: () => root });
  expect(result.exitCode).toBe(0);
  expect(await readFile(join(root, "CLAUDE.md"), "utf8")).toBe("Keep my rules.\n");
  await expect(lstat(join(root, ".claude/skills/debugbundle"))).rejects.toMatchObject({
    code: "ENOENT"
  });
  expect(
    createHash("sha256")
      .update(await readFile(join(root, ".agents/skills/debugbundle/SKILL.md")))
      .digest("hex")
  ).toMatch(/^[a-f0-9]{64}$/);
});
