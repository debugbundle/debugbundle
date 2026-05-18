// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState, type ImprovementRecord } from "../../../apps/web/src/lib/api.ts";
import { createProject, createSession, jsonResponse, requestUrl } from "./web-test-helpers.js";

function createImprovement(overrides: Partial<ImprovementRecord> = {}): ImprovementRecord {
  return {
    improvement_id: "imp_123",
    project_id: "proj_123",
    project_name: "Main App",
    project_slug: "main-app",
    service_id: null,
    service_name: "checkout-api",
    service_runtime: "node",
    service_framework: "fastify",
    environment: "production",
    kind: "warning_hotspot",
    status: "open",
    severity: "medium",
    confidence: 0.78,
    fingerprint: "fp_warning_hotspot",
    title: "Warning hotspot: payment provider warning",
    summary: "Repeated warning log pattern detected for checkout-api in production.",
    occurrence_count: 7,
    evidence: {
      kind: "warning_hotspot",
      normalized_message: "payment provider warning"
    },
    first_detected_at: "2026-05-18T12:00:00.000Z",
    last_detected_at: "2026-05-18T12:30:00.000Z",
    resolved_at: null,
    snoozed_until: null,
    bundle_generation_number: 1,
    bundle_created_at: "2026-05-18T12:31:00.000Z",
    bundle_updated_at: "2026-05-18T12:31:00.000Z",
    bundle_failure_reason: null,
    ...overrides
  };
}

afterEach(() => {
  resetBrowserSessionClientState();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("web app — improvements", () => {
  it("shows an upgrade notice on the workspace improvements page for free plans without calling hosted improvement routes", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession({ organization_plan: "free" }) });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/improvements"]} />);

    expect(await screen.findByText(/upgrade to solo or team to unlock hosted improvements/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open billing/i })).toHaveAttribute("href", "/billing");
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).includes("/v1/improvements"))).toBe(false);
  });

  it("renders the workspace improvements page", async () => {
    const improvement = createImprovement();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = requestUrl(input);

        if (url.endsWith("/v1/auth/session")) {
          return jsonResponse(200, { session: createSession() });
        }

        if (url.includes("/v1/improvements?")) {
          return jsonResponse(200, { improvements: [improvement], next_cursor: null });
        }

        return jsonResponse(404, { error: "not_found" });
      })
    );

    render(<App initialEntries={["/improvements"]} />);

    expect(await screen.findByText(/warning hotspot: payment provider warning/i)).toBeInTheDocument();
    expect(screen.getByText(/repeated warning log pattern detected/i)).toBeInTheDocument();
    expect(screen.getAllByText(/^open$/i).length).toBeGreaterThan(0);
  });

  it("shows an upgrade notice on the project improvements tab for free plans without calling hosted improvement routes", async () => {
    const project = createProject({ project_id: "proj_123", name: "Main App", organization_plan: "free" });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession({ organization_plan: "free" }) });
      }
      if (url.endsWith("/v1/projects")) {
        return jsonResponse(200, { projects: [project] });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/improvements"]} />);

    expect(await screen.findByText(/upgrade to solo or team to unlock hosted improvements/i)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /improvements/i })).toHaveAttribute("data-state", "active");
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).includes("/v1/improvements"))).toBe(false);
  });

  it("renders the project improvements tab", async () => {
    const project = createProject({ project_id: "proj_123", name: "Main App", organization_plan: "solo" });
    const improvement = createImprovement();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = requestUrl(input);

        if (url.endsWith("/v1/auth/session")) {
          return jsonResponse(200, { session: createSession({ organization_plan: "solo" }) });
        }
        if (url.endsWith("/v1/projects")) {
          return jsonResponse(200, { projects: [project] });
        }
        if (url.includes("/v1/improvements?") && url.includes("project_id=proj_123")) {
          return jsonResponse(200, { improvements: [improvement], next_cursor: null });
        }

        return jsonResponse(404, { error: "not_found" });
      })
    );

    render(<App initialEntries={["/projects/proj_123/improvements"]} />);

    expect(await screen.findByText(/project improvements/i)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /improvements/i })).toHaveAttribute("data-state", "active");
    expect(await screen.findByText(/warning hotspot: payment provider warning/i)).toBeInTheDocument();
  });

  it("allows resolving an improvement from the detail page", async () => {
    const improvement = createImprovement();
    const resolvedImprovement = createImprovement({
      status: "resolved",
      resolved_at: "2026-05-18T13:00:00.000Z"
    });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession({ organization_plan: "solo" }) });
      }
      if (url.endsWith("/v1/projects")) {
        return jsonResponse(200, {
          projects: [createProject({ project_id: improvement.project_id, organization_plan: "solo" })]
        });
      }
      if (url.endsWith(`/v1/improvements/${improvement.improvement_id}`) && init?.method === undefined) {
        return jsonResponse(200, { improvement });
      }
      if (url.endsWith(`/v1/improvements/${improvement.improvement_id}/resolve`) && init?.method === "POST") {
        return jsonResponse(200, { improvement: resolvedImprovement });
      }
      if (url.endsWith(`/v1/projects/${improvement.project_id}/improvements/${improvement.improvement_id}/bundle`)) {
        return jsonResponse(200, { status: "pending" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[`/projects/${improvement.project_id}/improvements/${improvement.improvement_id}`]} />);

    const user = userEvent.setup();

    expect(await screen.findByRole("button", { name: /mark resolved/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /mark resolved/i }));

    expect(await screen.findByRole("button", { name: /reopen/i })).toBeInTheDocument();
    const resolveCall = fetchMock.mock.calls.find(([input]) =>
      requestUrl(input).includes(`/v1/improvements/${improvement.improvement_id}/resolve`)
    );
    expect(resolveCall).toBeDefined();
  });
});
