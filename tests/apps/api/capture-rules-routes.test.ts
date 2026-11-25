import { gzipSync } from "node:zlib";

import { describe, expect, it, vi } from "vitest";

import type { ApiDependencies } from "../../../apps/api/src/api-types.js";
import { createApiServer } from "../../../apps/api/src/server.js";
import { CaptureRuleSuggestionsResponseSchema } from "../../../packages/shared-types/src/index.js";
import { CaptureRuleValidationError } from "../../../packages/storage/src/index.js";
import { createBundleWithRequestContext } from "../../helpers/repro-engine.js";

function createDependencies(
  overrides: {
    auditLogging?: ApiDependencies["auditLogging"];
    memberAuth?: ApiDependencies["memberAuth"];
    captureRuleManagement?: ApiDependencies["captureRuleManagement"];
    captureRuleV2WritesEnabled?: boolean;
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
    ...(overrides.captureRuleV2WritesEnabled === undefined
      ? {}
      : { captureRuleV2WritesEnabled: overrides.captureRuleV2WritesEnabled }),
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
    browser_event_opaque: true,
    services: ["web"],
    environments: ["production"],
    resource_url: { host: "www.googletagmanager.com", path_equals: "/gtm.js" }
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

function createBrowserNoiseBundleBuffer(
  sourceUrl: string | null = "https://www.googletagmanager.com/gtm.js?token=secret#frag"
): Buffer {
  const bundle = createBundleWithRequestContext();
  bundle.service.name = "web";
  bundle.project.environment = "production";
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
          opaque: true,
          page: { url: "https://app.example.com/checkout" },
          target: {
            tag_name: "script",
            ...(sourceUrl === null ? {} : { source_url: sourceUrl })
          }
        }
      }
    ],
    dom_context: null
  };

  return gzipSync(Buffer.from(JSON.stringify(bundle), "utf8"));
}

describe("capture rule routes", () => {
  it("uses canonical owner context for a shared incident while retaining the original artifact namespace", async () => {
    const source = "00000000-0000-0000-0000-000000000001",
      root = "00000000-0000-0000-0000-000000000002";
    const list = vi.fn().mockResolvedValue([]),
      create = vi.fn().mockResolvedValue({
        ...rule,
        project_id: root,
        matcher: { ...rule.matcher, services: ["Site"] }
      });
    const getObject = vi.fn().mockResolvedValue(createBrowserNoiseBundleBuffer());
    const audit = vi.fn().mockResolvedValue(undefined);
    const app = createDependencies({
      memberAuth: {
        resolveMemberByTokenHash: vi
          .fn()
          .mockResolvedValue({ member_id: "collaborator", organization_id: "org_home" })
      },
      projectManagement: {
        listProjectsForOrganization: vi.fn(),
        createProjectForOrganization: vi.fn(),
        updateProjectForOrganization: vi.fn(),
        deleteProjectForOrganization: vi.fn(),
        resolveProjectAccessForUser: vi.fn().mockResolvedValue({
          project_id: source,
          canonical_project_id: root,
          organization_id: "org_owner",
          owner_user_id: "owner",
          effective_role: "admin",
          relationship: "shared",
          organization_plan: "team"
        })
      },
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn(),
        listIncidentLogsForOrganization: vi.fn(),
        getIncidentForOrganization: vi.fn().mockResolvedValue({
          ...createIncidentFixture(),
          canonical_project_id: root,
          canonical_service_name: "Site"
        })
      },
      captureRuleManagement: {
        listCaptureRulesForProject: list,
        listActiveCaptureRulesForProject: vi.fn(),
        createCaptureRuleForProject: create,
        updateCaptureRuleForProject: vi.fn(),
        deleteCaptureRuleForProject: vi.fn()
      },
      objectStoreReader: { getObject },
      auditLogging: { createAuditLog: audit }
    });
    const suggested = await app.inject({
      method: "POST",
      url: "/v1/incidents/550e8400-e29b-41d4-a716-446655440123/capture-rule-suggestion",
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });
    expect(suggested.statusCode).toBe(200);
    const response = await app.inject({
      method: "POST",
      url: "/v1/incidents/550e8400-e29b-41d4-a716-446655440123/capture-rules",
      headers: { authorization: "Bearer dbundle_mem_test_token" },
      payload: { suggestion_id: "resource_context" }
    });
    expect(response.statusCode).toBe(201);
    expect(list).toHaveBeenCalledWith({
      organization_id: "org_owner",
      actor_user_id: "collaborator",
      project_id: root
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org_owner",
        actor_user_id: "collaborator",
        project_id: root,
        create: expect.objectContaining({
          matcher: expect.objectContaining({ services: ["Site"] })
        })
      })
    );
    expect(getObject).toHaveBeenCalledWith({ key: expect.stringContaining(`/${source}/`) });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ organization_id: "org_owner" }));
    await app.close();
  });
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

  it("keeps existing capture-rule list clients compatible when a project adds new rule actions", async () => {
    const thresholdRule = {
      ...rule,
      id: "550e8400-e29b-41d4-a716-446655440124",
      action: "threshold" as const,
      threshold_count: 10,
      threshold_window_seconds: 3600,
      threshold_group_by: "fingerprint" as const
    };
    const app = createDependencies({
      captureRuleManagement: {
        listCaptureRulesForProject: vi.fn().mockResolvedValue([rule, thresholdRule]),
        listActiveCaptureRulesForProject: vi.fn(),
        createCaptureRuleForProject: vi.fn(),
        updateCaptureRuleForProject: vi.fn(),
        deleteCaptureRuleForProject: vi.fn()
      }
    });

    try {
      const url = "/v1/projects/00000000-0000-0000-0000-000000000001/capture-rules";
      const headers = { authorization: "Bearer dbundle_mem_test_token" };
      const legacy = await app.inject({ method: "GET", url, headers });
      const current = await app.inject({ method: "GET", url: `${url}?rule_schema=2`, headers });

      expect(legacy.statusCode).toBe(200);
      expect(legacy.json()).toEqual({ access_mode: "manage", rules: [rule] });
      expect(current.statusCode).toBe(200);
      expect(current.json()).toEqual({ access_mode: "manage", rules: [rule, thresholdRule] });
    } finally {
      await app.close();
    }
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

  it("pauses creation and conversion to new rule types while keeping existing rule writes available", async () => {
    const create = vi.fn().mockResolvedValue(rule);
    const update = vi.fn().mockResolvedValue(rule);
    const app = createDependencies({
      captureRuleV2WritesEnabled: false,
      captureRuleManagement: {
        listCaptureRulesForProject: vi.fn(),
        listActiveCaptureRulesForProject: vi.fn(),
        createCaptureRuleForProject: create,
        updateCaptureRuleForProject: update,
        deleteCaptureRuleForProject: vi.fn()
      }
    });
    const url = `/v1/projects/${rule.project_id}/capture-rules`;
    const headers = { authorization: "Bearer dbundle_mem_test_token" };

    try {
      const createPaused = await app.inject({
        method: "POST",
        url,
        headers,
        payload: { name: "Allow web", action: "allow", matcher: { services: ["web"] } }
      });
      expect(createPaused.statusCode).toBe(503);
      expect(createPaused.json()).toEqual({ error: "capture_rule_v2_writes_paused" });

      const updatePaused = await app.inject({
        method: "PATCH",
        url: `${url}/${rule.id}`,
        headers,
        payload: {
          matcher: { resource_urls: [{ host: "cdn.example.test", path_equals: "/one.js" }] }
        }
      });
      expect(updatePaused.statusCode).toBe(503);
      expect(create).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();

      const legacyWrite = await app.inject({
        method: "POST",
        url,
        headers,
        payload: { name: "Demote web", action: "demote", matcher: { services: ["web"] } }
      });
      expect(legacyWrite.statusCode).toBe(201);
      expect(create).toHaveBeenCalledOnce();
    } finally {
      await app.close();
    }
  });

  it.each([
    "https://www.googletagmanager.com/gtm.js",
    "https://www.googletagmanager.com/gtag/js",
    "https://cdn.example.com/optional.js",
    null
  ])(
    "returns deterministic resource controls for %s without changing the API shape",
    async (url) => {
      const objectStoreReader = {
        getObject: vi.fn().mockResolvedValue(createBrowserNoiseBundleBuffer(url))
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
        url: "/v1/incidents/550e8400-e29b-41d4-a716-446655440123/capture-rule-suggestion?rule_schema=2",
        headers: { authorization: "Bearer dbundle_mem_test_token" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        bundle_status: "ready",
        suggestions:
          url === null
            ? [
                expect.objectContaining({
                  suggestion_id: "exact_fingerprint_demote",
                  recommended_action: "demote"
                }),
                expect.objectContaining({
                  suggestion_id: "exact_fingerprint_drop",
                  recommended_action: "drop"
                })
              ]
            : [
                expect.objectContaining({
                  suggestion_id: "resource_context",
                  recommended_action: "demote"
                }),
                expect.objectContaining({
                  suggestion_id: "resource_drop",
                  recommended_action: "drop"
                }),
                expect.objectContaining({
                  suggestion_id: "resource_threshold",
                  recommended_action: "threshold"
                })
              ]
      });
      const legacy = await app.inject({
        method: "POST",
        url: "/v1/incidents/550e8400-e29b-41d4-a716-446655440123/capture-rule-suggestion",
        headers: { authorization: "Bearer dbundle_mem_test_token" }
      });
      expect(legacy.statusCode).toBe(200);
      const currentBody = CaptureRuleSuggestionsResponseSchema.parse(response.json());
      const legacyBody = CaptureRuleSuggestionsResponseSchema.parse(legacy.json());
      expect(legacyBody.suggestions).toEqual(
        currentBody.suggestions.filter(
          (suggestion) => suggestion.suggestion_id !== "resource_threshold"
        )
      );
    }
  );

  it.each([true, false])("reports legacy matching rules with enabled=%s", async (enabled) => {
    const existingRule = {
      ...rule,
      enabled,
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
      suggestion_id: "resource_context",
      created_rule_id: rule.id,
      created_rule_enabled: enabled
    });
    expect(response.json().suggestions[0].rule.matcher).toEqual(existingRule.matcher);
    expect(response.json().suggestions[0].rule.matcher.browser_target_tag_name).toBeUndefined();
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
      access_mode: "preview",
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
        suggestion_id: "resource_context",
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
            browser_event_opaque: true,
            browser_target_tag_name: "script",
            services: ["web"],
            environments: ["production"],
            resource_url: { host: "www.googletagmanager.com", path_equals: "/gtm.js" }
          }
        })
      })
    );
  });

  it.each([true, false])(
    "returns an existing legacy rule without duplicating or enabling it (enabled=%s)",
    async (enabled) => {
      const existingRule = {
        ...rule,
        enabled,
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
          suggestion_id: "resource_context"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ rule: existingRule });
      expect(createCaptureRuleForProject).not.toHaveBeenCalled();
    }
  );

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

  it("creates threshold, allow, and multi-URL resource_urls rules and maps merged PATCH validation failures to 400", async () => {
    const thresholdRule = {
      ...rule,
      action: "threshold" as const,
      threshold_count: 10,
      threshold_window_seconds: 3600,
      threshold_group_by: "resource" as const,
      matcher: {
        event_types: ["frontend_exception"] as const,
        browser_event_kind: "resource_error" as const,
        services: ["web"],
        environments: ["production"],
        resource_urls: [
          { host: "cdn-primary.example.com", path_equals: "/widget.js" },
          { host: "cdn-fallback.example.com", path_equals: "/widget.js" }
        ]
      }
    };
    const allowRule = {
      ...rule,
      action: "allow" as const,
      threshold_count: null,
      threshold_window_seconds: null,
      threshold_group_by: null,
      matcher: {
        event_types: ["frontend_exception"] as const,
        browser_event_kind: "resource_error" as const,
        resource_url: { host: "app.example.com", path_prefix: "/assets/checkout-" }
      }
    };
    const createCaptureRuleForProject = vi
      .fn()
      .mockResolvedValueOnce(thresholdRule)
      .mockResolvedValueOnce(allowRule);
    const updateCaptureRuleForProject = vi
      .fn()
      .mockRejectedValueOnce(new CaptureRuleValidationError("invalid_capture_rule_update"));
    const app = createDependencies({
      auditLogging: { createAuditLog: vi.fn().mockResolvedValue(undefined) },
      captureRuleManagement: {
        listCaptureRulesForProject: vi.fn(),
        listActiveCaptureRulesForProject: vi.fn(),
        createCaptureRuleForProject,
        updateCaptureRuleForProject,
        deleteCaptureRuleForProject: vi.fn()
      }
    });

    const thresholdResponse = await app.inject({
      method: "POST",
      url: "/v1/projects/00000000-0000-0000-0000-000000000001/capture-rules",
      headers: { authorization: "Bearer dbundle_mem_test_token" },
      payload: {
        name: "Threshold optional CDN widget",
        description: null,
        enabled: true,
        action: "threshold",
        matcher: thresholdRule.matcher,
        sample_rate: null,
        sample_event_class: null,
        threshold_count: 10,
        threshold_window_seconds: 3600,
        threshold_group_by: "resource",
        created_by_user_id: null,
        created_from_incident_id: null,
        created_from_event_id: null,
        expires_at: null
      }
    });
    expect(thresholdResponse.statusCode).toBe(201);
    expect(thresholdResponse.json().rule).toMatchObject({
      action: "threshold",
      threshold_count: 10,
      threshold_window_seconds: 3600,
      threshold_group_by: "resource"
    });

    const allowResponse = await app.inject({
      method: "POST",
      url: "/v1/projects/00000000-0000-0000-0000-000000000001/capture-rules",
      headers: { authorization: "Bearer dbundle_mem_test_token" },
      payload: {
        name: "Allow checkout assets immediately",
        description: null,
        enabled: true,
        action: "allow",
        matcher: allowRule.matcher,
        sample_rate: null,
        sample_event_class: null,
        created_by_user_id: null,
        created_from_incident_id: null,
        created_from_event_id: null,
        expires_at: null
      }
    });
    expect(allowResponse.statusCode).toBe(201);
    expect(allowResponse.json().rule.action).toBe("allow");

    const invalidPatch = await app.inject({
      method: "PATCH",
      url: "/v1/projects/00000000-0000-0000-0000-000000000001/capture-rules/00000000-0000-4000-8000-000000000101",
      headers: { authorization: "Bearer dbundle_mem_test_token" },
      payload: {
        action: "threshold",
        threshold_count: 10,
        threshold_window_seconds: 3600,
        threshold_group_by: "resource"
      }
    });
    expect(invalidPatch.statusCode).toBe(400);
    expect(invalidPatch.json()).toMatchObject({ error: "invalid_payload" });
    await app.close();
  });
});
