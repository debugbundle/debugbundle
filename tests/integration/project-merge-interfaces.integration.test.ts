import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { migrateStorageSchema } from "../../packages/storage/src/schema-migrations.js";
import { createMetadataAccess } from "../../packages/storage/src/metadata-access.js";
import { createApiServer } from "../../apps/api/src/server.js";
import {
  createProjectMergesApi,
  ProjectMergeApiError
} from "../../packages/project-management-client/src/project-merges.js";
import {
  createProjectMergeMcpTools,
  PROJECT_MERGE_MCP_TOOL_CATALOG
} from "../../apps/mcp/src/project-merge-tools.js";
import { projectMergeWithAuthCommand } from "../../apps/cli/src/project-merge-commands.js";
import { createBaseDependencies } from "../helpers/api-capture-rule-ingestion.js";
import { seedConsolidationProjects } from "../helpers/consolidation-projects.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";
runIntegration("checked merge API CLI and MCP parity", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool);
  beforeAll(async () => {
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
  });
  afterAll(async () => {
    await pool.end();
  });
  it("previews, applies, retries and verifies one operation across the public adapters", async () => {
    const f = await seedConsolidationProjects(pool, db),
      bearerToken = "dbundle_mem_synthetic";
    const dependencies = createBaseDependencies();
    let actor = f.userId;
    dependencies.memberAuth.resolveMemberByTokenHash = async () => ({
      member_id: actor,
      organization_id: f.organizationId
    });
    const app = createApiServer({
      ...dependencies,
      projectManagement: { ...dependencies.projectManagement!, ...createMetadataAccess(db) },
      projectMerges: f.store
    });
    const http = {
      request: async (
        request: Parameters<Parameters<typeof createProjectMergesApi>[0]["request"]>[0]
      ) => {
        expect(JSON.stringify(request.body ?? {})).not.toContain(bearerToken);
        const response = await app.inject({
          method: request.method,
          url: request.path,
          headers: { authorization: `Bearer ${request.bearerToken}` },
          ...(request.body === undefined
            ? {}
            : { payload: request.body as Record<string, unknown> })
        });
        return { status: response.statusCode, body: response.json<unknown>() };
      }
    };
    try {
      const api = createProjectMergesApi(http),
        tools = createProjectMergeMcpTools(api);
      const preview = await api.previewProjectMerge({ bearerToken, request: f.request });
      expect(preview.ready).toBe(true);
      expect(preview.resource_limits.length).toBeGreaterThan(0);
      expect(preview.suggested_service_mappings).toHaveLength(1);
      const idempotency_key = randomUUID();
      actor = randomUUID();
      await expect(
        api.applyProjectMerge({
          bearerToken,
          request: f.request,
          plan_digest: preview.plan_digest,
          idempotency_key
        })
      ).rejects.toMatchObject({ code: "merge_conflict" });
      actor = f.userId;
      const result = await api.applyProjectMerge({
        bearerToken,
        request: f.request,
        plan_digest: preview.plan_digest,
        idempotency_key
      });
      expect(result).toMatchObject({
        state: "completed",
        local_adoption: "pending",
        deployed_runtime: "pending"
      });
      expect(await tools["get_project_merge"]!({ bearerToken, idempotency_key })).toEqual(result);
      expect(
        await api.applyProjectMerge({
          bearerToken,
          request: f.request,
          plan_digest: preview.plan_digest,
          idempotency_key
        })
      ).toEqual(result);
      const cli = await projectMergeWithAuthCommand(
        { action: "verify", selector: { operation_id: result.operation_id }, json: true },
        {
          readAuthState: async () =>
            ({ bearer_token: bearerToken, base_url: "https://api.example.test" }) as never,
          createHttpClient: () => http
        }
      );
      expect(cli.exitCode).toBe(0);
      expect(JSON.parse(cli.output)).toMatchObject({ verified: true });
      await expect(
        api.cancelProjectMerge({ bearerToken, operation_id: result.operation_id })
      ).rejects.toMatchObject({
        code: "project_merge_cannot_cancel",
        operation_id: result.operation_id
      });
      expect(
        await api
          .getProjectMerge({ bearerToken, operation_id: randomUUID() })
          .catch((error) => error as unknown)
      ).toBeInstanceOf(ProjectMergeApiError);
      expect(PROJECT_MERGE_MCP_TOOL_CATALOG.map((tool) => tool.annotations.readOnlyHint)).toEqual([
        true,
        false,
        true,
        true,
        false,
        false
      ]);
      await expect(
        tools["get_project_merge"]!({
          bearerToken,
          operation_id: result.operation_id,
          idempotency_key
        })
      ).rejects.toThrow("invalid_merge_request");
      actor = randomUUID();
      await expect(
        api.getProjectMerge({ bearerToken, operation_id: result.operation_id })
      ).rejects.toMatchObject({ code: "project_merge_not_found" });
    } finally {
      await app.close();
    }
  });
});
