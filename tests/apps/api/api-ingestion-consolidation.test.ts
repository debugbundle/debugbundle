import { describe, expect, it, vi } from "vitest";
import { createApiServer, type ApiDependencies } from "../../../apps/api/src/server.js";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";
import { createBaseDependencies } from "../../helpers/api-capture-rule-ingestion.js";
import { mockedObject } from "../../helpers/vitest.js";

const ROOT = "00000000-0000-4000-8000-000000000001";
const SITE = "00000000-0000-4000-8000-000000000002";
function event(name: string) {
  return createEventEnvelope({
    event_type: "backend_exception",
    project_token: "dbundle_proj_test",
    service: { name, environment: "production", runtime: "node", framework: "fastify" },
    payload: {
      name: "TypeError",
      message: "boom",
      stack: "TypeError: boom",
      handled: false,
      request: { method: "GET", path: "/orders", query: {}, headers: {}, body: null },
      response: { status_code: 500 },
      runtime: { version: "24.0.0" }
    }
  });
}
function fixture(full = true) {
  const deps = createBaseDependencies();
  deps.ingestionMetadata.resolveProjectByTokenHash = vi.fn().mockResolvedValue({
    project_id: ROOT,
    canonical_project_id: ROOT,
    scope_origin_ids: full ? [ROOT, SITE] : [ROOT],
    organization_id: "org_123",
    organization_plan: "team"
  });
  const resolveScopes = vi.fn().mockResolvedValue([
    { name: "API", origin_project_id: ROOT, service_aliases: ["API", "api"] },
    { name: "Site", origin_project_id: full ? SITE : ROOT, service_aliases: ["Site", "web"] }
  ]);
  deps.ingestionMetadata.resolveCredentialServiceScopes = resolveScopes;
  const persist = vi
    .fn<ApiDependencies["ingestionPersistence"]["persistAndEnqueue"]>()
    .mockResolvedValue({ object_key: "raw-events/fixture" });
  const receipt = vi
    .fn<NonNullable<ApiDependencies["ingestionPersistence"]["claimEvidenceReceipt"]>>()
    .mockResolvedValue({ matches: true, received_at: new Date().toISOString() });
  deps.ingestionPersistence = { persistAndEnqueue: persist, claimEvidenceReceipt: receipt };
  return { deps, resolveScopes, persist, receipt };
}
describe("consolidated ingestion scopes", () => {
  it("keeps an already durable batch accepted when optional probe refresh is unavailable", async () => {
    const f = fixture();
    f.deps.probeManagement = mockedObject<NonNullable<ApiDependencies["probeManagement"]>>({
      listActiveProbesForProject: vi.fn().mockRejectedValue(new Error("probe_refresh_unavailable"))
    });
    const response = await createApiServer(f.deps).inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: { events: [event("Site")] }
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ accepted: 1, rejected: 0 });
    expect(f.persist).toHaveBeenCalledTimes(1);
  });
  it("keeps a mixed batch's original service histories and raw submitted names", async () => {
    const f = fixture();
    const app = createApiServer(f.deps);
    const events = [event("API"), event("Site")];
    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: { events }
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ accepted: 2, rejected: 0 });
    expect(f.receipt.mock.calls.map((call) => call[1])).toEqual([ROOT, SITE]);
    expect(f.persist.mock.calls.map((call) => call[1])).toEqual([ROOT, SITE]);
    expect(f.persist.mock.calls.map((call) => call[0].service.name)).toEqual(["API", "Site"]);
  });
  it("retains original-only routing for an existing destination token", async () => {
    const f = fixture(false),
      app = createApiServer(f.deps);
    await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: { events: [event("Site")] }
    });
    expect(f.persist.mock.calls[0]?.[1]).toBe(ROOT);
  });
  it("rejects a service outside the token snapshot before receipts or persistence", async () => {
    const f = fixture();
    f.resolveScopes.mockResolvedValue([{ name: "Site", origin_project_id: null }]);
    const response = await createApiServer(f.deps).inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: { events: [event("Site")] }
    });
    expect(response.json()).toMatchObject({
      accepted: 0,
      rejected: 1,
      errors: [{ index: 0, reason: "service_scope_denied" }]
    });
    expect(f.receipt).not.toHaveBeenCalled();
    expect(f.persist).not.toHaveBeenCalled();
  });
});
