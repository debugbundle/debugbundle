import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const exec = promisify(execFile);
const previousBin = resolve(process.argv[2]);
const candidateBin = resolve(process.argv[3]);
const root = await mkdtemp(join(tmpdir(), "debugbundle upgrade consumer "));
async function run(bin, args, expectedExit = 0) {
  let result;
  try {
    result = {
      ...(await exec(process.execPath, [bin, ...args, "--json"], {
        cwd: root,
        timeout: 30000,
        maxBuffer: 1024 * 1024
      })),
      code: 0
    };
  } catch (error) {
    result = error;
  }
  assert.equal(result.code, expectedExit, result.stderr);
  return JSON.parse(
    (expectedExit === 0 ? result.stdout : result.stderr)
      .trim()
      .split("\n")
      .findLast((line) => line.startsWith("{"))
  );
}
try {
  await writeFile(join(root, "package.json"), '{"name":"upgrade-fixture","private":true}');
  await writeFile(join(root, "AGENTS.md"), "# Project owner instructions\nKeep these rules.\n");
  await run(previousBin, ["setup", "--non-interactive"]);
  const profilePath = join(root, ".debugbundle/profile.json");
  const profile = JSON.parse(await readFile(profilePath, "utf8"));
  profile.debugbundle.validation_status = "agent-validated";
  profile.debugbundle.notes = "Reviewed project-specific architecture";
  await writeFile(profilePath, JSON.stringify(profile));
  const connectionPath = join(root, ".debugbundle/local/connection.json");
  const connection = JSON.parse(await readFile(connectionPath, "utf8"));
  connection.mode = "connected";
  connection.cloud_project_id = "00000000-0000-4000-8000-000000000001";
  connection.cloud_base_url = "https://example.invalid";
  await writeFile(connectionPath, JSON.stringify(connection));
  const before = await Promise.all(
    [profilePath, connectionPath].map((path) => readFile(path, "utf8"))
  );
  const ignorePath = join(root, ".gitignore");
  const ignore = `${await readFile(ignorePath, "utf8")}\n.env.production\nprivate-notes/\n`;
  await writeFile(ignorePath, ignore);
  const upgraded = await run(candidateBin, [
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
  ]);
  assert.ok(upgraded.agent_setup.canonical.every((file) => file.status === "ok"));
  assert.ok(
    upgraded.agent_setup.agents.every(
      (agent) => agent.instruction === "ok" && agent.discovery === "ok"
    )
  );
  assert.deepEqual(
    await Promise.all([profilePath, connectionPath].map((path) => readFile(path, "utf8"))),
    before
  );
  assert.ok((await readFile(ignorePath, "utf8")).startsWith(ignore));
  assert.ok(
    (await readFile(join(root, "AGENTS.md"), "utf8")).startsWith(
      "# Project owner instructions\nKeep these rules.\n"
    )
  );
  await run(candidateBin, ["validate", "--fix"]);
  const metadataPath = join(root, ".debugbundle/agent-setup.json");
  const metadata = await readFile(metadataPath, "utf8");
  await run(candidateBin, ["setup", "--non-interactive"]);
  assert.equal(await readFile(metadataPath, "utf8"), metadata);
  const skill = join(root, ".agents/skills/debugbundle/SKILL.md");
  await writeFile(skill, "User-modified generated skill\n");
  const conflict = await run(candidateBin, ["validate", "--fix"], 4);
  assert.ok(conflict.agent_setup.canonical.some((file) => file.status === "conflict"));
  assert.equal(await readFile(skill, "utf8"), "User-modified generated skill\n");
  // Error reports must stay parseable even when ownership metadata cannot be trusted.
  await writeFile(metadataPath, '{"version":999}');
  for (const command of ["setup", "validate"])
    assert.equal((await run(candidateBin, [command], 1)).status, "error");
  console.log(
    "Published CLI 1.10.0 to candidate upgrade passed; profiles, connections, user rules, ownership and JSON failures verified."
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
