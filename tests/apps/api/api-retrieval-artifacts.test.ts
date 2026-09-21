import { describe, expect, it, vi } from "vitest";
import {
  gzipSync,
  createApiServer,
  createTokenManagementDependency,
  createServer
} from "../../helpers/api-retrieval.js";

describe("api-retrieval artifacts", () => {
  it("should return bundle payload when available for authenticated member token", async (): Promise<void> => {
    const app = createServer();

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/550e8400-e29b-41d4-a716-446655440123/bundle",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ bundle_version: 1 });
    expect(response.headers["x-debugbundle-privacy-policy"]).toBe("telemetry-privacy-v1");
  });

  it("should return pending bundle status and trigger regeneration when artifact is unavailable", async (): Promise<void> => {
    const requestRegeneration = vi.fn().mockResolvedValue(true);
    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: {
        resolveMemberByTokenHash: vi
          .fn()
          .mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
      },
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue({
          incident_id: "550e8400-e29b-41d4-a716-446655440123",
          project_id: "proj_123",
          service_id: null,
          environment: "production",
          fingerprint: "fp_123",
          fingerprint_version: "v1",
          title: "TypeError",
          severity: "high",
          status: "open",
          first_seen_at: "2026-03-11T00:00:00.000Z",
          last_seen_at: "2026-03-11T00:10:00.000Z",
          occurrence_count: 3,
          spike_detected_at: null,
          regressed_at: null,
          matched_fields: []
        }),
        listServicesForOrganization: vi.fn().mockResolvedValue([]),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
      },
      objectStoreReader: {
        getObject: vi.fn().mockRejectedValue(new Error("s3_object_not_found"))
      },
      bundleRegeneration: {
        requestRegeneration: requestRegeneration
      },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/550e8400-e29b-41d4-a716-446655440123/bundle",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "pending" });
    expect(requestRegeneration).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: "proj_123",
      incident_id: "550e8400-e29b-41d4-a716-446655440123"
    });
  });

  it("uses the owning project organization when a collaborator fetches a shared incident bundle", async (): Promise<void> => {
    const requestRegeneration = vi.fn().mockResolvedValue(true);
    const getBundleFailureReasonForOrganization = vi.fn().mockResolvedValue(null);
    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({
          member_id: "usr_collaborator",
          organization_id: "org_collaborator"
        })
      },
      tokenManagement: createTokenManagementDependency(),
      projectManagement: {
        resolveProjectAccessForUser: vi.fn().mockResolvedValue({
          project_id: "proj_shared",
          organization_id: "org_owner",
          owner_user_id: "usr_owner",
          owner_email: "owner@example.com",
          relationship: "shared",
          sharing_state: "shared_with_you",
          effective_role: "member",
          organization_plan: "team"
        }),
        listProjectsForOrganization: vi.fn().mockResolvedValue([]),
        createProjectForOrganization: vi.fn(),
        updateProjectForOrganization: vi.fn(),
        deleteProjectForOrganization: vi.fn()
      },
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue({
          incident_id: "550e8400-e29b-41d4-a716-4466554405bb",
          project_id: "proj_shared",
          project_name: "Shared App",
          service_id: null,
          service_name: null,
          latest_deployment_id: null,
          environment: "production",
          fingerprint: "fp_shared",
          fingerprint_version: "v1",
          title: "Shared incident",
          severity: "high",
          status: "open",
          first_seen_at: "2026-03-11T00:00:00.000Z",
          last_seen_at: "2026-03-11T00:10:00.000Z",
          occurrence_count: 3,
          spike_detected_at: null,
          resolved_at: null,
          regressed_at: null,
          matched_fields: []
        }),
        getBundleFailureReasonForOrganization,
        listServicesForOrganization: vi.fn().mockResolvedValue([]),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
      },
      objectStoreReader: {
        getObject: vi.fn().mockRejectedValue(new Error("s3_object_not_found"))
      },
      bundleRegeneration: {
        requestRegeneration
      },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/550e8400-e29b-41d4-a716-4466554405bb/bundle",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "pending" });
    expect(getBundleFailureReasonForOrganization).toHaveBeenCalledWith({
      organization_id: "org_owner",
      incident_id: "550e8400-e29b-41d4-a716-4466554405bb"
    });
    expect(requestRegeneration).toHaveBeenCalledWith({
      organization_id: "org_owner",
      project_id: "proj_shared",
      incident_id: "550e8400-e29b-41d4-a716-4466554405bb"
    });
  });

  it("should return reproduction payload when available", async (): Promise<void> => {
    const reproduction = {
      possible: true,
      confidence: 0.8,
      reason: "request_context_available",
      artifacts: {
        curl: "curl -X POST 'https://example.invalid/checkout'",
        httpie: "http POST 'https://example.invalid/checkout'",
        json_spec: {
          method: "POST",
          url: "https://example.invalid/checkout",
          headers: {
            "content-type": "application/json"
          },
          body: {
            amount: 42
          }
        }
      },
      feasibility_reference: null
    };

    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: {
        resolveMemberByTokenHash: vi
          .fn()
          .mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
      },
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue({
          incident_id: "550e8400-e29b-41d4-a716-446655440123",
          project_id: "proj_123",
          service_id: null,
          environment: "production",
          fingerprint: "fp_123",
          fingerprint_version: "v1",
          title: "TypeError",
          severity: "high",
          status: "open",
          first_seen_at: "2026-03-11T00:00:00.000Z",
          last_seen_at: "2026-03-11T00:10:00.000Z",
          occurrence_count: 3,
          spike_detected_at: null,
          regressed_at: null,
          matched_fields: []
        }),
        listServicesForOrganization: vi.fn().mockResolvedValue([]),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
      },
      objectStoreReader: {
        getObject: vi
          .fn()
          .mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(reproduction), "utf8")))
      },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/550e8400-e29b-41d4-a716-446655440123/reproduction",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(reproduction);
    expect(response.headers["x-debugbundle-privacy-policy"]).toBe("telemetry-privacy-v1");
  });

  it("should return failed bundle status when bundle artifact is unreadable", async (): Promise<void> => {
    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: {
        resolveMemberByTokenHash: vi
          .fn()
          .mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
      },
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue({
          incident_id: "550e8400-e29b-41d4-a716-446655440123",
          project_id: "proj_123",
          service_id: null,
          environment: "production",
          fingerprint: "fp_123",
          fingerprint_version: "v1",
          title: "TypeError",
          severity: "high",
          status: "open",
          first_seen_at: "2026-03-11T00:00:00.000Z",
          last_seen_at: "2026-03-11T00:10:00.000Z",
          occurrence_count: 3,
          spike_detected_at: null,
          regressed_at: null,
          matched_fields: []
        }),
        listServicesForOrganization: vi.fn().mockResolvedValue([]),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
      },
      objectStoreReader: {
        getObject: vi.fn().mockResolvedValue(Buffer.from("not-a-gzip", "utf8"))
      },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/550e8400-e29b-41d4-a716-446655440123/bundle",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "failed",
      reason: "bundle_artifact_invalid"
    });
  });

  it("should return failed bundle status when generation is blocked by monthly quota", async (): Promise<void> => {
    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: {
        resolveMemberByTokenHash: vi
          .fn()
          .mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
      },
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue({
          incident_id: "550e8400-e29b-41d4-a716-446655440123",
          project_id: "proj_123",
          service_id: null,
          environment: "production",
          fingerprint: "fp_123",
          fingerprint_version: "v1",
          title: "TypeError",
          severity: "high",
          status: "open",
          first_seen_at: "2026-03-11T00:00:00.000Z",
          last_seen_at: "2026-03-11T00:10:00.000Z",
          occurrence_count: 3,
          spike_detected_at: null,
          regressed_at: null,
          matched_fields: []
        }),
        getBundleFailureReasonForOrganization: vi.fn().mockResolvedValue("monthly_quota_exceeded"),
        listServicesForOrganization: vi.fn().mockResolvedValue([]),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
      },
      objectStoreReader: {
        getObject: vi.fn().mockRejectedValue(new Error("s3_object_not_found"))
      },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/550e8400-e29b-41d4-a716-446655440123/bundle",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "failed",
      reason: "monthly_quota_exceeded"
    });
  });

  it("should trigger regeneration and return pending when bundle has build_error failure", async (): Promise<void> => {
    const requestRegeneration = vi.fn().mockResolvedValue(true);
    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: {
        resolveMemberByTokenHash: vi
          .fn()
          .mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
      },
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue({
          incident_id: "550e8400-e29b-41d4-a716-446655440123",
          project_id: "proj_123",
          service_id: null,
          environment: "production",
          fingerprint: "fp_123",
          fingerprint_version: "v1",
          title: "TypeError",
          severity: "high",
          status: "open",
          first_seen_at: "2026-03-11T00:00:00.000Z",
          last_seen_at: "2026-03-11T00:10:00.000Z",
          occurrence_count: 3,
          spike_detected_at: null,
          regressed_at: null,
          matched_fields: []
        }),
        getBundleFailureReasonForOrganization: vi.fn().mockResolvedValue("build_error"),
        listServicesForOrganization: vi.fn().mockResolvedValue([]),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
      },
      objectStoreReader: {
        getObject: vi.fn().mockRejectedValue(new Error("s3_object_not_found"))
      },
      bundleRegeneration: {
        requestRegeneration: requestRegeneration
      },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/550e8400-e29b-41d4-a716-446655440123/bundle",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "pending" });
    expect(requestRegeneration).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: "proj_123",
      incident_id: "550e8400-e29b-41d4-a716-446655440123"
    });
  });

  it("should return failed when missing bundle cannot be regenerated", async (): Promise<void> => {
    const requestRegeneration = vi.fn().mockResolvedValue(false);
    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: {
        resolveMemberByTokenHash: vi
          .fn()
          .mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
      },
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue({
          incident_id: "550e8400-e29b-41d4-a716-446655440123",
          project_id: "proj_123",
          service_id: null,
          environment: "production",
          fingerprint: "fp_123",
          fingerprint_version: "v1",
          title: "TypeError",
          severity: "high",
          status: "open",
          first_seen_at: "2026-03-11T00:00:00.000Z",
          last_seen_at: "2026-03-11T00:10:00.000Z",
          occurrence_count: 3,
          spike_detected_at: null,
          regressed_at: null,
          matched_fields: []
        }),
        getBundleFailureReasonForOrganization: vi.fn().mockResolvedValue(null),
        listServicesForOrganization: vi.fn().mockResolvedValue([]),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
      },
      objectStoreReader: {
        getObject: vi.fn().mockRejectedValue(new Error("s3_object_not_found"))
      },
      bundleRegeneration: {
        requestRegeneration
      },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/550e8400-e29b-41d4-a716-446655440123/bundle",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "failed",
      reason: "bundle_source_unavailable"
    });
    expect(requestRegeneration).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: "proj_123",
      incident_id: "550e8400-e29b-41d4-a716-446655440123"
    });
  });

  it("should reject bundle retrieval for invalid member token", async (): Promise<void> => {
    const app = createServer();

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/550e8400-e29b-41d4-a716-446655440123/bundle"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "invalid_member_token" });
  });

  it("should return incident not found for bundle retrieval when incident is out of scope", async (): Promise<void> => {
    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: {
        resolveMemberByTokenHash: vi
          .fn()
          .mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
      },
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue(null),
        listServicesForOrganization: vi.fn().mockResolvedValue([]),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
      },
      objectStoreReader: {
        getObject: vi.fn().mockResolvedValue(Buffer.from("{}", "utf8"))
      },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/550e8400-e29b-41d4-a716-446655440404/bundle",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "incident_not_found" });
  });

  it("should return pending reproduction status when artifact is missing after bundle generation", async (): Promise<void> => {
    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: {
        resolveMemberByTokenHash: vi
          .fn()
          .mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
      },
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue({
          incident_id: "550e8400-e29b-41d4-a716-446655440123",
          project_id: "proj_123",
          service_id: null,
          environment: "production",
          fingerprint: "fp_123",
          fingerprint_version: "v1",
          title: "TypeError",
          severity: "high",
          status: "open",
          first_seen_at: "2026-03-11T00:00:00.000Z",
          last_seen_at: "2026-03-11T00:10:00.000Z",
          occurrence_count: 3,
          spike_detected_at: null,
          regressed_at: null,
          matched_fields: []
        }),
        listServicesForOrganization: vi.fn().mockResolvedValue([]),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
      },
      objectStoreReader: {
        getObject: vi
          .fn()
          .mockRejectedValueOnce(new Error("s3_object_not_found"))
          .mockResolvedValueOnce(
            gzipSync(Buffer.from(JSON.stringify({ bundle_version: 1 }), "utf8"))
          )
      },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/550e8400-e29b-41d4-a716-446655440123/reproduction",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "pending" });
  });

  it("should return pending reproduction status when reproduction artifact is missing and bundle is pending", async (): Promise<void> => {
    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: {
        resolveMemberByTokenHash: vi
          .fn()
          .mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
      },
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue({
          incident_id: "550e8400-e29b-41d4-a716-446655440123",
          project_id: "proj_123",
          service_id: null,
          environment: "production",
          fingerprint: "fp_123",
          fingerprint_version: "v1",
          title: "TypeError",
          severity: "high",
          status: "open",
          first_seen_at: "2026-03-11T00:00:00.000Z",
          last_seen_at: "2026-03-11T00:10:00.000Z",
          occurrence_count: 3,
          spike_detected_at: null,
          regressed_at: null,
          matched_fields: []
        }),
        listServicesForOrganization: vi.fn().mockResolvedValue([]),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
      },
      objectStoreReader: {
        getObject: vi.fn().mockRejectedValue(new Error("s3_object_not_found"))
      },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/550e8400-e29b-41d4-a716-446655440123/reproduction",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "pending" });
  });

  it("should return failed bundle status when object store errors unexpectedly", async (): Promise<void> => {
    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: {
        resolveMemberByTokenHash: vi
          .fn()
          .mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
      },
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue({
          incident_id: "550e8400-e29b-41d4-a716-446655440123",
          project_id: "proj_123",
          service_id: null,
          environment: "production",
          fingerprint: "fp_123",
          fingerprint_version: "v1",
          title: "TypeError",
          severity: "high",
          status: "open",
          first_seen_at: "2026-03-11T00:00:00.000Z",
          last_seen_at: "2026-03-11T00:10:00.000Z",
          occurrence_count: 3,
          spike_detected_at: null,
          regressed_at: null,
          matched_fields: []
        }),
        listServicesForOrganization: vi.fn().mockResolvedValue([]),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
      },
      objectStoreReader: {
        getObject: vi.fn().mockRejectedValue(new Error("s3_temporary_unavailable"))
      },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/550e8400-e29b-41d4-a716-446655440123/bundle",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "failed",
      reason: "bundle_artifact_unavailable"
    });
  });

  it("should return reproduction not found for non-notfound reproduction lookup errors", async (): Promise<void> => {
    const getObject = vi.fn().mockRejectedValue(new Error("read_timeout"));
    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: {
        resolveMemberByTokenHash: vi
          .fn()
          .mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
      },
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue({
          incident_id: "550e8400-e29b-41d4-a716-446655440123",
          project_id: "proj_123",
          service_id: null,
          environment: "production",
          fingerprint: "fp_123",
          fingerprint_version: "v1",
          title: "TypeError",
          severity: "high",
          status: "open",
          first_seen_at: "2026-03-11T00:00:00.000Z",
          last_seen_at: "2026-03-11T00:10:00.000Z",
          occurrence_count: 3,
          spike_detected_at: null,
          regressed_at: null,
          matched_fields: []
        }),
        listServicesForOrganization: vi.fn().mockResolvedValue([]),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
      },
      objectStoreReader: {
        getObject
      },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/550e8400-e29b-41d4-a716-446655440123/reproduction",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "reproduction_not_found" });
    expect(getObject).toHaveBeenCalledTimes(1);
  });
});
