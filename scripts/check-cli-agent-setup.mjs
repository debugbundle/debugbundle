import assert from "node:assert/strict";
import { lstat, readFile, readlink, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Invoked by the installed-tarball runtime matrix, with a disposable project only.
export async function checkAgentSetup(root, run) {
  const setup = await run(
    [
      "setup",
      "--agent",
      "codex",
      "--agent",
      "claude-code",
      "--agent",
      "gemini-cli",
      "--agent",
      "muse-code",
      "--non-interactive"
    ],
    0,
    false
  );
  assert.equal(setup.agent_setup.agents.length, 4);
  assert.ok(
    setup.agent_setup.agents.every(
      (agent) => agent.instruction === "ok" && agent.discovery === "ok"
    )
  );
  const link = join(root, ".claude/skills/debugbundle");
  assert.equal(await readlink(link), "../../.agents/skills/debugbundle");
  const profile = join(root, ".debugbundle/profile.json");
  const connection = join(root, ".debugbundle/local/connection.json");
  const tracked = [
    profile,
    connection,
    join(root, ".debugbundle/agent-setup.json"),
    join(root, "AGENTS.md"),
    join(root, "CLAUDE.md"),
    join(root, "GEMINI.md")
  ];
  const before = await Promise.all(tracked.map((path) => readFile(path, "utf8")));
  await run(["setup", "--non-interactive"], 0, false);
  assert.deepEqual(await Promise.all(tracked.map((path) => readFile(path, "utf8"))), before);
  await rm(link);
  const doctor = await run(["doctor"], 1, false);
  assert.equal(
    doctor.agent_setup.agents.find((agent) => agent.agent === "claude-code").discovery,
    "missing"
  );
  await run(["validate", "--fix"], 0, false);
  assert.ok((await lstat(link)).isSymbolicLink());
  const skill = join(root, ".agents/skills/debugbundle/SKILL.md");
  const original = await readFile(skill, "utf8");
  assert.ok(original.includes("## CLI-first capability routing"));
  assert.ok(original.includes("command -v debugbundle"));
  assert.ok(original.includes("Mutations require explicit authorization"));
  await writeFile(skill, "User edited skill\n");
  const conflict = await run(["validate", "--fix"], 4, false);
  assert.ok(conflict.agent_setup.canonical.some((file) => file.status === "conflict"));
  assert.equal(await readFile(skill, "utf8"), "User edited skill\n");
  await writeFile(skill, original);
  const agentsBefore = await readFile(join(root, "AGENTS.md"), "utf8");
  await run(["setup", "--agent", "muse-code", "--non-interactive"], 0, false);
  assert.equal(await readFile(join(root, "AGENTS.md"), "utf8"), agentsBefore);
  const museDoctor = await run(["doctor"], 0, false);
  assert.equal(museDoctor.agent_setup.agents[0].agent, "muse-code");
  assert.equal(museDoctor.agent_setup.agents[0].instruction, "ok");
  await run(["setup", "--agent", "none", "--non-interactive"], 0, false);
  await assert.rejects(lstat(link), { code: "ENOENT" });
  assert.equal(await readFile(profile, "utf8"), before[0]);
  assert.equal(await readFile(connection, "utf8"), before[1]);
  console.log(`Agent-aware installed CLI setup/repair/removal passed on ${process.version}.`);
}
