import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetWorkerRuntimeMocks } from "../../helpers/worker-runtime-mocks.js";
import {
  createGitHubDispatchPublisher,
  createLifecycleWebhookPublisher,
  getIncidentStatusForDispatchEvent
} from "../../../apps/worker/src/runtime.js";

describe("worker delivery intents", () => {
  beforeEach(resetWorkerRuntimeMocks);

  it("should persist delivery intent and enqueue initial webhook job", async (): Promise<void> => {
    const listMatchingWebhooks = vi.fn().mockResolvedValue([
      {
        webhook_id: "wh_123",
        target_url: "https://hooks.example.test/debugbundle",
        signing_secret: "secret_123"
      }
    ]);
    const createDeliveryIntent = vi.fn().mockResolvedValue({ delivery_id: "del_123" });
    const recordMetricDeltas = vi.fn().mockResolvedValue("recorded");

    const publisher = createLifecycleWebhookPublisher({
      fallbackTargetUrl: null,
      fallbackSigningSecret: null,
      webhookDeliveryStore: { listMatchingWebhooks, createDeliveryIntent },
      accountAnalyticsStore: { recordMetricDeltas },
      resolveOrganizationIdForProject: vi.fn().mockResolvedValue("org_123")
    });

    await publisher.publish({
      event_type: "bundle.reopened",
      incident_id: "inc_123",
      project_id: "proj_123",
      occurred_at: "2026-03-11T00:00:00.000Z",
      service_name: "checkout-api",
      environment: "production",
      severity: "high"
    });

    expect(listMatchingWebhooks).toHaveBeenCalledWith({
      project_id: "proj_123",
      event_type: "bundle.reopened",
      environment: "production",
      service_name: "checkout-api",
      severity: "high"
    });
    expect(createDeliveryIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          event: "bundle.reopened",
          event_type: "bundle.reopened",
          incident_id: "inc_123",
          project_id: "proj_123",
          occurred_at: "2026-03-11T00:00:00.000Z",
          service: "checkout-api",
          environment: "production",
          severity: "high",
          bundle_type: "failure",
          verification: false,
          summary: null,
          links: {
            bundle: "/v1/incidents/inc_123/bundle",
            reproduction: "/v1/incidents/inc_123/reproduction"
          },
          regression_after_deploy: false,
          deploy_version: null,
          deploy_commit_sha: null,
          deploy_branch: null,
          deploy_deployed_at: null,
          minutes_since_deploy: null
        }
      })
    );
    expect(recordMetricDeltas).toHaveBeenCalledWith({
      organization_id: "org_123",
      occurred_at: "2026-03-11T00:00:00.000Z",
      source: "webhook_delivery_created",
      dedupe_key: "webhook_delivery_created:del_123",
      deltas: {
        webhook_deliveries_created: 1
      }
    });
  });

  it("should skip lifecycle webhook intents when the monthly webhook quota is exhausted", async (): Promise<void> => {
    const listMatchingWebhooks = vi.fn().mockResolvedValue([
      {
        webhook_id: "wh_123",
        target_url: "https://hooks.example.test/debugbundle",
        signing_secret: "secret_123"
      }
    ]);
    const createDeliveryIntent = vi.fn();
    const queueProjectOperationalEmailDelivery = vi
      .fn()
      .mockResolvedValue({ delivery_id: "op_123", created: true });

    const publisher = createLifecycleWebhookPublisher({
      fallbackTargetUrl: null,
      fallbackSigningSecret: null,
      webhookDeliveryStore: { listMatchingWebhooks, createDeliveryIntent },
      operationalEmailDeliveryStore: { queueProjectOperationalEmailDelivery },
      billingStore: {
        getBillingSummaryForProject: vi.fn().mockResolvedValue({
          usage_window: {
            starts_at: "2026-03-01T00:00:00.000Z",
            ends_at: "2026-04-01T00:00:00.000Z"
          },
          allowances: {
            monthly_webhook_deliveries: { used: 100, limit: 100 }
          }
        })
      }
    });

    await publisher.publish({
      event_type: "bundle.created",
      incident_id: "inc_123",
      project_id: "proj_123",
      occurred_at: "2026-03-11T00:00:00.000Z",
      service_name: "checkout-api",
      environment: "production",
      severity: "high"
    });

    expect(createDeliveryIntent).not.toHaveBeenCalled();
    expect(queueProjectOperationalEmailDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "proj_123",
        kind: "allowance_limit_reached"
      })
    );
  });

  it("should queue webhook allowance threshold notifications when lifecycle deliveries cross 80 percent", async (): Promise<void> => {
    const listMatchingWebhooks = vi.fn().mockResolvedValue([
      {
        webhook_id: "wh_123",
        target_url: "https://hooks.example.test/debugbundle",
        signing_secret: "secret_123"
      }
    ]);
    const createDeliveryIntent = vi.fn().mockResolvedValue({ delivery_id: "del_123" });
    const queueProjectOperationalEmailDelivery = vi
      .fn()
      .mockResolvedValue({ delivery_id: "op_123", created: true });

    const publisher = createLifecycleWebhookPublisher({
      fallbackTargetUrl: null,
      fallbackSigningSecret: null,
      webhookDeliveryStore: { listMatchingWebhooks, createDeliveryIntent },
      operationalEmailDeliveryStore: { queueProjectOperationalEmailDelivery },
      billingStore: {
        getBillingSummaryForProject: vi.fn().mockResolvedValue({
          usage_window: {
            starts_at: "2026-03-01T00:00:00.000Z",
            ends_at: "2026-04-01T00:00:00.000Z"
          },
          allowances: {
            monthly_webhook_deliveries: { used: 79, limit: 100 }
          }
        })
      }
    });

    await publisher.publish({
      event_type: "bundle.created",
      incident_id: "inc_123",
      project_id: "proj_123",
      occurred_at: "2026-03-11T00:00:00.000Z",
      service_name: "checkout-api",
      environment: "production",
      severity: "high"
    });

    expect(createDeliveryIntent).toHaveBeenCalledOnce();
    expect(queueProjectOperationalEmailDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "proj_123",
        kind: "allowance_warning_80"
      })
    );
  });

  it("should persist github dispatch intent when a rule matches", async (): Promise<void> => {
    const listMatchingGitHubDispatchRules = vi.fn().mockResolvedValue([
      {
        rule_id: "ghr_123",
        rule_name: "High severity incidents",
        installation_id: 99,
        repo_owner: "debugbundle",
        repo_name: "app",
        default_branch: "main",
        cooldown_seconds: 300
      }
    ]);
    const hasRecentGitHubDispatch = vi.fn().mockResolvedValue(false);
    const countProjectGitHubDispatchesSince = vi.fn().mockResolvedValue(1);
    const countInstallationGitHubDispatchesSince = vi.fn().mockResolvedValue(25);
    const createGitHubDispatchDeliveryIntent = vi
      .fn()
      .mockResolvedValue({ delivery_id: "gdd_123", created: true });
    const createSkippedGitHubDispatchDelivery = vi.fn();
    const recordMetricDeltas = vi.fn().mockResolvedValue("recorded");

    const publisher = createGitHubDispatchPublisher({
      githubStore: {
        listMatchingGitHubDispatchRules,
        hasRecentGitHubDispatch,
        countProjectGitHubDispatchesSince,
        countInstallationGitHubDispatchesSince,
        createGitHubDispatchDeliveryIntent,
        createSkippedGitHubDispatchDelivery
      },
      accountAnalyticsStore: { recordMetricDeltas },
      resolveOrganizationIdForProject: vi.fn().mockResolvedValue("org_123")
    });

    await publisher.publish({
      event_type: "bundle.created",
      incident_id: "inc_123",
      project_id: "proj_123",
      occurred_at: "2026-03-11T00:00:00.000Z",
      service_name: "checkout-api",
      environment: "production",
      severity: "high",
      bundle_type: "failure",
      title: "TypeError in checkout",
      occurrence_count: 12,
      first_seen_at: "2026-03-10T23:00:00.000Z",
      bundle_version: 3
    });

    expect(listMatchingGitHubDispatchRules).toHaveBeenCalledWith({
      project_id: "proj_123",
      event_type: "bundle.created",
      environment: "production",
      service_name: "checkout-api",
      severity: "high",
      bundle_type: "failure",
      incident_status: "new_or_reopened"
    });
    expect(createGitHubDispatchDeliveryIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        rule_id: "ghr_123",
        rule_name: "High severity incidents",
        project_id: "proj_123",
        incident_id: "inc_123",
        improvement_id: null,
        target_fingerprint: "inc_123:bundle.created",
        dedupe_key: "bundle.created:3",
        installation_id: 99,
        repo_owner: "debugbundle",
        repo_name: "app",
        dispatch_payload: {
          debugbundle_event: "bundle.created",
          incident_id: "inc_123",
          improvement_id: null,
          bundle_type: "failure",
          bundle_version: 3,
          severity: "high",
          service: "checkout-api",
          environment: "production",
          title: "TypeError in checkout",
          links: {
            bundle: "/v1/incidents/inc_123/bundle",
            reproduction: "/v1/incidents/inc_123/reproduction",
            dashboard: "/incidents/inc_123"
          },
          debugbundle: {
            project_id: "proj_123",
            occurrence_count: 12,
            first_seen_at: "2026-03-10T23:00:00.000Z"
          }
        }
      })
    );
    expect(recordMetricDeltas).toHaveBeenCalledWith({
      organization_id: "org_123",
      occurred_at: "2026-03-11T00:00:00.000Z",
      source: "github_dispatch_created",
      dedupe_key: "github_dispatch_created:gdd_123",
      deltas: {
        github_dispatches_created: 1
      }
    });
  });

  it("should classify github dispatch event statuses and skip publishes during cooldown or quota limits", async (): Promise<void> => {
    expect(getIncidentStatusForDispatchEvent("bundle.created")).toBe("new_or_reopened");
    expect(getIncidentStatusForDispatchEvent("bundle.reopened")).toBe("new_or_reopened");
    expect(getIncidentStatusForDispatchEvent("incident.spike_detected")).toBe("new_or_reopened");
    expect(getIncidentStatusForDispatchEvent("improvement_bundle.created")).toBe("new_or_reopened");

    const baseRule = {
      rule_id: "ghr_123",
      rule_name: "High severity incidents",
      installation_id: 99,
      repo_owner: "debugbundle",
      repo_name: "app",
      default_branch: "main",
      cooldown_seconds: 300
    };
    const createGitHubDispatchDeliveryIntent = vi.fn();
    const createSkippedGitHubDispatchDelivery = vi
      .fn()
      .mockResolvedValue({ delivery_id: "gdd_skipped", created: true });
    const listMatchingGitHubDispatchRules = vi.fn().mockResolvedValue([baseRule]);

    const cooldownPublisher = createGitHubDispatchPublisher({
      githubStore: {
        listMatchingGitHubDispatchRules,
        hasRecentGitHubDispatch: vi.fn().mockResolvedValue(true),
        countProjectGitHubDispatchesSince: vi.fn().mockResolvedValue(0),
        countInstallationGitHubDispatchesSince: vi.fn().mockResolvedValue(0),
        createGitHubDispatchDeliveryIntent,
        createSkippedGitHubDispatchDelivery
      }
    });

    await cooldownPublisher.publish({
      event_type: "bundle.created",
      incident_id: "inc_123",
      project_id: "proj_123",
      occurred_at: "2026-03-11T00:00:00.000Z",
      service_name: "checkout-api",
      environment: "production",
      severity: "high"
    });

    const projectQuotaPublisher = createGitHubDispatchPublisher({
      githubStore: {
        listMatchingGitHubDispatchRules,
        hasRecentGitHubDispatch: vi.fn().mockResolvedValue(false),
        countProjectGitHubDispatchesSince: vi.fn().mockResolvedValue(100),
        countInstallationGitHubDispatchesSince: vi.fn().mockResolvedValue(0),
        createGitHubDispatchDeliveryIntent,
        createSkippedGitHubDispatchDelivery
      }
    });

    await projectQuotaPublisher.publish({
      event_type: "bundle.created",
      incident_id: "inc_124",
      project_id: "proj_123",
      occurred_at: "2026-03-11T00:00:00.000Z",
      service_name: "checkout-api",
      environment: "production",
      severity: "high"
    });

    const installationQuotaPublisher = createGitHubDispatchPublisher({
      githubStore: {
        listMatchingGitHubDispatchRules,
        hasRecentGitHubDispatch: vi.fn().mockResolvedValue(false),
        countProjectGitHubDispatchesSince: vi.fn().mockResolvedValue(0),
        countInstallationGitHubDispatchesSince: vi.fn().mockResolvedValue(4000),
        createGitHubDispatchDeliveryIntent,
        createSkippedGitHubDispatchDelivery
      }
    });

    await installationQuotaPublisher.publish({
      event_type: "bundle.created",
      incident_id: "inc_125",
      project_id: "proj_123",
      occurred_at: "2026-03-11T00:00:00.000Z",
      service_name: "checkout-api",
      environment: "production",
      severity: "high"
    });

    expect(createGitHubDispatchDeliveryIntent).not.toHaveBeenCalled();
    expect(createSkippedGitHubDispatchDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        incident_id: "inc_124",
        reason: "project_hourly_rate_limited"
      })
    );
    expect(createSkippedGitHubDispatchDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        incident_id: "inc_125",
        reason: "installation_hourly_rate_limited"
      })
    );
  });

  it("should persist github dispatch intent for improvement bundles", async (): Promise<void> => {
    const listMatchingGitHubDispatchRules = vi.fn().mockResolvedValue([
      {
        rule_id: "ghr_123",
        rule_name: "Hosted improvements",
        installation_id: 99,
        repo_owner: "debugbundle",
        repo_name: "app",
        default_branch: "main",
        cooldown_seconds: 300
      }
    ]);
    const hasRecentGitHubDispatch = vi.fn().mockResolvedValue(false);
    const countProjectGitHubDispatchesSince = vi.fn().mockResolvedValue(1);
    const countInstallationGitHubDispatchesSince = vi.fn().mockResolvedValue(25);
    const createGitHubDispatchDeliveryIntent = vi
      .fn()
      .mockResolvedValue({ delivery_id: "gdd_123", created: true });
    const createSkippedGitHubDispatchDelivery = vi.fn();

    const publisher = createGitHubDispatchPublisher({
      githubStore: {
        listMatchingGitHubDispatchRules,
        hasRecentGitHubDispatch,
        countProjectGitHubDispatchesSince,
        countInstallationGitHubDispatchesSince,
        createGitHubDispatchDeliveryIntent,
        createSkippedGitHubDispatchDelivery
      }
    });

    await publisher.publish({
      event_type: "improvement_bundle.created",
      improvement_id: "imp_123",
      project_id: "proj_123",
      occurred_at: "2026-03-11T00:00:00.000Z",
      service_name: "checkout-api",
      environment: "production",
      severity: "medium",
      bundle_type: "improvement",
      title: "Repeated warning hotspot",
      occurrence_count: 7,
      first_seen_at: "2026-03-10T23:00:00.000Z",
      bundle_version: 2
    });

    expect(listMatchingGitHubDispatchRules).toHaveBeenCalledWith({
      project_id: "proj_123",
      event_type: "improvement_bundle.created",
      environment: "production",
      service_name: "checkout-api",
      severity: "medium",
      bundle_type: "improvement",
      incident_status: "new_or_reopened"
    });
    expect(createGitHubDispatchDeliveryIntent).toHaveBeenCalledWith({
      rule_id: "ghr_123",
      rule_name: "Hosted improvements",
      project_id: "proj_123",
      incident_id: null,
      improvement_id: "imp_123",
      target_fingerprint: "imp_123:improvement_bundle.created",
      dedupe_key: "improvement_bundle.created:2",
      installation_id: 99,
      repo_owner: "debugbundle",
      repo_name: "app",
      dispatch_payload: {
        debugbundle_event: "improvement_bundle.created",
        incident_id: null,
        improvement_id: "imp_123",
        bundle_type: "improvement",
        bundle_version: 2,
        severity: "medium",
        service: "checkout-api",
        environment: "production",
        title: "Repeated warning hotspot",
        links: {
          bundle: "/v1/projects/proj_123/improvements/imp_123/bundle",
          reproduction: null,
          dashboard: "/projects/proj_123/improvements/imp_123"
        },
        debugbundle: {
          project_id: "proj_123",
          occurrence_count: 7,
          first_seen_at: "2026-03-10T23:00:00.000Z"
        }
      }
    });
  });

  it("should derive github dispatch dedupe keys from occurred_at when bundle version is absent", async (): Promise<void> => {
    const listMatchingGitHubDispatchRules = vi.fn().mockResolvedValue([
      {
        rule_id: "ghr_123",
        rule_name: "Spike detector",
        installation_id: 99,
        repo_owner: "debugbundle",
        repo_name: "app",
        default_branch: "main",
        cooldown_seconds: 300
      }
    ]);
    const hasRecentGitHubDispatch = vi.fn().mockResolvedValue(false);
    const countProjectGitHubDispatchesSince = vi.fn().mockResolvedValue(1);
    const countInstallationGitHubDispatchesSince = vi.fn().mockResolvedValue(25);
    const createGitHubDispatchDeliveryIntent = vi
      .fn()
      .mockResolvedValue({ delivery_id: "gdd_123", created: true });
    const createSkippedGitHubDispatchDelivery = vi.fn();

    const publisher = createGitHubDispatchPublisher({
      githubStore: {
        listMatchingGitHubDispatchRules,
        hasRecentGitHubDispatch,
        countProjectGitHubDispatchesSince,
        countInstallationGitHubDispatchesSince,
        createGitHubDispatchDeliveryIntent,
        createSkippedGitHubDispatchDelivery
      }
    });

    await publisher.publish({
      event_type: "incident.spike_detected",
      incident_id: "inc_123",
      project_id: "proj_123",
      occurred_at: "2026-03-11T00:00:00.000Z",
      service_name: "checkout-api",
      environment: "production",
      severity: "high"
    });

    expect(createGitHubDispatchDeliveryIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        rule_name: "Spike detector",
        dedupe_key: "incident.spike_detected:2026-03-11T00:00:00.000Z"
      })
    );
  });

  it("should persist deploy correlation fields for reopened lifecycle payloads", async (): Promise<void> => {
    const listMatchingWebhooks = vi.fn().mockResolvedValue([
      {
        webhook_id: "wh_123",
        target_url: "https://hooks.example.test/debugbundle",
        signing_secret: "secret_123"
      }
    ]);
    const createDeliveryIntent = vi.fn().mockResolvedValue({ delivery_id: "del_123" });

    const publisher = createLifecycleWebhookPublisher({
      fallbackTargetUrl: null,
      fallbackSigningSecret: null,
      webhookDeliveryStore: { listMatchingWebhooks, createDeliveryIntent }
    });

    await publisher.publish({
      event_type: "bundle.reopened",
      incident_id: "inc_123",
      project_id: "proj_123",
      occurred_at: "2026-03-11T01:30:00.000Z",
      service_name: "checkout-api",
      environment: "production",
      severity: "high",
      regression_deploy: {
        deployment_id: "dep_123",
        commit_sha: "abc123def456",
        version: "v2.4.0",
        branch: "main",
        deployed_at: "2026-03-10T23:30:00.000Z",
        minutes_since_deploy: 120
      }
    });

    expect(createDeliveryIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          event: "bundle.reopened",
          event_type: "bundle.reopened",
          incident_id: "inc_123",
          project_id: "proj_123",
          occurred_at: "2026-03-11T01:30:00.000Z",
          service: "checkout-api",
          environment: "production",
          severity: "high",
          bundle_type: "failure",
          verification: false,
          summary: null,
          links: {
            bundle: "/v1/incidents/inc_123/bundle",
            reproduction: "/v1/incidents/inc_123/reproduction"
          },
          regression_after_deploy: true,
          deploy_version: "v2.4.0",
          deploy_commit_sha: "abc123def456",
          deploy_branch: "main",
          deploy_deployed_at: "2026-03-10T23:30:00.000Z",
          minutes_since_deploy: 120
        }
      })
    );
  });

  it("should use fallback webhook target when no matching webhooks exist", async (): Promise<void> => {
    const listMatchingWebhooks = vi.fn().mockResolvedValue([]);
    const createDeliveryIntent = vi.fn().mockResolvedValue({ delivery_id: "del_123" });

    const publisher = createLifecycleWebhookPublisher({
      fallbackTargetUrl: "https://fallback.example.test/webhook",
      fallbackSigningSecret: "fallback_secret",
      webhookDeliveryStore: { listMatchingWebhooks, createDeliveryIntent }
    });

    await publisher.publish({
      event_type: "incident.spike_detected",
      incident_id: "inc_123",
      project_id: "proj_123",
      occurred_at: "2026-03-11T00:00:00.000Z",
      service_name: "checkout-api",
      environment: "production",
      severity: "high"
    });

    expect(createDeliveryIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        target_url: "https://fallback.example.test/webhook",
        signing_secret: "fallback_secret"
      })
    );
  });

  it("should skip delivery intent creation when no matching webhook and no fallback", async (): Promise<void> => {
    const listMatchingWebhooks = vi.fn().mockResolvedValue([]);
    const createDeliveryIntent = vi.fn().mockResolvedValue({ delivery_id: "del_123" });

    const publisher = createLifecycleWebhookPublisher({
      fallbackTargetUrl: null,
      fallbackSigningSecret: null,
      webhookDeliveryStore: { listMatchingWebhooks, createDeliveryIntent }
    });

    await publisher.publish({
      event_type: "incident.spike_detected",
      incident_id: "inc_123",
      project_id: "proj_123",
      occurred_at: "2026-03-11T00:00:00.000Z",
      service_name: "checkout-api",
      environment: "production",
      severity: "high"
    });

    expect(createDeliveryIntent).not.toHaveBeenCalled();
  });
});
