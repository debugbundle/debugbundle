// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeAll, afterAll, beforeEach, expect, it, vi } from "vitest";
import { NotificationSettings } from "../../../apps/web/src/components/system/notification-settings.js";
import {
  defaultNotificationPreferences,
  resolveNotificationPolicy,
  NOTIFICATION_CHANNELS
} from "../../../packages/shared-types/src/notification-preferences.js";
// jsdom lacks these standard browser APIs used by Radix Select pointer interactions.
const browserMethods = [
  "hasPointerCapture",
  "setPointerCapture",
  "releasePointerCapture",
  "scrollIntoView"
] as const;
const originalMethods = new Map<string, PropertyDescriptor | undefined>();
beforeAll(() => {
  for (const name of browserMethods) {
    originalMethods.set(name, Object.getOwnPropertyDescriptor(HTMLElement.prototype, name));
    Object.defineProperty(HTMLElement.prototype, name, {
      configurable: true,
      value: name === "hasPointerCapture" ? () => false : () => undefined
    });
  }
});
afterAll(() => {
  for (const name of browserMethods) {
    const descriptor = originalMethods.get(name);
    if (descriptor === undefined) Reflect.deleteProperty(HTMLElement.prototype, name);
    else Object.defineProperty(HTMLElement.prototype, name, descriptor);
  }
});
const request = vi.hoisted(() => vi.fn());
vi.mock("../../../apps/web/src/lib/api-notification-preferences.js", () => ({
  requestNotificationPreferences: request
}));
function response() {
  const settings = defaultNotificationPreferences();
  return {
    audience: "personal",
    project_id: null,
    can_manage: true,
    settings,
    account: settings,
    effective: Object.fromEntries(
      NOTIFICATION_CHANNELS.map((channel) => [
        channel,
        resolveNotificationPolicy({ account: settings, channel, now: new Date() })
      ])
    )
  };
}
beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue(response());
});
it("shows progress only on the notification action being submitted", async () => {
  render(<NotificationSettings />);
  await screen.findByLabelText("Email delivery");
  let finish!: (value: ReturnType<typeof response>) => void;
  request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  fireEvent.click(screen.getByRole("button", { name: "Pause notifications" }));
  expect(screen.getByRole("button", { name: "Pausing…" })).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("button", { name: "Save notification settings" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Save notification settings" })).not.toHaveAttribute(
    "aria-busy"
  );
  expect(screen.getByRole("button", { name: "Resume now" })).not.toHaveAttribute("aria-busy");
  finish(response());
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Pause notifications" })).toBeEnabled()
  );
});
it("offers personal email settings and pauses with explicit selected channels", async () => {
  const user = userEvent.setup();
  render(<NotificationSettings />);
  await screen.findByLabelText("Email delivery");
  await user.click(screen.getByRole("button", { name: "Pause notifications" }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      { audience: "personal" },
      "pause",
      expect.objectContaining({ channels: ["email"], allow_health_checks: false })
    )
  );
});
it("shows a retryable load error", async () => {
  request.mockRejectedValueOnce(new Error("unavailable"));
  const user = userEvent.setup();
  render(<NotificationSettings />);
  await screen.findByRole("alert");
  await user.click(screen.getByRole("button", { name: "Retry notification settings" }));
  await screen.findByLabelText("Email delivery");
  expect(request).toHaveBeenCalledTimes(2);
});

it("retains a daily schedule draft after save failure and after pausing", async () => {
  const value = response();
  value.settings.channels.email = "daily";
  request.mockResolvedValue(value);
  const user = userEvent.setup();
  render(<NotificationSettings />);
  await user.click(await screen.findByRole("combobox", { name: "Hour" }));
  await user.click(screen.getByRole("option", { name: "Custom time…" }));
  const time = screen.getByLabelText("Custom time");
  fireEvent.change(time, { target: { value: "08:30" } });
  request.mockRejectedValueOnce(new Error("offline"));
  await user.click(screen.getByRole("button", { name: "Save notification settings" }));
  await screen.findByRole("alert");
  expect(time).toHaveValue("08:30");
  await user.click(screen.getByRole("button", { name: "Pause notifications" }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith({ audience: "personal" }, "pause", expect.any(Object))
  );
  expect(time).toHaveValue("08:30");
  await user.click(screen.getByRole("button", { name: "Save notification settings" }));
  await waitFor(() =>
    expect(request).toHaveBeenLastCalledWith(
      { audience: "personal" },
      "update",
      expect.objectContaining({ daily: { time: "08:30", timezone: "UTC" } })
    )
  );
});
it("disables shared mutations for readers and ignores a late response from a previous project", async () => {
  let finish!: (value: ReturnType<typeof response>) => void;
  request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const view = render(<NotificationSettings projectId="old" />);
  fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
  const value = response();
  value.can_manage = false;
  request.mockResolvedValue(value);
  view.rerender(<NotificationSettings projectId="new" />);
  await screen.findByLabelText("Email delivery");
  finish(response());
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save notification settings" })).toBeDisabled()
  );
  expect(screen.getByRole("button", { name: "Pause notifications" })).toBeDisabled();
});

it("edits a shared project schedule with inheritance and validates time zones", async () => {
  const value = response();
  value.account.channels.email = "daily";
  const project = defaultNotificationPreferences(true);
  request.mockImplementation(async (scope: { audience: string }) => ({
    ...value,
    audience: scope.audience,
    project_id: "project",
    settings: project
  }));
  const user = userEvent.setup();
  render(<NotificationSettings projectId="project" />);
  expect(screen.queryByLabelText("Email delivery")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Notifications" }));
  await screen.findByLabelText("Email delivery");
  await user.click(screen.getByRole("combobox", { name: "Who these settings affect" }));
  await user.click(screen.getByRole("option", { name: "Shared destinations — affects the team" }));
  await screen.findByLabelText("Slack delivery");
  expect(screen.getByRole("combobox", { name: "Hour" })).toBeDisabled();
  await user.click(screen.getByRole("combobox", { name: "Daily schedule" }));
  await user.click(screen.getByRole("option", { name: "Custom schedule" }));
  fireEvent.change(screen.getByLabelText("Timezone"), { target: { value: "Mars" } });
  expect(screen.getByRole("button", { name: "Save notification settings" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Use device time zone" }));
  expect(screen.getByLabelText("Timezone")).toHaveValue(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  await user.click(screen.getByRole("combobox", { name: "Slack delivery" }));
  await user.click(screen.getByRole("option", { name: "Off" }));
  await user.click(screen.getByRole("button", { name: "Save notification settings" }));
  await waitFor(() =>
    expect(request).toHaveBeenLastCalledWith(
      { audience: "shared", projectId: "project" },
      "update",
      expect.objectContaining({ channels: expect.objectContaining({ slack: "off" }) })
    )
  );
});
it("supports selective, weekly, indefinite and custom pauses and resumes", async () => {
  const { NotificationPauseFields } =
    await import("../../../apps/web/src/components/system/notification-pause-fields.js");
  const settings = defaultNotificationPreferences();
  settings.pauses.email = { until: null, allow_health_checks: false };
  const onPause = vi.fn(),
    onResume = vi.fn(),
    user = userEvent.setup();
  render(
    <NotificationPauseFields
      channels={["email", "slack"]}
      disabled={false}
      settings={settings}
      onPause={onPause}
      onResume={onResume}
    />
  );
  await user.click(screen.getByLabelText("All channels in this scope"));
  expect(screen.getByRole("button", { name: "Pause notifications" })).toBeDisabled();
  await user.click(screen.getByLabelText("Email", { exact: true }));
  await user.click(screen.getByLabelText("Allow health-check alerts while paused"));
  for (const name of ["1 week", "Until resumed"]) {
    await user.click(screen.getByRole("combobox", { name: "Pause for" }));
    await user.click(screen.getByRole("option", { name }));
    await user.click(screen.getByRole("button", { name: "Pause notifications" }));
  }
  expect(onPause).toHaveBeenLastCalledWith({
    channels: ["email"],
    until: null,
    allow_health_checks: true
  });
  await user.click(screen.getByRole("button", { name: "Resume now" }));
  expect(onResume).toHaveBeenCalledWith(["email"]);
  await user.click(screen.getByRole("combobox", { name: "Pause for" }));
  await user.click(screen.getByRole("option", { name: "Until a specific time" }));
  await user.click(screen.getByRole("button", { name: "Pause notifications" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Choose a future end time");
  const custom = new Date(Date.now() + 86400000).toISOString().slice(0, 16);
  fireEvent.change(screen.getByLabelText("Resume at (your device’s local time)"), {
    target: { value: custom }
  });
  await user.click(screen.getByRole("button", { name: "Pause notifications" }));
  expect(onPause).toHaveBeenLastCalledWith({
    channels: ["email"],
    until: new Date(custom).toISOString(),
    allow_health_checks: true
  });
  await user.click(screen.getByLabelText("Email", { exact: true }));
  expect(screen.getByRole("button", { name: "Pause notifications" })).toBeDisabled();
});

it("shows that an account pause wins and cannot be resumed from the project", async () => {
  const user = userEvent.setup();
  const value = response();
  value.account.pauses.email = {
    until: new Date(Date.now() + 86400000).toISOString(),
    allow_health_checks: false
  };
  const project = defaultNotificationPreferences(true);
  project.channels.email = "immediate";
  request.mockResolvedValue({ ...value, project_id: "project", settings: project });
  render(<NotificationSettings projectId="project" />);
  expect(screen.queryByLabelText("Email delivery")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Notifications" }));
  expect(await screen.findByText(/Paused by account settings until/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Resume now" })).toBeDisabled();
});

it("reveals configurable daily time and timezone when switching account email to a daily digest", async () => {
  request.mockResolvedValue(response());
  const user = userEvent.setup();
  render(<NotificationSettings />);
  await screen.findByLabelText("Email delivery");
  expect(screen.queryByRole("combobox", { name: "Hour" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("combobox", { name: "Email delivery" }));
  await user.click(screen.getByRole("option", { name: "Daily digest" }));
  const hour = screen.getByRole("combobox", { name: "Hour" });
  expect(hour.closest(".grid")).toHaveClass("sm:grid-cols-[1fr_0.75fr]");
  await user.click(hour);
  await user.click(screen.getByRole("option", { name: "08:00" }));
  expect(hour).toHaveTextContent("08:00");
  await user.click(hour);
  await user.click(screen.getByRole("option", { name: "Custom time…" }));
  fireEvent.change(screen.getByLabelText("Custom time"), { target: { value: "08:30" } });
  fireEvent.change(screen.getByLabelText("Timezone"), { target: { value: "Europe/Ljubljana" } });
  await user.click(screen.getByRole("button", { name: "Save notification settings" }));
  await waitFor(() =>
    expect(request).toHaveBeenLastCalledWith(
      { audience: "personal" },
      "update",
      expect.objectContaining({
        channels: { email: "daily" },
        daily: { time: "08:30", timezone: "Europe/Ljubljana" }
      })
    )
  );
});

it("preserves a saved minute-level schedule and permits switching back to an hourly choice", async () => {
  const value = response();
  value.settings.channels.email = "daily";
  value.settings.daily = { time: "08:17", timezone: "Europe/Ljubljana" };
  request.mockResolvedValue(value);
  const user = userEvent.setup();
  render(<NotificationSettings />);
  expect(await screen.findByLabelText("Custom time")).toHaveValue("08:17");
  expect(screen.getByLabelText("Timezone")).toHaveValue("Europe/Ljubljana");
  expect(screen.getByRole("button", { name: "Use device time zone" })).toHaveClass("w-fit");
  await user.click(screen.getByRole("combobox", { name: "Hour" }));
  await user.click(screen.getByRole("option", { name: "10:00" }));
  expect(screen.queryByLabelText("Custom time")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Save notification settings" }));
  await waitFor(() =>
    expect(request).toHaveBeenLastCalledWith(
      { audience: "personal" },
      "update",
      expect.objectContaining({
        daily: { time: "10:00", timezone: "Europe/Ljubljana" }
      })
    )
  );
});
