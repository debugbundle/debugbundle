import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetWorkerRuntimeMocks } from "../../helpers/worker-runtime-mocks.js";
import { encryptIntegrationSecret } from "../../../packages/storage/src/index.ts";
import {
  createAlertTransport,
  createLifecycleWebhookTransport,
  createWeeklyReportTransport
} from "../../../apps/worker/src/runtime.js";

describe("worker notification transports", () => {
  beforeEach(resetWorkerRuntimeMocks);

  it("should deliver alerts across email, slack, discord, and webhook channels", async (): Promise<void> => {
    const emailSend = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const transport = createAlertTransport({
      timeoutMs: 1000,
      emailTransport: { send: emailSend },
      appBaseUrl: "https://app.debugbundle.com",
      apiBaseUrl: "https://api.debugbundle.com"
    });

    await transport.deliver({
      channel: "email",
      config: { to: "alerts@example.com" },
      payload: {
        condition_type: "new_incident",
        incident_id: "inc_alert_123",
        occurred_at: "2026-05-13T08:33:56.774Z",
        service_name: "api",
        environment: "production",
        severity: "high"
      }
    } as never);
    await transport.deliver({
      channel: "slack",
      config: { webhook_url: "https://hooks.slack.test/alert" },
      payload: {}
    } as never);
    await transport.deliver({
      channel: "discord",
      config: { webhook_url: "https://discord.test/alert" },
      payload: {}
    } as never);
    await transport.deliver({
      channel: "webhook",
      config: { target_url: "https://alerts.test/webhook" },
      payload: { summary: "Disk alert" }
    } as never);

    expect(emailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["alerts@example.com"],
        subject: "[DebugBundle Alert] A new incident was detected"
      })
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("should surface alert transport configuration and delivery failures", async (): Promise<void> => {
    const transportWithoutEmail = createAlertTransport({ timeoutMs: 1000, emailTransport: null });

    await expect(
      transportWithoutEmail.deliver({
        channel: "email",
        config: { to: "alerts@example.com" },
        payload: { summary: "Broken" }
      } as never)
    ).rejects.toMatchObject({ message: "alert_email_not_configured" });

    const emailSend = vi.fn().mockRejectedValue(new Error("smtp_down"));
    const transport = createAlertTransport({
      timeoutMs: 1000,
      emailTransport: { send: emailSend }
    });

    await expect(
      transport.deliver({
        channel: "email",
        config: { to: "   " },
        payload: { summary: "Broken" }
      } as never)
    ).rejects.toMatchObject({ message: "alert_email_recipients_missing" });

    await expect(
      transport.deliver({
        channel: "email",
        config: { to: "alerts@example.com" },
        payload: { summary: "Broken", event_type: "incident.spike_detected" }
      } as never)
    ).rejects.toMatchObject({ message: "alert_email_error:smtp_down" });

    const abortError = new Error("timed out");
    abortError.name = "AbortError";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValueOnce(new Error("offline")).mockRejectedValueOnce(abortError)
    );

    await expect(
      transport.deliver({
        channel: "slack",
        config: { webhook_url: "https://hooks.slack.test/alert" },
        payload: { summary: "Slack broken", event_type: "bundle.created" }
      } as never)
    ).rejects.toMatchObject({ message: "alert_transport_error:offline" });

    await expect(
      transport.deliver({
        channel: "discord",
        config: { webhook_url: "https://discord.test/alert" },
        payload: { summary: "Discord broken", event_type: "bundle.created" }
      } as never)
    ).rejects.toMatchObject({ message: "alert_timeout" });

    await expect(
      transport.deliver({
        channel: "webhook",
        config: {},
        payload: { summary: "Webhook broken" }
      } as never)
    ).rejects.toMatchObject({ message: "alert_target_url_missing" });

    await expect(
      transport.deliver({
        channel: "pagerduty",
        config: {},
        payload: {}
      } as never)
    ).rejects.toMatchObject({ message: "alert_channel_not_supported:pagerduty" });
  });

  it("should validate weekly report email and slack delivery configuration", async (): Promise<void> => {
    const reportEvent = {
      channel: {
        channel: "email",
        config: { to: ["team@example.com"] }
      },
      report: {
        project_id: "proj_123",
        project_name: "Main app",
        window_start: "2026-03-09T00:00:00.000Z",
        window_end: "2026-03-16T00:00:00.000Z",
        bundle_counts: { failure: 3, improvement: 1 },
        new_incidents: 2,
        resolved_incidents: 1,
        opened_incidents_resolved: 1,
        regressions: 1,
        top_spiking_incidents: []
      }
    };

    await expect(
      createWeeklyReportTransport({ emailTransport: null }).deliver(reportEvent as never)
    ).rejects.toThrow("weekly_report_email_not_configured");

    await expect(
      createWeeklyReportTransport({ emailTransport: { send: vi.fn() } }).deliver({
        ...reportEvent,
        channel: {
          channel: "email",
          config: { to: "team@example.com" }
        }
      } as never)
    ).rejects.toThrow("weekly_report_email_config_invalid");

    await expect(
      createWeeklyReportTransport({ emailTransport: { send: vi.fn() } }).deliver({
        ...reportEvent,
        channel: {
          channel: "slack",
          config: {}
        }
      } as never)
    ).rejects.toThrow("weekly_report_slack_config_invalid");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        headers: { get: vi.fn().mockReturnValue(null) }
      })
    );

    await expect(
      createWeeklyReportTransport({ emailTransport: { send: vi.fn() } }).deliver({
        ...reportEvent,
        channel: {
          channel: "slack",
          config: { webhook_url: "https://hooks.slack.test/weekly" }
        }
      } as never)
    ).rejects.toThrow("weekly_report_slack_http_error_503");

    const encryptedWebhookUrl = encryptIntegrationSecret(
      "https://hooks.slack.test/weekly",
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    await expect(
      createWeeklyReportTransport({
        emailTransport: { send: vi.fn() },
        integrationSecretEncryptionKey: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        slackDestinationStore: {
          getSlackDestinationSecretForDelivery: vi.fn().mockResolvedValue({
            webhook_url_ciphertext: encryptedWebhookUrl
          })
        }
      }).deliver({
        ...reportEvent,
        channel: {
          channel: "slack",
          config: { slack_destination_id: "sd_123" }
        }
      } as never)
    ).resolves.toBeUndefined();
  });

  it("should return timeout error from real webhook transport", async (): Promise<void> => {
    const transport = createLifecycleWebhookTransport({
      timeoutMs: 100
    });

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(Object.assign(new Error("aborted"), { name: "AbortError" }));

    await expect(
      transport.deliver({
        delivery_id: "del_1",
        project_id: "proj_1",
        incident_id: "inc_1",
        event_type: "bundle.reopened",
        occurred_at: "2026-03-11T00:00:00.000Z",
        target_url: "https://hooks.example.test/debugbundle",
        signing_secret: "secret_123",
        payload: { event: "bundle.reopened" }
      })
    ).rejects.toThrow("webhook_timeout");

    fetchSpy.mockRestore();
  });

  it("should return http status error from real webhook transport when response is non-2xx", async (): Promise<void> => {
    const transport = createLifecycleWebhookTransport({
      timeoutMs: 100
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 503
    } as Response);

    await expect(
      transport.deliver({
        delivery_id: "del_1",
        project_id: "proj_1",
        incident_id: "inc_1",
        event_type: "bundle.reopened",
        occurred_at: "2026-03-11T00:00:00.000Z",
        target_url: "https://hooks.example.test/debugbundle",
        signing_secret: "secret_123",
        payload: { event: "bundle.reopened" }
      })
    ).rejects.toThrow("webhook_http_error_503");

    fetchSpy.mockRestore();
  });

  it("should return transport error from real webhook transport for non-timeout failures", async (): Promise<void> => {
    const transport = createLifecycleWebhookTransport({
      timeoutMs: 100
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network_down"));

    await expect(
      transport.deliver({
        delivery_id: "del_1",
        project_id: "proj_1",
        incident_id: "inc_1",
        event_type: "bundle.reopened",
        occurred_at: "2026-03-11T00:00:00.000Z",
        target_url: "https://hooks.example.test/debugbundle",
        signing_secret: "secret_123",
        payload: { event: "bundle.reopened" }
      })
    ).rejects.toThrow("webhook_transport_error:network_down");

    fetchSpy.mockRestore();
  });

  it("should sign webhook payloads with HMAC header", async (): Promise<void> => {
    const transport = createLifecycleWebhookTransport({
      timeoutMs: 100
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true
    } as Response);

    await transport.deliver({
      delivery_id: "del_1",
      project_id: "proj_1",
      incident_id: "inc_1",
      event_type: "bundle.reopened",
      occurred_at: "2026-03-11T00:00:00.000Z",
      target_url: "https://hooks.example.test/debugbundle",
      signing_secret: "secret_123",
      payload: { event: "bundle.reopened", incident_id: "inc_1" }
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const requestOptions = fetchSpy.mock.calls[0]?.[1] as { headers: Record<string, string> };
    expect(requestOptions.headers["x-debugbundle-signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
    fetchSpy.mockRestore();
  });
});
