import { describe, it, expect, vi } from "vitest";
import { createApiServer } from "../../../apps/api/src/server.js";
import { ProjectMergeError } from "../../../packages/storage/src/project-merge-store.js";
import { createBaseDependencies } from "../../helpers/api-capture-rule-ingestion.js";
const target = "10000000-0000-4000-8000-000000000001",
  source = "10000000-0000-4000-8000-000000000002",
  operation = "10000000-0000-4000-8000-000000000003";
const request = { target_project_id: target, source_project_ids: [source], service_mappings: [] };
function fixture() {
  const auditLogging = { createAuditLog: vi.fn().mockResolvedValue(undefined) };
  const projectMerges = {
    preview: vi.fn().mockResolvedValue({ ready: true }),
    apply: vi.fn().mockResolvedValue({ operation_id: operation }),
    status: vi.fn().mockResolvedValue({ operation_id: operation }),
    verify: vi.fn().mockResolvedValue({ verified: true }),
    resume: vi.fn().mockResolvedValue({ operation_id: operation }),
    cancel: vi.fn().mockResolvedValue({ state: "cancelled" })
  };
  const dependencies = {
    auditLogging,
    ...createBaseDependencies(),
    projectMerges,
    memberAuth: {
      resolveMemberByTokenHash: vi
        .fn()
        .mockResolvedValue({ member_id: "owner", organization_id: "account" })
    }
  };
  return { app: createApiServer(dependencies), projectMerges, auditLogging };
}
const headers = { authorization: "Bearer dbundle_mem_synthetic" };
describe("project merge HTTP operations", () => {
  it("audit-logs rejected privileged input as a failure", async () => {
    const f = fixture();
    await f.app.inject({
      method: "POST",
      url: "/v1/project-merges",
      headers,
      payload: { idempotency_key: "missing-plan" }
    });
    expect(f.auditLogging.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "project_merge.apply",
        status: "failure",
        metadata: { reason: "invalid_merge_request" }
      })
    );
    await f.app.close();
  });
  it("accepts the bounded thousand-service Unicode preview above the generic body limit", async () => {
    const f = fixture();
    const service_mappings = Array.from({ length: 1000 }, (_, index) => ({
      source_project_id: source,
      service_definition_id: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      name: "服".repeat(110) + index
    }));
    const response = await f.app.inject({
      method: "POST",
      url: "/v1/project-merges/preview",
      headers,
      payload: { ...request, service_mappings }
    });
    expect(response.statusCode).toBe(200);
    expect(f.projectMerges.preview).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({ service_mappings: expect.any(Array) })
      })
    );
    await f.app.close();
  });
  it.each([
    ["preview", "POST", "/v1/project-merges/preview", request],
    [
      "apply",
      "POST",
      "/v1/project-merges",
      { request, plan_digest: "a".repeat(64), idempotency_key: "retry-key" }
    ],
    ["status", "GET", `/v1/project-merges/${operation}`, undefined],
    ["verify", "GET", `/v1/project-merges/${operation}/verification`, undefined],
    ["resume", "POST", `/v1/project-merges/${operation}/resume`, undefined],
    ["cancel", "POST", `/v1/project-merges/${operation}/cancel`, undefined]
  ] as const)(
    "uses the shared %s operation with the authenticated actor",
    async (action, method, url, payload) => {
      const f = fixture();
      const response = await f.app.inject({
        method,
        url,
        headers,
        ...(payload === undefined ? {} : { payload })
      });
      expect(response.statusCode).toBe(200);
      expect(f.projectMerges[action]).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: "owner" })
      );
      await f.app.close();
    }
  );
  it("looks up an uncertain apply by the original idempotency key", async () => {
    const f = fixture();
    const response = await f.app.inject({
      method: "GET",
      url: "/v1/project-merges?idempotency_key=retry-key",
      headers
    });
    expect(response.statusCode).toBe(200);
    expect(f.projectMerges.status).toHaveBeenCalledWith({
      user_id: "owner",
      idempotency_key: "retry-key"
    });
    await f.app.close();
  });
  it("rejects malformed and unauthenticated requests before reaching the engine", async () => {
    const f = fixture();
    expect(
      (
        await f.app.inject({
          method: "POST",
          url: "/v1/project-merges/preview",
          headers,
          payload: { ...request, user_id: "someone" }
        })
      ).statusCode
    ).toBe(400);
    expect(
      (await f.app.inject({ method: "GET", url: `/v1/project-merges/${operation}` })).statusCode
    ).toBe(401);
    expect(f.projectMerges.preview).not.toHaveBeenCalled();
    expect(f.projectMerges.status).not.toHaveBeenCalled();
    await f.app.close();
  });
  it("returns a safe conflict with the durable operation ID", async () => {
    const f = fixture();
    f.projectMerges.apply.mockRejectedValue(new ProjectMergeError("stale_merge_plan", operation));
    const response = await f.app.inject({
      method: "POST",
      url: "/v1/project-merges",
      headers,
      payload: { request, plan_digest: "a".repeat(64), idempotency_key: "retry-key" }
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "stale_merge_plan", operation_id: operation });
    await f.app.close();
  });
});
