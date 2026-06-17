import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildApiUrl,
  bulkReopenIncidents,
  bulkResolveIncidents,
  createProjectAvailabilityCheck,
  createProjectAlert,
  createProjectWebhook,
  deleteProjectAvailabilityCheck,
  deleteAlert,
  exportAccountData,
  getProjectAvailabilityCheck,
  getBillingSummary,
  getGitHubInstallUrl,
  getIncidentBundle,
  getIncidentReproduction,
  getSession,
  InvalidSessionError,
  listIncidents,
  listProjectAvailabilityCheckDailyRollups,
  listProjectAvailabilityCheckResults,
  listProjectAvailabilityChecks,
  logout,
  subscribeToBrowserSessionInvalidation,
  resetBrowserSessionClientState,
  testProjectWebhook,
  testProjectAvailabilityCheck,
  updateProjectAvailabilityCheck,
  updateProjectAlert,
  verifyEmailCode
} from "../../../apps/web/src/lib/api.ts";
import { createSession } from "./web-test-helpers.js";

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("web api client", () => {
  it("calls project availability-check endpoints with browser-session credentials", async () => {
    const check = {
      check_id: "chk_1",
      project_id: "proj_1",
      name: "Primary app",
      url: "https://app.example.com/health",
      method: "GET",
      expected_status_min: 200,
      expected_status_max: 399,
      timeout_ms: 5000,
      interval_seconds: 60,
      failure_threshold: 3,
      recovery_threshold: 2,
      environment: "production",
      service_name: "web",
      enabled: true,
      status: "passing",
      paused_reason: null,
      organization_plan: "solo",
      consecutive_failures: 0,
      consecutive_successes: 12,
      linked_incident_id: null,
      last_checked_at: "2026-06-15T10:00:00.000Z",
      next_check_at: "2026-06-15T10:01:00.000Z",
      last_result_status: "success",
      last_result_http_status: 200,
      last_result_error_kind: null,
      last_result_error_message: null,
      last_result_duration_ms: 180,
      created_at: "2026-06-15T09:00:00.000Z",
      updated_at: "2026-06-15T10:00:00.000Z"
    };
    const result = {
      result_id: "res_1",
      check_id: "chk_1",
      project_id: "proj_1",
      started_at: "2026-06-15T10:00:00.000Z",
      completed_at: "2026-06-15T10:00:00.180Z",
      duration_ms: 180,
      status: "success",
      http_status: 200,
      error_kind: null,
      error_message: null,
      redirect_count: 0,
      checked_url_host: "app.example.com",
      final_url: "https://app.example.com/health"
    };
    const rollup = {
      check_id: "chk_1",
      project_id: "proj_1",
      day: "2026-06-15",
      state: "operational",
      total_checks: 1440,
      successful_checks: 1438,
      failed_checks: 2,
      degraded_checks: 0,
      avg_duration_ms: 185,
      first_checked_at: "2026-06-15T00:00:00.000Z",
      last_checked_at: "2026-06-15T23:59:00.000Z",
      downtime_seconds: 60,
      incident_ids: []
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input :
        input instanceof URL ? input.toString() :
        input.url;

      if (url.endsWith("/v1/projects/proj_1/availability-checks?limit=50")) {
        return Promise.resolve(
          new Response(JSON.stringify({ checks: [check], limits: { max_checks_per_project: 5, min_interval_seconds: 60 } }), {
            status: 200
          })
        );
      }
      if (url.endsWith("/v1/projects/proj_1/availability-checks/chk_1") && init?.method === undefined) {
        return Promise.resolve(
          new Response(JSON.stringify({ check, limits: { max_checks_per_project: 5, min_interval_seconds: 60 } }), {
            status: 200
          })
        );
      }
      if (url.endsWith("/v1/projects/proj_1/availability-checks") && init?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({ check }), { status: 201 }));
      }
      if (url.endsWith("/v1/projects/proj_1/availability-checks/chk_1") && init?.method === "PATCH") {
        return Promise.resolve(new Response(JSON.stringify({ check: { ...check, enabled: false } }), { status: 200 }));
      }
      if (url.endsWith("/v1/projects/proj_1/availability-checks/chk_1") && init?.method === "DELETE") {
        return Promise.resolve(new Response(JSON.stringify({ deleted: true }), { status: 200 }));
      }
      if (url.endsWith("/v1/projects/proj_1/availability-checks/test")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              normalized_url: "https://app.example.com/health",
              result: {
                status: "success",
                http_status: 200,
                duration_ms: 180,
                error_kind: null,
                error_message: null,
                checked_url_host: "app.example.com",
                checked_url_path: "/health",
                checked_url_query: {},
                final_url: "https://app.example.com/health",
                redirect_count: 0
              }
            }),
            { status: 200 }
          )
        );
      }
      if (url.endsWith("/v1/projects/proj_1/availability-checks/chk_1/results?limit=7")) {
        return Promise.resolve(new Response(JSON.stringify({ results: [result] }), { status: 200 }));
      }
      if (url.endsWith("/v1/projects/proj_1/availability-checks/chk_1/daily-rollups?limit=9")) {
        return Promise.resolve(new Response(JSON.stringify({ rollups: [rollup] }), { status: 200 }));
      }

      return Promise.resolve(new Response(JSON.stringify({ error: "not_found" }), { status: 404 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(listProjectAvailabilityChecks("proj_1", 50)).resolves.toEqual({
      checks: [check],
      limits: { max_checks_per_project: 5, min_interval_seconds: 60 }
    });
    await expect(getProjectAvailabilityCheck("proj_1", "chk_1")).resolves.toEqual({
      check,
      limits: { max_checks_per_project: 5, min_interval_seconds: 60 }
    });
    await expect(
      createProjectAvailabilityCheck("proj_1", {
        name: "Primary app",
        url: "https://app.example.com/health",
        method: "GET",
        expected_status_min: 200,
        expected_status_max: 399,
        timeout_ms: 5000,
        interval_seconds: 60,
        failure_threshold: 3,
        recovery_threshold: 2,
        environment: "production",
        service_name: "web",
        enabled: true
      })
    ).resolves.toEqual(check);
    await expect(updateProjectAvailabilityCheck("proj_1", "chk_1", { enabled: false })).resolves.toEqual({
      ...check,
      enabled: false
    });
    await expect(deleteProjectAvailabilityCheck("proj_1", "chk_1")).resolves.toBeUndefined();
    await expect(
      testProjectAvailabilityCheck("proj_1", {
        url: "https://app.example.com/health",
        method: "GET",
        expected_status_min: 200,
        expected_status_max: 399,
        timeout_ms: 5000
      })
    ).resolves.toEqual(expect.objectContaining({ normalized_url: "https://app.example.com/health" }));
    await expect(listProjectAvailabilityCheckResults("proj_1", "chk_1", 7)).resolves.toEqual([result]);
    await expect(listProjectAvailabilityCheckDailyRollups("proj_1", "chk_1", 9)).resolves.toEqual([rollup]);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      buildApiUrl("/v1/projects/proj_1/availability-checks?limit=50"),
      { credentials: "include" }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      buildApiUrl("/v1/projects/proj_1/availability-checks"),
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          name: "Primary app",
          url: "https://app.example.com/health",
          method: "GET",
          expected_status_min: 200,
          expected_status_max: 399,
          timeout_ms: 5000,
          interval_seconds: 60,
          failure_threshold: 3,
          recovery_threshold: 2,
          environment: "production",
          service_name: "web",
          enabled: true
        })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      buildApiUrl("/v1/projects/proj_1/availability-checks/chk_1"),
      expect.objectContaining({
        method: "DELETE",
        credentials: "include"
      })
    );
  });

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
      buildApiUrl("/v1/alerts"),
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
            created_by_user_id: "usr_123",
            service_id: null,
            channel: "webhook",
            condition_type: "severity_threshold",
            severity_min: "high",
            cooldown_seconds: 0,
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
      buildApiUrl("/v1/alerts"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          project_id: "proj_1",
          service_id: undefined,
          channel: "webhook",
          condition_type: "severity_threshold",
          severity_min: "high",
          cooldown_seconds: 0,
          config: { target_url: "https://hooks.example.test/alerts" },
          is_enabled: true
        })
      })
    );
  });

  it("sends alert update payloads through the project-scoped patch route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          alert: {
            alert_id: "al_1",
            project_id: "proj_1",
            created_by_user_id: "usr_123",
            service_id: null,
            channel: "email",
            condition_type: "severity_threshold",
            severity_min: "critical",
            cooldown_seconds: 172800,
            config: { to: "alerts@example.com" },
            is_enabled: true,
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-16T00:00:00.000Z"
          }
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const alert = await updateProjectAlert("al_1", "proj_1", {
      channel: "email",
      condition_type: "severity_threshold",
      severity_min: "critical",
      cooldown_seconds: 172800,
      config: { to: "alerts@example.com" }
    });

    expect(alert.updated_at).toBe("2026-03-16T00:00:00.000Z");
    expect(fetchMock).toHaveBeenCalledWith(
      buildApiUrl("/v1/alerts/al_1?project_id=proj_1"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          channel: "email",
          condition_type: "severity_threshold",
          severity_min: "critical",
          cooldown_seconds: 172800,
          config: { to: "alerts@example.com" }
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
    const installUrlWithReturnTo = await getGitHubInstallUrl("/projects/proj_1/github", "proj_1");

    expect(incidents).toEqual({ incidents: [], nextCursor: "cursor_2" });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      buildApiUrl(
        "/v1/incidents?limit=5&cursor=cursor_1&project_id=proj_1&environment=production&service=checkout-api&status=resolved&severity=high"
      ),
      { credentials: "include" }
    );
    expect(installUrl).toBe("https://github.com/apps/debugbundle/installations/new");
    expect(fetchMock).toHaveBeenNthCalledWith(2, buildApiUrl("/v1/github/app/install-url"), { credentials: "include" });
    expect(installUrlWithReturnTo).toBe("https://github.com/apps/debugbundle/installations/new?state=return");
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      buildApiUrl("/v1/github/app/install-url?return_to=%2Fprojects%2Fproj_1%2Fgithub&project_id=proj_1"),
      { credentials: "include" }
    );
  });

  it("calls bulk incident lifecycle endpoints with csrf headers", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ session: createSession() }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ incidents: [{ incident_id: "inc_1", status: "resolved" }] }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ incidents: [{ incident_id: "inc_1", status: "open" }] }), { status: 200 })
      );

    vi.stubGlobal("fetch", fetchMock);

    await verifyEmailCode({ email: "owen@example.com", code: "123456" });
    await expect(bulkResolveIncidents(["inc_1", "inc_2"])).resolves.toEqual([
      { incident_id: "inc_1", status: "resolved", project_color_tag: null }
    ]);
    await expect(bulkReopenIncidents(["inc_1", "inc_2"])).resolves.toEqual([
      { incident_id: "inc_1", status: "open", project_color_tag: null }
    ]);

    expect(fetchMock).toHaveBeenNthCalledWith(2, buildApiUrl("/v1/incidents/resolve"), {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": "csrf-token-123"
      },
      body: JSON.stringify({ incident_ids: ["inc_1", "inc_2"] })
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, buildApiUrl("/v1/incidents/reopen"), {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": "csrf-token-123"
      },
      body: JSON.stringify({ incident_ids: ["inc_1", "inc_2"] })
    });
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
              created_by_user_id: "usr_123",
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
    await testProjectWebhook("wh_1", "proj_1");
    await testProjectWebhook("wh_1", "proj_1", "verification.failed");

    expect(webhook.webhook_id).toBe("wh_1");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      buildApiUrl("/v1/webhooks"),
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
      buildApiUrl("/v1/webhooks/wh_1/test?project_id=proj_1"),
      expect.objectContaining({ body: JSON.stringify({ event_type: "verification.passed" }) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      buildApiUrl("/v1/webhooks/wh_1/test?project_id=proj_1"),
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
    await expect(deleteAlert("al_1", "proj_1")).rejects.toThrow("delete_failed");
    await expect(deleteAlert("al_2", "proj_1")).rejects.toThrow("request_failed_502");
  });
});
