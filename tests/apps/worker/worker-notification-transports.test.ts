import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../packages/node-http/src/index.js", () => ({
  nodeFetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args)
}));
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
      signing_secret: "test-signing-secret",
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

  it("signs custom alert webhooks with the exact serialized payload", async (): Promise<void> => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    await createAlertTransport({ timeoutMs: 100, emailTransport: null }).deliver({
      channel: "webhook",
      config: { target_url: "https://hooks.example.test/alert" },
      signing_secret: "dbundle_asec_test-secret",
      payload: { incident_id: "inc_1", summary: "Failure" }
    } as never);
    const request = fetchMock.mock.calls[0]?.[1];
    const body = request?.body as string;
    const expected = `sha256=${createHmac("sha256", "dbundle_asec_test-secret").update(body).digest("hex")}`;
    expect(request?.headers).toMatchObject({ "x-debugbundle-signature": expected });
  });

  it.each([undefined, null, ""])("refuses a custom webhook without a usable signing key (%s)", async (signingSecret) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(createAlertTransport({ timeoutMs: 100, emailTransport: null }).deliver({
      channel: "webhook", config: { target_url: "https://alerts.test/webhook" },
      signing_secret: signingSecret, payload: { summary: "Failure" }
    } as never)).rejects.toThrow("alert_signing_secret_missing");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("points direct provider alerts to their inspectable member group", async (): Promise<void> => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    const transport = createAlertTransport({
      timeoutMs: 100,
      emailTransport: null,
      apiBaseUrl: "https://api.debugbundle.com"
    });
    const event = {
      delivery_id: "00000000-0000-4000-8000-000000000011",
      project_id: "00000000-0000-4000-8000-000000000012",
      payload: { incident_id: "00000000-0000-4000-8000-000000000013" }
    };
    const groupUrl = `https://api.debugbundle.com/v1/alert-groups/direct/${event.delivery_id}?project_id=${event.project_id}`;

    await transport.deliver({ ...event, channel: "slack", config: { webhook_url: "https://hooks.slack.test/alert" } } as never);
    await transport.deliver({ ...event, channel: "discord", config: { webhook_url: "https://discord.test/alert" } } as never);
    await transport.deliver({ ...event, channel: "webhook", config: { target_url: "https://alerts.test/webhook" }, signing_secret: "secret", webhook_payload_version: 1 } as never);
    await transport.deliver({ ...event, channel: "webhook", config: { target_url: "https://alerts.test/legacy" }, signing_secret: "legacy-secret", webhook_payload_version: 0 } as never);

    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string).text).toContain(groupUrl);
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string).content).toContain(groupUrl);
    const signedRequest = fetchMock.mock.calls[2]?.[1];
    expect(JSON.parse(signedRequest?.body as string)).toMatchObject({
      alert_group_id: event.delivery_id,
      alert_group_url: groupUrl
    });
    expect(signedRequest?.headers["x-debugbundle-signature"]).toBe(
      `sha256=${createHmac("sha256", "secret").update(signedRequest?.body as string).digest("hex")}`
    );
    expect(JSON.parse(fetchMock.mock.calls[3]?.[1]?.body as string)).not.toHaveProperty("alert_group_id");
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

    const emailSend = vi.fn().mockRejectedValue(new Error("smtp_down password=mail-secret"));
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
    ).rejects.toMatchObject({ message: "alert_email_error" });

    const abortError = new Error("timed out");
    abortError.name = "AbortError";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValueOnce(new Error("offline token=transport-secret")).mockRejectedValueOnce(abortError)
    );

    await expect(
      transport.deliver({
        channel: "slack",
        config: { webhook_url: "https://hooks.slack.test/alert" },
        payload: { summary: "Slack broken", event_type: "bundle.created" }
      } as never)
    ).rejects.toMatchObject({ message: "alert_transport_error" });

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

  it("scrubs historical alert fields and webhook bodies before delivery", async (): Promise<void> => {
    const emailSend = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const transport = createAlertTransport({
      timeoutMs: 1000,
      emailTransport: { send: emailSend },
      resolveProjectName: async () => "Main app"
    });
    const payload = {
      summary: "A normal summary token=historical-secret",
      service_name: "api password=service-secret",
      event_type: "bundle.created",
      context: { apiKey: "raw-key", reason: "Unexpected failure" }
    };
    await transport.deliver({ channel: "email", config: { to: "team@example.com" }, payload } as never);
    await transport.deliver({ channel: "discord", config: { webhook_url: "https://discord.test/alert" }, payload } as never);
    await transport.deliver({ channel: "webhook", signing_secret: "secret", config: { target_url: "https://alerts.test/webhook" }, payload } as never);

    const bytes = JSON.stringify(emailSend.mock.calls) + JSON.stringify(fetchMock.mock.calls);
    expect(bytes).not.toContain("historical-secret");
    expect(bytes).not.toContain("service-secret");
    expect(bytes).not.toContain("raw-key");
    expect(bytes).toContain("Unexpected failure");
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)).toMatchObject({
      context: { apiKey: "[REDACTED]", reason: "Unexpected failure" }
    });
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

    const privateFetch = vi.fn();
    vi.stubGlobal("fetch", privateFetch);
    await expect(createWeeklyReportTransport({ emailTransport: null }).deliver({
      ...reportEvent,
      channel: { channel: "slack", config: { webhook_url: "http://127.0.0.1/weekly" } }
    } as never)).rejects.toThrow("alert_target_blocked");
    expect(privateFetch).not.toHaveBeenCalled();

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

  it("blocks private lifecycle webhook targets before fetch", async (): Promise<void> => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({ ok: true } as Response);
    await expect(createLifecycleWebhookTransport({ timeoutMs: 100 }).deliver({
      target_url: "http://169.254.169.254/latest/meta-data/",
      signing_secret: "test-only",
      payload: {}
    } as never)).rejects.toThrow("webhook_target_blocked");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("does not follow lifecycle webhook redirects", async (): Promise<void> => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 302
    } as Response);
    await expect(createLifecycleWebhookTransport({ timeoutMs: 100 }).deliver({
      target_url: "https://hooks.example.test/alert",
      signing_secret: "test-only",
      payload: {}
    } as never)).rejects.toThrow("webhook_redirect_blocked");
    expect(fetchSpy).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      redirect: "manual",
      dispatcher: expect.any(Object)
    }));
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
    ).rejects.toThrow("webhook_transport_error");

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
      payload: { event: "bundle.reopened", incident_id: "inc_1", summary: "token=old-secret", context: { apiKey: "raw-key" } }
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const requestOptions = fetchSpy.mock.calls[0]?.[1] as { headers: Record<string, string>; body: string };
    expect(requestOptions.headers["x-debugbundle-signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(requestOptions.body).not.toContain("old-secret");
    expect(requestOptions.body).not.toContain("raw-key");
    expect(JSON.parse(requestOptions.body)).toMatchObject({ context: { apiKey: "[REDACTED]" } });
    fetchSpy.mockRestore();
  });
});
