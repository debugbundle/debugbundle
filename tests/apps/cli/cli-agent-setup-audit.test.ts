import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { setupCommand } from "../../../apps/cli/src/setup-command.js";
import { doctorCommand } from "../../../apps/cli/src/doctor-command.js";
import { validateCommand } from "../../../apps/cli/src/validate-command.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "cli-agent-audit-"));
  roots.push(root);
  return root;
}

it.each(["setup", "doctor", "validate"] as const)(
  "returns structured JSON on corrupt ownership metadata in %s",
  async (command) => {
    const root = await fixture();
    await setupCommand({ json: true }, { cwd: () => root });
    await writeFile(join(root, ".debugbundle/agent-setup.json"), '{"version":999}');
    const before = await readFile(join(root, ".agents/skills/debugbundle/SKILL.md"), "utf8");
    const result = await { setup: setupCommand, doctor: doctorCommand, validate: validateCommand }[
      command
    ]({ json: true }, { cwd: () => root });
    expect(result.exitCode).not.toBe(0);
    expect(JSON.parse(result.output)).toMatchObject({
      status: "error",
      errors: expect.any(Array),
      auto_fix_available: false
    });
    expect(await readFile(join(root, ".agents/skills/debugbundle/SKILL.md"), "utf8")).toBe(before);
  }
);

it.each(["doctor", "validate"] as const)(
  "returns structured JSON for unsafe project scaffold in %s",
  async (command) => {
    const root = await fixture();
    await mkdir(join(root, ".debugbundle/profile.json"), { recursive: true });
    const result = await { doctor: doctorCommand, validate: validateCommand }[command](
      { json: true },
      { cwd: () => root }
    );
    expect(result.exitCode).not.toBe(0);
    expect(JSON.parse(result.output)).toMatchObject({ status: "error", errors: expect.any(Array) });
  }
);

it("preserves user ignore rules following an existing managed section", async () => {
  const root = await fixture();
  await setupCommand({ json: true }, { cwd: () => root });
  const path = join(root, ".gitignore");
  const original = `${await readFile(path, "utf8")}\n.env.production\nprivate-notes/\n`;
  await writeFile(path, original);
  expect((await setupCommand({ json: true }, { cwd: () => root })).exitCode).toBe(0);
  expect(await readFile(path, "utf8")).toBe(original);
});

it("does not contact a cloud endpoint from a symlinked connection file", async () => {
  const root = await fixture();
  const outside = await fixture();
  await setupCommand({ json: true }, { cwd: () => root });
  const connection = join(root, ".debugbundle/local/connection.json");
  const external = join(outside, "connection.json");
  const original = JSON.parse(await readFile(connection, "utf8"));
  await writeFile(
    external,
    JSON.stringify({
      ...original,
      mode: "connected",
      cloud_base_url: "https://example.invalid",
      cloud_project_id: "00000000-0000-4000-8000-000000000001"
    })
  );
  await rm(connection);
  await symlink(external, connection);
  const fetchImpl = vi.fn();
  const result = await doctorCommand({ json: true }, { cwd: () => root, fetchImpl });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.output)).toMatchObject({
    status: "error",
    checks: expect.arrayContaining([
      expect.objectContaining({ name: "connection-config", status: "error" })
    ])
  });
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("refuses an ignore-file symlink introduced after initial setup validation", async () => {
  const root = await fixture();
  const outside = await fixture();
  const external = join(outside, "ignore");
  await writeFile(external, "Private external content\n");
  const result = await setupCommand(
    { json: true },
    {
      cwd: () => root,
      selectTargetNames: async () => {
        await symlink(external, join(root, ".gitignore"));
        return [];
      }
    }
  );
  expect(result.exitCode).not.toBe(0);
  expect(await readFile(external, "utf8")).toBe("Private external content\n");
  expect(JSON.parse(result.output).status).toBe("error");
});
