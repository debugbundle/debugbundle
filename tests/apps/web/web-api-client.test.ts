import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createProjectAlert,
  createProjectWebhook,
  deleteAlert,
  exportAccountData,
  getBillingSummary,
  getGitHubInstallUrl,
  getIncidentBundle,
  getIncidentReproduction,
  getSession,
  InvalidSessionError,
  listIncidents,
  logout,
  subscribeToBrowserSessionInvalidation,
  resetBrowserSessionClientState,
  testProjectWebhook,
  verifyEmailCode
} from "../../../apps/web/src/lib/api.ts";
import { createSession } from "./web-test-helpers.js";

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("web api client", () => {
  it("notifies invalid-session listeners once until a new session is remembered", async () => {
    const notifications: number[] = [];
    const unsubscribe = subscribeToBrowserSessionInvalidation(() => {
      notifications.push(notifications.length + 1);
    });

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ error: "invalid_session" }), { status: 401 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ error: "invalid_session" }), { status: 401 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ session: createSession() }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ error: "invalid_session" }), { status: 401 }))
    );

    await expect(getBillingSummary()).rejects.toBeInstanceOf(InvalidSessionError);
    await expect(getBillingSummary()).rejects.toBeInstanceOf(InvalidSessionError);
    await expect(getSession()).resolves.toMatchObject({ session_id: "ses_123" });
    await expect(getBillingSummary()).rejects.toBeInstanceOf(InvalidSessionError);

    unsubscribe();

    expect(notifications).toEqual([1, 2]);
  });

  it("ignores logout 401 responses and clears the csrf header state", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ session: createSession() }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "invalid_session" }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ alert: { alert_id: "al_1" } }), { status: 200 }));

    vi.stubGlobal("fetch", fetchMock);

    await verifyEmailCode({ email: "owen@example.com", code: "123456" });
    await expect(logout()).resolves.toBeUndefined();
    await createProjectAlert({
      project_id: "proj_1",
      channel: "email",
      condition_type: "new_incident",
      config: { to: "owner@example.com" }
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://localhost:3003/v1/alerts",
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json"
        }
      })
    );
  });

  it("sends alert payloads with default is_enabled and preserved config", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          alert: {
            alert_id: "al_1",
            project_id: "proj_1",
            service_id: null,
            channel: "webhook",
            condition_type: "severity_threshold",
            severity_min: "high",
            config: { target_url: "https://hooks.example.test/alerts" },
            is_enabled: true,
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:00:00.000Z"
          }
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const alert = await createProjectAlert({
      project_id: "proj_1",
      channel: "webhook",
      condition_type: "severity_threshold",
      severity_min: "high",
      config: { target_url: "https://hooks.example.test/alerts" }
    });

    expect(alert.alert_id).toBe("al_1");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3003/v1/alerts",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          project_id: "proj_1",
          service_id: undefined,
          channel: "webhook",
          condition_type: "severity_threshold",
          severity_min: "high",
          config: { target_url: "https://hooks.example.test/alerts" },
          is_enabled: true
        })
      })
    );
  });

  it("serializes incident filters and optional GitHub install return_to values", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ incidents: [], next_cursor: "cursor_2" }), { status: 200 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ install_url: "https://github.com/apps/debugbundle/installations/new" }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ install_url: "https://github.com/apps/debugbundle/installations/new?state=return" }), { status: 200 })
      );

    vi.stubGlobal("fetch", fetchMock);

    const incidents = await listIncidents({
      limit: 5,
      cursor: "cursor_1",
      projectId: "proj_1",
      environment: "production",
      service: "checkout-api",
      status: "resolved",
      severity: "high"
    });
    const installUrl = await getGitHubInstallUrl();
    const installUrlWithReturnTo = await getGitHubInstallUrl("/projects/proj_1/github");

    expect(incidents).toEqual({ incidents: [], nextCursor: "cursor_2" });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:3003/v1/incidents?limit=5&cursor=cursor_1&project_id=proj_1&environment=production&service=checkout-api&status=resolved&severity=high",
      { credentials: "include" }
    );
    expect(installUrl).toBe("https://github.com/apps/debugbundle/installations/new");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:3003/v1/github/app/install-url", { credentials: "include" });
    expect(installUrlWithReturnTo).toBe("https://github.com/apps/debugbundle/installations/new?state=return");
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://localhost:3003/v1/github/app/install-url?return_to=%2Fprojects%2Fproj_1%2Fgithub",
      { credentials: "include" }
    );
  });

  it("falls back to the default export filename when content disposition is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ organization_id: "org_123" }), { status: 200, headers: { "Content-Type": "application/json" } }))
    );

    const result = await exportAccountData();

    expect(result.filename).toBe("debugbundle-account-export.json");
    expect(result.blob).toBeInstanceOf(Blob);
  });

  it("applies webhook defaults and supports default and explicit test event types", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            webhook: {
              webhook_id: "wh_1",
              project_id: "proj_1",
              url: "https://hooks.example.test/alerts",
              events: ["bundle.created"],
              filters: {},
              is_enabled: true,
              created_at: "2026-03-15T00:00:00.000Z",
              updated_at: "2026-03-15T00:00:00.000Z"
            }
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ delivery: { delivery_id: "del_1" } }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ delivery: { delivery_id: "del_2" } }), { status: 200 })
      );

    vi.stubGlobal("fetch", fetchMock);

    const webhook = await createProjectWebhook({
      project_id: "proj_1",
      url: "https://hooks.example.test/alerts",
      events: ["bundle.created"]
    });
    await testProjectWebhook("wh_1");
    await testProjectWebhook("wh_1", "verification.failed");

    expect(webhook.webhook_id).toBe("wh_1");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:3003/v1/webhooks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          project_id: "proj_1",
          url: "https://hooks.example.test/alerts",
          events: ["bundle.created"],
          filters: {},
          is_enabled: true
        })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3003/v1/webhooks/wh_1/test",
      expect.objectContaining({ body: JSON.stringify({ event_type: "verification.passed" }) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://localhost:3003/v1/webhooks/wh_1/test",
      expect.objectContaining({ body: JSON.stringify({ event_type: "verification.failed" }) })
    );
  });

  it("returns pending and ready incident artifacts and surfaces alert deletion errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "pending" }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            bundle_id: "bun_1",
            incident_id: "inc_1",
            project_id: "proj_1",
            version: "1",
            summary: { title: "Checkout error", severity: "high", environment: "production" }
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "failed" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "delete_failed" }), { status: 500 }))
      .mockResolvedValueOnce(new Response("not-json", { status: 502 }));

    vi.stubGlobal("fetch", fetchMock);

    await expect(getIncidentBundle("inc_1")).resolves.toEqual({ status: "pending" });
    await expect(getIncidentBundle("inc_1")).resolves.toMatchObject({ status: "ready", bundle: { bundle_id: "bun_1" } });
    await expect(getIncidentReproduction("inc_1")).resolves.toEqual({ status: "failed" });
    await expect(deleteAlert("al_1")).rejects.toThrow("delete_failed");
    await expect(deleteAlert("al_2")).rejects.toThrow("request_failed_502");
  });
});
