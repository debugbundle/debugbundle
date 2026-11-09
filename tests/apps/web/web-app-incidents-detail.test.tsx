// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "../../../apps/web/src/app.js";
import {
  createIncident,
  createProject,
  createSession,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";
import { registerIncidentTestCleanup } from "../../helpers/web-incidents.js";

registerIncidentTestCleanup();

describe("web app — incidents detail", () => {
  it("shows incident detail page with metadata, severity badge, and bundle/reproduction tabs", async () => {
    const incident = createIncident({
      fingerprint:
        "fp_checkout_timeout_route_template_production_checkout_api_1234567890abcdefghijklmnopqrstuvwxyz"
    });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}`)) {
        return jsonResponse(200, { incident });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}/bundle`)) {
        return jsonResponse(200, {
          bundle_id: "bundle_123",
          incident_id: incident.incident_id,
          project_id: incident.project_id,
          version: "v1",
          summary: {
            title: incident.title,
            severity: incident.severity,
            environment: incident.environment
          }
        });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}/reproduction`)) {
        return jsonResponse(200, { steps: ["step 1", "step 2"] });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<App initialEntries={[`/incidents/${incident.incident_id}`]} />);

    expect(await screen.findByText(/typeerror in checkout handler/i)).toBeInTheDocument();
    expect(screen.getByText(/^high$/i)).toBeInTheDocument();
    expect(screen.getByText(/^open$/i)).toBeInTheDocument();
    expect(screen.getByText(String(incident.occurrence_count))).toBeInTheDocument();

    // Verify the back link exists
    const backLinks = screen.getAllByRole("link", { name: /back to incidents/i });
    expect(backLinks.length).toBeGreaterThan(0);
    expect(backLinks[0]).toHaveAttribute("href", "/incidents");

    // Bundle tab loads by default — verify the bundle card content
    expect(await screen.findByText(/full bundle artifact for this incident/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^copy$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download/i })).toBeInTheDocument();

    const fingerprintValue = screen.getByText(incident.fingerprint);
    expect(fingerprintValue).toHaveAttribute("title", incident.fingerprint);
    expect(fingerprintValue.className.includes("truncate")).toBe(true);
    expect(screen.queryByText(/^fingerprint version$/i)).toBeNull();

    const incidentCopyButton = screen.getByRole("button", { name: /copy incident id/i });
    const incidentRow = incidentCopyButton.parentElement;
    expect(incidentRow).not.toBeNull();
    expect(within(incidentRow as HTMLElement).getByText(incident.incident_id)).toBeInTheDocument();
    expect(incidentCopyButton).toBeInTheDocument();

    const fingerprintRow = screen.getByText(/^fingerprint$/i).closest("div");
    expect(fingerprintRow).not.toBeNull();
    expect(within(fingerprintRow as HTMLElement).getByText(/^v1$/i)).toBeInTheDocument();

    expect(container.querySelector('[data-token="property"]')).not.toBeNull();
    expect(container.querySelector('[data-token="string"]')).not.toBeNull();
  });

  it("shows regressed incident detail status with the destructive badge variant", async () => {
    const incident = createIncident({
      incident_id: "inc_regressed_detail",
      status: "regressed"
    });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}`)) {
        return jsonResponse(200, { incident });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}/bundle`)) {
        return jsonResponse(200, { status: "pending" });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}/reproduction`)) {
        return jsonResponse(200, { status: "pending" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[`/incidents/${incident.incident_id}`]} />);

    expect(await screen.findByText(/typeerror in checkout handler/i)).toBeInTheDocument();
    expect(screen.getByText(/^regressed$/i)).toHaveAttribute("data-variant", "destructive");
  });

  it("formats request-anomaly grouping copy on the incident detail page", async () => {
    const incident = createIncident({
      title: "Request anomaly: GET /checkout/:orderId returned 404 repeatedly",
      matched_fields: ["request_anomaly", "route_template", "http_method", "http_status"]
    });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}`)) {
        return jsonResponse(200, { incident });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}/bundle`)) {
        return jsonResponse(200, { status: "pending" });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}/reproduction`)) {
        return jsonResponse(200, { status: "pending" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[`/incidents/${incident.incident_id}`]} />);

    expect(
      await screen.findByText(/request anomaly: get \/checkout\/:orderid returned 404 repeatedly/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Request anomaly threshold crossed. Grouped by route template, HTTP method, and HTTP status."
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/request_anomaly, route_template, http_method, http_status/i)
    ).toBeNull();
  });

  it("allows resolving an incident from the detail page", async () => {
    const incident = createIncident();
    const resolvedIncident = createIncident({
      incident_id: incident.incident_id,
      status: "resolved",
      resolved_at: "2026-03-17T00:06:00.000Z"
    });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.includes("/v1/projects?") && url.includes(`project_id=${incident.project_id}`)) {
        return jsonResponse(200, {
          projects: [
            { ...createProject({ project_id: incident.project_id }), effective_role: "owner" }
          ]
        });
      }

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}`) && init?.method === undefined) {
        return jsonResponse(200, { incident });
      }

      if (
        url.endsWith(`/v1/incidents/${incident.incident_id}/resolve`) &&
        init?.method === "POST"
      ) {
        return jsonResponse(200, { incident: resolvedIncident });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}/bundle`)) {
        return jsonResponse(200, { status: "pending" });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}/reproduction`)) {
        return jsonResponse(200, { status: "pending" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[`/incidents/${incident.incident_id}`]} />);

    const user = userEvent.setup();

    expect(await screen.findByText(/typeerror in checkout handler/i)).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /mark resolved/i }));

    expect(await screen.findByText(/^resolved$/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark resolved/i })).toBeNull();
    const resolveCall = fetchMock.mock.calls.find(([input]) =>
      requestUrl(input).includes(`/v1/incidents/${incident.incident_id}/resolve`)
    );
    expect(resolveCall).toBeDefined();
    if (resolveCall === undefined) {
      throw new Error("expected_resolve_call");
    }
    const [, resolveInit] = resolveCall;
    expect(resolveInit?.method).toBe("POST");
    expect(resolveInit?.credentials).toBe("include");
    expect(resolveInit?.headers).toEqual(
      expect.objectContaining({
        "X-CSRF-Token": "csrf-token-123"
      })
    );
  });

  it("shows pending state when bundle is still being generated", async () => {
    const incident = createIncident();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}`)) {
        return jsonResponse(200, { incident });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}/bundle`)) {
        return jsonResponse(200, { status: "pending" });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}/reproduction`)) {
        return jsonResponse(200, { status: "pending" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[`/incidents/${incident.incident_id}`]} />);

    expect(await screen.findByText(/typeerror in checkout handler/i)).toBeInTheDocument();
    const pendingTitle = await screen.findByText(/bundle is being generated/i);
    expect(pendingTitle).toBeInTheDocument();
    expect(pendingTitle.closest("[data-tone='neutral']")).not.toBeNull();
    expect(
      pendingTitle.closest("[data-tone='neutral']")?.querySelector(".animate-spin")
    ).not.toBeNull();
  });

  it("polls a pending bundle until the artifact is ready", async () => {
    const incident = createIncident();
    let bundleRequestCount = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}`)) {
        return jsonResponse(200, { incident });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}/bundle`)) {
        bundleRequestCount += 1;
        if (bundleRequestCount === 1) {
          return jsonResponse(200, { status: "pending" });
        }

        return jsonResponse(200, {
          bundle_id: "bundle_123",
          incident_id: incident.incident_id,
          project_id: incident.project_id,
          version: "v1",
          summary: {
            title: incident.title,
            severity: incident.severity,
            environment: incident.environment
          }
        });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}/reproduction`)) {
        return jsonResponse(200, { status: "pending" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[`/incidents/${incident.incident_id}`]} />);

    expect(await screen.findByText(/bundle is being generated/i)).toBeInTheDocument();

    expect(
      await screen.findByText(/full bundle artifact for this incident/i, undefined, {
        timeout: 4_000
      })
    ).toBeInTheDocument();
    expect(bundleRequestCount).toBe(2);
  });

  it("shows unavailable bundle and reproduction callouts when artifact generation fails", async () => {
    const incident = createIncident();
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}`)) {
        return jsonResponse(200, { incident });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}/bundle`)) {
        return jsonResponse(200, { status: "failed" });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}/reproduction`)) {
        return jsonResponse(200, { status: "failed" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[`/incidents/${incident.incident_id}`]} />);

    expect(await screen.findByText(/bundle generation failed/i)).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /reproduction/i }));
    expect(await screen.findByText(/reproduction not available/i)).toBeInTheDocument();
  });

  it("shows error state when incident is not found", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/incidents/inc_nonexistent")) {
        return jsonResponse(404, { error: "not_found" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/incidents/inc_nonexistent"]} />);

    expect(await screen.findByText(/incident not available/i)).toBeInTheDocument();
    const backLinks = screen.getAllByRole("link", { name: /back to incidents/i });
    expect(backLinks.length).toBeGreaterThan(0);
  });

  it("copies and downloads bundle and reproduction artifacts from the incident detail page", async () => {
    const incident = createIncident();
    const user = userEvent.setup();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    const createObjectUrlMock = vi.fn(() => "blob:incident-artifact");
    const revokeObjectUrlMock = vi.fn();
    const clickMock = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: writeTextMock
      }
    });
    vi.stubGlobal("URL", {
      createObjectURL: createObjectUrlMock,
      revokeObjectURL: revokeObjectUrlMock
    });

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}`)) {
        return jsonResponse(200, { incident });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}/bundle`)) {
        return jsonResponse(200, { bundle_id: "bundle_123", summary: { title: incident.title } });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}/reproduction`)) {
        return jsonResponse(200, { steps: ["step 1"], command: "pnpm test" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[`/incidents/${incident.incident_id}`]} />);

    await screen.findByText(/typeerror in checkout handler/i);

    const copyButtons = await screen.findAllByRole("button", { name: /^copy$/i });
    const downloadButtons = await screen.findAllByRole("button", { name: /^download$/i });
    await user.click(copyButtons[0] as HTMLButtonElement);
    await user.click(downloadButtons[0] as HTMLButtonElement);

    await user.click(screen.getByRole("tab", { name: /reproduction/i }));
    const reproCopyButtons = await screen.findAllByRole("button", { name: /^copy$/i });
    const reproDownloadButtons = await screen.findAllByRole("button", { name: /^download$/i });
    await user.click(reproCopyButtons[0] as HTMLButtonElement);
    await user.click(reproDownloadButtons[0] as HTMLButtonElement);

    expect(writeTextMock).toHaveBeenCalledTimes(2);
    expect(createObjectUrlMock).toHaveBeenCalledTimes(2);
    expect(clickMock).toHaveBeenCalledTimes(2);
    expect(revokeObjectUrlMock).toHaveBeenCalledWith("blob:incident-artifact");
  });
});
