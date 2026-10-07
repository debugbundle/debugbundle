// @vitest-environment jsdom
import { parseRequestBody } from "./helpers/request-body.js";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { chooseSelectOption } from "./helpers/management-ui.js";
import { App } from "../../../apps/web/src/app.js";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.js";
import {
  createAlert,
  createProject,
  createSession,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetBrowserSessionClientState();
});
function mockAlert(alert: ReturnType<typeof createAlert>, availableServices = false) {
  let saved: Record<string, unknown> | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.endsWith("/v1/auth/session")) return jsonResponse(200, { session: createSession() });
      if (url.endsWith("/v1/projects"))
        return jsonResponse(200, { projects: [createProject({ organization_plan: "team" })] });
      if (url.includes("/v1/alerts?")) return jsonResponse(200, { alerts: [alert] });
      if (url.includes("/v1/services?"))
        return jsonResponse(200, {
          services: availableServices
            ? [
                {
                  service_id: "svc_123",
                  project_id: "proj_123",
                  name: "API",
                  runtime: "node",
                  framework: null,
                  environment: "production"
                }
              ]
            : []
        });
      if (url.includes("/v1/alerts/alert_123") && init?.method === "PATCH") {
        saved = parseRequestBody(init.body);
        return jsonResponse(200, {
          alert: {
            ...alert,
            ...saved,
            ...(saved?.["rotate_signing_secret"] ? { signing_secret: "one-time-secret" } : {})
          }
        });
      }
      return jsonResponse(404, { error: "not_found" });
    })
  );
  return () => saved;
}
it.each([
  {
    channel: "discord" as const,
    config: { webhook_url: "https://discord.com/api/webhooks/123/abc", cooldown_scope: "project" }
  },
  {
    channel: "slack" as const,
    config: { webhook_url: "https://hooks.slack.com/services/123", cooldown_scope: "project" }
  }
])("preserves an existing $channel channel and configuration", async (options) => {
  const saved = mockAlert(
    createAlert({ alert_id: "alert_123", ...options, cooldown_seconds: 300, is_enabled: false })
  );
  const user = userEvent.setup();
  render(<App initialEntries={["/projects/proj_123/alerts"]} />);
  await user.click(await screen.findByRole("button", { name: /^edit$/i }));
  await user.click(screen.getByRole("button", { name: /save changes/i }));
  await waitFor(() =>
    expect(saved()).toMatchObject({
      channel: options.channel,
      config: options.config,
      is_enabled: false
    })
  );
});
it("exposes digest settings, service scope and enabled state in the shared editor", async () => {
  const saved = mockAlert(
    createAlert({
      alert_id: "alert_123",
      config: { to: "owner@example.com", aggregation_window_seconds: 30 },
      service_id: "svc_123",
      is_enabled: false,
      cooldown_seconds: 60
    })
  );
  const user = userEvent.setup();
  render(<App initialEntries={["/projects/proj_123/alerts"]} />);
  await user.click(await screen.findByRole("button", { name: /^edit$/i }));
  expect(screen.getByLabelText(/service scope/i)).toHaveTextContent("svc_123");
  expect(screen.getByRole("switch", { name: /^enabled$/i })).not.toBeChecked();
  await user.clear(screen.getByLabelText(/digest window/i));
  await user.type(screen.getByLabelText(/digest window/i), "45");
  await user.click(screen.getByRole("button", { name: /save changes/i }));
  await waitFor(() =>
    expect(saved()).toMatchObject({
      service_id: "svc_123",
      is_enabled: false,
      config: { to: "owner@example.com", aggregation_window_seconds: 45 }
    })
  );
});
it("reveals a rotated webhook signing key once and excludes it from ordinary rule state", async () => {
  const saved = mockAlert(
    createAlert({
      alert_id: "alert_123",
      channel: "webhook",
      config: { target_url: "https://example.com/alerts" }
    })
  );
  const user = userEvent.setup();
  render(<App initialEntries={["/projects/proj_123/alerts"]} />);
  await user.click(await screen.findByRole("button", { name: /^edit$/i }));
  await user.click(screen.getByRole("checkbox", { name: /rotate signing secret/i }));
  await user.click(screen.getByRole("button", { name: /save changes/i }));
  expect(
    await screen.findByRole("region", { name: /new alert signing secret/i })
  ).toHaveTextContent("one-time-secret");
  expect(saved()).toMatchObject({ channel: "webhook", rotate_signing_secret: true });
  await user.click(screen.getByRole("button", { name: /dismiss secret/i }));
  expect(screen.queryByText("one-time-secret")).toBeNull();
});

it("clears service scope and enables an existing email alert without losing recipients", async () => {
  const saved = mockAlert(
    createAlert({
      alert_id: "alert_123",
      service_id: "svc_123",
      is_enabled: false,
      config: { to: "owner@example.com", aggregation_window_seconds: 30 }
    })
  );
  const user = userEvent.setup();
  render(<App initialEntries={["/projects/proj_123/alerts"]} />);
  await user.click(await screen.findByRole("button", { name: /^edit$/i }));
  await chooseSelectOption(user, "Service scope", "All services");
  await user.click(screen.getByRole("switch", { name: /^enabled$/i }));
  await user.click(screen.getByRole("button", { name: /save changes/i }));
  await waitFor(() =>
    expect(saved()).toMatchObject({
      service_id: null,
      is_enabled: true,
      config: { to: "owner@example.com", aggregation_window_seconds: 30 }
    })
  );
});
it("selects an available service and project cooldown scope for an immediate channel", async () => {
  const saved = mockAlert(
    createAlert({
      alert_id: "alert_123",
      channel: "webhook",
      config: { target_url: "https://example.com/alerts" }
    }),
    true
  );
  const user = userEvent.setup();
  render(<App initialEntries={["/projects/proj_123/alerts"]} />);
  await user.click(await screen.findByRole("button", { name: /^edit$/i }));
  await chooseSelectOption(user, "Service scope", "API");
  await chooseSelectOption(user, "Cooldown scope", "Project");
  await user.click(screen.getByRole("button", { name: /save changes/i }));
  await waitFor(() =>
    expect(saved()).toMatchObject({
      service_id: "svc_123",
      config: { target_url: "https://example.com/alerts", cooldown_scope: "project" }
    })
  );
});
