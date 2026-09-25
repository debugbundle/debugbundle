import { describe, expect, it, vi } from "vitest";

import { AlertApiError, createAlertApi, type HttpClient } from "../../../packages/alert-client/src/index.js";

describe("alert api client", () => {
  it("accepts a one-time signing secret and forwards explicit webhook rotation", async () => {
    const alert = {
      alert_id: "al_1", project_id: "proj_1", created_by_user_id: "usr_1",
      service_id: null, channel: "webhook", condition_type: "new_incident",
      severity_min: null, severity_lifecycle_scope: null, cooldown_seconds: 0,
      config: { target_url: "https://hooks.example.test/alert" }, is_enabled: true,
      created_at: "2026-09-24T00:00:00Z", updated_at: "2026-09-24T00:00:00Z",
      signing_secret: "dbundle_asec_one-time"
    };
    const request = vi.fn<HttpClient["request"]>()
      .mockResolvedValueOnce({ status: 201, body: { alert } })
      .mockResolvedValueOnce({ status: 200, body: { alert } });
    const api = createAlertApi({ request });
    const created = await api.createAlert({ bearerToken: "member", projectId: "proj_1",
      channel: "webhook", conditionType: "new_incident", config: alert.config });
    expect(created.signing_secret).toBe(alert.signing_secret);
    expect(request).toHaveBeenNthCalledWith(1, expect.objectContaining({
      body: { project_id: "proj_1", channel: "webhook", condition_type: "new_incident",
        config: alert.config, signing: "hmac_sha256_v1" }
    }));
    const rotated = await api.updateAlert({ bearerToken: "member", projectId: "proj_1",
      alertId: "al_1", channel: "webhook", rotateSigningSecret: true });
    expect(rotated.signing_secret).toBe(alert.signing_secret);
    expect(request).toHaveBeenNthCalledWith(2, expect.objectContaining({
      body: { channel: "webhook", rotate_signing_secret: true }
    }));
    const unsafeList = createAlertApi({ request: vi.fn().mockResolvedValue({
      status: 200, body: { alerts: [alert] }
    }) });
    await expect(unsafeList.listAlerts({ bearerToken: "member", projectId: "proj_1" }))
      .rejects.toMatchObject({ code: "invalid_response_shape" });
  });
  it("validates paginated alert-group metadata and detail without accepting extra sensitive fields", async () => {
    const group = {
      group_id: "00000000-0000-4000-8000-000000000001",
      kind: "direct", project_id: "00000000-0000-4000-8000-000000000002",
      alert_id: "00000000-0000-4000-8000-000000000003",
      root_incident_id: "00000000-0000-4000-8000-000000000004",
      channel: "slack", status: "delivered", member_count: 2,
      created_at: "2026-09-24T10:00:00Z", delivered_at: "2026-09-24T10:00:01Z"
    };
    const request = vi.fn<HttpClient["request"]>()
      .mockResolvedValueOnce({ status: 200, body: { groups: [group], next_cursor: "next" } })
      .mockResolvedValueOnce({ status: 200, body: {
        group, members: [{ incident_id: group.root_incident_id, condition_type: "new_incident", created_at: group.created_at }],
        next_cursor: null
      } });
    const api = createAlertApi({ request });
    const list = await api.listAlertGroups({ bearerToken: "dbundle_mem_x", projectId: group.project_id, limit: 1 });
    expect(list.groups).toEqual([group]);
    expect(request).toHaveBeenNthCalledWith(1, {
      method: "GET", path: `/v1/alert-groups?project_id=${group.project_id}&limit=1`, bearerToken: "dbundle_mem_x"
    });
    const detail = await api.getAlertGroup({
      bearerToken: "dbundle_mem_x", projectId: group.project_id, kind: "direct", groupId: group.group_id, cursor: "next"
    });
    expect(detail.members).toHaveLength(1);
    expect(request).toHaveBeenNthCalledWith(2, {
      method: "GET", path: `/v1/alert-groups/direct/${group.group_id}?project_id=${group.project_id}&cursor=next`,
      bearerToken: "dbundle_mem_x"
    });

    const unsafe = createAlertApi({ request: vi.fn().mockResolvedValue({
      status: 200, body: { groups: [{ ...group, payload: { secret: "do-not-return" } }], next_cursor: null }
    }) });
    await expect(unsafe.listAlertGroups({ bearerToken: "dbundle_mem_x", projectId: group.project_id }))
      .rejects.toMatchObject({ code: "invalid_response_shape" });
  });
  it("calls list alerts route with required project query and optional limit", async () => {
    const request = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 200,
      body: {
        alerts: [
          {
            alert_id: "al_1",
            project_id: "proj_1",
            service_id: null,
            channel: "email",
            condition_type: "severity_threshold",
            severity_min: "high",
            severity_lifecycle_scope: "both",
            cooldown_seconds: 0,
            config: {
              to: "oncall@example.com"
            },
            is_enabled: true,
            created_by_user_id: "usr_1",
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:00:00.000Z"
          }
        ]
      }
    });

    const api = createAlertApi({ request });
    const alerts = await api.listAlerts({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_1",
      limit: 5
    });

    expect(alerts).toHaveLength(1);
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: "/v1/alerts?project_id=proj_1&limit=5",
      bearerToken: "dbundle_mem_x"
    });
  });

  it("defaults missing severity lifecycle scope to null for older alert responses", async () => {
    const request = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 200,
      body: {
        alerts: [
          {
            alert_id: "al_legacy",
            project_id: "proj_1",
            service_id: null,
            channel: "email",
            condition_type: "new_incident",
            severity_min: null,
            cooldown_seconds: 0,
            config: {
              to: "owner@example.com"
            },
            is_enabled: true,
            created_by_user_id: "usr_1",
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:00:00.000Z"
          }
        ]
      }
    });

    const api = createAlertApi({ request });
    const alerts = await api.listAlerts({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_1"
    });

    expect(alerts[0]?.severity_lifecycle_scope).toBeNull();
  });

  it("calls create alert route and returns the created alert", async () => {
    const request = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 201,
      body: {
        alert: {
          alert_id: "al_1",
          project_id: "proj_1",
          service_id: "svc_1",
          channel: "email",
          condition_type: "severity_threshold",
          severity_min: "high",
          severity_lifecycle_scope: "incident_regressed",
          cooldown_seconds: 3600,
          config: {
            to: "oncall@example.com"
          },
          is_enabled: true,
          created_by_user_id: "usr_1",
          created_at: "2026-03-15T00:00:00.000Z",
          updated_at: "2026-03-15T00:00:00.000Z"
        }
      }
    });

    const api = createAlertApi({ request });
    const alert = await api.createAlert({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_1",
      serviceId: "svc_1",
      channel: "email",
      conditionType: "severity_threshold",
      severityMin: "high",
      severityLifecycleScope: "incident_regressed",
      cooldownSeconds: 3600,
      config: {
        to: "oncall@example.com"
      },
      isEnabled: true
    });

    expect(alert.alert_id).toBe("al_1");
    expect(request).toHaveBeenCalledWith({
      method: "POST",
      path: "/v1/alerts",
      bearerToken: "dbundle_mem_x",
      body: {
        project_id: "proj_1",
        service_id: "svc_1",
        channel: "email",
        condition_type: "severity_threshold",
        severity_min: "high",
        severity_lifecycle_scope: "incident_regressed",
        cooldown_seconds: 3600,
        config: {
          to: "oncall@example.com"
        },
        is_enabled: true
      }
    });
  });

  it("calls update and delete alert routes", async () => {
    const request = vi
      .fn<HttpClient["request"]>()
      .mockResolvedValueOnce({
        status: 200,
        body: {
          alert: {
            alert_id: "al_1",
            project_id: "proj_1",
            service_id: null,
            channel: "slack",
            condition_type: "error_spike",
            severity_min: null,
            severity_lifecycle_scope: null,
            cooldown_seconds: 86400,
            config: {
              channel: "eng-alerts"
            },
            is_enabled: false,
            created_by_user_id: "usr_1",
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:05:00.000Z"
          }
        }
      })
      .mockResolvedValueOnce({
        status: 204,
        body: null
      });

    const api = createAlertApi({ request });
    const updated = await api.updateAlert({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_1",
      alertId: "al_1",
      serviceId: null,
      channel: "slack",
      conditionType: "error_spike",
      severityMin: null,
      severityLifecycleScope: null,
      cooldownSeconds: 86400,
      config: {
        channel: "eng-alerts"
      },
      isEnabled: false
    });
    const deleted = await api.deleteAlert({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_1",
      alertId: "al_1"
    });

    expect(updated.is_enabled).toBe(false);
    expect(deleted).toEqual({ alert_id: "al_1" });
    expect(request).toHaveBeenNthCalledWith(1, {
      method: "PATCH",
      path: "/v1/alerts/al_1?project_id=proj_1",
      bearerToken: "dbundle_mem_x",
      body: {
        service_id: null,
        channel: "slack",
        condition_type: "error_spike",
        severity_min: null,
        severity_lifecycle_scope: null,
        cooldown_seconds: 86400,
        config: {
          channel: "eng-alerts"
        },
        is_enabled: false
      }
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      method: "DELETE",
      path: "/v1/alerts/al_1?project_id=proj_1",
      bearerToken: "dbundle_mem_x"
    });
  });

  it("throws structured and shape errors for alert routes", async () => {
    const requestError = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 404,
      body: {
        error: "alert_not_found"
      }
    });
    const requestShape = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 200,
      body: {
        alerts: [{ invalid: true }]
      }
    });
    const requestMalformedError = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 500,
      body: {
        unexpected: true
      }
    });

    const apiError = createAlertApi({ request: requestError });
    const apiShape = createAlertApi({ request: requestShape });
    const apiMalformedError = createAlertApi({ request: requestMalformedError });

    await expect(apiError.deleteAlert({ bearerToken: "dbundle_mem_x", projectId: "proj_1", alertId: "al_missing" })).rejects.toEqual(
      new AlertApiError(404, "alert_not_found")
    );
    await expect(apiShape.listAlerts({ bearerToken: "dbundle_mem_x", projectId: "proj_1" })).rejects.toEqual(
      new AlertApiError(200, "invalid_response_shape")
    );
    await expect(
      apiMalformedError.createAlert({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        channel: "email",
        conditionType: "new_incident",
        config: { to: "owner@example.com" }
      })
    ).rejects.toEqual(new AlertApiError(500, "unknown_error"));
  });

  it("omits optional fields when alert mutations do not supply them", async () => {
    const request = vi
      .fn<HttpClient["request"]>()
      .mockResolvedValueOnce({
        status: 200,
        body: {
          alerts: []
        }
      })
      .mockResolvedValueOnce({
        status: 201,
        body: {
          alert: {
            alert_id: "al_minimal",
            project_id: "proj_1",
            service_id: null,
            channel: "email",
            condition_type: "new_incident",
            severity_min: null,
            severity_lifecycle_scope: null,
            cooldown_seconds: 0,
            config: {
              to: "owner@example.com"
            },
            is_enabled: true,
            created_by_user_id: "usr_1",
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:00:00.000Z"
          }
        }
      })
      .mockResolvedValueOnce({
        status: 200,
        body: {
          alert: {
            alert_id: "al_minimal",
            project_id: "proj_1",
            service_id: null,
            channel: "email",
            condition_type: "new_incident",
            severity_min: null,
            severity_lifecycle_scope: null,
            cooldown_seconds: 0,
            config: {
              to: "owner@example.com"
            },
            is_enabled: true,
            created_by_user_id: "usr_1",
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:00:00.000Z"
          }
        }
      });
    const api = createAlertApi({ request });

    await expect(api.listAlerts({ bearerToken: "dbundle_mem_x", projectId: "proj_1" })).resolves.toEqual([]);
    await expect(
      api.createAlert({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        channel: "email",
        conditionType: "new_incident",
        config: { to: "owner@example.com" }
      })
    ).resolves.toMatchObject({ alert_id: "al_minimal" });
    await expect(
      api.updateAlert({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        alertId: "al_minimal",
        isEnabled: true
      })
    ).resolves.toMatchObject({ alert_id: "al_minimal" });

    expect(request).toHaveBeenNthCalledWith(1, {
      method: "GET",
      path: "/v1/alerts?project_id=proj_1",
      bearerToken: "dbundle_mem_x"
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      method: "POST",
      path: "/v1/alerts",
      bearerToken: "dbundle_mem_x",
      body: {
        project_id: "proj_1",
        channel: "email",
        condition_type: "new_incident",
        config: {
          to: "owner@example.com"
        }
      }
    });
    expect(request).toHaveBeenNthCalledWith(3, {
      method: "PATCH",
      path: "/v1/alerts/al_minimal?project_id=proj_1",
      bearerToken: "dbundle_mem_x",
      body: {
        is_enabled: true
      }
    });
  });
});
