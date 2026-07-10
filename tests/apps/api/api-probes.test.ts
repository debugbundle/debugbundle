import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApiServer } from "../../../apps/api/src/server.ts";
import { mockedObject, type MockedMethods } from "../../helpers/vitest.ts";

type ApiServerDependencies = Parameters<typeof createApiServer>[0];
type IngestionMetadataDependency = MockedMethods<ApiServerDependencies["ingestionMetadata"]>;
type CapturePolicyManagementDependency = MockedMethods<NonNullable<ApiServerDependencies["capturePolicyManagement"]>>;
type BillingManagementDependency = MockedMethods<NonNullable<ApiServerDependencies["billingManagement"]>>;
type ProbeManagementDependency = MockedMethods<NonNullable<ApiServerDependencies["probeManagement"]>>;
type ProjectManagementDependency = MockedMethods<NonNullable<ApiServerDependencies["projectManagement"]>>;
type MemberAuthDependency = MockedMethods<ApiServerDependencies["memberAuth"]>;

const originalProbeTriggerSecret = process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"];

function createServer(overrides: {
  ingestionMetadata?: IngestionMetadataDependency;
  capturePolicyManagement?: CapturePolicyManagementDependency;
  analyticsSettingsManagement?: ApiServerDependencies["analyticsSettingsManagement"];
  billingManagement?: Partial<BillingManagementDependency>;
  probeManagement?: ProbeManagementDependency;
  projectManagement?: Partial<ProjectManagementDependency>;
  operationalEmailDelivery?: ApiServerDependencies["operationalEmailDelivery"];
  memberAuth?: MemberAuthDependency;
  authRateLimiter?: ApiServerDependencies["authRateLimiter"];
} = {}): ReturnType<typeof createApiServer> {
  const billingManagement =
    overrides.billingManagement === undefined
      ? undefined
      : mockedObject<NonNullable<ApiServerDependencies["billingManagement"]>>({
          getBillingSummaryForOrganization: overrides.billingManagement.getBillingSummaryForOrganization,
          ...(overrides.billingManagement.getBillingSummaryForProject === undefined
            ? {}
            : { getBillingSummaryForProject: overrides.billingManagement.getBillingSummaryForProject }),
          createCheckoutLink: overrides.billingManagement.createCheckoutLink ?? vi.fn().mockResolvedValue(null),
          createPortalLink: overrides.billingManagement.createPortalLink ?? vi.fn().mockResolvedValue(null)
        });

  return createApiServer({
    ingestionPersistence: {
      persistAndEnqueue: vi.fn()
    },
    ...(overrides.authRateLimiter === undefined
      ? {}
      : { authRateLimiter: overrides.authRateLimiter }),
    ingestionMetadata:
      overrides.ingestionMetadata ??
      mockedObject<ApiServerDependencies["ingestionMetadata"]>({
        resolveProjectByTokenHash: vi.fn().mockResolvedValue({ project_id: "proj_123", organization_plan: "free" })
      }),
    memberAuth:
      overrides.memberAuth ??
      mockedObject<ApiServerDependencies["memberAuth"]>({
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({ member_id: "usr_123", organization_id: "org_123" })
      }),
    tokenManagement: mockedObject<ApiServerDependencies["tokenManagement"]>({
      listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
      createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
      createMemberTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
    }),
    projectManagement: {
      resolveProjectAccessForUser:
        overrides.projectManagement?.resolveProjectAccessForUser ??
        vi.fn().mockResolvedValue({
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
    probeManagement:
      overrides.probeManagement ??
      mockedObject<NonNullable<ApiServerDependencies["probeManagement"]>>({
        listActiveProbesForProject: vi.fn().mockResolvedValue([]),
        listActiveProbesForProjectInOrganization: vi.fn().mockResolvedValue({ organization_plan: "solo", activations: [] }),
        createProbeActivationForProjectInOrganization: vi.fn().mockResolvedValue({
          organization_plan: "solo",
          activation: {
            activation_id: "11111111-1111-4111-8111-111111111111",
            label_pattern: "checkout.*",
            service: "*",
            environment: "*",
            expires_at: "2026-03-11T01:00:00.000Z",
            trigger_expires_at: "2026-03-12T01:00:00.000Z"
          },
          trigger_token: "dbundle_probe_test"
        }),
        deactivateProbeActivationForProjectInOrganization: vi.fn().mockResolvedValue({
          organization_plan: "solo",
          deactivated: {
            activation_id: "11111111-1111-4111-8111-111111111111",
            deactivated_at: "2026-03-11T00:10:00.000Z"
          }
        })
      }),
    incidentRetrieval: {
      listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
      getIncidentForOrganization: vi.fn().mockResolvedValue(null),
      listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
    },
    objectStoreReader: {
      getObject: vi.fn()
    },
    webhookDelivery: {
      listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] })
    },
    operationalEmailDelivery: overrides.operationalEmailDelivery,
    capturePolicyManagement: overrides.capturePolicyManagement,
    analyticsSettingsManagement: overrides.analyticsSettingsManagement,
    billingManagement
  });
}

describe("api probe routes", () => {
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
        resolveProjectByTokenHash: vi.fn().mockResolvedValue({ project_id: "proj_123", organization_plan: "free" })
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/sdk/config",
      headers: { authorization: "Bearer dbundle_proj_test" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("public, s-maxage=30");
    expect(response.headers["vary"]).toBe("X-DebugBundle-Analytics-Config");
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

  it("should return restrictive project analytics capture settings to eligible browser SDKs", async (): Promise<void> => {
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
        aggregate_retention_months: 12,
        max_saved_funnels: 3,
        max_custom_dimensions: 0,
        approved_custom_dimensions: []
      }),
      updateAnalyticsSettingsForProject: vi.fn()
    };
    const app = createServer({
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn().mockResolvedValue({ project_id: "proj_123", organization_plan: "solo" })
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

  it("should return disabled analytics config to an opted-in free-tier SDK", async (): Promise<void> => {
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
        resolveProjectByTokenHash: vi.fn().mockResolvedValue({ project_id: "proj_123", organization_plan: "solo" })
      },
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({ member_id: "usr_123", organization_id: "org_123" })
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

  it("should return sdk config with active probes for paid tier projects", async (): Promise<void> => {
    const app = createServer({
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn().mockResolvedValue({ project_id: "proj_123", organization_plan: "solo" })
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
    expect((body as Record<string, unknown>)["trigger_token_key"]).toEqual(expect.any(String));
  });

  it("should return balanced capture policy defaults for solo projects without a stored policy row", async (): Promise<void> => {
    const app = createServer({
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn().mockResolvedValue({ project_id: "proj_123", organization_plan: "solo" })
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

  it("should enforce paid tier for remote probe activation", async (): Promise<void> => {
    const app = createServer({
      probeManagement: {
        listActiveProbesForProject: vi.fn().mockResolvedValue([]),
        listActiveProbesForProjectInOrganization: vi.fn().mockResolvedValue({ organization_plan: "free", activations: [] }),
        createProbeActivationForProjectInOrganization: vi.fn().mockResolvedValue({
          organization_plan: "free",
          activation: {
            activation_id: "11111111-1111-4111-8111-111111111111",
            label_pattern: "checkout.*",
            service: "*",
            environment: "*",
            expires_at: "2026-03-11T01:00:00.000Z",
            trigger_expires_at: "2026-03-12T01:00:00.000Z"
          },
          trigger_token: "dbundle_probe_test"
        }),
        deactivateProbeActivationForProjectInOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/probes/activate",
      headers: { authorization: "Bearer dbundle_mem_test" },
      payload: {
        label_pattern: "checkout.*",
        service: "*",
        environment: "*",
        ttl_seconds: 300
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "upgrade_required" });
  });

  it("should reject remote probe activation when monthly activation quota is exhausted", async (): Promise<void> => {
    const createProbeActivationForProjectInOrganization = vi.fn();
    const queueProjectOperationalEmailDelivery = vi.fn().mockResolvedValue({ delivery_id: "op_123", created: true });
    const app = createServer({
      billingManagement: {
        getBillingSummaryForOrganization: vi.fn().mockResolvedValue({
          plan: "solo",
          stripe_customer_id: null,
          active_projects: 2,
          capacity_units: {
            total: 3,
            included: 3,
            additional_purchased: 0
          },
          usage_window: {
            starts_at: "2026-03-01T00:00:00.000Z",
            ends_at: "2026-04-01T00:00:00.000Z"
          },
          allowances: {
            monthly_bundle_requests: { used: 0, limit: 750 },
            monthly_raw_ingested_events: { used: 0, limit: 10500 },
            retained_bundle_cap: { used: 0, limit: 450 },
            monthly_remote_activations: { used: 75, limit: 75 },
            monthly_alert_deliveries: { used: 0, limit: 225 },
            monthly_webhook_deliveries: { used: 0, limit: 750 }
          }
        })
      },
      probeManagement: {
        listActiveProbesForProject: vi.fn().mockResolvedValue([]),
        listActiveProbesForProjectInOrganization: vi.fn().mockResolvedValue({ organization_plan: "solo", activations: [] }),
        createProbeActivationForProjectInOrganization,
        deactivateProbeActivationForProjectInOrganization: vi.fn().mockResolvedValue(null)
      },
      operationalEmailDelivery: { queueProjectOperationalEmailDelivery }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/probes/activate",
      headers: { authorization: "Bearer dbundle_mem_test" },
      payload: {
        label_pattern: "checkout.*",
        service: "*",
        environment: "*",
        ttl_seconds: 300,
        trigger_ttl_seconds: 300
      }
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({ error: "monthly_quota_exceeded" });
    expect(response.headers["retry-after"]).toBeDefined();
    expect(createProbeActivationForProjectInOrganization).not.toHaveBeenCalled();
    expect(queueProjectOperationalEmailDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "00000000-0000-4000-8000-000000000001",
        kind: "allowance_limit_reached"
      })
    );
  });

  it("queues an 80 percent allowance warning after a successful remote probe activation", async (): Promise<void> => {
    const queueProjectOperationalEmailDelivery = vi.fn().mockResolvedValue({ delivery_id: "op_123", created: true });
    const app = createServer({
      billingManagement: {
        getBillingSummaryForOrganization: vi.fn().mockResolvedValue({
          plan: "solo",
          stripe_customer_id: null,
          active_projects: 1,
          capacity_units: {
            total: 3,
            included: 3,
            additional_purchased: 0
          },
          usage_window: {
            starts_at: "2026-03-01T00:00:00.000Z",
            ends_at: "2026-04-01T00:00:00.000Z"
          },
          allowances: {
            monthly_bundle_requests: { used: 0, limit: 750 },
            monthly_raw_ingested_events: { used: 0, limit: 10500 },
            retained_bundle_cap: { used: 0, limit: 450 },
            monthly_remote_activations: { used: 59, limit: 75 },
            monthly_alert_deliveries: { used: 0, limit: 225 },
            monthly_webhook_deliveries: { used: 0, limit: 750 }
          }
        })
      },
      operationalEmailDelivery: { queueProjectOperationalEmailDelivery }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/probes/activate",
      headers: { authorization: "Bearer dbundle_mem_test" },
      payload: {
        label_pattern: "checkout.*",
        service: "*",
        environment: "*",
        ttl_seconds: 300,
        trigger_ttl_seconds: 300
      }
    });

    expect(response.statusCode).toBe(201);
    expect(queueProjectOperationalEmailDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "00000000-0000-4000-8000-000000000001",
        kind: "allowance_warning_80"
      })
    );
  });

  it("should validate activation project id and payload", async (): Promise<void> => {
    const app = createServer();

    const badProject = await app.inject({
      method: "POST",
      url: "/v1/projects/not-a-uuid/probes/activate",
      headers: { authorization: "Bearer dbundle_mem_test" },
      payload: {
        label_pattern: "checkout.*"
      }
    });
    const badPayload = await app.inject({
      method: "POST",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/probes/activate",
      headers: { authorization: "Bearer dbundle_mem_test" },
      payload: {
        label_pattern: ""
      }
    });

    expect(badProject.statusCode).toBe(400);
    expect(badProject.json()).toEqual({ error: "invalid_project_id" });
    expect(badPayload.statusCode).toBe(400);
    expect(badPayload.json()).toEqual({ error: "invalid_payload" });
  });

  it("should return trigger token metadata on successful activation", async (): Promise<void> => {
    const app = createServer({
      probeManagement: {
        listActiveProbesForProject: vi.fn().mockResolvedValue([]),
        listActiveProbesForProjectInOrganization: vi.fn().mockResolvedValue({ organization_plan: "solo", activations: [] }),
        createProbeActivationForProjectInOrganization: vi.fn().mockResolvedValue({
          organization_plan: "solo",
          activation: {
            activation_id: "11111111-1111-4111-8111-111111111111",
            label_pattern: "checkout.*",
            service: "checkout-api",
            environment: "production",
            expires_at: "2026-03-11T01:00:00.000Z",
            trigger_expires_at: "2026-03-12T01:00:00.000Z"
          },
          trigger_token: "dbundle_probe_test"
        }),
        deactivateProbeActivationForProjectInOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/probes/activate",
      headers: { authorization: "Bearer dbundle_mem_test" },
      payload: {
        label_pattern: "checkout.*",
        service: "checkout-api",
        environment: "production",
        ttl_seconds: 300,
        trigger_ttl_seconds: 3600
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      activation: {
        activation_id: "11111111-1111-4111-8111-111111111111",
        label_pattern: "checkout.*",
        service: "checkout-api",
        environment: "production",
        expires_at: "2026-03-11T01:00:00.000Z",
        trigger_expires_at: "2026-03-12T01:00:00.000Z"
      },
      trigger_token: "dbundle_probe_test"
    });
  });

  it("should default trigger token ttl to the passive activation ttl", async (): Promise<void> => {
    const createProbeActivationForProjectInOrganization = vi.fn().mockResolvedValue({
      organization_plan: "solo",
      activation: {
        activation_id: "11111111-1111-4111-8111-111111111111",
        label_pattern: "checkout.*",
        service: "checkout-api",
        environment: "production",
        expires_at: "2026-03-11T00:05:00.000Z",
        trigger_expires_at: "2026-03-11T00:05:00.000Z"
      },
      trigger_token: "dbundle_probe_test"
    });
    const app = createServer({
      probeManagement: {
        listActiveProbesForProject: vi.fn().mockResolvedValue([]),
        listActiveProbesForProjectInOrganization: vi.fn().mockResolvedValue({ organization_plan: "solo", activations: [] }),
        createProbeActivationForProjectInOrganization,
        deactivateProbeActivationForProjectInOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/probes/activate",
      headers: { authorization: "Bearer dbundle_mem_test" },
      payload: {
        label_pattern: "checkout.*",
        service: "checkout-api",
        environment: "production",
        ttl_seconds: 300
      }
    });

    expect(response.statusCode).toBe(201);
    const activationInput = createProbeActivationForProjectInOrganization.mock.calls[0]?.[0];
    expect(activationInput).toBeDefined();
    expect(activationInput?.trigger_expires_at).toBe(activationInput?.expires_at);
  });

  it("should return not found when probe management is missing or project is out-of-scope", async (): Promise<void> => {
    const withoutProbeDeps = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn().mockResolvedValue({ project_id: "proj_123", organization_plan: "solo" })
      },
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({ member_id: "usr_123", organization_id: "org_123" })
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
      objectStoreReader: {
        getObject: vi.fn()
      },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] })
      }
    });

    const missingDependency = await withoutProbeDeps.inject({
      method: "GET",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/probes",
      headers: { authorization: "Bearer dbundle_mem_test" }
    });

    const withOutOfScopeProject = createServer({
      probeManagement: {
        listActiveProbesForProject: vi.fn().mockResolvedValue([]),
        listActiveProbesForProjectInOrganization: vi.fn().mockResolvedValue(null),
        createProbeActivationForProjectInOrganization: vi.fn().mockResolvedValue(null),
        deactivateProbeActivationForProjectInOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const activationNotFound = await withOutOfScopeProject.inject({
      method: "POST",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/probes/activate",
      headers: { authorization: "Bearer dbundle_mem_test" },
      payload: {
        label_pattern: "checkout.*",
        ttl_seconds: 300
      }
    });

    expect(missingDependency.statusCode).toBe(404);
    expect(missingDependency.json()).toEqual({ error: "project_not_found" });
    expect(activationNotFound.statusCode).toBe(404);
    expect(activationNotFound.json()).toEqual({ error: "project_not_found" });
  });

  it("should keep preserved probe activations readable on free and still handle missing deactivations", async (): Promise<void> => {
    const app = createServer({
      probeManagement: {
        listActiveProbesForProject: vi.fn().mockResolvedValue([]),
        listActiveProbesForProjectInOrganization: vi.fn().mockResolvedValue({
          organization_plan: "free",
          activations: [
            {
              activation_id: "11111111-1111-4111-8111-111111111111",
              label_pattern: "checkout.*",
              service: "*",
              environment: "*",
              expires_at: "2026-03-11T01:00:00.000Z",
              trigger_expires_at: "2026-03-12T01:00:00.000Z"
            }
          ]
        }),
        createProbeActivationForProjectInOrganization: vi.fn().mockResolvedValue(null),
        deactivateProbeActivationForProjectInOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const freeList = await app.inject({
      method: "GET",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/probes",
      headers: { authorization: "Bearer dbundle_mem_test" }
    });
    const deactivateMissing = await app.inject({
      method: "POST",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/probes/deactivate",
      headers: { authorization: "Bearer dbundle_mem_test" },
      payload: {
        activation_id: "11111111-1111-4111-8111-111111111111"
      }
    });

    expect(freeList.statusCode).toBe(200);
    expect(freeList.json()).toEqual({
      activations: [
        {
          activation_id: "11111111-1111-4111-8111-111111111111",
          label_pattern: "checkout.*",
          service: "*",
          environment: "*",
          expires_at: "2026-03-11T01:00:00.000Z",
          trigger_expires_at: "2026-03-12T01:00:00.000Z"
        }
      ]
    });
    expect(deactivateMissing.statusCode).toBe(404);
    expect(deactivateMissing.json()).toEqual({ error: "activation_not_found" });
  });

  it("should validate probe list/deactivate route inputs and auth", async (): Promise<void> => {
    const app = createServer();

    const listMissingAuth = await app.inject({
      method: "GET",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/probes"
    });
    const listBadProject = await app.inject({
      method: "GET",
      url: "/v1/projects/not-a-uuid/probes",
      headers: { authorization: "Bearer dbundle_mem_test" }
    });
    const deactivateBadPayload = await app.inject({
      method: "POST",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/probes/deactivate",
      headers: { authorization: "Bearer dbundle_mem_test" },
      payload: {
        activation_id: "not-a-uuid"
      }
    });

    expect(listMissingAuth.statusCode).toBe(401);
    expect(listMissingAuth.json()).toEqual({ error: "invalid_member_token" });
    expect(listBadProject.statusCode).toBe(400);
    expect(listBadProject.json()).toEqual({ error: "invalid_project_id" });
    expect(deactivateBadPayload.statusCode).toBe(400);
    expect(deactivateBadPayload.json()).toEqual({ error: "invalid_payload" });
  });

  it("should allow deactivating preserved remote probes after a downgrade", async (): Promise<void> => {
    const app = createServer({
      probeManagement: {
        listActiveProbesForProject: vi.fn().mockResolvedValue([]),
        listActiveProbesForProjectInOrganization: vi.fn().mockResolvedValue({ organization_plan: "solo", activations: [] }),
        createProbeActivationForProjectInOrganization: vi.fn().mockResolvedValue(null),
        deactivateProbeActivationForProjectInOrganization: vi.fn().mockResolvedValue({
          organization_plan: "free",
          deactivated: {
            activation_id: "11111111-1111-4111-8111-111111111111",
            deactivated_at: "2026-03-11T00:10:00.000Z"
          }
        })
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/probes/deactivate",
      headers: { authorization: "Bearer dbundle_mem_test" },
      payload: {
        activation_id: "11111111-1111-4111-8111-111111111111"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      deactivated: {
        activation_id: "11111111-1111-4111-8111-111111111111",
        deactivated_at: "2026-03-11T00:10:00.000Z"
      }
    });
  });

  it("should create, list, and deactivate remote probe activations for paid projects", async (): Promise<void> => {
    const probeManagement = {
      listActiveProbesForProject: vi.fn().mockResolvedValue([]),
      listActiveProbesForProjectInOrganization: vi.fn().mockResolvedValue({
        organization_plan: "solo",
        activations: [
          {
            activation_id: "11111111-1111-4111-8111-111111111111",
            label_pattern: "checkout.*",
            service: "*",
            environment: "*",
            expires_at: "2026-03-11T01:00:00.000Z",
            trigger_expires_at: "2026-03-12T01:00:00.000Z"
          }
        ]
      }),
      createProbeActivationForProjectInOrganization: vi.fn().mockResolvedValue({
        organization_plan: "solo",
        activation: {
          activation_id: "11111111-1111-4111-8111-111111111111",
          label_pattern: "checkout.*",
          service: "*",
          environment: "*",
          expires_at: "2026-03-11T01:00:00.000Z",
          trigger_expires_at: "2026-03-12T01:00:00.000Z"
        }
      }),
      deactivateProbeActivationForProjectInOrganization: vi.fn().mockResolvedValue({
        organization_plan: "solo",
        deactivated: {
          activation_id: "11111111-1111-4111-8111-111111111111",
          deactivated_at: "2026-03-11T00:10:00.000Z"
        }
      })
    };
    const app = createServer({ probeManagement });

    const created = await app.inject({
      method: "POST",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/probes/activate",
      headers: { authorization: "Bearer dbundle_mem_test" },
      payload: {
        label_pattern: "checkout.*",
        service: "*",
        environment: "*",
        ttl_seconds: 300
      }
    });
    const listed = await app.inject({
      method: "GET",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/probes",
      headers: { authorization: "Bearer dbundle_mem_test" }
    });
    const deactivated = await app.inject({
      method: "POST",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/probes/deactivate",
      headers: { authorization: "Bearer dbundle_mem_test" },
      payload: {
        activation_id: "11111111-1111-4111-8111-111111111111"
      }
    });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toEqual({
      activation: {
        activation_id: "11111111-1111-4111-8111-111111111111",
        label_pattern: "checkout.*",
        service: "*",
        environment: "*",
        expires_at: "2026-03-11T01:00:00.000Z",
        trigger_expires_at: "2026-03-12T01:00:00.000Z"
      }
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual({
      activations: [
        {
          activation_id: "11111111-1111-4111-8111-111111111111",
          label_pattern: "checkout.*",
          service: "*",
          environment: "*",
          expires_at: "2026-03-11T01:00:00.000Z",
          trigger_expires_at: "2026-03-12T01:00:00.000Z"
        }
      ]
    });
    expect(deactivated.statusCode).toBe(200);
    expect(deactivated.json()).toEqual({
      deactivated: {
        activation_id: "11111111-1111-4111-8111-111111111111",
        deactivated_at: "2026-03-11T00:10:00.000Z"
      }
    });
  });

  it("should allow team tier access to remote probes via capability lookup", async (): Promise<void> => {
    const app = createServer({
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn().mockResolvedValue({ project_id: "proj_123", organization_plan: "team" })
      },
      probeManagement: {
        listActiveProbesForProject: vi.fn().mockResolvedValue([]),
        listActiveProbesForProjectInOrganization: vi.fn().mockResolvedValue({ organization_plan: "team", activations: [] }),
        createProbeActivationForProjectInOrganization: vi.fn().mockResolvedValue({
          organization_plan: "team",
          activation: {
            activation_id: "22222222-2222-4222-8222-222222222222",
            label_pattern: "payment.*",
            service: "*",
            environment: "*",
            expires_at: "2026-03-11T01:00:00.000Z",
            trigger_expires_at: "2026-03-12T01:00:00.000Z"
          }
        }),
        deactivateProbeActivationForProjectInOrganization: vi.fn()
      }
    });

    const sdkConfig = await app.inject({
      method: "GET",
      url: "/v1/sdk/config",
      headers: { authorization: "Bearer dbundle_proj_test" }
    });
    expect(sdkConfig.statusCode).toBe(200);
    expect(sdkConfig.json()).toMatchObject({ remote_probes_enabled: true });

    const created = await app.inject({
      method: "POST",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/probes/activate",
      headers: { authorization: "Bearer dbundle_mem_test" },
      payload: { label_pattern: "payment.*", ttl_seconds: 300 }
    });
    expect(created.statusCode).toBe(201);

    const listed = await app.inject({
      method: "GET",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/probes",
      headers: { authorization: "Bearer dbundle_mem_test" }
    });
    expect(listed.statusCode).toBe(200);
  });

  it("should scope collaborator probe access to the project owner organization", async (): Promise<void> => {
    const projectManagement = {
      resolveProjectAccessForUser: vi.fn().mockResolvedValue({
        project_id: "00000000-0000-4000-8000-000000000001",
        organization_id: "org_owner",
        owner_user_id: "usr_owner",
        owner_email: "owner@example.com",
        relationship: "shared",
        sharing_state: "shared_with_you",
        effective_role: "member",
        organization_plan: "solo"
      })
    };
    const billingManagement = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue({
        organization_id: "org_owner",
        plan: "solo",
        stripe_customer_id: null,
        usage_window: {
          starts_at: "2026-03-01T00:00:00.000Z",
          ends_at: "2026-03-31T23:59:59.000Z"
        },
        active_projects: 1,
        capacities: {
          active_projects: 1,
          retention_days: 7,
          team_members: 1
        },
        allowances: {
          monthly_bundle_requests: { used: 0, limit: 100 },
          retained_bundles: { used: 0, limit: 100 },
          monthly_raw_ingested_events: { used: 0, limit: 1000 },
          monthly_alert_deliveries: { used: 0, limit: 1000 },
          monthly_remote_activations: { used: 0, limit: 10 }
        }
      })
    };
    const probeManagement = {
      listActiveProbesForProject: vi.fn().mockResolvedValue([]),
      listActiveProbesForProjectInOrganization: vi.fn().mockResolvedValue({ organization_plan: "solo", activations: [] }),
      createProbeActivationForProjectInOrganization: vi.fn().mockResolvedValue({
        organization_plan: "solo",
        activation: {
          activation_id: "11111111-1111-4111-8111-111111111111",
          label_pattern: "checkout.*",
          service: "*",
          environment: "*",
          expires_at: "2026-03-11T01:00:00.000Z",
          trigger_expires_at: "2026-03-12T01:00:00.000Z"
        },
        trigger_token: "dbundle_probe_test"
      }),
      deactivateProbeActivationForProjectInOrganization: vi.fn().mockResolvedValue({
        organization_plan: "solo",
        deactivated: {
          activation_id: "11111111-1111-4111-8111-111111111111",
          deactivated_at: "2026-03-11T00:10:00.000Z"
        }
      })
    };
    const app = createServer({
      memberAuth: mockedObject<ApiServerDependencies["memberAuth"]>({
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({ member_id: "usr_member", organization_id: "org_member" })
      }),
      projectManagement,
      billingManagement,
      probeManagement
    });

    await app.inject({
      method: "GET",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/probes",
      headers: { authorization: "Bearer dbundle_mem_test" }
    });
    await app.inject({
      method: "POST",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/probes/activate",
      headers: { authorization: "Bearer dbundle_mem_test" },
      payload: { label_pattern: "checkout.*", ttl_seconds: 300 }
    });
    await app.inject({
      method: "POST",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/probes/deactivate",
      headers: { authorization: "Bearer dbundle_mem_test" },
      payload: { activation_id: "11111111-1111-4111-8111-111111111111" }
    });

    expect(projectManagement.resolveProjectAccessForUser).toHaveBeenCalledWith({
      user_id: "usr_member",
      project_id: "00000000-0000-4000-8000-000000000001"
    });
    expect(billingManagement.getBillingSummaryForOrganization).toHaveBeenCalledWith({
      organization_id: "org_owner",
      now: expect.any(String)
    });
    expect(probeManagement.listActiveProbesForProjectInOrganization).toHaveBeenCalledWith({
      organization_id: "org_owner",
      project_id: "00000000-0000-4000-8000-000000000001",
      now: expect.any(String)
    });
    expect(probeManagement.createProbeActivationForProjectInOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org_owner",
        project_id: "00000000-0000-4000-8000-000000000001",
        created_by_member_id: "usr_member"
      })
    );
    expect(probeManagement.deactivateProbeActivationForProjectInOrganization).toHaveBeenCalledWith({
      organization_id: "org_owner",
      project_id: "00000000-0000-4000-8000-000000000001",
      activation_id: "11111111-1111-4111-8111-111111111111",
      deactivated_at: expect.any(String)
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
        resolveProjectByTokenHash: vi.fn().mockResolvedValue({ project_id: "proj_123", organization_plan: "solo" })
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

  it("should call cdnPurge on probe activation and deactivation", async (): Promise<void> => {
    const cdnPurge = vi.fn();
    const projectId = "00000000-0000-4000-8000-000000000001";
    const probeManagement = {
      listActiveProbesForProject: vi.fn().mockResolvedValue([]),
      listActiveProbesForProjectInOrganization: vi.fn().mockResolvedValue({ organization_plan: "solo", activations: [] }),
      createProbeActivationForProjectInOrganization: vi.fn().mockResolvedValue({
        organization_plan: "solo",
        activation: {
          activation_id: "11111111-1111-4111-8111-111111111111",
          label_pattern: "checkout.*",
          service: "*",
          environment: "*",
          expires_at: "2026-03-11T01:00:00.000Z",
          trigger_expires_at: "2026-03-12T01:00:00.000Z"
        }
      }),
      deactivateProbeActivationForProjectInOrganization: vi.fn().mockResolvedValue({
        organization_plan: "solo",
        deactivated: {
          activation_id: "11111111-1111-4111-8111-111111111111",
          deactivated_at: "2026-03-11T00:10:00.000Z"
        }
      })
    };
    const app = createApiServer({
      ingestionPersistence: { persistAndEnqueue: vi.fn() },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn().mockResolvedValue({ project_id: "proj_123", organization_plan: "solo" })
      },
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({ member_id: "usr_123", organization_id: "org_123" })
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
          project_id: projectId,
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
      probeManagement,
      cdnPurge
    });

    await app.inject({
      method: "POST",
      url: `/v1/projects/${projectId}/probes/activate`,
      headers: { authorization: "Bearer dbundle_mem_test" },
      payload: { label_pattern: "checkout.*", ttl_seconds: 300 }
    });
    expect(cdnPurge).toHaveBeenCalledWith(projectId);

    cdnPurge.mockClear();

    await app.inject({
      method: "POST",
      url: `/v1/projects/${projectId}/probes/deactivate`,
      headers: { authorization: "Bearer dbundle_mem_test" },
      payload: { activation_id: "11111111-1111-4111-8111-111111111111" }
    });
    expect(cdnPurge).toHaveBeenCalledWith(projectId);
  });

  it("should reject probe activation when concurrent limit exceeded", async (): Promise<void> => {
    const app = createServer({
      probeManagement: {
        listActiveProbesForProject: vi.fn().mockResolvedValue([]),
        listActiveProbesForProjectInOrganization: vi.fn().mockResolvedValue({ organization_plan: "solo", activations: [] }),
        createProbeActivationForProjectInOrganization: vi.fn().mockResolvedValue({
          organization_plan: "solo",
          activation: null,
          concurrent_limit_exceeded: true
        }),
        deactivateProbeActivationForProjectInOrganization: vi.fn()
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/probes/activate",
      headers: { authorization: "Bearer dbundle_mem_test" },
      payload: { label_pattern: "checkout.*", ttl_seconds: 300 }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "concurrent_activation_limit" });
  });

  it("should rate limit probe reads per member", async (): Promise<void> => {
    const claimRequest = vi.fn().mockResolvedValue({
      allowed: false,
      limit: 100,
      remaining: 0,
      retry_after_ms: 12_000
    });
    const app = createServer({ authRateLimiter: { claimRequest } });

    const response = await app.inject({
      method: "GET",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/probes",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({ error: "rate_limited" });
    expect(response.headers["retry-after"]).toBe("12");
    expect(claimRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: "management-read",
        subject: "member:usr_123",
        limit: 200
      })
    );
  });
});
