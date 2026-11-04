import { describe, it, expect, vi } from "vitest";
import { runCli } from "../../../apps/cli/src/main.js";
import { writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  projectMergeWithAuthCommand,
  readProjectMergeJson,
  type ProjectMergeCommandInput
} from "../../../apps/cli/src/project-merge-commands.js";
import { createProjectAdoptionFixture } from "../../helpers/project-adoption-fixture.js";
const target = "10000000-0000-4000-8000-000000000001",
  source = "10000000-0000-4000-8000-000000000002";
describe("project merge CLI", () => {
  it("uses checked mapping/plan files and rejects malformed or oversized input", async () => {
    const f = await createProjectAdoptionFixture();
    try {
      const mappings = join(f.root, "mappings.json"),
        savedPlan = join(f.root, "plan.json"),
        projectMergeCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "checked" });
      const plan = {
        ...f.operation.request,
        plan_version: 1,
        runtime_contract: "project-services-v1",
        plan_digest: f.operation.plan_digest,
        ready: true,
        origin_ids: [f.source, f.target],
        observed_rows: 0,
        blockers: [],
        suggested_service_mappings: f.operation.request.service_mappings,
        resource_limits: []
      };
      await writeFile(mappings, JSON.stringify(f.operation.request.service_mappings));
      await writeFile(savedPlan, JSON.stringify(plan));
      expect(
        (
          await runCli(
            [
              "project",
              "merge",
              "preview",
              "--target",
              f.target,
              "--sources",
              f.source,
              "--mapping-file",
              mappings
            ],
            { projectMergeCommand }
          )
        ).exitCode
      ).toBe(0);
      expect(projectMergeCommand).toHaveBeenLastCalledWith({
        action: "preview",
        request: f.operation.request
      });
      expect(
        (
          await runCli(
            ["project", "merge", "apply", "--plan-file", savedPlan, "--idempotency-key", "checked"],
            { projectMergeCommand }
          )
        ).exitCode
      ).toBe(0);
      expect(projectMergeCommand).toHaveBeenLastCalledWith({
        action: "apply",
        apply: {
          request: f.operation.request,
          plan_digest: plan.plan_digest,
          idempotency_key: "checked"
        }
      });
      await expect(readProjectMergeJson(savedPlan, 1)).rejects.toThrow("size limit");
      await expect(readProjectMergeJson(f.root)).rejects.toThrow("valid JSON");
      await writeFile(savedPlan, "{");
      await expect(readProjectMergeJson(savedPlan)).rejects.toThrow("valid JSON");
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("runs all authenticated merge actions through the real typed client", async () => {
    const f = await createProjectAdoptionFixture();
    try {
      const plan = {
        ...f.operation.request,
        plan_version: 1,
        runtime_contract: "project-services-v1",
        plan_digest: f.operation.plan_digest,
        ready: true,
        origin_ids: [f.source, f.target],
        observed_rows: 0,
        blockers: [],
        suggested_service_mappings: f.operation.request.service_mappings,
        resource_limits: []
      };
      const verification = {
        operation_id: f.operation.operation_id,
        canonical_project_id: f.target,
        verified: true,
        failures: []
      };
      const request = vi.fn().mockImplementation(async (input: { path: string }) => ({
        status: 200,
        body: input.path.endsWith("/preview")
          ? plan
          : input.path.endsWith("/verification")
            ? verification
            : f.operation
      }));
      const deps = {
        readAuthState: async () => ({
          bearer_token: "member",
          base_url: "https://api.example.test"
        }),
        createHttpClient: () => ({ request })
      };
      const actions: ProjectMergeCommandInput[] = [
        { action: "preview", request: f.operation.request },
        {
          action: "apply",
          apply: {
            request: f.operation.request,
            plan_digest: f.operation.plan_digest,
            idempotency_key: "checked"
          }
        },
        { action: "status", selector: { idempotency_key: "checked" } },
        ...(["verify", "resume", "cancel"] as const).map((action) => ({
          action,
          selector: { operation_id: f.operation.operation_id }
        }))
      ];
      for (const input of actions) {
        const result = await projectMergeWithAuthCommand({ ...input, json: true }, deps);
        expect(result.exitCode).toBe(0);
        expect(JSON.parse(result.output)).toEqual(
          input.action === "preview" ? plan : input.action === "verify" ? verification : f.operation
        );
      }
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({
          bearerToken: "member",
          path: expect.stringContaining("/v1/project-merges")
        })
      );
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("routes a simple preview without prompting or inferring policy changes", async () => {
    const projectMergeCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "preview" });
    const response = await runCli(
      ["project", "merge", "preview", "--target", target, "--sources", source, "--json"],
      { projectMergeCommand }
    );
    expect(response).toEqual({ exitCode: 0, output: "preview" });
    expect(projectMergeCommand).toHaveBeenCalledWith({
      action: "preview",
      request: { target_project_id: target, source_project_ids: [source], service_mappings: [] },
      json: true
    });
  });
  it("looks up a timed-out apply by idempotency key", async () => {
    const projectMergeCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "status" });
    await runCli(["project", "merge", "status", "--idempotency-key", "original-key"], {
      projectMergeCommand
    });
    expect(projectMergeCommand).toHaveBeenCalledWith({
      action: "status",
      selector: { idempotency_key: "original-key" }
    });
  });
  it("rejects malformed scopes, conflicting selectors and unknown flags before authentication", async () => {
    const projectMergeCommand = vi.fn();
    for (const args of [
      ["preview", "--target", "bad", "--sources", source],
      ["status", target, "--idempotency-key", "key"],
      ["cancel", target, "--force"]
    ])
      expect((await runCli(["project", "merge", ...args], { projectMergeCommand })).exitCode).toBe(
        4
      );
    expect(projectMergeCommand).not.toHaveBeenCalled();
  });
});
