import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import { processNextEvaluateAlertsJob, processNextGroupIncidentJob } from "../../../apps/worker/src/processor.js";
import { createAlertTransport } from "../../../apps/worker/src/runtime.js";

const SlackAlertBodySchema = z
  .object({
    text: z.string(),
    blocks: z.array(z.object({ type: z.string() }).passthrough())
  })
  .passthrough();

const DiscordAlertBodySchema = z
  .object({
    content: z.string(),
    embeds: z.array(z.object({ title: z.string() }).passthrough())
  })
  .passthrough();

function getJsonRequestBody(fetchSpy: ReturnType<typeof vi.fn>): unknown {
  const calls = fetchSpy.mock.calls as Array<[string, RequestInit | undefined]>;
  const body = calls[0]?.[1]?.body;
  if (typeof body !== "string") {
    throw new Error("Expected JSON string request body");
  }

  return JSON.parse(body) as unknown;
}

describe("worker alert evaluation", () => {
  it("enqueues new-incident and severity-threshold alert evaluations for first occurrences", async (): Promise<void> => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const alertEnqueue = vi.fn().mockResolvedValue(undefined);

    const result = await processNextGroupIncidentJob({
      queue: {
        enqueue,
        dequeue: vi.fn().mockResolvedValue({
          project_id: "proj_123",
          event_id: "evt_123",
          event_type: "backend_exception",
          service_name: "checkout-api",
          environment: "production",
          fingerprint: "fp_123",
          normalized_message: "boom",
          occurred_at: "2026-03-15T12:00:00.000Z",
          severity: "high"
        })
      },
      alertEvaluationQueue: {
        enqueue: alertEnqueue
      },
      incidentStore: {
        upsertIncident: vi.fn().mockResolvedValue({
          incident_id: "inc_123",
          matched_fields: ["normalized_message"],
          status: "open",
          regressed_now: false,
          occurrence_count: 1
        }),
        insertIncidentEvent: vi.fn().mockResolvedValue(undefined),
        markIncidentSpiking: vi.fn().mockResolvedValue(false)
      },
      frequencyCounter: {
        recordOccurrence: vi.fn().mockResolvedValue({
          occurrences_1m: 1,
          occurrences_5m: 1,
          occurrences_1h: 1,
          occurrences_24h: 1,
          baseline_1h_per_5m: 0,
          spike_ratio_5m_to_1h: 1,
          has_sufficient_baseline: false,
          is_spiking: false
        })
      },
      lifecycleWebhookPublisher: {
        publish: vi.fn().mockResolvedValue(undefined)
      }
    });

    expect(result).toEqual({ processed: true });
    expect(enqueue).toHaveBeenNthCalledWith(1, "build-bundle", {
      project_id: "proj_123",
      incident_id: "inc_123",
      event_id: "evt_123",
      occurred_at: "2026-03-15T12:00:00.000Z",
      occurrence_count: 1,
      trigger: "occurrence_threshold"
    });
    expect(alertEnqueue).toHaveBeenNthCalledWith(1, "evaluate-alerts", {
      project_id: "proj_123",
      incident_id: "inc_123",
      condition_type: "new_incident",
      dedupe_key: "new_incident",
      occurred_at: "2026-03-15T12:00:00.000Z",
      service_name: "checkout-api",
      environment: "production",
      severity: "high"
    });
    expect(alertEnqueue).toHaveBeenNthCalledWith(2, "evaluate-alerts", {
      project_id: "proj_123",
      incident_id: "inc_123",
      condition_type: "severity_threshold",
      dedupe_key: "severity_threshold:high",
      occurred_at: "2026-03-15T12:00:00.000Z",
      service_name: "checkout-api",
      environment: "production",
      severity: "high"
    });
  });

  it("enqueues regression and spike alert evaluations from real incident transitions", async (): Promise<void> => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const alertEnqueue = vi.fn().mockResolvedValue(undefined);
    const publish = vi.fn().mockResolvedValue(undefined);

    const result = await processNextGroupIncidentJob({
      queue: {
        enqueue,
        dequeue: vi.fn().mockResolvedValue({
          project_id: "proj_123",
          event_id: "evt_456",
          event_type: "backend_exception",
          service_name: "checkout-api",
          environment: "production",
          fingerprint: "fp_456",
          normalized_message: "boom again",
          occurred_at: "2026-03-15T13:00:00.000Z",
          severity: "critical"
        })
      },
      alertEvaluationQueue: {
        enqueue: alertEnqueue
      },
      incidentStore: {
        upsertIncident: vi.fn().mockResolvedValue({
          incident_id: "inc_456",
          matched_fields: ["normalized_message"],
          status: "regressed",
          regressed_now: true,
          occurrence_count: 4,
          regression_deploy: {
            deployment_id: "dep_123",
            commit_sha: "abc123",
            version: "v2.5.0",
            branch: "main",
            deployed_at: "2026-03-15T11:00:00.000Z",
            minutes_since_deploy: 120
          }
        }),
        insertIncidentEvent: vi.fn().mockResolvedValue(undefined),
        markIncidentSpiking: vi.fn().mockResolvedValue(true)
      },
      frequencyCounter: {
        recordOccurrence: vi.fn().mockResolvedValue({
          occurrences_1m: 20,
          occurrences_5m: 45,
          occurrences_1h: 15,
          occurrences_24h: 60,
          baseline_1h_per_5m: 10,
          spike_ratio_5m_to_1h: 4.5,
          has_sufficient_baseline: true,
          is_spiking: true
        })
      },
      lifecycleWebhookPublisher: {
        publish
      }
    });

    expect(result).toEqual({ processed: true });
    expect(alertEnqueue).toHaveBeenCalledWith("evaluate-alerts", expect.objectContaining({
      incident_id: "inc_456",
      condition_type: "incident_regressed",
      dedupe_key: "incident_regressed"
    }));
    expect(alertEnqueue).toHaveBeenCalledWith("evaluate-alerts", expect.objectContaining({
      incident_id: "inc_456",
      condition_type: "regression_after_deploy",
      dedupe_key: "regression_after_deploy"
    }));
    expect(alertEnqueue).toHaveBeenCalledWith("evaluate-alerts", expect.objectContaining({
      incident_id: "inc_456",
      condition_type: "error_spike",
      dedupe_key: "error_spike"
    }));
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ event_type: "bundle.reopened" }));
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ event_type: "incident.spike_detected" }));
  });

  it("creates one delivery intent per matching alert and skips already-created duplicates", async (): Promise<void> => {
    const listMatchingAlerts = vi.fn().mockResolvedValue([
      {
        alert_id: "alt_1",
        project_id: "proj_123",
        service_id: null,
        channel: "webhook",
        condition_type: "new_incident",
        severity_min: null,
        config: { target_url: "https://hooks.example.test/alerts" },
        is_enabled: true,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z"
      },
      {
        alert_id: "alt_2",
        project_id: "proj_123",
        service_id: null,
        channel: "webhook",
        condition_type: "new_incident",
        severity_min: null,
        config: { target_url: "https://hooks.example.test/alerts-2" },
        is_enabled: true,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z"
      }
    ]);
    const createAlertDeliveryIntent = vi
      .fn()
      .mockResolvedValueOnce({ delivery_id: "ad_1", created: true })
      .mockResolvedValueOnce({ delivery_id: null, created: false });
    const markAlertDeliveryResult = vi.fn().mockResolvedValue({ status: "delivered" });
    const deliver = vi.fn().mockResolvedValue(undefined);

    const result = await processNextEvaluateAlertsJob({
      queue: {
        enqueue: vi.fn().mockResolvedValue(undefined),
        dequeue: vi.fn().mockResolvedValue({
          project_id: "proj_123",
          incident_id: "inc_123",
          condition_type: "new_incident",
          dedupe_key: "new_incident",
          occurred_at: "2026-03-15T12:00:00.000Z",
          service_name: "checkout-api",
          environment: "production",
          severity: "high"
        })
      },
      alertStore: {
        listMatchingAlerts,
        createAlertDeliveryIntent,
        markAlertDeliveryResult
      },
      alertTransport: {
        deliver
      }
    });

    expect(result).toEqual({ processed: true });
    expect(listMatchingAlerts).toHaveBeenCalledWith({
      project_id: "proj_123",
      condition_type: "new_incident",
      service_name: "checkout-api",
      environment: "production",
      severity: "high"
    });
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver).toHaveBeenCalledWith(expect.objectContaining({
      delivery_id: "ad_1",
      alert_id: "alt_1",
      incident_id: "inc_123",
      channel: "webhook"
    }));
    expect(markAlertDeliveryResult).toHaveBeenCalledWith({
      delivery_id: "ad_1",
      delivered: true,
      error_message: null
    });
  });

  it("marks alert deliveries failed when transport delivery raises an alert error", async (): Promise<void> => {
    const markAlertDeliveryResult = vi.fn().mockResolvedValue({ status: "failed" });

    const result = await processNextEvaluateAlertsJob({
      queue: {
        enqueue: vi.fn().mockResolvedValue(undefined),
        dequeue: vi.fn().mockResolvedValue({
          project_id: "proj_123",
          incident_id: "inc_123",
          condition_type: "error_spike",
          dedupe_key: "error_spike",
          occurred_at: "2026-03-15T12:30:00.000Z",
          service_name: "checkout-api",
          environment: "production",
          severity: "critical"
        })
      },
      alertStore: {
        listMatchingAlerts: vi.fn().mockResolvedValue([
          {
            alert_id: "alt_1",
            project_id: "proj_123",
            service_id: null,
            channel: "email",
            condition_type: "error_spike",
            severity_min: "high",
            config: { to: "alerts@example.com" },
            is_enabled: true,
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:00:00.000Z"
          }
        ]),
        createAlertDeliveryIntent: vi.fn().mockResolvedValue({ delivery_id: "ad_1", created: true }),
        markAlertDeliveryResult
      },
      alertTransport: {
        deliver: vi.fn().mockRejectedValue(new Error("alert_channel_not_supported:email"))
      }
    });

    expect(result).toEqual({ processed: true });
    expect(markAlertDeliveryResult).toHaveBeenCalledWith({
      delivery_id: "ad_1",
      delivered: false,
      error_message: "alert_channel_not_supported:email"
    });
  });

  it("skips new alert deliveries when the monthly delivery quota is exhausted", async (): Promise<void> => {
    const createAlertDeliveryIntent = vi.fn();
    const deliver = vi.fn();

    const result = await processNextEvaluateAlertsJob({
      queue: {
        enqueue: vi.fn().mockResolvedValue(undefined),
        dequeue: vi.fn().mockResolvedValue({
          project_id: "proj_123",
          incident_id: "inc_123",
          condition_type: "new_incident",
          dedupe_key: "new_incident",
          occurred_at: "2026-03-15T12:30:00.000Z",
          service_name: "checkout-api",
          environment: "production",
          severity: "critical"
        })
      },
      alertStore: {
        listMatchingAlerts: vi.fn().mockResolvedValue([
          {
            alert_id: "alt_1",
            project_id: "proj_123",
            service_id: null,
            channel: "webhook",
            condition_type: "new_incident",
            severity_min: null,
            config: { target_url: "https://hooks.example.test/alerts" },
            is_enabled: true,
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:00:00.000Z"
          }
        ]),
        createAlertDeliveryIntent,
        markAlertDeliveryResult: vi.fn()
      },
      alertTransport: {
        deliver
      },
      billingStore: {
        getBillingSummaryForProject: vi.fn().mockResolvedValue({
          plan: "solo",
          stripe_customer_id: null,
          active_projects: 2,
          capacity_units: {
            total: 2,
            included: 2,
            additional_purchased: 0
          },
          usage_window: {
            starts_at: "2026-03-01T00:00:00.000Z",
            ends_at: "2026-04-01T00:00:00.000Z"
          },
          allowances: {
            monthly_bundle_requests: { used: 0, limit: 500 },
            monthly_raw_ingested_events: { used: 0, limit: 4000 },
            retained_bundle_cap: { used: 0, limit: 300 },
            monthly_remote_activations: { used: 0, limit: 50 },
            monthly_alert_deliveries: { used: 150, limit: 150 }
          }
        })
      }
    });

    expect(result).toEqual({ processed: true });
    expect(createAlertDeliveryIntent).not.toHaveBeenCalled();
    expect(deliver).not.toHaveBeenCalled();
  });
});

describe("alert delivery transport – multi-channel", () => {
  it("should deliver email alerts via email transport", async (): Promise<void> => {
    const sendMock = vi.fn<(input: { to: string[]; subject: string; text: string; html: string }) => Promise<void>>().mockResolvedValue(
      undefined
    );
    await createAlertTransport({
      timeoutMs: 5000,
      emailTransport: { send: sendMock },
      appBaseUrl: "https://app.debugbundle.com",
      apiBaseUrl: "https://api.debugbundle.com"
    }).deliver({
      delivery_id: "adel_1",
      alert_id: "alert_1",
      project_id: "proj_1",
      incident_id: "inc_1",
      channel: "email",
      config: { to: "team@example.com" },
      payload: {
        condition_type: "new_incident",
        incident_id: "inc_1",
        occurred_at: "2026-05-13T08:33:56.774Z",
        service_name: "checkout-api",
        environment: "production",
        severity: "high"
      }
    });

    const emailDelivery = sendMock.mock.calls[0]?.[0];
    expect(emailDelivery?.to).toEqual(["team@example.com"]);
    expect(emailDelivery?.subject).toBe("[DebugBundle Alert] A new incident was detected");
    expect(emailDelivery?.text).toContain("Service: checkout-api");
    expect(emailDelivery?.text).toContain("Open incident: https://app.debugbundle.com/incidents/inc_1");
    expect(emailDelivery?.html).toContain("View bundle JSON");
  });

  it("should reject email alerts when no email transport configured", async (): Promise<void> => {
    await expect(
      createAlertTransport({
        timeoutMs: 5000,
        emailTransport: null
      }).deliver({
        delivery_id: "adel_2",
        alert_id: "alert_2",
        project_id: "proj_1",
        incident_id: "inc_1",
        channel: "email",
        config: { to: "team@example.com" },
        payload: { event_type: "new_incident", summary: "crash" }
      })
    ).rejects.toThrow("alert_email_not_configured");
  });

  it("should reject email alerts when no recipients configured", async (): Promise<void> => {
    await expect(
      createAlertTransport({
        timeoutMs: 5000,
        emailTransport: { send: vi.fn() }
      }).deliver({
        delivery_id: "adel_3",
        alert_id: "alert_3",
        project_id: "proj_1",
        incident_id: "inc_1",
        channel: "email",
        config: {},
        payload: { event_type: "new_incident", summary: "crash" }
      })
    ).rejects.toThrow("alert_email_recipients_missing");
  });

  it("should deliver slack alerts via webhook URL with Block Kit format", async (): Promise<void> => {
    const fetchSpy = vi.fn<(input: string, init?: RequestInit) => Promise<{ ok: boolean }>>().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchSpy as unknown);

    await createAlertTransport({
      timeoutMs: 5000,
      emailTransport: null
    }).deliver({
      delivery_id: "adel_4",
      alert_id: "alert_4",
      project_id: "proj_1",
      incident_id: "inc_1",
      channel: "slack",
      config: { webhook_url: "https://hooks.slack.com/services/T/B/X" },
      payload: { event_type: "error_spike", summary: "Spike detected" }
    });

    const slackCall = fetchSpy.mock.calls[0];
    expect(slackCall?.[0]).toBe("https://hooks.slack.com/services/T/B/X");
    expect(slackCall?.[1]?.method).toBe("POST");
    const slackBody = slackCall?.[1]?.body;
    expect(typeof slackBody).toBe("string");
    if (typeof slackBody !== "string") {
      throw new Error("Expected Slack request body to be a string");
    }
    expect(slackBody).toContain("Spike detected");

    const body = SlackAlertBodySchema.parse(getJsonRequestBody(fetchSpy));
    expect(body.text).toContain("error_spike");
    expect(body.blocks[0]?.type).toBe("section");
  });

  it("should deliver discord alerts via webhook URL with embed format", async (): Promise<void> => {
    const fetchSpy = vi.fn<(input: string, init?: RequestInit) => Promise<{ ok: boolean }>>().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchSpy as unknown);

    await createAlertTransport({
      timeoutMs: 5000,
      emailTransport: null
    }).deliver({
      delivery_id: "adel_5",
      alert_id: "alert_5",
      project_id: "proj_1",
      incident_id: "inc_1",
      channel: "discord",
      config: {
        webhook_url: "https://discord.com/api/webhooks/123/abc"
      },
      payload: { event_type: "severity_threshold", summary: "Critical error" }
    });

    const discordCall = fetchSpy.mock.calls[0];
    expect(discordCall?.[0]).toBe("https://discord.com/api/webhooks/123/abc");
    expect(discordCall?.[1]?.method).toBe("POST");
    const discordBody = discordCall?.[1]?.body;
    expect(typeof discordBody).toBe("string");
    if (typeof discordBody !== "string") {
      throw new Error("Expected Discord request body to be a string");
    }
    expect(discordBody).toContain("Critical error");

    const body = DiscordAlertBodySchema.parse(getJsonRequestBody(fetchSpy));
    expect(body.content).toContain("severity_threshold");
    expect(body.embeds[0]?.title).toBe("severity_threshold");
  });

  it("should deliver webhook alerts via POST to target_url with raw payload", async (): Promise<void> => {
    const fetchSpy = vi.fn<(input: string, init?: RequestInit) => Promise<{ ok: boolean }>>().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchSpy as unknown);

    await createAlertTransport({
      timeoutMs: 5000,
      emailTransport: null
    }).deliver({
      delivery_id: "adel_6",
      alert_id: "alert_6",
      project_id: "proj_1",
      incident_id: "inc_1",
      channel: "webhook",
      config: { target_url: "https://custom.hooks.test/alerts" },
      payload: { event_type: "new_incident", incident_id: "inc_1" }
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://custom.hooks.test/alerts",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          event_type: "new_incident",
          incident_id: "inc_1"
        })
      })
    );
  });

  it("should reject slack alerts when webhook_url is missing", async (): Promise<void> => {
    await expect(
      createAlertTransport({
        timeoutMs: 5000,
        emailTransport: null
      }).deliver({
        delivery_id: "adel_7",
        alert_id: "alert_7",
        project_id: "proj_1",
        incident_id: "inc_1",
        channel: "slack",
        config: {},
        payload: { event_type: "new_incident", summary: "crash" }
      })
    ).rejects.toThrow("alert_slack_webhook_url_missing");
  });

  it("should reject discord alerts when webhook_url is missing", async (): Promise<void> => {
    await expect(
      createAlertTransport({
        timeoutMs: 5000,
        emailTransport: null
      }).deliver({
        delivery_id: "adel_8",
        alert_id: "alert_8",
        project_id: "proj_1",
        incident_id: "inc_1",
        channel: "discord",
        config: {},
        payload: { event_type: "new_incident", summary: "crash" }
      })
    ).rejects.toThrow("alert_discord_webhook_url_missing");
  });

  it("should reject webhook alerts when target_url is missing", async (): Promise<void> => {
    await expect(
      createAlertTransport({
        timeoutMs: 5000,
        emailTransport: null
      }).deliver({
        delivery_id: "adel_9",
        alert_id: "alert_9",
        project_id: "proj_1",
        incident_id: "inc_1",
        channel: "webhook",
        config: {},
        payload: { event_type: "new_incident", summary: "crash" }
      })
    ).rejects.toThrow("alert_target_url_missing");
  });
});
