import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";

import type { ApiDependencies } from "../../../apps/api/src/api-types.js";
import { createApiServer } from "../../../apps/api/src/server.js";

function createDependencies(overrides: {
  memberAuth?: ApiDependencies["memberAuth"];
  projectManagement?: ApiDependencies["projectManagement"];
  improvementManagement?: ApiDependencies["improvementManagement"];
  improvementBundleRegeneration?: ApiDependencies["improvementBundleRegeneration"];
  objectStoreReader?: ApiDependencies["objectStoreReader"];
} = {}): ReturnType<typeof createApiServer> {
  return createApiServer({
    ingestionPersistence: { persistAndEnqueue: vi.fn() },
    ingestionMetadata: { resolveProjectByTokenHash: vi.fn() },
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
    incidentRetrieval: {
      listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
      getIncidentForOrganization: vi.fn().mockResolvedValue(null),
      listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
    },
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
    improvementManagement: overrides.improvementManagement,
    ...(overrides.improvementBundleRegeneration === undefined
      ? {}
      : { improvementBundleRegeneration: overrides.improvementBundleRegeneration }),
    objectStoreReader: overrides.objectStoreReader ?? { getObject: vi.fn() },
    webhookDelivery: {
      listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue(null)
    }
  });
}

function createImprovementRecord(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    improvement_id: "imp_123",
    project_id: "00000000-0000-0000-0000-000000000001",
    project_name: "Checkout",
    project_slug: "checkout",
    service_id: null,
    service_name: "checkout-api",
    service_runtime: "node",
    service_framework: "fastify",
    environment: "production",
    kind: "warning_hotspot",
    status: "open",
    severity: "medium",
    confidence: 0.8,
    fingerprint: "fp_warning_hotspot",
    title: "Warning hotspot: payment provider warning",
    summary: "Repeated warning log pattern detected for checkout-api in production.",
    occurrence_count: 7,
    evidence: {
      kind: "warning_hotspot",
      normalized_message: "payment provider warning"
    },
    related_incident_ids: [],
    first_detected_at: "2026-05-18T12:00:00.000Z",
    last_detected_at: "2026-05-18T12:30:00.000Z",
    resolved_at: null,
    snoozed_until: null,
    bundle_generation_number: 1,
    bundle_created_at: "2026-05-18T12:31:00.000Z",
    bundle_updated_at: "2026-05-18T12:31:00.000Z",
    bundle_failure_reason: null,
    ...overrides
  };
}

describe("improvement routes", () => {
  it("lists improvements for the authenticated organization", async () => {
    const app = createDependencies({
      improvementManagement: {
        listImprovementsForOrganization: vi.fn().mockResolvedValue([createImprovementRecord()]),
        getImprovementForOrganization: vi.fn(),
        resolveImprovementForOrganization: vi.fn(),
        reopenImprovementForOrganization: vi.fn()
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/improvements?status=open&limit=20",
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      improvements: [createImprovementRecord()],
      next_cursor: null
    });
  });

  it("builds a next cursor and forwards parsed filters for improvement listing", async () => {
    const listImprovementsForOrganization = vi.fn().mockResolvedValue([
      createImprovementRecord({
        improvement_id: "imp_123",
        last_detected_at: "2026-05-18T12:30:00.000Z"
      }),
      createImprovementRecord({
        improvement_id: "imp_456",
        last_detected_at: "2026-05-18T12:31:00.000Z"
      })
    ]);
    const app = createDependencies({
      improvementManagement: {
        listImprovementsForOrganization,
        getImprovementForOrganization: vi.fn(),
        resolveImprovementForOrganization: vi.fn(),
        reopenImprovementForOrganization: vi.fn()
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/improvements?project_id=00000000-0000-0000-0000-000000000001&environment=production&service=checkout-api&status=open&severity=medium&kind=warning_hotspot&cursor=2026-05-18T12%3A45%3A00.000Z%7Cimp_cursor&limit=2",
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(response.statusCode).toBe(200);
    expect(listImprovementsForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      user_id: "usr_owner",
      project_id: "00000000-0000-0000-0000-000000000001",
      environment: "production",
      service: "checkout-api",
      status: "open",
      severity: "medium",
      kind: "warning_hotspot",
      cursor: {
        last_detected_at: "2026-05-18T12:45:00.000Z",
        improvement_id: "imp_cursor"
      },
      limit: 2
    });
    expect(response.json()).toEqual({
      improvements: [
        createImprovementRecord({
          improvement_id: "imp_123",
          last_detected_at: "2026-05-18T12:30:00.000Z"
        }),
        createImprovementRecord({
          improvement_id: "imp_456",
          last_detected_at: "2026-05-18T12:31:00.000Z"
        })
      ],
      next_cursor: "2026-05-18T12:31:00.000Z|imp_456"
    });
  });

  it("returns improvements_not_available when the improvement surface is disabled", async () => {
    const app = createDependencies();

    const response = await app.inject({
      method: "GET",
      url: "/v1/improvements?status=open&limit=20",
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "improvements_not_available" });
  });

  it("rejects invalid improvement cursors", async () => {
    const app = createDependencies({
      improvementManagement: {
        listImprovementsForOrganization: vi.fn(),
        getImprovementForOrganization: vi.fn(),
        resolveImprovementForOrganization: vi.fn(),
        reopenImprovementForOrganization: vi.fn()
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/improvements?cursor=not-a-valid-cursor&limit=20",
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_query" });
  });

  it("returns a single improvement record", async () => {
    const improvement = createImprovementRecord();
    const app = createDependencies({
      improvementManagement: {
        listImprovementsForOrganization: vi.fn(),
        getImprovementForOrganization: vi.fn().mockResolvedValue(improvement),
        resolveImprovementForOrganization: vi.fn(),
        reopenImprovementForOrganization: vi.fn()
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/improvements/imp_123",
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ improvement });
  });

  it("returns improvement_not_found when the improvement is missing", async () => {
    const app = createDependencies({
      improvementManagement: {
        listImprovementsForOrganization: vi.fn(),
        getImprovementForOrganization: vi.fn().mockResolvedValue(null),
        resolveImprovementForOrganization: vi.fn(),
        reopenImprovementForOrganization: vi.fn()
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/improvements/imp_missing",
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "improvement_not_found" });
  });

  it("returns unavailable errors when mutation surfaces are disabled", async () => {
    const app = createDependencies({
      improvementManagement: {
        listImprovementsForOrganization: vi.fn(),
        getImprovementForOrganization: vi.fn()
      }
    });

    const unavailableResolve = await app.inject({
      method: "POST",
      url: "/v1/improvements/imp_123/resolve",
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });
    const unavailableReopen = await app.inject({
      method: "POST",
      url: "/v1/improvements/imp_123/reopen",
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });
    const unavailableSnooze = await app.inject({
      method: "POST",
      url: "/v1/improvements/imp_123/snooze",
      headers: { authorization: "Bearer dbundle_mem_test_token" },
      payload: { snoozed_until: "2026-05-25T13:00:00.000Z" }
    });

    expect(unavailableResolve.statusCode).toBe(404);
    expect(unavailableResolve.json()).toEqual({ error: "improvement_resolution_unavailable" });
    expect(unavailableReopen.statusCode).toBe(404);
    expect(unavailableReopen.json()).toEqual({ error: "improvement_reopen_unavailable" });
    expect(unavailableSnooze.statusCode).toBe(404);
    expect(unavailableSnooze.json()).toEqual({ error: "improvement_snooze_unavailable" });
  });

  it("resolves an improvement", async () => {
    const resolved = createImprovementRecord({
      status: "resolved",
      resolved_at: "2026-05-18T13:00:00.000Z"
    });
    const app = createDependencies({
      improvementManagement: {
        listImprovementsForOrganization: vi.fn(),
        getImprovementForOrganization: vi.fn(),
        resolveImprovementForOrganization: vi.fn().mockResolvedValue(resolved),
        reopenImprovementForOrganization: vi.fn()
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/improvements/imp_123/resolve",
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ improvement: resolved });
  });

  it("returns improvement_not_found when resolve, reopen, or snooze targets are missing", async () => {
    const snoozeImprovementForOrganization = vi.fn().mockResolvedValue(null);
    const app = createDependencies({
      improvementManagement: {
        listImprovementsForOrganization: vi.fn(),
        getImprovementForOrganization: vi.fn(),
        resolveImprovementForOrganization: vi.fn().mockResolvedValue(null),
        reopenImprovementForOrganization: vi.fn().mockResolvedValue(null),
        snoozeImprovementForOrganization
      }
    });

    const resolveResponse = await app.inject({
      method: "POST",
      url: "/v1/improvements/imp_missing/resolve",
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });
    const reopenResponse = await app.inject({
      method: "POST",
      url: "/v1/improvements/imp_missing/reopen",
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });
    const snoozeResponse = await app.inject({
      method: "POST",
      url: "/v1/improvements/imp_missing/snooze",
      headers: { authorization: "Bearer dbundle_mem_test_token" },
      payload: {
        snoozed_until: "2099-05-25T13:00:00.000Z"
      }
    });

    expect(resolveResponse.statusCode).toBe(404);
    expect(resolveResponse.json()).toEqual({ error: "improvement_not_found" });
    expect(reopenResponse.statusCode).toBe(404);
    expect(reopenResponse.json()).toEqual({ error: "improvement_not_found" });
    expect(snoozeResponse.statusCode).toBe(404);
    expect(snoozeResponse.json()).toEqual({ error: "improvement_not_found" });
    expect(snoozeImprovementForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      improvement_id: "imp_missing",
      user_id: "usr_owner",
      snoozed_until: "2099-05-25T13:00:00.000Z"
    });
  });

  it("reopens an improvement", async () => {
    const reopened = createImprovementRecord({
      status: "open",
      resolved_at: null,
      kind: "recurring_incident"
    });
    const app = createDependencies({
      improvementManagement: {
        listImprovementsForOrganization: vi.fn(),
        getImprovementForOrganization: vi.fn(),
        resolveImprovementForOrganization: vi.fn(),
        reopenImprovementForOrganization: vi.fn().mockResolvedValue(reopened)
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/improvements/imp_123/reopen",
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ improvement: reopened });
  });

  it("rejects snooze requests when the timestamp is in the past", async () => {
    const snoozeImprovementForOrganization = vi.fn();
    const app = createDependencies({
      improvementManagement: {
        listImprovementsForOrganization: vi.fn(),
        getImprovementForOrganization: vi.fn(),
        resolveImprovementForOrganization: vi.fn(),
        reopenImprovementForOrganization: vi.fn(),
        snoozeImprovementForOrganization
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/improvements/imp_123/snooze",
      headers: { authorization: "Bearer dbundle_mem_test_token" },
      payload: {
        snoozed_until: "2020-01-01T00:00:00.000Z"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_snooze_until" });
    expect(snoozeImprovementForOrganization).not.toHaveBeenCalled();
  });

  it("snoozes an improvement", async () => {
    const snoozed = createImprovementRecord({
      status: "snoozed",
      snoozed_until: "2099-05-25T13:00:00.000Z"
    });
    const snoozeImprovementForOrganization = vi.fn().mockResolvedValue(snoozed);
    const app = createDependencies({
      improvementManagement: {
        listImprovementsForOrganization: vi.fn(),
        getImprovementForOrganization: vi.fn(),
        resolveImprovementForOrganization: vi.fn(),
        reopenImprovementForOrganization: vi.fn(),
        snoozeImprovementForOrganization
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/improvements/imp_123/snooze",
      headers: { authorization: "Bearer dbundle_mem_test_token" },
      payload: {
        snoozed_until: "2099-05-25T13:00:00.000Z"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(snoozeImprovementForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      improvement_id: "imp_123",
      user_id: "usr_owner",
      snoozed_until: "2099-05-25T13:00:00.000Z"
    });
    expect(response.json()).toEqual({ improvement: snoozed });
  });

  it("returns pending when the improvement bundle artifact is not in object storage yet", async () => {
    const improvement = createImprovementRecord({
      bundle_generation_number: 2,
      bundle_failure_reason: null
    });
    const app = createDependencies({
      improvementManagement: {
        listImprovementsForOrganization: vi.fn(),
        getImprovementForOrganization: vi.fn().mockResolvedValue(improvement),
        resolveImprovementForOrganization: vi.fn(),
        reopenImprovementForOrganization: vi.fn()
      },
      objectStoreReader: {
        getObject: vi.fn().mockRejectedValue(new Error("s3_object_not_found"))
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/projects/00000000-0000-0000-0000-000000000001/improvements/imp_123/bundle",
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "pending" });
  });

  it("queues improvement bundle regeneration for retryable missing artifacts", async () => {
    const buildFailed = createImprovementRecord({
      improvement_id: "imp_failed_retry",
      bundle_generation_number: 1,
      bundle_failure_reason: "build_error"
    });
    const requestRegeneration = vi.fn().mockResolvedValue(true);
    const app = createDependencies({
      improvementManagement: {
        listImprovementsForOrganization: vi.fn(),
        getImprovementForOrganization: vi.fn().mockResolvedValue(buildFailed),
        resolveImprovementForOrganization: vi.fn(),
        reopenImprovementForOrganization: vi.fn()
      },
      improvementBundleRegeneration: {
        requestRegeneration
      },
      objectStoreReader: {
        getObject: vi.fn().mockRejectedValue(new Error("s3_object_not_found"))
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/projects/00000000-0000-0000-0000-000000000001/improvements/imp_failed_retry/bundle",
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "pending" });
    expect(requestRegeneration).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: "00000000-0000-0000-0000-000000000001",
      opportunity_id: "imp_failed_retry"
    });
  });

  it("returns source unavailable when improvement bundle regeneration cannot find source events", async () => {
    const buildFailed = createImprovementRecord({
      improvement_id: "imp_missing_source",
      bundle_generation_number: 1,
      bundle_failure_reason: "build_error"
    });
    const app = createDependencies({
      improvementManagement: {
        listImprovementsForOrganization: vi.fn(),
        getImprovementForOrganization: vi.fn().mockResolvedValue(buildFailed),
        resolveImprovementForOrganization: vi.fn(),
        reopenImprovementForOrganization: vi.fn()
      },
      improvementBundleRegeneration: {
        requestRegeneration: vi.fn().mockResolvedValue(false)
      },
      objectStoreReader: {
        getObject: vi.fn().mockRejectedValue(new Error("s3_object_not_found"))
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/projects/00000000-0000-0000-0000-000000000001/improvements/imp_missing_source/bundle",
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "failed",
      reason: "bundle_source_unavailable"
    });
  });

  it("returns failed states when a bundle is missing or unavailable", async () => {
    const notGenerated = createImprovementRecord({
      improvement_id: "imp_not_generated",
      bundle_generation_number: 0,
      bundle_failure_reason: null
    });
    const failedBundle = createImprovementRecord({
      improvement_id: "imp_failed",
      bundle_generation_number: 2,
      bundle_failure_reason: "bundle_generation_failed"
    });
    const incidentCovered = createImprovementRecord({
      improvement_id: "imp_incident_covered",
      kind: "recurring_incident",
      bundle_generation_number: 0,
      bundle_failure_reason: null,
      related_incident_ids: ["00000000-0000-0000-0000-000000000501"],
      evidence: {
        kind: "recurring_incident",
        incident_id: "00000000-0000-0000-0000-000000000501"
      }
    });
    const getImprovementForOrganization = vi
      .fn()
      .mockResolvedValueOnce(notGenerated)
      .mockResolvedValueOnce(failedBundle)
      .mockResolvedValueOnce(incidentCovered)
      .mockResolvedValueOnce(createImprovementRecord({ improvement_id: "imp_unavailable" }));
    const app = createDependencies({
      improvementManagement: {
        listImprovementsForOrganization: vi.fn(),
        getImprovementForOrganization,
        resolveImprovementForOrganization: vi.fn(),
        reopenImprovementForOrganization: vi.fn()
      },
      objectStoreReader: {
        getObject: vi
          .fn()
          .mockRejectedValueOnce(new Error("s3_object_not_found"))
          .mockRejectedValueOnce(new Error("s3_object_not_found"))
          .mockRejectedValueOnce(new Error("s3_object_not_found"))
          .mockRejectedValueOnce(new Error("boom"))
      }
    });

    const notGeneratedResponse = await app.inject({
      method: "GET",
      url: "/v1/projects/00000000-0000-0000-0000-000000000001/improvements/imp_not_generated/bundle",
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });
    const failedResponse = await app.inject({
      method: "GET",
      url: "/v1/projects/00000000-0000-0000-0000-000000000001/improvements/imp_failed/bundle",
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });
    const incidentCoveredResponse = await app.inject({
      method: "GET",
      url: "/v1/projects/00000000-0000-0000-0000-000000000001/improvements/imp_incident_covered/bundle",
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });
    const unavailableResponse = await app.inject({
      method: "GET",
      url: "/v1/projects/00000000-0000-0000-0000-000000000001/improvements/imp_unavailable/bundle",
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(notGeneratedResponse.statusCode).toBe(200);
    expect(notGeneratedResponse.json()).toEqual({
      status: "failed",
      reason: "bundle_not_generated_yet"
    });
    expect(failedResponse.statusCode).toBe(200);
    expect(failedResponse.json()).toEqual({
      status: "failed",
      reason: "bundle_generation_failed"
    });
    expect(incidentCoveredResponse.statusCode).toBe(200);
    expect(incidentCoveredResponse.json()).toEqual({
      status: "failed",
      reason: "covered_by_incident_bundle",
      related_incident_ids: ["00000000-0000-0000-0000-000000000501"]
    });
    expect(unavailableResponse.statusCode).toBe(200);
    expect(unavailableResponse.json()).toEqual({
      status: "failed",
      reason: "bundle_artifact_unavailable"
    });
  });

  it("returns the hosted improvement bundle artifact", async () => {
    const improvement = createImprovementRecord();
    const bundle = { bundle_version: 1, bundle_type: "improvement", summary: { title: "warning hotspot" } };
    const app = createDependencies({
      improvementManagement: {
        listImprovementsForOrganization: vi.fn(),
        getImprovementForOrganization: vi.fn().mockResolvedValue(improvement),
        resolveImprovementForOrganization: vi.fn(),
        reopenImprovementForOrganization: vi.fn()
      },
      objectStoreReader: {
        getObject: vi.fn().mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(bundle), "utf8")))
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/projects/00000000-0000-0000-0000-000000000001/improvements/imp_123/bundle",
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(bundle);
  });

  it("rejects invalid bundle params and missing bundle access", async () => {
    const app = createDependencies({
      improvementManagement: {
        listImprovementsForOrganization: vi.fn(),
        getImprovementForOrganization: vi.fn().mockResolvedValue(createImprovementRecord({ project_id: "proj_other" })),
        resolveImprovementForOrganization: vi.fn(),
        reopenImprovementForOrganization: vi.fn()
      }
    });

    const invalidParamsResponse = await app.inject({
      method: "GET",
      url: "/v1/projects/not-a-uuid/improvements/imp_123/bundle",
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });
    const wrongProjectResponse = await app.inject({
      method: "GET",
      url: "/v1/projects/00000000-0000-0000-0000-000000000001/improvements/imp_123/bundle",
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(invalidParamsResponse.statusCode).toBe(400);
    expect(invalidParamsResponse.json()).toEqual({ error: "invalid_improvement_id" });
    expect(wrongProjectResponse.statusCode).toBe(404);
    expect(wrongProjectResponse.json()).toEqual({ error: "improvement_not_found" });
  });

  it("returns improvements_not_available from the bundle route when hosted improvements are disabled", async () => {
    const app = createDependencies();

    const response = await app.inject({
      method: "GET",
      url: "/v1/projects/00000000-0000-0000-0000-000000000001/improvements/imp_123/bundle",
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "improvements_not_available" });
  });
});
