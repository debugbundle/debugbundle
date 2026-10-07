// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "../../../apps/web/src/app.js";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.js";
import { buildIncidentContextRecord } from "../../../packages/storage/src/incident-context.js";
import {
  createIncident,
  createProject,
  createSession,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";
afterEach(() => {
  cleanup();
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});
function setup(failed = false, failLogsOnce = false) {
  let logRequests = 0;
  const incident = createIncident();
  const context = buildIncidentContextRecord({
    incident: { ...incident, latest_deployment_id: null },
    bundle: { status: "pending" },
    reproduction: { status: "failed", reason: "expired" },
    logs: { logs: [], next_cursor: null }
  });
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      requests.push(url);
      if (url.endsWith("/auth/session")) return jsonResponse(200, { session: createSession() });
      if (url.endsWith("/projects")) return jsonResponse(200, { projects: [createProject()] });
      if (url.endsWith(`/incidents/${incident.incident_id}`))
        return jsonResponse(200, { incident });
      if (url.endsWith("/context"))
        return failed
          ? jsonResponse(404, { error: "incident_not_found" })
          : jsonResponse(200, context);
      if (url.includes("/v1/logs?")) {
        logRequests += 1;
        if (failLogsOnce && logRequests === 1) return jsonResponse(503, { error: "unavailable" });
        return jsonResponse(200, {
          logs: [
            {
              event_id: url.includes("cursor=") ? "event_2" : "event_1",
              event_type: "log_event",
              occurred_at: "2026-10-07T10:00:00Z",
              level: "warn",
              is_sampled: true
            }
          ],
          next_cursor: url.includes("cursor=") || url.includes("level=") ? null : "next-log"
        });
      }
      return jsonResponse(404, { error: "not_found" });
    })
  );
  return { requests, incident };
}
it("exposes the one-call context with partial artifact status and retry", async () => {
  const { incident, requests } = setup();
  const user = userEvent.setup();
  render(<App initialEntries={[`/incidents/${incident.incident_id}`]} />);
  await user.click(await screen.findByRole("tab", { name: "Context" }));
  expect(await screen.findByText("Bundle: pending")).toBeInTheDocument();
  expect(screen.getByText("Reproduction: failed")).toBeInTheDocument();
  expect(requests.some((url) => url.endsWith(`/incidents/${incident.incident_id}/context`))).toBe(
    true
  );
  await user.click(screen.getByRole("button", { name: "Refresh incident context" }));
  await waitFor(() => expect(requests.filter((url) => url.endsWith("/context"))).toHaveLength(2));
});
it("pages incident log metadata and resets cursors when filtering level", async () => {
  const { incident, requests } = setup();
  const user = userEvent.setup();
  render(<App initialEntries={[`/incidents/${incident.incident_id}`]} />);
  await user.click(await screen.findByRole("tab", { name: "Logs" }));
  expect(await screen.findByText("event_1")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Next logs" }));
  expect(await screen.findByText("event_2")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Previous logs" }));
  expect(await screen.findByText("event_1")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Log level"), { target: { value: "warn" } });
  await user.click(screen.getByRole("button", { name: "Apply log level" }));
  await waitFor(() => expect(requests.at(-1)).toContain("level=warn"));
  expect(requests.at(-1)).not.toContain("cursor=");
  expect(
    requests
      .filter((url) => url.includes("/v1/logs?"))
      .every(
        (url) => url.includes(`incident_id=${incident.incident_id}`) && url.includes("limit=20")
      )
  ).toBe(true);
});
it("recovers log inventory after a server failure and resets paging when its limit changes", async () => {
  const { incident, requests } = setup(false, true);
  const user = userEvent.setup();
  render(<App initialEntries={[`/incidents/${incident.incident_id}`]} />);
  await user.click(await screen.findByRole("tab", { name: "Logs" }));
  await user.click(await screen.findByRole("button", { name: "Retry incident logs" }));
  await screen.findByText("event_1");
  await user.click(screen.getByRole("button", { name: "Next logs" }));
  await screen.findByText("event_2");
  fireEvent.change(screen.getByLabelText("Log page limit"), { target: { value: "100" } });
  await user.click(screen.getByRole("button", { name: "Apply log page limit" }));
  await waitFor(() => expect(requests.at(-1)).toContain("limit=100"));
  expect(requests.at(-1)).not.toContain("cursor=");
  expect(await screen.findByText("event_1")).toBeInTheDocument();
});
it("offers retry when context is unavailable without displaying an internal error", async () => {
  const { incident } = setup(true);
  const user = userEvent.setup();
  render(<App initialEntries={[`/incidents/${incident.incident_id}`]} />);
  await user.click(await screen.findByRole("tab", { name: "Context" }));
  expect(await screen.findByText("Incident context is unavailable.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Refresh incident context" })).toBeInTheDocument();
});
