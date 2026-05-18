import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";

import type { ApiDependencies } from "../../../apps/api/src/api-types.js";
import { createApiServer } from "../../../apps/api/src/server.js";

function createDependencies(overrides: {
  memberAuth?: ApiDependencies["memberAuth"];
  projectManagement?: ApiDependencies["projectManagement"];
  improvementManagement?: ApiDependencies["improvementManagement"];
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

  it("snoozes an improvement", async () => {
    const snoozed = createImprovementRecord({
      status: "snoozed",
      snoozed_until: "2026-05-25T13:00:00.000Z"
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
        snoozed_until: "2026-05-25T13:00:00.000Z"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(snoozeImprovementForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      improvement_id: "imp_123",
      snoozed_until: "2026-05-25T13:00:00.000Z"
    });
    expect(response.json()).toEqual({ improvement: snoozed });
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
});
