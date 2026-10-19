import { expect, it, vi } from "vitest";
import { handleNotificationCommand } from "../../../apps/cli/src/notification-commands.js";
import { parseArgv } from "../../../apps/cli/src/argv-helpers.js";
it("supports independent email and Slack settings and all-channel pauses", async () => {
  const run = vi.fn().mockResolvedValue({ exitCode: 0, output: "ok" });
  await handleNotificationCommand(
    parseArgv([
      "notifications",
      "set",
      "--audience",
      "shared",
      "--email",
      "daily",
      "--slack",
      "immediate",
      "--time",
      "09:00",
      "--timezone",
      "Europe/Ljubljana"
    ]),
    run
  );
  expect(run).toHaveBeenCalledWith(
    expect.objectContaining({
      audience: "shared",
      action: "update",
      body: {
        channels: { email: "daily", slack: "immediate" },
        daily: { time: "09:00", timezone: "Europe/Ljubljana" }
      }
    })
  );
  await handleNotificationCommand(parseArgv(["notifications", "pause", "--for", "forever"]), run);
  expect(run).toHaveBeenLastCalledWith(
    expect.objectContaining({
      body: { channels: ["email"], until: null, allow_health_checks: false }
    })
  );
});
it("rejects ambiguous pauses and incomplete schedules before requests", async () => {
  const run = vi.fn();
  await expect(
    handleNotificationCommand(
      parseArgv(["notifications", "pause", "--for", "7d", "--until", "2027-01-01T00:00:00Z"]),
      run
    )
  ).rejects.toThrow("Choose");
  await expect(
    handleNotificationCommand(parseArgv(["notifications", "set", "--time", "09:00"]), run)
  ).rejects.toThrow("together");
  expect(run).not.toHaveBeenCalled();
});

it("prints effective policies and returns auth failures through the authenticated command", async () => {
  const { notificationWithAuthCommand } =
    await import("../../../apps/cli/src/notification-commands.js");
  const { notificationResponse } = await import("../../helpers/notification-fixtures.js");
  const body = notificationResponse();
  body.effective.email = {
    mode: "off",
    reason: "account_paused",
    paused_until: null,
    daily: { time: "09:00", timezone: "UTC" }
  };
  const request = vi.fn().mockResolvedValue({ status: 200, body });
  const readAuthState = vi
    .fn()
    .mockResolvedValue({ base_url: "https://api.example.com", bearer_token: "member" });
  const deps = { readAuthState, createHttpClient: () => ({ request }) };
  expect(
    (await notificationWithAuthCommand({ action: "get", audience: "personal" }, deps)).output
  ).toContain("until resumed");
  expect(
    JSON.parse(
      (
        await notificationWithAuthCommand(
          { action: "get", audience: "personal", json: true, authFilePath: "/tmp/example" },
          deps
        )
      ).output
    )
  ).toMatchObject({ audience: "personal" });
  request.mockResolvedValueOnce({ status: 401, body: { error: "unauthorized" } });
  expect(
    await notificationWithAuthCommand({ action: "get", audience: "personal" }, deps)
  ).toMatchObject({ exitCode: 2, output: "unauthorized" });
  readAuthState.mockRejectedValueOnce(new Error("private-file-path"));
  expect(
    await notificationWithAuthCommand({ action: "get", audience: "personal" }, deps)
  ).toMatchObject({ exitCode: 1 });
});
it("supports resume, custom expiry, local schedule inheritance and strict options", async () => {
  const run = vi.fn().mockResolvedValue({ exitCode: 0, output: "ok" });
  await handleNotificationCommand(
    parseArgv(["notifications", "resume", "--audience", "shared", "--channels", "slack,discord"]),
    run
  );
  expect(run).toHaveBeenLastCalledWith(
    expect.objectContaining({ action: "resume", body: { channels: ["slack", "discord"] } })
  );
  await handleNotificationCommand(
    parseArgv([
      "notifications",
      "pause",
      "--until",
      "2027-01-01T00:00:00.000Z",
      "--allow-health-checks",
      "true"
    ]),
    run
  );
  expect(run).toHaveBeenLastCalledWith(
    expect.objectContaining({
      body: { channels: ["email"], until: "2027-01-01T00:00:00.000Z", allow_health_checks: true }
    })
  );
  await handleNotificationCommand(
    parseArgv([
      "notifications",
      "set",
      "--project-id",
      "10000000-0000-4000-8000-000000000001",
      "--email",
      "inherit",
      "--inherit-schedule",
      "true"
    ]),
    run
  );
  expect(run).toHaveBeenLastCalledWith(
    expect.objectContaining({ body: { channels: { email: "inherit" }, daily: null } })
  );
  for (const args of [
    ["pause", "--for", "invalid"],
    ["pause", "--for", "24h", "--allow-health-checks", "maybe"],
    ["set", "--inherit-schedule", "true"],
    ["missing"]
  ]) {
    await expect(
      handleNotificationCommand(parseArgv(["notifications", ...args]), run)
    ).rejects.toThrow();
  }
});
