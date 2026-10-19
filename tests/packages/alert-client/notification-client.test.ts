import { expect, it, vi } from "vitest";
import {
  createNotificationApi,
  NotificationApiError
} from "../../../packages/alert-client/src/notification-preferences.js";
import { notificationResponse } from "../../helpers/notification-fixtures.js";
it("maps every operation to the strict account/project HTTP contract", async () => {
  const request = vi.fn().mockResolvedValue({ status: 200, body: notificationResponse() });
  const api = createNotificationApi({ request });
  await api.request({ bearerToken: "member", audience: "personal" }, "get");
  expect(request).toHaveBeenLastCalledWith({
    method: "GET",
    bearerToken: "member",
    path: "/v1/account/notification-preferences?audience=personal"
  });
  const scope = {
    bearerToken: "member",
    audience: "shared" as const,
    projectId: "10000000-0000-4000-8000-000000000001"
  };
  for (const [action, body, method, suffix] of [
    ["update", { channels: { email: "daily" } }, "PATCH", ""],
    ["pause", { channels: ["slack"], until: null, allow_health_checks: true }, "POST", "/pause"],
    ["resume", { channels: ["slack"] }, "POST", "/resume"]
  ] as const) {
    await api.request(scope, action, body);
    expect(request).toHaveBeenLastCalledWith({
      method,
      bearerToken: "member",
      path: `/v1/projects/${scope.projectId}/notification-preferences${suffix}?audience=shared`,
      body
    });
  }
  const before = request.mock.calls.length;
  await expect(api.request({ ...scope, projectId: "../account" }, "get")).rejects.toThrow();
  await expect(
    api.request(scope, "update", { daily: { time: "25:00", timezone: "Mars" } })
  ).rejects.toThrow();
  expect(request).toHaveBeenCalledTimes(before);
});
it("rejects malformed successes and preserves safe API error codes", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce({ status: 200, body: {} })
    .mockResolvedValueOnce({ status: 403, body: { error: "forbidden" } })
    .mockResolvedValueOnce({ status: 500, body: "untrusted proxy" });
  const api = createNotificationApi({ request }),
    scope = { bearerToken: "member", audience: "personal" as const };
  await expect(api.request(scope, "get")).rejects.toEqual(
    new NotificationApiError(502, "invalid_notification_response")
  );
  await expect(api.request(scope, "get")).rejects.toEqual(
    new NotificationApiError(403, "forbidden")
  );
  await expect(api.request(scope, "get")).rejects.toEqual(
    new NotificationApiError(500, "notification_request_failed")
  );
});
