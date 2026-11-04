import { readFile, rm } from "node:fs/promises";
import { afterEach, expect, it, vi } from "vitest";
import { runCli } from "../../../apps/cli/src/main.js";
import { projectAdoptionWithAuthCommand } from "../../../apps/cli/src/project-adoption-commands.js";
import { createProjectAdoptionFixture } from "../../helpers/project-adoption-fixture.js";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
it("routes adoption preview for one explicit root", async () => {
  const projectAdoptionCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "preview" }),
    operation_id = "10000000-0000-4000-8000-000000000001";
  expect(
    (
      await runCli(
        [
          "project",
          "merge",
          "adopt",
          "preview",
          "--operation-id",
          operation_id,
          "--workspace-root",
          "/workspace",
          "--json"
        ],
        { projectAdoptionCommand }
      )
    ).output
  ).toBe("preview");
  expect(projectAdoptionCommand).toHaveBeenCalledWith({
    action: "preview",
    operation_id,
    workspace_root: "/workspace",
    json: true
  });
});
it("checks only read-only cloud operations before preview and authorised file application", async () => {
  const f = await createProjectAdoptionFixture();
  roots.push(f.root);
  const request = vi.fn(async (input: { path: string; method: string }) => ({
    status: 200,
    body: input.path.endsWith("/verification")
      ? {
          operation_id: f.operation.operation_id,
          canonical_project_id: f.target,
          verified: true,
          failures: []
        }
      : f.operation
  }));
  const dependencies = {
    readAuthState: async () => ({ bearer_token: "member", base_url: "https://api.example.test" }),
    createHttpClient: () => ({ request })
  };
  const preview = await projectAdoptionWithAuthCommand(
    {
      action: "preview",
      operation_id: f.operation.operation_id,
      workspace_root: f.root,
      json: true
    },
    dependencies
  );
  expect(preview.exitCode).toBe(0);
  expect(JSON.parse(await readFile(f.connectionPath, "utf8"))).toMatchObject({
    cloud_project_id: f.source
  });
  const applied = await projectAdoptionWithAuthCommand(
    { action: "apply", plan: JSON.parse(preview.output), json: true },
    dependencies
  );
  expect(applied.exitCode).toBe(0);
  expect(JSON.parse(applied.output)).toMatchObject({
    local_adoption: "pending_repository_checks",
    deployed_runtime: "pending"
  });
  expect(request.mock.calls.every(([input]) => input.method === "GET")).toBe(true);
});
