import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApiServer } from "../../../apps/api/src/server.ts";
import { mockedObject, type MockedMethods } from "../../helpers/vitest.ts";

type ApiServerDependencies = Parameters<typeof createApiServer>[0];
type IngestionMetadataDependency = MockedMethods<ApiServerDependencies["ingestionMetadata"]>;
type CapturePolicyManagementDependency = MockedMethods<NonNullable<ApiServerDependencies["capturePolicyManagement"]>>;
type BillingManagementDependency = MockedMethods<NonNullable<ApiServerDependencies["billingManagement"]>>;
type ProbeManagementDependency = MockedMethods<NonNullable<ApiServerDependencies["probeManagement"]>>;
type MemberAuthDependency = MockedMethods<ApiServerDependencies["memberAuth"]>;

const originalProbeTriggerSecret = process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"];

function createServer(overrides: {
  ingestionMetadata?: IngestionMetadataDependency;
  capturePolicyManagement?: CapturePolicyManagementDependency;
  billingManagement?: Partial<BillingManagementDependency>;
  probeManagement?: ProbeManagementDependency;
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
    capturePolicyManagement: overrides.capturePolicyManagement,
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
    expect(response.json()).toEqual({
      probes_enabled: true,
      remote_probes_enabled: false,
      active_probes: [],
      poll_interval_ms: 60000,
      capture_policy: {
        preset: "balanced",
        capture_logs: "warning",
        capture_request_events: "failures_only",
        capture_breadcrumbs: "exception_only",
        capture_probe_events: "buffer_only",
        immediate_client_error_statuses: []
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
        immediate_client_error_statuses: null
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
      capture_policy: {
        preset: "investigative",
        capture_logs: "info",
        capture_request_events: "failures_only",
        capture_breadcrumbs: "standalone",
        capture_probe_events: "standalone_when_activated",
        immediate_client_error_statuses: [401, 403, 409, 422]
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
      capture_policy: {
        preset: "balanced",
        capture_logs: "warning",
        capture_request_events: "failures_only",
        capture_breadcrumbs: "exception_only",
        capture_probe_events: "buffer_only",
        immediate_client_error_statuses: []
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
        environment: "*"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "upgrade_required" });
  });

  it("should reject remote probe activation when monthly activation quota is exhausted", async (): Promise<void> => {
    const createProbeActivationForProjectInOrganization = vi.fn();
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
            monthly_alert_deliveries: { used: 0, limit: 225 }
          }
        })
      },
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
        label_pattern: "checkout.*"
      }
    });

    expect(missingDependency.statusCode).toBe(404);
    expect(missingDependency.json()).toEqual({ error: "project_not_found" });
    expect(activationNotFound.statusCode).toBe(404);
    expect(activationNotFound.json()).toEqual({ error: "project_not_found" });
  });

  it("should enforce paid tier and missing activation branches on list/deactivate", async (): Promise<void> => {
    const app = createServer({
      probeManagement: {
        listActiveProbesForProject: vi.fn().mockResolvedValue([]),
        listActiveProbesForProjectInOrganization: vi.fn().mockResolvedValue({ organization_plan: "free", activations: [] }),
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

    expect(freeList.statusCode).toBe(403);
    expect(freeList.json()).toEqual({ error: "upgrade_required" });
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

  it("should enforce paid tier on deactivate route", async (): Promise<void> => {
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

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "upgrade_required" });
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
        environment: "*"
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
      payload: { label_pattern: "payment.*" }
    });
    expect(created.statusCode).toBe(201);

    const listed = await app.inject({
      method: "GET",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/probes",
      headers: { authorization: "Bearer dbundle_mem_test" }
    });
    expect(listed.statusCode).toBe(200);
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

    const projectId = "00000000-0000-4000-8000-000000000001";

    await app.inject({
      method: "POST",
      url: `/v1/projects/${projectId}/probes/activate`,
      headers: { authorization: "Bearer dbundle_mem_test" },
      payload: { label_pattern: "checkout.*" }
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
      payload: { label_pattern: "checkout.*" }
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
