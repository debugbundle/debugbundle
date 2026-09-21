import { describe, expect, it, vi } from "vitest";
import { createApiServer, createTokenManagementDependency } from "../../helpers/api-retrieval.js";

describe("api-retrieval lifecycle", () => {
  it("should resolve an incident for an authenticated member token", async (): Promise<void> => {
    const resolveIncidentForOrganization = vi.fn().mockResolvedValue({
      incident_id: "550e8400-e29b-41d4-a716-446655440123",
      project_id: "550e8400-e29b-41d4-a716-446655440000",
      project_name: "Main App",
      service_id: "svc_123",
      service_name: "checkout-api",
      latest_deployment_id: null,
      environment: "production",
      fingerprint: "fp_123",
      fingerprint_version: "v1",
      title: "TypeError",
      severity: "high",
      status: "resolved",
      first_seen_at: "2026-03-11T00:00:00.000Z",
      last_seen_at: "2026-03-11T00:10:00.000Z",
      occurrence_count: 3,
      spike_detected_at: null,
      resolved_at: "2026-03-11T00:12:00.000Z",
      regressed_at: null,
      matched_fields: ["fingerprint"]
    });

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
          .mockResolvedValue({ member_id: "usr_123", organization_id: "org_123" })
      },
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue({
          incident_id: "550e8400-e29b-41d4-a716-446655440123",
          project_id: "550e8400-e29b-41d4-a716-446655440000",
          project_name: "Main App",
          service_id: "svc_123",
          service_name: "checkout-api",
          latest_deployment_id: null,
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
          resolved_at: null,
          regressed_at: null,
          matched_fields: ["fingerprint"]
        }),
        resolveIncidentForOrganization,
        listServicesForOrganization: vi.fn().mockResolvedValue([]),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
      },
      objectStoreReader: {
        getObject: vi.fn()
      },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/incidents/550e8400-e29b-41d4-a716-446655440123/resolve",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(resolveIncidentForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      incident_id: "550e8400-e29b-41d4-a716-446655440123",
      user_id: "usr_123",
      resolved_by_member_id: "usr_123",
      resolved_at: expect.any(String)
    });
    expect(response.json()).toEqual({
      incident: {
        incident_id: "550e8400-e29b-41d4-a716-446655440123",
        project_id: "550e8400-e29b-41d4-a716-446655440000",
        project_name: "Main App",
        service_id: "svc_123",
        service_name: "checkout-api",
        latest_deployment_id: null,
        environment: "production",
        fingerprint: "fp_123",
        fingerprint_version: "v1",
        title: "TypeError",
        severity: "high",
        status: "resolved",
        first_seen_at: "2026-03-11T00:00:00.000Z",
        last_seen_at: "2026-03-11T00:10:00.000Z",
        occurrence_count: 3,
        spike_detected_at: null,
        resolved_at: "2026-03-11T00:12:00.000Z",
        regressed_at: null,
        matched_fields: ["fingerprint"]
      }
    });
  });

  it("should reopen an incident for an authenticated member token", async (): Promise<void> => {
    const reopenIncidentForOrganization = vi.fn().mockResolvedValue({
      incident_id: "550e8400-e29b-41d4-a716-446655440123",
      project_id: "550e8400-e29b-41d4-a716-446655440000",
      project_name: "Main App",
      service_id: "svc_123",
      service_name: "checkout-api",
      latest_deployment_id: null,
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
      resolved_at: null,
      regressed_at: null,
      matched_fields: ["fingerprint"]
    });

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
          .mockResolvedValue({ member_id: "usr_123", organization_id: "org_123" })
      },
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue({
          incident_id: "550e8400-e29b-41d4-a716-446655440123",
          project_id: "550e8400-e29b-41d4-a716-446655440000",
          project_name: "Main App",
          service_id: "svc_123",
          service_name: "checkout-api",
          latest_deployment_id: null,
          environment: "production",
          fingerprint: "fp_123",
          fingerprint_version: "v1",
          title: "TypeError",
          severity: "high",
          status: "resolved",
          first_seen_at: "2026-03-11T00:00:00.000Z",
          last_seen_at: "2026-03-11T00:10:00.000Z",
          occurrence_count: 3,
          spike_detected_at: null,
          resolved_at: "2026-03-11T00:12:00.000Z",
          regressed_at: null,
          matched_fields: ["fingerprint"]
        }),
        resolveIncidentForOrganization: vi.fn(),
        reopenIncidentForOrganization,
        listServicesForOrganization: vi.fn().mockResolvedValue([]),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
      },
      objectStoreReader: {
        getObject: vi.fn()
      },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/incidents/550e8400-e29b-41d4-a716-446655440123/reopen",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(reopenIncidentForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      incident_id: "550e8400-e29b-41d4-a716-446655440123",
      user_id: "usr_123"
    });
    expect(response.json()).toEqual({
      incident: {
        incident_id: "550e8400-e29b-41d4-a716-446655440123",
        project_id: "550e8400-e29b-41d4-a716-446655440000",
        project_name: "Main App",
        service_id: "svc_123",
        service_name: "checkout-api",
        latest_deployment_id: null,
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
        resolved_at: null,
        regressed_at: null,
        matched_fields: ["fingerprint"]
      }
    });
  });

  it("should bulk resolve incidents for an authenticated member token", async (): Promise<void> => {
    const sharedIncidentId = "550e8400-e29b-41d4-a716-446655440101";
    const ownedIncidentId = "550e8400-e29b-41d4-a716-446655440102";
    const resolveIncidentsForOrganization = vi
      .fn()
      .mockImplementationOnce(
        async (input: { organization_id: string; incident_ids: string[] }) => [
          {
            incident_id: input.incident_ids[0]!,
            project_id: "550e8400-e29b-41d4-a716-446655440001",
            project_name: "Shared App",
            service_id: "svc_456",
            service_name: "checkout-api",
            latest_deployment_id: null,
            environment: "production",
            fingerprint: "fp_shared",
            fingerprint_version: "v1",
            title: "Shared incident",
            severity: "high",
            status: "resolved",
            first_seen_at: "2026-03-11T00:00:00.000Z",
            last_seen_at: "2026-03-11T00:10:00.000Z",
            occurrence_count: 3,
            spike_detected_at: null,
            resolved_at: "2026-03-11T00:12:00.000Z",
            regressed_at: null,
            matched_fields: ["fingerprint"]
          }
        ]
      )
      .mockImplementationOnce(
        async (input: { organization_id: string; incident_ids: string[] }) => [
          {
            incident_id: input.incident_ids[0]!,
            project_id: "550e8400-e29b-41d4-a716-446655440002",
            project_name: "Owned App",
            service_id: "svc_789",
            service_name: "payments-api",
            latest_deployment_id: null,
            environment: "production",
            fingerprint: "fp_owned",
            fingerprint_version: "v1",
            title: "Owned incident",
            severity: "medium",
            status: "resolved",
            first_seen_at: "2026-03-11T00:05:00.000Z",
            last_seen_at: "2026-03-11T00:15:00.000Z",
            occurrence_count: 2,
            spike_detected_at: null,
            resolved_at: "2026-03-11T00:12:00.000Z",
            regressed_at: null,
            matched_fields: ["fingerprint"]
          }
        ]
      );

    const resolveProjectAccessForUser = vi
      .fn()
      .mockResolvedValueOnce({
        project_id: "550e8400-e29b-41d4-a716-446655440001",
        organization_id: "org_shared"
      })
      .mockResolvedValueOnce(null);

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
          .mockResolvedValue({ member_id: "usr_123", organization_id: "org_123" })
      },
      tokenManagement: createTokenManagementDependency(),
      projectManagement: {
        listProjectsForOrganization: vi.fn().mockResolvedValue([]),
        createProjectForOrganization: vi.fn().mockResolvedValue(null),
        updateProjectForOrganization: vi.fn().mockResolvedValue(null),
        deleteProjectForOrganization: vi.fn().mockResolvedValue(null),
        resolveProjectAccessForUser
      },
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi
          .fn()
          .mockResolvedValueOnce({
            incident_id: sharedIncidentId,
            project_id: "550e8400-e29b-41d4-a716-446655440001",
            project_name: "Shared App",
            service_id: "svc_456",
            service_name: "checkout-api",
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
            matched_fields: ["fingerprint"]
          })
          .mockResolvedValueOnce({
            incident_id: ownedIncidentId,
            project_id: "550e8400-e29b-41d4-a716-446655440002",
            project_name: "Owned App",
            service_id: "svc_789",
            service_name: "payments-api",
            latest_deployment_id: null,
            environment: "production",
            fingerprint: "fp_owned",
            fingerprint_version: "v1",
            title: "Owned incident",
            severity: "medium",
            status: "regressed",
            first_seen_at: "2026-03-11T00:05:00.000Z",
            last_seen_at: "2026-03-11T00:15:00.000Z",
            occurrence_count: 2,
            spike_detected_at: null,
            resolved_at: null,
            regressed_at: "2026-03-11T00:11:00.000Z",
            matched_fields: ["fingerprint"]
          }),
        resolveIncidentForOrganization: vi.fn(),
        resolveIncidentsForOrganization,
        reopenIncidentForOrganization: vi.fn(),
        listServicesForOrganization: vi.fn().mockResolvedValue([]),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
      },
      objectStoreReader: {
        getObject: vi.fn()
      },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/incidents/resolve",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        incident_ids: [sharedIncidentId, ownedIncidentId, sharedIncidentId]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(resolveProjectAccessForUser).toHaveBeenNthCalledWith(1, {
      user_id: "usr_123",
      project_id: "550e8400-e29b-41d4-a716-446655440001"
    });
    expect(resolveProjectAccessForUser).toHaveBeenNthCalledWith(2, {
      user_id: "usr_123",
      project_id: "550e8400-e29b-41d4-a716-446655440002"
    });
    expect(resolveIncidentsForOrganization).toHaveBeenNthCalledWith(1, {
      organization_id: "org_shared",
      incident_ids: [sharedIncidentId],
      user_id: "usr_123",
      resolved_by_member_id: "usr_123",
      resolved_at: expect.any(String)
    });
    expect(resolveIncidentsForOrganization).toHaveBeenNthCalledWith(2, {
      organization_id: "org_123",
      incident_ids: [ownedIncidentId],
      user_id: "usr_123",
      resolved_by_member_id: "usr_123",
      resolved_at: expect.any(String)
    });
    expect(response.json()).toEqual({
      incidents: [
        expect.objectContaining({ incident_id: sharedIncidentId, status: "resolved" }),
        expect.objectContaining({ incident_id: ownedIncidentId, status: "resolved" })
      ]
    });
  });

  it("should bulk reopen incidents for an authenticated member token", async (): Promise<void> => {
    const firstIncidentId = "550e8400-e29b-41d4-a716-446655440201";
    const secondIncidentId = "550e8400-e29b-41d4-a716-446655440202";
    const reopenIncidentsForOrganization = vi.fn().mockResolvedValue([
      {
        incident_id: firstIncidentId,
        project_id: "550e8400-e29b-41d4-a716-446655440000",
        project_name: "Main App",
        service_id: "svc_123",
        service_name: "checkout-api",
        latest_deployment_id: null,
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
        resolved_at: null,
        regressed_at: null,
        matched_fields: ["fingerprint"]
      },
      {
        incident_id: secondIncidentId,
        project_id: "550e8400-e29b-41d4-a716-446655440000",
        project_name: "Main App",
        service_id: "svc_456",
        service_name: "payments-api",
        latest_deployment_id: null,
        environment: "production",
        fingerprint: "fp_456",
        fingerprint_version: "v1",
        title: "Payment timeout",
        severity: "medium",
        status: "open",
        first_seen_at: "2026-03-11T00:05:00.000Z",
        last_seen_at: "2026-03-11T00:15:00.000Z",
        occurrence_count: 2,
        spike_detected_at: null,
        resolved_at: null,
        regressed_at: null,
        matched_fields: ["fingerprint"]
      }
    ]);

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
          .mockResolvedValue({ member_id: "usr_123", organization_id: "org_123" })
      },
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi
          .fn()
          .mockResolvedValueOnce({
            incident_id: firstIncidentId,
            project_id: "550e8400-e29b-41d4-a716-446655440000",
            project_name: "Main App",
            service_id: "svc_123",
            service_name: "checkout-api",
            latest_deployment_id: null,
            environment: "production",
            fingerprint: "fp_123",
            fingerprint_version: "v1",
            title: "TypeError",
            severity: "high",
            status: "resolved",
            first_seen_at: "2026-03-11T00:00:00.000Z",
            last_seen_at: "2026-03-11T00:10:00.000Z",
            occurrence_count: 3,
            spike_detected_at: null,
            resolved_at: "2026-03-11T00:12:00.000Z",
            regressed_at: null,
            matched_fields: ["fingerprint"]
          })
          .mockResolvedValueOnce({
            incident_id: secondIncidentId,
            project_id: "550e8400-e29b-41d4-a716-446655440000",
            project_name: "Main App",
            service_id: "svc_456",
            service_name: "payments-api",
            latest_deployment_id: null,
            environment: "production",
            fingerprint: "fp_456",
            fingerprint_version: "v1",
            title: "Payment timeout",
            severity: "medium",
            status: "resolved",
            first_seen_at: "2026-03-11T00:05:00.000Z",
            last_seen_at: "2026-03-11T00:15:00.000Z",
            occurrence_count: 2,
            spike_detected_at: null,
            resolved_at: "2026-03-11T00:16:00.000Z",
            regressed_at: null,
            matched_fields: ["fingerprint"]
          }),
        resolveIncidentForOrganization: vi.fn(),
        reopenIncidentForOrganization: vi.fn(),
        reopenIncidentsForOrganization,
        listServicesForOrganization: vi.fn().mockResolvedValue([]),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
      },
      objectStoreReader: {
        getObject: vi.fn()
      },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/incidents/reopen",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        incident_ids: [firstIncidentId, secondIncidentId]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(reopenIncidentsForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      incident_ids: [firstIncidentId, secondIncidentId],
      user_id: "usr_123"
    });
    expect(response.json()).toEqual({
      incidents: [
        expect.objectContaining({ incident_id: firstIncidentId, status: "open" }),
        expect.objectContaining({ incident_id: secondIncidentId, status: "open" })
      ]
    });
  });
});
