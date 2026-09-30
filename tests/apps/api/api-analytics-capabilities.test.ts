import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createApiServer } from "../../../apps/api/src/server.js";
import { buildPublicOpenApiSpec } from "../../../apps/api/src/openapi.js";
import { AnalyticsCapabilitiesSchema } from "../../../packages/shared-types/src/index.js";
import { createBaseDependencies } from "../../helpers/api-capture-rule-ingestion.js";
import { mockedObject } from "../../helpers/vitest.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";
const writerId = "33333333-3333-4333-8333-333333333333";
const issuerId = "44444444-4444-4444-8444-444444444444";
const writerToken = `dbundle_anl_${"A".repeat(43)}`;
const schema = "2026-09-analytics-02";
const apps: ReturnType<typeof createApiServer>[] = [];
const originalProbeSecret = process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"];

beforeEach(() => {
  process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"] = "test-probe-secret";
});

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  if (originalProbeSecret === undefined) delete process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"];
  else process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"] = originalProbeSecret;
});

function createApp() {
  const resolveProject = vi.fn().mockResolvedValue({
    project_id: projectId,
    organization_id: organizationId,
    organization_plan: "solo"
  });
  const resolveWriter = vi.fn().mockResolvedValue({
    writer_id: writerId,
    project_id: projectId,
    organization_id: organizationId,
    issuer_user_id: issuerId,
    kind: "server",
    expires_at: "2099-01-01T00:00:00.000Z",
    revoked_at: null
  });
  const app = createApiServer({
    ...createBaseDependencies({ resolveProjectByTokenHash: resolveProject }),
    analyticsWriters: mockedObject<
      NonNullable<Parameters<typeof createApiServer>[0]["analyticsWriters"]>
    >({
      resolveByTokenHash: resolveWriter
    })
  });
  apps.push(app);
  return { app, resolveProject, resolveWriter };
}

it("preserves the installed SDK config shape and cache headers without negotiation", async () => {
  const { app } = createApp();
  const response = await app.inject({
    method: "GET",
    url: "/v1/sdk/config",
    headers: { authorization: "Bearer dbundle_proj_test" }
  });
  expect(response.statusCode).toBe(200);
  expect(response.json()).not.toHaveProperty("analytics_semantic");
  expect(response.headers["cache-control"]).toBe("public, s-maxage=30");
  expect(response.headers["vary"]).toBe("X-DebugBundle-Analytics-Config");
});

it("returns a credential-private disabled V2 capability until ingestion is ready", async () => {
  const { app } = createApp();
  const response = await app.inject({
    method: "GET",
    url: "/v1/sdk/config?project_id=99999999-9999-4999-8999-999999999999",
    headers: {
      authorization: "Bearer dbundle_proj_test",
      "x-debugbundle-analytics-schema": schema,
      "if-none-match": '"legacy-etag"'
    }
  });
  expect(response.statusCode).toBe(200);
  const capability = AnalyticsCapabilitiesSchema.parse(response.json().analytics_semantic);
  expect(capability).toMatchObject({
    project_id: projectId,
    principal: "project_token",
    enabled: false,
    unavailable_reason: "not_enabled",
    allowed_producers: [],
    allowed_purposes: [],
    max_event_age_seconds: 604_800,
    correction_seconds: 172_800
  });
  expect(response.headers["cache-control"]).toBe("private, no-store");
  expect(response.headers["vary"]).toBe(
    "Authorization, Origin, X-DebugBundle-Analytics-Schema, X-DebugBundle-Analytics-Config"
  );
  expect(response.headers["etag"]).toBeUndefined();
});

it("rejects an unknown opt-in schema without falling back to a cacheable response", async () => {
  const { app } = createApp();
  const response = await app.inject({
    method: "GET",
    url: "/v1/sdk/config",
    headers: {
      authorization: "Bearer dbundle_proj_test",
      "x-debugbundle-analytics-schema": "unknown"
    }
  });
  expect(response.statusCode).toBe(406);
  expect(response.json()).toEqual({ error: "unsupported_analytics_schema" });
  expect(response.headers["cache-control"]).toBe("private, no-store");
  const unauthenticated = await app.inject({
    method: "GET",
    url: "/v1/sdk/config",
    headers: { "x-debugbundle-analytics-schema": "unknown" }
  });
  expect(unauthenticated.statusCode).toBe(401);
  expect(unauthenticated.json()).toEqual({ error: "invalid_project_token" });
});

it("accepts only a live server-writer credential for its scoped capability", async () => {
  const { app, resolveProject, resolveWriter } = createApp();
  const request = {
    method: "GET" as const,
    url: "/v1/sdk/config",
    headers: { authorization: `Bearer ${writerToken}`, "x-debugbundle-analytics-schema": schema }
  };
  const response = await app.inject(request);
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({
    analytics_semantic: AnalyticsCapabilitiesSchema.parse(response.json().analytics_semantic)
  });
  expect(response.json().analytics_semantic).toMatchObject({
    principal: "server_writer",
    project_id: projectId,
    enabled: false
  });
  expect(resolveProject).not.toHaveBeenCalled();
  expect(resolveWriter).toHaveBeenCalledOnce();

  const browserOrigin = await app.inject({
    ...request,
    headers: { ...request.headers, origin: "https://site.example" }
  });
  expect(browserOrigin.statusCode).toBe(401);
  const relay = await app.inject({
    ...request,
    headers: { ...request.headers, authorization: `Bearer dbundle_anr_${"A".repeat(43)}` }
  });
  expect(relay.statusCode).toBe(401);

  resolveWriter.mockResolvedValueOnce({
    writer_id: writerId,
    project_id: projectId,
    organization_id: organizationId,
    issuer_user_id: issuerId,
    kind: "server",
    expires_at: "2099-01-01T00:00:00.000Z",
    revoked_at: "2026-09-28T00:00:00.000Z"
  });
  const revoked = await app.inject(request);
  expect(revoked.statusCode).toBe(401);
  expect(revoked.json()).toEqual({ error: "invalid_analytics_writer" });
});

it("uses a current project policy resolver only behind the complete local V2 route gates", async () => {
  const now = new Date();
  const resolve = vi.fn().mockResolvedValue({
    protocol: "2026-09-analytics-capabilities-01",
    project_id: projectId,
    principal: "server_writer",
    server_time: now.toISOString(),
    expires_at: new Date(now.getTime() + 300_000).toISOString(),
    enabled: true,
    unavailable_reason: null,
    schema_version: schema,
    scope: { kind: "project", project_id: projectId },
    scope_revision: 1,
    catalog_revision: 1,
    namespace_revision: null,
    identity_scope: null,
    known_identity_allowed: false,
    allowed_producers: ["server"],
    allowed_purposes: ["business_measurement"],
    consent_required: false,
    privacy_mode: "strict",
    sample_rate: 1,
    max_event_bytes: 16_384,
    max_batch_events: 256,
    max_batch_bytes: 262_144,
    max_properties: 2,
    detailed_retention_days: 30,
    max_event_age_seconds: 604_800,
    correction_seconds: 172_800,
    receipt_retention_days: 90,
    retry_after_max_ms: 300_000
  });
  const base = createApp();
  const dependencies = base.app;
  await dependencies.close();
  apps.splice(apps.indexOf(dependencies), 1);
  const app = createApiServer({
    ...createBaseDependencies({ resolveProjectByTokenHash: base.resolveProject }),
    analyticsWriters: mockedObject<
      NonNullable<Parameters<typeof createApiServer>[0]["analyticsWriters"]>
    >({ resolveByTokenHash: base.resolveWriter }),
    semanticAnalyticsCapabilities: { enabled: true, resolve }
  });
  apps.push(app);
  const response = await app.inject({
    method: "GET",
    url: "/v1/sdk/config",
    headers: { authorization: `Bearer ${writerToken}`, "x-debugbundle-analytics-schema": schema }
  });
  expect(response.json().analytics_semantic.enabled).toBe(false);
  expect(resolve).not.toHaveBeenCalled();
  const readyApp = createApiServer({
    ...createBaseDependencies({ resolveProjectByTokenHash: base.resolveProject }),
    analyticsWriters: mockedObject<
      NonNullable<Parameters<typeof createApiServer>[0]["analyticsWriters"]>
    >({ resolveByTokenHash: base.resolveWriter }),
    semanticAnalyticsCapabilities: { enabled: true, resolve },
    semanticAnalyticsDelivery: mockedObject<
      NonNullable<Parameters<typeof createApiServer>[0]["semanticAnalyticsDelivery"]>
    >({ enabled: true }),
    semanticAnalyticsReports: mockedObject<
      NonNullable<Parameters<typeof createApiServer>[0]["semanticAnalyticsReports"]>
    >({ enabled: true })
  });
  apps.push(readyApp);
  const ready = await readyApp.inject({
    method: "GET",
    url: "/v1/sdk/config",
    headers: { authorization: `Bearer ${writerToken}`, "x-debugbundle-analytics-schema": schema }
  });
  expect(ready.json().analytics_semantic.enabled).toBe(true);
  expect(resolve).toHaveBeenCalledWith({
    projectId,
    principal: "server_writer",
    credentialHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    receivedAt: expect.any(String)
  });
});

it("documents the two opt-in credential modes and negotiated response variants", () => {
  const spec = buildPublicOpenApiSpec() as {
    paths: Record<
      string,
      Record<
        string,
        {
          security: unknown;
          responses: Record<
            string,
            { content?: { "application/json"?: { schema?: { oneOf?: unknown[] } } } }
          >;
        }
      >
    >;
    components: { securitySchemes: Record<string, unknown> };
  };
  const operation = spec.paths["/v1/sdk/config"]?.["get"];
  expect(operation?.security).toEqual([
    { projectBearerToken: [] },
    { analyticsWriterBearerToken: [] }
  ]);
  expect(spec.components.securitySchemes).toHaveProperty("analyticsWriterBearerToken");
  expect(operation?.responses["200"]?.content?.["application/json"]?.schema?.oneOf).toHaveLength(2);
  expect(operation?.responses).toHaveProperty("406");
});
