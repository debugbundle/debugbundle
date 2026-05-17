import { describe, expect, it, vi } from "vitest";

import { AlertApiError, createAlertApi, type HttpClient } from "../../../packages/alert-client/src/index.js";

describe("alert api client", () => {
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
