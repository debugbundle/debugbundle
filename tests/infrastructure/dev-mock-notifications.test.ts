import { expect, it } from "vitest";
import { createDevMockApi } from "../../scripts/dev-mock/api.js";
import { createDevMockFixtures } from "../../scripts/dev-mock/fixtures.js";
import { createNotificationMocks } from "../../scripts/dev-mock/notifications.js";
import { NotificationSettingsResponseSchema } from "../../packages/shared-types/src/notification-preferences.js";

it("supports account/project notification controls in the isolated settings preview", () => {
  const api = createDevMockApi();
  const account = "/v1/account/notification-preferences";
  const project = "/v1/projects/00000000-0000-4000-8000-000000000001/notification-preferences";
  expect(api.handle("GET", account).status).toBe(200);
  const saved = NotificationSettingsResponseSchema.parse(
    api.handle("PATCH", account, {
      channels: { email: "daily" },
      daily: { time: "09:00", timezone: "Europe/Ljubljana" }
    }).body
  );
  expect(saved.effective.email.mode).toBe("daily");
  expect(
    NotificationSettingsResponseSchema.parse(api.handle("GET", project).body).effective.email.daily
  ).toEqual(saved.settings.daily);
  const paused = NotificationSettingsResponseSchema.parse(
    api.handle("POST", `${account}/pause`, {
      channels: ["email"],
      until: null,
      allow_health_checks: true
    }).body
  );
  expect(paused.effective.email.reason).toBe("account_paused");
  api.handle("POST", `${project}/resume`, { channels: ["email"] });
  expect(
    NotificationSettingsResponseSchema.parse(api.handle("GET", project).body).effective.email.reason
  ).toBe("account_paused");
  api.handle("POST", `${account}/resume`, { channels: ["email"] });
  expect(
    NotificationSettingsResponseSchema.parse(api.handle("GET", project).body).effective.email.mode
  ).toBe("daily");
  api.handle("PATCH", `${account}?audience=shared`, { channels: { email: "off", slack: "off" } });
  expect(
    NotificationSettingsResponseSchema.parse(api.handle("GET", project).body).effective.email.mode
  ).toBe("off");
  expect(api.handle("PATCH", account, { channels: { slack: "off" } }).status).toBe(400);
  expect(api.handle("GET", `${account}?audience=unknown`).status).toBe(400);
  expect(api.handle("GET", "/v1/projects/missing/notification-preferences").status).toBe(404);
  expect(
    api.handle("POST", `${account}/pause`, { channels: ["email"], until: "2000-01-01T00:00:00Z" })
      .status
  ).toBe(400);
  api.handle("POST", "/v1/auth/logout");
  expect(api.handle("GET", account).status).toBe(401);
});
it("keeps shared preview controls read-only for members and validates unsupported input", () => {
  const data = createDevMockFixtures();
  const mocks = createNotificationMocks(data, () => true);
  const project = data.projects[0]!;
  const path = `/v1/projects/${String(project["project_id"])}/notification-preferences`;
  const shared = new URLSearchParams("audience=shared");
  project["owner_user_id"] = "another_user";
  project["effective_role"] = "member";
  expect(
    NotificationSettingsResponseSchema.parse(mocks.handle("GET", path, shared)!.body).can_manage
  ).toBe(false);
  expect(mocks.handle("PATCH", path, shared, { channels: { email: "off" } })!.status).toBe(403);
  project["effective_role"] = "admin";
  expect(mocks.handle("PATCH", path, shared, { channels: { email: "daily" } })!.status).toBe(200);
  expect(mocks.handle("DELETE", path, shared)!.status).toBe(405);
  expect(mocks.handle("PATCH", path, shared, { unknown: true })!.status).toBe(400);
  expect(
    mocks.handle("PATCH", path, shared, { pause: { channels: ["email"], until: null } })!.status
  ).toBe(400);
  expect(
    mocks.handle("PATCH", "/v1/account/notification-preferences", shared, {
      channels: { email: "inherit" }
    })!.status
  ).toBe(400);
  expect(mocks.handle("GET", "/v1/projects", shared)).toBeNull();
  const fresh = createDevMockApi();
  expect(
    NotificationSettingsResponseSchema.parse(
      fresh.handle("GET", "/v1/account/notification-preferences").body
    ).effective.email.mode
  ).toBe("immediate");
});
