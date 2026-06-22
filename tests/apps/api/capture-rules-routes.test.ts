import { gzipSync } from "node:zlib";

import { describe, expect, it, vi } from "vitest";

import type { ApiDependencies } from "../../../apps/api/src/api-types.js";
import { createApiServer } from "../../../apps/api/src/server.js";
import { createBundleWithRequestContext } from "../../helpers/repro-engine.js";

function createDependencies(
  overrides: {
    auditLogging?: ApiDependencies["auditLogging"];
    memberAuth?: ApiDependencies["memberAuth"];
    captureRuleManagement?: ApiDependencies["captureRuleManagement"];
    projectManagement?: ApiDependencies["projectManagement"];
    authRateLimiter?: ApiDependencies["authRateLimiter"];
    incidentRetrieval?: ApiDependencies["incidentRetrieval"];
    bundleRegeneration?: ApiDependencies["bundleRegeneration"];
    objectStoreReader?: ApiDependencies["objectStoreReader"];
  } = {}
): ReturnType<typeof createApiServer> {
  return createApiServer({
    ingestionPersistence: { persistAndEnqueue: vi.fn() },
    ingestionMetadata: { resolveProjectByTokenHash: vi.fn() },
    ...(overrides.authRateLimiter === undefined
      ? {}
      : { authRateLimiter: overrides.authRateLimiter }),
    memberAuth: overrides.memberAuth ?? {
      resolveMemberByTokenHash: vi.fn().mockResolvedValue({
        member_id: "usr_owner",
        organization_id: "org_123",
        role: "owner",
        revoked_at: null,
        expires_at: null
      })
    },
    tokenManagement: {
      listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
      createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
      createMemberTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
    },
    incidentRetrieval: overrides.incidentRetrieval ?? {
      listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
      getIncidentForOrganization: vi.fn().mockResolvedValue(null),
      listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
    },
    objectStoreReader: overrides.objectStoreReader ?? { getObject: vi.fn() },
    webhookDelivery: {
      listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue(null)
    },
    ...(overrides.auditLogging === undefined ? {} : { auditLogging: overrides.auditLogging }),
    ...(overrides.bundleRegeneration === undefined
      ? {}
      : { bundleRegeneration: overrides.bundleRegeneration }),
    projectManagement: overrides.projectManagement ?? {
      resolveProjectAccessForUser: vi.fn().mockResolvedValue({
        project_id: "00000000-0000-0000-0000-000000000001",
        organization_id: "org_123",
        owner_user_id: "usr_owner",
        owner_email: "owner@example.com",
        relationship: "owned",
        effective_role: "owner",
        organization_plan: "solo"
      }),
      listProjectsForOrganization: vi.fn().mockResolvedValue([]),
      createProjectForOrganization: vi.fn(),
      updateProjectForOrganization: vi.fn(),
      deleteProjectForOrganization: vi.fn()
    },
    captureRuleManagement: overrides.captureRuleManagement
  });
}

const rule = {
  id: "00000000-0000-4000-8000-000000000101",
  project_id: "00000000-0000-0000-0000-000000000001",
  name: "Demote analytics resource noise",
  description: null,
  enabled: true,
  action: "demote" as const,
  matcher: {
    event_types: ["frontend_exception"] as const,
    browser_event_kind: "resource_error" as const,
    resource_url: { host: "analytics.example.com" }
  },
  sample_rate: null,
  sample_event_class: null,
  created_by_user_id: null,
  created_from_incident_id: null,
  created_from_event_id: null,
  expires_at: null,
  hit_count: 0,
  last_matched_at: null,
  created_at: "2026-05-26T10:00:00.000Z",
  updated_at: "2026-05-26T10:00:00.000Z"
};

function createIncidentFixture(): Awaited<
  ReturnType<ApiDependencies["incidentRetrieval"]["getIncidentForOrganization"]>
> {
  return {
    incident_id: "550e8400-e29b-41d4-a716-446655440123",
    project_id: "00000000-0000-0000-0000-000000000001",
    project_name: "Main App",
    project_color_tag: null,
    service_id: "svc_123",
    service_name: "web",
    environment: "production",
    fingerprint: "fp_browser_noise",
    fingerprint_version: "v1",
    title: "Browser resource load error",
    status: "open",
    severity: "medium",
    first_seen_at: "2026-05-26T10:00:00.000Z",
    last_seen_at: "2026-05-26T10:10:00.000Z",
    occurrence_count: 12,
    regressed_at: null,
    resolved_at: null,
    resolved_by_member_id: null,
    bundle_version: 1,
    latest_deployment_id: null,
    matched_fields: ["browser_event_kind", "resource_host"],
    spike_detected_at: null
  };
}

function createBrowserNoiseBundleBuffer(): Buffer {
  const bundle = createBundleWithRequestContext();
  bundle.signal.signal_type = "frontend_exception";
  bundle.signal.source_event_types = ["frontend_exception"];
  bundle.signal.fingerprint = "fp_browser_noise";
  bundle.summary.title = "Browser resource load error";
  bundle.summary.description = "Browser resource load error";
  bundle.summary.primary_signal = "frontend_exception";
  bundle.summary.error_type = "ResourceLoadError";
  bundle.summary.error_message = "Failed to load resource";
  bundle.context.request = {
    version: 1,
    method: "GET",
    path: "/checkout",
    route_template: "/checkout",
    query: {},
    headers: { host: "app.example.com" },
    body: null,
    request_id: "req_browser_noise"
  };
  bundle.context.response = null;
  bundle.context.frontend = {
    version: 1,
    route_changes: [],
    clicks: [],
    form_submissions: [],
    console_logs: [],
    network_requests: [],
    exceptions: [
      {
        name: "ResourceLoadError",
        message: "Failed to load resource",
        route: "/checkout",
        browser_event: {
          kind: "resource_error",
          target: {
            source_url: "https://analytics.example.com/tag.js?token=secret#frag"
          }
        }
      }
    ],
    dom_context: null
  };

  return gzipSync(Buffer.from(JSON.stringify(bundle), "utf8"));
}

describe("capture rule routes", () => {
  it("lists capture rules for project viewers", async () => {
    const app = createDependencies({
      captureRuleManagement: {
        listCaptureRulesForProject: vi.fn().mockResolvedValue([rule]),
        listActiveCaptureRulesForProject: vi.fn(),
        createCaptureRuleForProject: vi.fn(),
        updateCaptureRuleForProject: vi.fn(),
        deleteCaptureRuleForProject: vi.fn()
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/projects/00000000-0000-0000-0000-000000000001/capture-rules",
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      access_mode: "manage",
      rules: [rule]
    });
  });

  it("returns preview mode for members", async () => {
    const app = createDependencies({
      projectManagement: {
        resolveProjectAccessForUser: vi.fn().mockResolvedValue({
          project_id: "00000000-0000-0000-0000-000000000001",
          organization_id: "org_123",
          owner_user_id: "usr_owner",
          owner_email: "owner@example.com",
          relationship: "shared",
          effective_role: "member",
          organization_plan: "team"
        }),
        listProjectsForOrganization: vi.fn().mockResolvedValue([]),
        createProjectForOrganization: vi.fn(),
        updateProjectForOrganization: vi.fn(),
        deleteProjectForOrganization: vi.fn()
      },
      captureRuleManagement: {
        listCaptureRulesForProject: vi.fn().mockResolvedValue([rule]),
        listActiveCaptureRulesForProject: vi.fn(),
        createCaptureRuleForProject: vi.fn(),
        updateCaptureRuleForProject: vi.fn(),
        deleteCaptureRuleForProject: vi.fn()
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/projects/00000000-0000-0000-0000-000000000001/capture-rules",
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      access_mode: "preview",
      rules: [rule]
    });
  });

  it("creates capture rules for owners and admins", async () => {
    const app = createDependencies({
      auditLogging: {
        createAuditLog: vi.fn().mockResolvedValue(undefined)
      },
      captureRuleManagement: {
        listCaptureRulesForProject: vi.fn(),
        listActiveCaptureRulesForProject: vi.fn(),
        createCaptureRuleForProject: vi.fn().mockResolvedValue(rule),
        updateCaptureRuleForProject: vi.fn(),
        deleteCaptureRuleForProject: vi.fn()
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/projects/00000000-0000-0000-0000-000000000001/capture-rules",
      headers: { authorization: "Bearer dbundle_mem_test_token" },
      payload: {
        name: rule.name,
        description: null,
        enabled: true,
        action: "demote",
        matcher: rule.matcher,
        sample_rate: null,
        sample_event_class: null,
        created_by_user_id: null,
        created_from_incident_id: null,
        created_from_event_id: null,
        expires_at: null
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ rule });
  });

  it("returns deterministic incident-based suggestions when the incident bundle is ready", async () => {
    const objectStoreReader = {
      getObject: vi.fn().mockResolvedValue(createBrowserNoiseBundleBuffer())
    };
    const app = createDependencies({
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue(createIncidentFixture()),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([]),
        getBundleFailureReasonForOrganization: vi.fn().mockResolvedValue(null)
      },
      objectStoreReader
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/incidents/550e8400-e29b-41d4-a716-446655440123/capture-rule-suggestion",
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      bundle_status: "ready",
      suggestions: [
        expect.objectContaining({
          suggestion_id: "primary_resource_host_demote",
          recommended_action: "demote"
        }),
        expect.objectContaining({
          suggestion_id: "primary_resource_host_drop",
          recommended_action: "drop"
        }),
        expect.objectContaining({
          suggestion_id: "exact_fingerprint_demote",
          recommended_action: "demote"
        })
      ]
    });
  });

  it("marks incident suggestions that already have matching capture rules", async () => {
    const existingRule = {
      ...rule,
      created_from_incident_id: null
    };
    const objectStoreReader = {
      getObject: vi.fn().mockResolvedValue(createBrowserNoiseBundleBuffer())
    };
    const app = createDependencies({
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue(createIncidentFixture()),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([]),
        getBundleFailureReasonForOrganization: vi.fn().mockResolvedValue(null)
      },
      captureRuleManagement: {
        listCaptureRulesForProject: vi.fn().mockResolvedValue([existingRule]),
        listActiveCaptureRulesForProject: vi.fn(),
        createCaptureRuleForProject: vi.fn(),
        updateCaptureRuleForProject: vi.fn(),
        deleteCaptureRuleForProject: vi.fn()
      },
      objectStoreReader
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/incidents/550e8400-e29b-41d4-a716-446655440123/capture-rule-suggestion",
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().suggestions[0]).toMatchObject({
      suggestion_id: "primary_resource_host_demote",
      created_rule_id: rule.id,
      created_rule_enabled: true
    });
  });

  it("returns pending suggestions and requests bundle regeneration when the bundle is missing", async () => {
    const requestRegeneration = vi.fn().mockResolvedValue(true);
    const objectStoreReader = {
      getObject: vi.fn().mockRejectedValue(new Error("s3_object_not_found"))
    };
    const app = createDependencies({
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue(createIncidentFixture()),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([]),
        getBundleFailureReasonForOrganization: vi.fn().mockResolvedValue(null)
      },
      bundleRegeneration: {
        requestRegeneration
      },
      objectStoreReader
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/incidents/550e8400-e29b-41d4-a716-446655440123/capture-rule-suggestion",
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      suggestions: [],
      bundle_status: "pending"
    });
    expect(requestRegeneration).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: "00000000-0000-0000-0000-000000000001",
      incident_id: "550e8400-e29b-41d4-a716-446655440123"
    });
  });

  it("creates a capture rule from a selected suggestion", async () => {
    const createCaptureRuleForProject = vi.fn().mockResolvedValue(rule);
    const objectStoreReader = {
      getObject: vi.fn().mockResolvedValue(createBrowserNoiseBundleBuffer())
    };
    const app = createDependencies({
      auditLogging: {
        createAuditLog: vi.fn().mockResolvedValue(undefined)
      },
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue(createIncidentFixture()),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([]),
        getBundleFailureReasonForOrganization: vi.fn().mockResolvedValue(null)
      },
      captureRuleManagement: {
        listCaptureRulesForProject: vi.fn(),
        listActiveCaptureRulesForProject: vi.fn(),
        createCaptureRuleForProject,
        updateCaptureRuleForProject: vi.fn(),
        deleteCaptureRuleForProject: vi.fn()
      },
      objectStoreReader
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/incidents/550e8400-e29b-41d4-a716-446655440123/capture-rules",
      headers: { authorization: "Bearer dbundle_mem_test_token" },
      payload: {
        suggestion_id: "primary_resource_host_demote",
        name: "Demote analytics noise"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ rule });
    expect(createCaptureRuleForProject).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org_123",
        project_id: "00000000-0000-0000-0000-000000000001",
        create: expect.objectContaining({
          name: "Demote analytics noise",
          action: "demote",
          created_from_incident_id: "550e8400-e29b-41d4-a716-446655440123",
          matcher: {
            event_types: ["frontend_exception"],
            browser_event_kind: "resource_error",
            resource_url: { host: "analytics.example.com" }
          }
        })
      })
    );
  });

  it("returns an existing matching rule instead of duplicating a selected suggestion", async () => {
    const existingRule = {
      ...rule,
      created_from_incident_id: null
    };
    const createCaptureRuleForProject = vi.fn();
    const objectStoreReader = {
      getObject: vi.fn().mockResolvedValue(createBrowserNoiseBundleBuffer())
    };
    const app = createDependencies({
      auditLogging: {
        createAuditLog: vi.fn().mockResolvedValue(undefined)
      },
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue(createIncidentFixture()),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([]),
        getBundleFailureReasonForOrganization: vi.fn().mockResolvedValue(null)
      },
      captureRuleManagement: {
        listCaptureRulesForProject: vi.fn().mockResolvedValue([existingRule]),
        listActiveCaptureRulesForProject: vi.fn(),
        createCaptureRuleForProject,
        updateCaptureRuleForProject: vi.fn(),
        deleteCaptureRuleForProject: vi.fn()
      },
      objectStoreReader
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/incidents/550e8400-e29b-41d4-a716-446655440123/capture-rules",
      headers: { authorization: "Bearer dbundle_mem_test_token" },
      payload: {
        suggestion_id: "primary_resource_host_demote"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ rule: existingRule });
    expect(createCaptureRuleForProject).not.toHaveBeenCalled();
  });

  it("updates capture rules for owners and admins", async () => {
    const updatedRule = {
      ...rule,
      action: "sample" as const,
      sample_rate: 0.2,
      sample_event_class: "context" as const
    };
    const app = createDependencies({
      auditLogging: {
        createAuditLog: vi.fn().mockResolvedValue(undefined)
      },
      captureRuleManagement: {
        listCaptureRulesForProject: vi.fn(),
        listActiveCaptureRulesForProject: vi.fn(),
        createCaptureRuleForProject: vi.fn(),
        updateCaptureRuleForProject: vi.fn().mockResolvedValue(updatedRule),
        deleteCaptureRuleForProject: vi.fn()
      }
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/projects/00000000-0000-0000-0000-000000000001/capture-rules/00000000-0000-4000-8000-000000000101",
      headers: { authorization: "Bearer dbundle_mem_test_token" },
      payload: {
        action: "sample",
        sample_rate: 0.2,
        sample_event_class: "context"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ rule: updatedRule });
  });

  it("deletes capture rules for owners and admins", async () => {
    const app = createDependencies({
      auditLogging: {
        createAuditLog: vi.fn().mockResolvedValue(undefined)
      },
      captureRuleManagement: {
        listCaptureRulesForProject: vi.fn(),
        listActiveCaptureRulesForProject: vi.fn(),
        createCaptureRuleForProject: vi.fn(),
        updateCaptureRuleForProject: vi.fn(),
        deleteCaptureRuleForProject: vi.fn().mockResolvedValue(true)
      }
    });

    const response = await app.inject({
      method: "DELETE",
      url: "/v1/projects/00000000-0000-0000-0000-000000000001/capture-rules/00000000-0000-4000-8000-000000000101",
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
  });
});
