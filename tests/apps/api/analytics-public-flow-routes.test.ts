import * as quota from "../../../apps/api/src/analytics-quota.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiServer } from "../../../apps/api/src/server.js";
import type { ApiDependencies } from "../../../apps/api/src/api-types.js";
import { AnalyticsFlowError } from "../../../packages/storage/src/analytics-flow-store.js";
import { mockedObject } from "../../helpers/vitest.js";
const project = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const origin = "https://customer.test";
const definition = {
  flow_key: "reading",
  display_name: "Read blog",
  kind: "acquisition",
  timeout_minutes: 60,
  steps: [
    { step_key: "home", display_name: "Home", origin },
    { step_key: "blog", display_name: "Blog", origin: "https://blog.customer.test" }
  ]
};
const member = { authorization: "Bearer dbundle_mem_test" };
const sdk = { authorization: "Bearer dbundle_proj_test", origin };
function setup(
  input: {
    role?: string;
    denied?: boolean;
    enabled?: boolean;
    consent?: boolean;
    tokenProject?: string;
  } = {}
) {
  const store = {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn(),
    save: vi.fn().mockResolvedValue(definition),
    archive: vi.fn(),
    start: vi.fn().mockResolvedValue({ expires_at: "2026-10-04T10:00:00.000Z" }),
    step: vi.fn(),
    handoff: vi.fn(),
    arrive: vi.fn(),
    withdraw: vi.fn(),
    report: vi.fn().mockResolvedValue({ starts: 0 })
  };
  const app = createApiServer(
    mockedObject<ApiDependencies>({
      ingestionPersistence: { persistAndEnqueue: vi.fn() },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn().mockResolvedValue({
          project_id: input.tokenProject ?? project,
          organization_id: "org_customer",
          organization_plan: "free",
          allowed_origins: [origin],
          revoked_at: null,
          expires_at: null
        })
      },
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({
          member_id: "customer",
          organization_id: "org_customer",
          role: "owner",
          revoked_at: null,
          expires_at: null
        })
      },
      projectManagement: mockedObject<NonNullable<ApiDependencies["projectManagement"]>>({
        resolveProjectAccessForUser: vi.fn().mockImplementation(async ({ project_id }) =>
          input.denied || project_id !== project
            ? null
            : {
                project_id: project,
                organization_id: "org_customer",
                effective_role: input.role ?? "owner",
                organization_plan: "free"
              }
        )
      }),
      analyticsSettingsManagement: {
        getAnalyticsSettingsForProject: vi.fn().mockResolvedValue({
          enabled: input.enabled !== false,
          consent_required: input.consent !== false
        }),
        updateAnalyticsSettingsForProject: vi.fn()
      },
      analyticsFlows: store
    })
  );
  return { app, store };
}
afterEach(() => vi.restoreAllMocks());
describe("public project flow routes", () => {
  it("allows ordinary project readers without operator configuration and denies cross-project access", async () => {
    const { app, store } = setup({ role: "member" });
    expect(
      (await app.inject({ url: `/v1/projects/${project}/analytics/flows`, headers: member }))
        .statusCode
    ).toBe(200);
    expect(
      (await app.inject({ url: `/v1/projects/${other}/analytics/flows`, headers: member }))
        .statusCode
    ).toBe(404);
    expect(store.list).toHaveBeenCalledTimes(1);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: `/v1/projects/${project}/analytics/flows/reading`,
          headers: member,
          payload: definition
        })
      ).statusCode
    ).toBe(403);
    expect(store.save).not.toHaveBeenCalled();
  });
  it("allows owners to save/archive, validates step origins, and separates project write tokens", async () => {
    const { app, store } = setup();
    const url = `/v1/projects/${project}/analytics/flows/reading`;
    expect(
      (await app.inject({ method: "PUT", url, headers: member, payload: definition })).statusCode
    ).toBe(200);
    expect((await app.inject({ method: "DELETE", url, headers: member })).statusCode).toBe(200);
    expect(store.archive).toHaveBeenCalledOnce();
    expect(
      (
        await app.inject({
          method: "PUT",
          url,
          headers: member,
          payload: {
            ...definition,
            steps: [
              definition.steps[0],
              { ...definition.steps[1], origin: "https://blog.customer.test/path" }
            ]
          }
        })
      ).statusCode
    ).toBe(400);
    expect(
      (await app.inject({ url: `/v1/projects/${project}/analytics/flows`, headers: sdk }))
        .statusCode
    ).toBe(401);
  });
  it("enforces enabled settings, consent, exact project and origin on capture", async () => {
    const payload = { context: "a".repeat(43), step_key: "home", consent: true };
    const url = `/v1/analytics/flows/${project}/reading/start`;
    const ok = setup();
    expect((await ok.app.inject({ method: "POST", url, headers: sdk, payload })).statusCode).toBe(
      200
    );
    expect(ok.store.start).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: project, origin, step_key: "home" })
    );
    for (const [input, status] of [
      [{ enabled: false }, 403],
      [{ tokenProject: other }, 401]
    ] as const) {
      const { app, store } = setup(input);
      expect((await app.inject({ method: "POST", url, headers: sdk, payload })).statusCode).toBe(
        status
      );
      expect(store.start).not.toHaveBeenCalled();
    }
    for (const headers of [
      { authorization: sdk.authorization },
      { ...sdk, origin: "https://attacker.test" }
    ])
      expect((await ok.app.inject({ method: "POST", url, headers, payload })).statusCode).toBe(403);
    expect(
      (
        await ok.app.inject({
          method: "POST",
          url,
          headers: sdk,
          payload: { ...payload, consent: false }
        })
      ).statusCode
    ).toBe(403);
    expect(
      (
        await setup({ consent: false }).app.inject({
          method: "POST",
          url,
          headers: sdk,
          payload: { ...payload, consent: false }
        })
      ).statusCode
    ).toBe(200);
    expect(
      (
        await ok.app.inject({
          method: "POST",
          url,
          headers: sdk,
          payload: { ...payload, email: "private@example.test" }
        })
      ).statusCode
    ).toBe(400);
  });
  it("permits withdrawal when disabled and exposes credential-free CORS to configured capture origins", async () => {
    const { app, store } = setup({ enabled: false });
    const url = `/v1/analytics/flows/${project}/reading/withdraw`;
    expect(
      (
        await app.inject({
          method: "POST",
          url,
          headers: sdk,
          payload: { context: "a".repeat(43) }
        })
      ).statusCode
    ).toBe(200);
    expect(store.withdraw).toHaveBeenCalledOnce();
    const cors = await app.inject({
      method: "OPTIONS",
      url,
      headers: {
        origin,
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type"
      }
    });
    expect(cors.statusCode).toBe(204);
    expect(cors.headers["access-control-allow-origin"]).toBe(origin);
    expect(cors.headers["access-control-allow-credentials"]).not.toBe("true");
  });
  it("rejects credential-like attribution before persistence", async () => {
    const { app, store } = setup();
    for (const attribution of [
      { source: `dbundle_proj_${"a".repeat(32)}` },
      { campaign: `dbundle_mem_${"a".repeat(32)}` },
      { campaign: "4242424242424242" }
    ]) {
      const response = await app.inject({
        method: "POST",
        url: `/v1/analytics/flows/${project}/reading/start`,
        headers: sdk,
        payload: { context: "a".repeat(43), step_key: "home", consent: true, ...attribution }
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "invalid_flow_attribution" });
    }
    expect(store.start).not.toHaveBeenCalled();
  });
  it("rejects invalid report windows and maps bounded capture failures without leaking errors", async () => {
    const { app, store } = setup();
    expect(
      (
        await app.inject({
          url: `/v1/projects/${project}/analytics/flows/reading/report?window=all`,
          headers: member
        })
      ).statusCode
    ).toBe(400);
    expect(
      (
        await app.inject({
          url: `/v1/projects/${project}/analytics/flows/reading/report?window=7d`,
          headers: member
        })
      ).statusCode
    ).toBe(200);
    const call = store.report.mock.calls[0]![0] as {
      from: string;
      to: string;
      previous_from: string;
    };
    expect(Date.parse(call.to) - Date.parse(call.from)).toBe(7 * 86400_000);
    expect(Date.parse(call.from) - Date.parse(call.previous_from)).toBe(7 * 86400_000);
    store.start.mockRejectedValue(new AnalyticsFlowError("out_of_order"));
    const response = await app.inject({
      method: "POST",
      url: `/v1/analytics/flows/${project}/reading/start`,
      headers: sdk,
      payload: { context: "a".repeat(43), step_key: "home", consent: true }
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "analytics_flow_out_of_order" });
  });
  it("enforces analytics allowances and uses stable retry claims without blocking withdrawal", async () => {
    const claim = vi.spyOn(quota, "claimAnalyticsIngestionQuota").mockResolvedValue({
      allowed: false,
      metric: "monthly_analytics_events",
      used: 100,
      limit: 100,
      retry_after_ms: 1000,
      usage_window: { starts_at: "2026-10-01T00:00:00.000Z", ends_at: "2026-11-01T00:00:00.000Z" }
    });
    const { app, store } = setup();
    const url = `/v1/analytics/flows/${project}/reading/start`;
    const payload = { context: "a".repeat(43), step_key: "home", consent: true };
    const rejected = await app.inject({ method: "POST", url, headers: sdk, payload });
    expect(rejected.statusCode).toBe(429);
    expect(rejected.headers["retry-after"]).toBe("1");
    expect(store.start).not.toHaveBeenCalled();
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/v1/analytics/flows/${project}/reading/withdraw`,
          headers: sdk,
          payload: { context: payload.context }
        })
      ).statusCode
    ).toBe(200);
    expect(claim).toHaveBeenCalledOnce();
    claim.mockResolvedValue({ allowed: true });
    expect((await app.inject({ method: "POST", url, headers: sdk, payload })).statusCode).toBe(200);
    expect(claim.mock.calls[0]![0].events).toEqual(claim.mock.calls[1]![0].events);
  });
});
