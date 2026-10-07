// @vitest-environment jsdom
import { parseRequestBody } from "./helpers/request-body.js";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
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
it("keeps an API-configured digest window when the recipient is edited in the dashboard", async () => {
  const user = userEvent.setup();
  const alert = createAlert({
    alert_id: "alert_123",
    config: { to: "owner@example.com", aggregation_window_seconds: 30 },
    cooldown_seconds: 86400
  });
  let saved: Record<string, unknown> | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.endsWith("/v1/auth/session")) return jsonResponse(200, { session: createSession() });
      if (url.endsWith("/v1/projects"))
        return jsonResponse(200, { projects: [createProject({ organization_plan: "team" })] });
      if (url.endsWith("/v1/alerts?project_id=proj_123&limit=20"))
        return jsonResponse(200, { alerts: [alert] });
      if (url.endsWith("/v1/alerts/alert_123?project_id=proj_123") && init?.method === "PATCH") {
        if (typeof init.body !== "string") throw new Error("Expected JSON request body");
        saved = JSON.parse(init.body);
        return jsonResponse(200, { alert: { ...alert, ...saved } });
      }
      return jsonResponse(404, { error: "not_found" });
    })
  );
  render(<App initialEntries={["/projects/proj_123/alerts"]} />);
  await screen.findByText(/email - owner@example.com/i);
  await user.click(screen.getByRole("button", { name: /^edit$/i }));
  const recipient = await screen.findByLabelText(/recipient email/i);
  await user.clear(recipient);
  await user.type(recipient, "new@example.com");
  await user.click(screen.getByRole("button", { name: /save changes/i }));
  await waitFor(() =>
    expect(saved?.["config"]).toEqual({ to: "new@example.com", aggregation_window_seconds: 30 })
  );
});

it.each([0, 60, 300, 3600, 604800])(
  "round-trips an existing %i-second alert cooldown",
  async (seconds) => {
    const user = userEvent.setup();
    const alert = createAlert({
      alert_id: "alert_123",
      severity_min: "high",
      cooldown_seconds: seconds,
      config: { to: "owner@example.com" }
    });
    let saved: Record<string, unknown> | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);
        if (url.endsWith("/v1/auth/session"))
          return jsonResponse(200, { session: createSession() });
        if (url.endsWith("/v1/projects"))
          return jsonResponse(200, { projects: [createProject({ organization_plan: "team" })] });
        if (url.includes("/v1/alerts?")) return jsonResponse(200, { alerts: [alert] });
        if (url.includes("/v1/alerts/alert_123") && init?.method === "PATCH") {
          saved = parseRequestBody(init.body);
          return jsonResponse(200, { alert: { ...alert, ...saved } });
        }
        return jsonResponse(404, { error: "not_found" });
      })
    );
    render(<App initialEntries={["/projects/proj_123/alerts"]} />);
    await user.click(await screen.findByRole("button", { name: /^edit$/i }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(saved?.["cooldown_seconds"]).toBe(seconds));
  }
);
it("clears the stored severity when Any severity is selected", async () => {
  const user = userEvent.setup();
  const alert = createAlert({
    alert_id: "alert_123",
    severity_min: "high",
    cooldown_seconds: 86400,
    config: { to: "owner@example.com" }
  });
  let saved: Record<string, unknown> | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.endsWith("/v1/auth/session")) return jsonResponse(200, { session: createSession() });
      if (url.endsWith("/v1/projects"))
        return jsonResponse(200, { projects: [createProject({ organization_plan: "team" })] });
      if (url.includes("/v1/alerts?")) return jsonResponse(200, { alerts: [alert] });
      if (url.includes("/v1/alerts/alert_123") && init?.method === "PATCH") {
        saved = parseRequestBody(init.body);
        return jsonResponse(200, { alert: { ...alert, ...saved } });
      }
      return jsonResponse(404, { error: "not_found" });
    })
  );
  render(<App initialEntries={["/projects/proj_123/alerts"]} />);
  await user.click(await screen.findByRole("button", { name: /^edit$/i }));
  const trigger = await screen.findByLabelText(/minimum severity/i);
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "ArrowDown", code: "ArrowDown" });
  await user.click(await screen.findByRole("option", { name: /^any severity$/i }));
  await user.click(screen.getByRole("button", { name: /save changes/i }));
  await waitFor(() => expect(saved).toHaveProperty("severity_min", null));
});
