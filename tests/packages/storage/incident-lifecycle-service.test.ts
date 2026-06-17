import { describe, expect, it, vi } from "vitest";

import { createIncidentLifecycleService } from "../../../packages/storage/src/incident-lifecycle-service.js";
import type { IncidentRetrievalRecord } from "../../../packages/storage/src/types.js";

function createResolvedIncident(overrides: Partial<IncidentRetrievalRecord> = {}): IncidentRetrievalRecord {
  return {
    incident_id: "inc_123",
    project_id: "proj_123",
    project_name: "Checkout",
    project_color_tag: null,
    service_id: "svc_123",
    service_name: "api",
    latest_deployment_id: null,
    environment: "production",
    fingerprint: "fp_123",
    fingerprint_version: "v1",
    title: "TypeError in checkout",
    severity: "high",
    status: "resolved",
    first_seen_at: "2026-05-18T10:00:00.000Z",
    last_seen_at: "2026-05-18T10:05:00.000Z",
    occurrence_count: 3,
    spike_detected_at: null,
    resolved_at: "2026-05-18T10:06:00.000Z",
    regressed_at: null,
    matched_fields: ["fingerprint"],
    ...overrides
  };
}

function createIncidentResolutionStore(overrides: Partial<Parameters<typeof createIncidentLifecycleService>[0]["incidentStore"]> = {}) {
  return {
    resolveIncidentForOrganization: vi.fn(),
    resolveIncidentsForOrganization: vi.fn(),
    reopenIncidentForOrganization: vi.fn(),
    reopenIncidentsForOrganization: vi.fn(),
    ...overrides
  };
}

describe("incident lifecycle service", () => {
  it("does not create bundle.resolved webhook intents when the monthly webhook quota is exhausted", async (): Promise<void> => {
    const incident = createResolvedIncident();
    const resolveIncidentForOrganization = vi.fn().mockResolvedValue(incident);
    const listMatchingWebhooks = vi.fn().mockResolvedValue([
      {
        webhook_id: "wh_123",
        target_url: "https://hooks.example.test/debugbundle",
        signing_secret: "whsec_123"
      }
    ]);
    const createDeliveryIntent = vi.fn();
    const getBillingSummaryForProject = vi.fn().mockResolvedValue({
      plan: "free",
      stripe_customer_id: null,
      active_projects: 1,
      capacity_units: {
        total: 1,
        included: 1,
        additional_purchased: 0,
        pending_reduction: null
      },
      usage_window: {
        starts_at: "2026-05-01T00:00:00.000Z",
        ends_at: "2026-06-01T00:00:00.000Z"
      },
      allowances: {
        monthly_bundle_requests: { used: 0, limit: 25 },
        monthly_raw_ingested_events: { used: 0, limit: 750 },
        retained_bundle_cap: { used: 0, limit: 5 },
        monthly_remote_activations: { used: 0, limit: 0 },
        monthly_alert_deliveries: { used: 0, limit: 25 },
        monthly_webhook_deliveries: { used: 100, limit: 100 }
      }
    });

    const service = createIncidentLifecycleService({
      incidentStore: createIncidentResolutionStore({
        resolveIncidentForOrganization
      }),
      webhookDeliveryStore: {
        listMatchingWebhooks,
        createDeliveryIntent
      },
      fallbackTargetUrl: null,
      fallbackSigningSecret: null,
      billingStore: {
        getBillingSummaryForProject
      }
    });

    const result = await service.resolveIncidentForOrganization({
      organization_id: "org_123",
      incident_id: incident.incident_id,
      resolved_by_member_id: "mem_123",
      resolved_at: incident.resolved_at!
    });

    expect(result).toEqual(incident);
    expect(listMatchingWebhooks).toHaveBeenCalledOnce();
    expect(getBillingSummaryForProject).toHaveBeenCalledWith({
      project_id: incident.project_id,
      now: expect.any(String)
    });
    expect(createDeliveryIntent).not.toHaveBeenCalled();
  });

  it("creates bundle.resolved webhook intents when allowance remains", async (): Promise<void> => {
    const incident = createResolvedIncident();
    const createDeliveryIntent = vi.fn().mockResolvedValue({ delivery_id: "del_123" });
    const recordMetricDeltas = vi.fn().mockResolvedValue("recorded");

    const service = createIncidentLifecycleService({
      incidentStore: createIncidentResolutionStore({
        resolveIncidentForOrganization: vi.fn().mockResolvedValue(incident),
      }),
      accountAnalyticsStore: {
        recordMetricDeltas
      },
      webhookDeliveryStore: {
        listMatchingWebhooks: vi.fn().mockResolvedValue([
          {
            webhook_id: "wh_123",
            target_url: "https://hooks.example.test/debugbundle",
            signing_secret: "whsec_123"
          }
        ]),
        createDeliveryIntent
      },
      fallbackTargetUrl: null,
      fallbackSigningSecret: null,
      billingStore: {
        getBillingSummaryForProject: vi.fn().mockResolvedValue({
          plan: "solo",
          stripe_customer_id: null,
          active_projects: 1,
          capacity_units: {
            total: 3,
            included: 3,
            additional_purchased: 0,
            pending_reduction: null
          },
          usage_window: {
            starts_at: "2026-05-01T00:00:00.000Z",
            ends_at: "2026-06-01T00:00:00.000Z"
          },
          allowances: {
            monthly_bundle_requests: { used: 0, limit: 750 },
            monthly_raw_ingested_events: { used: 0, limit: 10500 },
            retained_bundle_cap: { used: 0, limit: 450 },
            monthly_remote_activations: { used: 0, limit: 75 },
            monthly_alert_deliveries: { used: 0, limit: 225 },
            monthly_webhook_deliveries: { used: 10, limit: 750 }
          }
        })
      }
    });

    await service.resolveIncidentForOrganization({
      organization_id: "org_123",
      incident_id: incident.incident_id,
      resolved_by_member_id: "mem_123",
      resolved_at: incident.resolved_at!
    });

    expect(createDeliveryIntent).toHaveBeenCalledWith({
      webhook_id: "wh_123",
      project_id: incident.project_id,
      incident_id: incident.incident_id,
      event_type: "bundle.resolved",
      occurred_at: incident.resolved_at,
      target_url: "https://hooks.example.test/debugbundle",
      signing_secret: "whsec_123",
      payload: expect.objectContaining({
        event: "bundle.resolved",
        event_type: "bundle.resolved",
        incident_id: incident.incident_id,
        project_id: incident.project_id
      })
    });
    expect(recordMetricDeltas).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        organization_id: "org_123",
        source: "incident_resolved",
        deltas: {
          incidents_resolved: 1
        }
      })
    );
    expect(recordMetricDeltas).toHaveBeenNthCalledWith(2, {
      organization_id: "org_123",
      occurred_at: incident.resolved_at!,
      source: "webhook_delivery_created",
      dedupe_key: "webhook_delivery_created:del_123",
      deltas: {
        webhook_deliveries_created: 1
      }
    });
  });

  it("auto-resolves incident-derived improvements after resolving the related incident", async (): Promise<void> => {
    const incident = createResolvedIncident();
    const resolveIncidentDerivedImprovementsForIncident = vi.fn().mockResolvedValue(1);

    const service = createIncidentLifecycleService({
      incidentStore: createIncidentResolutionStore({
        resolveIncidentForOrganization: vi.fn().mockResolvedValue(incident),
      }),
      improvementStore: {
        resolveIncidentDerivedImprovementsForIncident
      },
      webhookDeliveryStore: {
        listMatchingWebhooks: vi.fn().mockResolvedValue([]),
        createDeliveryIntent: vi.fn()
      },
      fallbackTargetUrl: null,
      fallbackSigningSecret: null
    });

    await service.resolveIncidentForOrganization({
      organization_id: "org_123",
      incident_id: incident.incident_id,
      resolved_by_member_id: "mem_123",
      resolved_at: incident.resolved_at!
    });

    expect(resolveIncidentDerivedImprovementsForIncident).toHaveBeenCalledWith({
      organization_id: "org_123",
      incident_id: incident.incident_id,
      resolved_by_member_id: "mem_123",
      resolved_at: incident.resolved_at
    });
  });

  it("keeps incident resolution successful when derived improvement cleanup fails", async (): Promise<void> => {
    const incident = createResolvedIncident();
    const service = createIncidentLifecycleService({
      incidentStore: createIncidentResolutionStore({
        resolveIncidentForOrganization: vi.fn().mockResolvedValue(incident),
      }),
      improvementStore: {
        resolveIncidentDerivedImprovementsForIncident: vi.fn().mockRejectedValue(new Error("cleanup_failed"))
      },
      webhookDeliveryStore: {
        listMatchingWebhooks: vi.fn().mockResolvedValue([]),
        createDeliveryIntent: vi.fn()
      },
      fallbackTargetUrl: null,
      fallbackSigningSecret: null
    });

    await expect(
      service.resolveIncidentForOrganization({
        organization_id: "org_123",
        incident_id: incident.incident_id,
        resolved_by_member_id: "mem_123",
        resolved_at: incident.resolved_at!
      })
    ).resolves.toEqual(incident);
  });

  it("records reopen metrics when a resolved incident is reopened", async (): Promise<void> => {
    const reopenedIncident = createResolvedIncident({
      status: "open",
      resolved_at: null
    });
    const recordMetricDeltas = vi.fn().mockResolvedValue("recorded");
    const service = createIncidentLifecycleService({
      incidentStore: createIncidentResolutionStore({
        reopenIncidentForOrganization: vi.fn().mockResolvedValue(reopenedIncident)
      }),
      accountAnalyticsStore: {
        recordMetricDeltas
      },
      webhookDeliveryStore: {
        listMatchingWebhooks: vi.fn().mockResolvedValue([]),
        createDeliveryIntent: vi.fn()
      },
      fallbackTargetUrl: null,
      fallbackSigningSecret: null
    });

    const result = await service.reopenIncidentForOrganization({
      organization_id: "org_123",
      incident_id: reopenedIncident.incident_id
    });

    expect(result).toEqual(reopenedIncident);
    expect(recordMetricDeltas).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org_123",
        source: "incident_reopened",
        deltas: {
          incidents_reopened: 1
        }
      })
    );
  });
});
