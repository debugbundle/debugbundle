import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiServer } from "../../../apps/api/src/server.ts";
import { deriveProbeTriggerTokenKey } from "../../../packages/auth/src/index.js";
import { createProbeRouteServer as createServer } from "../../helpers/api-probe-server.js";
const originalProbeTriggerSecret = process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"];

describe("api SDK config", () => {
  beforeEach(() => {
    process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"] = "test-probe-secret";
  });

  afterEach(() => {
    if (originalProbeTriggerSecret === undefined) {
      delete process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"];
      return;
    }

    process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"] = originalProbeTriggerSecret;
  });

  it("should reject sdk config when project token is missing", async (): Promise<void> => {
    const app = createServer();

    const response = await app.inject({
      method: "GET",
      url: "/v1/sdk/config"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "invalid_project_token" });
  });

  it("should enforce project token origins for sdk config", async (): Promise<void> => {
    const app = createServer({
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn().mockResolvedValue({
          project_id: "proj_123",
          organization_plan: "free",
          allowed_origins: ["https://static.example.com"]
        })
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/sdk/config",
      headers: {
        authorization: "Bearer dbundle_proj_test",
        origin: "https://evil.example.com"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "origin_not_allowed" });
  });

  it("should reject sdk config without origin when project token origins are configured", async (): Promise<void> => {
    const app = createServer({
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn().mockResolvedValue({
          project_id: "proj_123",
          organization_plan: "free",
          allowed_origins: ["https://static.example.com"]
        })
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/sdk/config",
      headers: {
        authorization: "Bearer dbundle_proj_test"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "origin_not_allowed" });
  });

  it("should return sdk config for free tier projects", async (): Promise<void> => {
    const probeManagement = {
      listActiveProbesForProject: vi.fn().mockResolvedValue([
        {
          activation_id: "11111111-1111-4111-8111-111111111111",
          label_pattern: "checkout.*",
          service: "*",
          environment: "*",
          expires_at: "2026-03-11T01:00:00.000Z",
          trigger_expires_at: "2026-03-12T01:00:00.000Z"
        }
      ]),
      listActiveProbesForProjectInOrganization: vi.fn(),
      createProbeActivationForProjectInOrganization: vi.fn(),
      deactivateProbeActivationForProjectInOrganization: vi.fn()
    };
    const app = createServer({
      probeManagement,
      ingestionMetadata: {
        resolveProjectByTokenHash: vi
          .fn()
          .mockResolvedValue({ project_id: "proj_123", organization_plan: "free" })
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/sdk/config",
      headers: { authorization: "Bearer dbundle_proj_test" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.headers["vary"]).toBe(
      "Authorization, Origin, X-DebugBundle-Analytics-Config, X-DebugBundle-Evidence"
    );
    expect(response.json()).toEqual({
      probes_enabled: true,
      remote_probes_enabled: false,
      active_probes: [],
      poll_interval_ms: 60000,
      capture_rules: [],
      capture_policy: {
        preset: "balanced",
        capture_logs: "warning",
        capture_request_events: "failures_only",
        capture_breadcrumbs: "exception_only",
        capture_probe_events: "buffer_only",
        immediate_client_error_statuses: [],
        immediate_client_error_path_rules: []
      }
    });
  });

  it("keeps the installed SDK config shape and capture defaults for Business", async () => {
    const configurations: unknown[] = [];
    for (const plan of ["team", "business"] as const) {
      const app = createServer({
        ingestionMetadata: {
          resolveProjectByTokenHash: vi.fn().mockResolvedValue({
            project_id: "proj_123",
            organization_plan: plan
          })
        }
      });
      try {
        const response = await app.inject({
          method: "GET",
          url: "/v1/sdk/config",
          headers: { authorization: "Bearer dbundle_proj_test" }
        });
        expect(response.statusCode).toBe(200);
        configurations.push(response.json());
      } finally {
        await app.close();
      }
    }
    expect(configurations[1]).toEqual(configurations[0]);
    expect(configurations[1]).toMatchObject({ capture_policy: { preset: "balanced" } });
    expect(configurations[1]).not.toHaveProperty("organization_plan");
  });

  it("should return restrictive project analytics capture settings to opted-in Free browser SDKs", async (): Promise<void> => {
    const analyticsSettingsManagement = {
      getAnalyticsSettingsForProject: vi.fn().mockResolvedValue({
        enabled: true,
        privacy_mode: "strict",
        consent_required: true,
        capture_page_views: false,
        capture_route_changes: true,
        capture_actions: false,
        capture_friction_signals: false,
        journey_sample_rate: 0.5,
        raw_retention_days: 1,
        sample_retention_days: 7,
        hourly_retention_days: 30,
        aggregate_retention_months: 12,
        max_saved_funnels: 1,
        max_custom_dimensions: 0,
        approved_custom_dimensions: []
      }),
      updateAnalyticsSettingsForProject: vi.fn()
    };
    const app = createServer({
      ingestionMetadata: {
        resolveProjectByTokenHash: vi
          .fn()
          .mockResolvedValue({ project_id: "proj_123", organization_plan: "free" })
      },
      analyticsSettingsManagement
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/sdk/config",
      headers: {
        authorization: "Bearer dbundle_proj_test",
        "x-debugbundle-analytics-config": "1"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      analytics: {
        enabled: true,
        privacy_mode: "strict",
        consent_required: true,
        capture_page_views: false,
        capture_route_changes: true,
        capture_actions: false,
        capture_friction_signals: false
      }
    });
    expect(analyticsSettingsManagement.getAnalyticsSettingsForProject).toHaveBeenCalledWith({
      organization_id: "",
      project_id: "proj_123"
    });
  });

  it("should return disabled analytics config when opted-in SDK settings storage is unavailable", async (): Promise<void> => {
    const app = createServer();

    const response = await app.inject({
      method: "GET",
      url: "/v1/sdk/config",
      headers: {
        authorization: "Bearer dbundle_proj_test",
        "x-debugbundle-analytics-config": "1"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      analytics: {
        enabled: false,
        privacy_mode: "strict",
        consent_required: false,
        capture_page_views: true,
        capture_route_changes: true,
        capture_actions: false,
        capture_friction_signals: true
      }
    });
  });

  it("should return resolved capture policy from capturePolicyManagement when available", async (): Promise<void> => {
    const capturePolicyManagement = {
      getCapturePolicyForProject: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        preset: "investigative",
        capture_logs: null,
        capture_request_events: "failures_only",
        capture_breadcrumbs: null,
        capture_probe_events: null,
        immediate_client_error_statuses: null,
        immediate_client_error_path_rules: null
      }),
      upsertCapturePolicyForProject: vi.fn()
    };
    const app = createApiServer({
      ingestionPersistence: { persistAndEnqueue: vi.fn() },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi
          .fn()
          .mockResolvedValue({ project_id: "proj_123", organization_plan: "solo" })
      },
      memberAuth: {
        resolveMemberByTokenHash: vi
          .fn()
          .mockResolvedValue({ member_id: "usr_123", organization_id: "org_123" })
      },
      tokenManagement: {
        listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
        createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
        revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
        listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
        createMemberTokenForOrganization: vi.fn().mockResolvedValue(null),
        revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
      },
      projectManagement: {
        resolveProjectAccessForUser: vi.fn().mockResolvedValue({
          project_id: "00000000-0000-4000-8000-000000000001",
          organization_id: "org_owner",
          owner_user_id: "usr_owner",
          owner_email: "owner@example.com",
          relationship: "shared",
          sharing_state: "shared_with_you",
          effective_role: "member",
          organization_plan: "solo"
        }),
        listProjectsForOrganization: vi.fn().mockResolvedValue([]),
        createProjectForOrganization: vi.fn().mockResolvedValue(null),
        updateProjectForOrganization: vi.fn().mockResolvedValue(null),
        deleteProjectForOrganization: vi.fn().mockResolvedValue(null)
      },
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue(null),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
      },
      objectStoreReader: { getObject: vi.fn() },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] })
      },
      capturePolicyManagement
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/sdk/config",
      headers: { authorization: "Bearer dbundle_proj_test" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      capture_rules: [],
      capture_policy: {
        preset: "investigative",
        capture_logs: "info",
        capture_request_events: "failures_only",
        capture_breadcrumbs: "standalone",
        capture_probe_events: "standalone_when_activated",
        immediate_client_error_statuses: [401, 403, 409, 422],
        immediate_client_error_path_rules: []
      }
    });
    expect(capturePolicyManagement.getCapturePolicyForProject).toHaveBeenCalledWith({
      organization_id: "",
      project_id: "proj_123"
    });
  });

  it("returns probes with the immutable credential scope signing key for paid projects", async (): Promise<void> => {
    const app = createServer({
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn().mockResolvedValue({
          project_id: "proj_123",
          organization_plan: "solo",
          scope_origin_ids: ["proj_123", "proj_adopted"]
        })
      },
      probeManagement: {
        listActiveProbesForProject: vi.fn().mockResolvedValue([
          {
            activation_id: "11111111-1111-4111-8111-111111111111",
            label_pattern: "checkout.*",
            service: "*",
            environment: "*",
            expires_at: "2026-03-11T01:00:00.000Z",
            trigger_expires_at: "2026-03-12T01:00:00.000Z"
          }
        ]),
        listActiveProbesForProjectInOrganization: vi.fn(),
        createProbeActivationForProjectInOrganization: vi.fn(),
        deactivateProbeActivationForProjectInOrganization: vi.fn()
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/sdk/config",
      headers: { authorization: "Bearer dbundle_proj_test" }
    });
    const body: unknown = response.json();

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      probes_enabled: true,
      remote_probes_enabled: true,
      active_probes: [
        {
          activation_id: "11111111-1111-4111-8111-111111111111",
          label_pattern: "checkout.*",
          service: "*",
          environment: "*",
          expires_at: "2026-03-11T01:00:00.000Z",
          trigger_expires_at: "2026-03-12T01:00:00.000Z"
        }
      ],
      poll_interval_ms: 60000
    });
    expect(body).not.toBeNull();
    expect(Array.isArray(body)).toBe(false);
    expect((body as Record<string, unknown>)["trigger_token_key"]).toBe(
      deriveProbeTriggerTokenKey("proj_123", ["proj_123", "proj_adopted"])
    );
    expect((body as Record<string, unknown>)["trigger_token_key"]).not.toBe(
      deriveProbeTriggerTokenKey("proj_123")
    );
  });

  it("should return balanced capture policy defaults for solo projects without a stored policy row", async (): Promise<void> => {
    const app = createServer({
      ingestionMetadata: {
        resolveProjectByTokenHash: vi
          .fn()
          .mockResolvedValue({ project_id: "proj_123", organization_plan: "solo" })
      },
      capturePolicyManagement: {
        getCapturePolicyForProject: vi.fn().mockResolvedValue(null),
        upsertCapturePolicyForProject: vi.fn()
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/sdk/config",
      headers: { authorization: "Bearer dbundle_proj_test" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      capture_rules: [],
      capture_policy: {
        preset: "balanced",
        capture_logs: "warning",
        capture_request_events: "failures_only",
        capture_breadcrumbs: "exception_only",
        capture_probe_events: "buffer_only",
        immediate_client_error_statuses: [],
        immediate_client_error_path_rules: []
      }
    });
  });

  it("should return ETag header on sdk config and 304 on If-None-Match hit", async (): Promise<void> => {
    const probeManagement = {
      listActiveProbesForProject: vi.fn().mockResolvedValue([
        {
          activation_id: "11111111-1111-4111-8111-111111111111",
          label_pattern: "checkout.*",
          service: "*",
          environment: "*",
          expires_at: "2026-03-11T01:00:00.000Z",
          trigger_expires_at: "2026-03-12T01:00:00.000Z"
        }
      ]),
      listActiveProbesForProjectInOrganization: vi.fn(),
      createProbeActivationForProjectInOrganization: vi.fn(),
      deactivateProbeActivationForProjectInOrganization: vi.fn()
    };
    const app = createServer({
      ingestionMetadata: {
        resolveProjectByTokenHash: vi
          .fn()
          .mockResolvedValue({ project_id: "proj_123", organization_plan: "solo" })
      },
      probeManagement
    });

    const first = await app.inject({
      method: "GET",
      url: "/v1/sdk/config",
      headers: { authorization: "Bearer dbundle_proj_test" }
    });
    expect(first.statusCode).toBe(200);
    const etag = first.headers["etag"] as string;
    expect(etag).toBeDefined();
    expect(etag.length).toBeGreaterThan(0);

    const second = await app.inject({
      method: "GET",
      url: "/v1/sdk/config",
      headers: {
        authorization: "Bearer dbundle_proj_test",
        "if-none-match": etag
      }
    });
    expect(second.statusCode).toBe(304);

    const third = await app.inject({
      method: "GET",
      url: "/v1/sdk/config",
      headers: {
        authorization: "Bearer dbundle_proj_test",
        "if-none-match": '"stale-etag"'
      }
    });
    expect(third.statusCode).toBe(200);
    expect(third.headers["etag"]).toBe(etag);
  });
});
