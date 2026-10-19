import { afterEach, expect, it, vi } from "vitest";
import { requestNotificationPreferences } from "../../../apps/web/src/lib/api-notification-preferences.js";
import { notificationResponse } from "../../helpers/notification-fixtures.js";
vi.mock("../../../apps/web/src/lib/api-client.js", () => ({
  API_BASE: "https://api.example.com",
  buildBrowserSessionHeaders: (json: boolean) =>
    json ? { "Content-Type": "application/json", "X-CSRF-Token": "csrf" } : {}
}));
afterEach(() => vi.unstubAllGlobals());
it("uses cookie credentials and existing CSRF headers for browser mutations", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue({ status: 200, json: async () => notificationResponse() });
  vi.stubGlobal("fetch", fetch);
  await requestNotificationPreferences({ audience: "personal" }, "get");
  expect(fetch).toHaveBeenLastCalledWith(
    "https://api.example.com/v1/account/notification-preferences?audience=personal",
    { method: "GET", credentials: "include", headers: {} }
  );
  await requestNotificationPreferences({ audience: "personal" }, "resume", { channels: ["email"] });
  expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining("/resume?audience=personal"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": "csrf" },
    body: JSON.stringify({ channels: ["email"] })
  });
});
