// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

async function findStatusFilterTrigger(id: string): Promise<HTMLElement> {
  await waitFor(() => {
    expect(document.getElementById(id)).not.toBeNull();
  });

  return document.getElementById(id) as HTMLElement;
}

async function chooseStatusFilterOption(
  user: ReturnType<typeof userEvent.setup>,
  triggerId: string,
  optionName: RegExp | string
): Promise<void> {
  const trigger = await findStatusFilterTrigger(triggerId);
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "ArrowDown", code: "ArrowDown" });
  await user.click(await screen.findByRole("option", { name: optionName }));
}

function getImprovementLinks(): HTMLAnchorElement[] {
  return screen
    .getAllByRole("link")
    .filter(
      (element): element is HTMLAnchorElement =>
        element instanceof HTMLAnchorElement && /\/improvements\/imp_/.test(element.getAttribute("href") ?? "")
    );
}

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

  it("supports workspace improvement sorting across the visible columns", async () => {
    const user = userEvent.setup();
    const improvements = [
      createImprovement({
        improvement_id: "imp_alpha",
        project_id: "proj_alpha",
        project_name: "Zeta App",
        project_slug: "zeta-app",
        service_name: "checkout-api",
        kind: "warning_hotspot",
        status: "open",
        severity: "high",
        title: "Zeta warning hotspot",
        occurrence_count: 8,
        last_detected_at: "2026-05-18T12:30:00.000Z"
      }),
      createImprovement({
        improvement_id: "imp_beta",
        project_id: "proj_beta",
        project_name: "Alpha App",
        project_slug: "alpha-app",
        service_name: "auth-api",
        kind: "recurring_incident",
        status: "snoozed",
        severity: "low",
        title: "Alpha recurring incident",
        occurrence_count: 2,
        last_detected_at: "2026-05-18T11:30:00.000Z"
      }),
      createImprovement({
        improvement_id: "imp_gamma",
        project_id: "proj_gamma",
        project_name: "Delta App",
        project_slug: "delta-app",
        service_name: "billing-api",
        kind: "post_deploy_regression",
        status: "resolved",
        severity: "critical",
        title: "Delta regression follow-up",
        occurrence_count: 15,
        last_detected_at: "2026-05-18T10:30:00.000Z"
      })
    ];
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession({ organization_plan: "team" }) });
      }

      if (url.includes("/v1/improvements?")) {
        const request = new URL(url, "https://app.debugbundle.test");
        const status = request.searchParams.get("status");

        if (status === "open") {
          return jsonResponse(200, { improvements: [improvements[0]], next_cursor: null });
        }

        return jsonResponse(200, { improvements, next_cursor: null });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/improvements"]} />);

    await screen.findByText(/zeta warning hotspot/i);
    await chooseStatusFilterOption(user, "workspace-improvements-status-filter", /all statuses/i);

    await waitFor(() => {
      expect(getImprovementLinks()[0]).toHaveTextContent(/^zeta warning hotspot$/i);
    });

    await user.click(screen.getByRole("button", { name: /^improvement$/i }));
    await waitFor(() => {
      expect(getImprovementLinks()[0]).toHaveTextContent(/^alpha recurring incident$/i);
    });

    await user.click(screen.getByRole("button", { name: /^project$/i }));
    await waitFor(() => {
      expect(getImprovementLinks()[0]).toHaveTextContent(/^alpha recurring incident$/i);
    });

    await user.click(screen.getByRole("button", { name: /^service$/i }));
    await waitFor(() => {
      expect(getImprovementLinks()[0]).toHaveTextContent(/^alpha recurring incident$/i);
    });

    await user.click(screen.getByRole("button", { name: /^severity$/i }));
    await waitFor(() => {
      expect(getImprovementLinks()[0]).toHaveTextContent(/^alpha recurring incident$/i);
    });

    await user.click(screen.getByRole("button", { name: /^status$/i }));
    await waitFor(() => {
      expect(getImprovementLinks()[0]).toHaveTextContent(/^zeta warning hotspot$/i);
    });

    await user.click(screen.getByRole("button", { name: /^occurrences$/i }));
    await waitFor(() => {
      expect(getImprovementLinks()[0]).toHaveTextContent(/^alpha recurring incident$/i);
    });

    expect(
      fetchMock.mock.calls.some(([input]) => {
        const url = requestUrl(input);
        return url.includes("/v1/improvements?") && !new URL(url, "https://app.debugbundle.test").searchParams.has("status");
      })
    ).toBe(true);
  });

  it("renders the workspace empty states for resolved, snoozed, and all-status filters", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession({ organization_plan: "team" }) });
      }

      if (url.includes("/v1/improvements?")) {
        const request = new URL(url, "https://app.debugbundle.test");
        const status = request.searchParams.get("status");

        if (status === "open") {
          return jsonResponse(200, { improvements: [createImprovement()], next_cursor: null });
        }

        return jsonResponse(200, { improvements: [], next_cursor: null });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/improvements"]} />);

    await screen.findByText(/warning hotspot: payment provider warning/i);

    await chooseStatusFilterOption(user, "workspace-improvements-status-filter", /^resolved$/i);
    expect(await screen.findByText(/no resolved improvements/i)).toBeInTheDocument();

    await chooseStatusFilterOption(user, "workspace-improvements-status-filter", /^snoozed$/i);
    expect(await screen.findByText(/no snoozed improvements/i)).toBeInTheDocument();

    await chooseStatusFilterOption(user, "workspace-improvements-status-filter", /all statuses/i);
    expect(await screen.findByText(/no improvements captured yet/i)).toBeInTheDocument();
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

  it("shows the project improvements empty state when a filter has no matches", async () => {
    const user = userEvent.setup();
    const project = createProject({ project_id: "proj_123", name: "Main App", organization_plan: "solo" });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession({ organization_plan: "solo" }) });
      }
      if (url.endsWith("/v1/projects")) {
        return jsonResponse(200, { projects: [project] });
      }
      if (url.includes("/v1/improvements?") && url.includes("project_id=proj_123") && url.includes("status=open")) {
        return jsonResponse(200, { improvements: [createImprovement()], next_cursor: null });
      }
      if (url.includes("/v1/improvements?") && url.includes("project_id=proj_123") && url.includes("status=resolved")) {
        return jsonResponse(200, { improvements: [], next_cursor: null });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/improvements"]} />);

    await screen.findByText(/warning hotspot: payment provider warning/i);

    await chooseStatusFilterOption(user, "project-improvements-status-filter", /^resolved$/i);

    expect(await screen.findByText(/no improvements for this filter/i)).toBeInTheDocument();
    expect(screen.getByText(/hosted analysis has enough signal for this project/i)).toBeInTheDocument();
  });

  it("supports project improvement sorting across the visible columns", async () => {
    const user = userEvent.setup();
    const project = createProject({ project_id: "proj_123", name: "Main App", organization_plan: "solo" });
    const improvements = [
      createImprovement({
        improvement_id: "imp_project_alpha",
        service_name: "checkout-api",
        kind: "warning_hotspot",
        status: "open",
        severity: "high",
        title: "Zeta warning hotspot",
        occurrence_count: 8,
        last_detected_at: "2026-05-18T12:30:00.000Z"
      }),
      createImprovement({
        improvement_id: "imp_project_beta",
        service_name: "auth-api",
        kind: "recurring_incident",
        status: "snoozed",
        severity: "low",
        title: "Alpha recurring incident",
        occurrence_count: 2,
        last_detected_at: "2026-05-18T11:30:00.000Z"
      }),
      createImprovement({
        improvement_id: "imp_project_gamma",
        service_name: "billing-api",
        kind: "post_deploy_regression",
        status: "resolved",
        severity: "critical",
        title: "Delta regression follow-up",
        occurrence_count: 15,
        last_detected_at: "2026-05-18T10:30:00.000Z"
      })
    ];
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession({ organization_plan: "solo" }) });
      }
      if (url.endsWith("/v1/projects")) {
        return jsonResponse(200, { projects: [project] });
      }
      if (url.includes("/v1/improvements?") && url.includes("project_id=proj_123")) {
        const request = new URL(url, "https://app.debugbundle.test");
        const status = request.searchParams.get("status");

        if (status === "open") {
          return jsonResponse(200, { improvements: [improvements[0]], next_cursor: null });
        }

        return jsonResponse(200, { improvements, next_cursor: null });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/improvements"]} />);

    await screen.findByText(/zeta warning hotspot/i);
    await chooseStatusFilterOption(user, "project-improvements-status-filter", /all statuses/i);

    await waitFor(() => {
      expect(getImprovementLinks()[0]).toHaveTextContent(/^zeta warning hotspot$/i);
    });

    await user.click(screen.getByRole("button", { name: /^improvement$/i }));
    await waitFor(() => {
      expect(getImprovementLinks()[0]).toHaveTextContent(/^alpha recurring incident$/i);
    });

    await user.click(screen.getByRole("button", { name: /^service$/i }));
    await waitFor(() => {
      expect(getImprovementLinks()[0]).toHaveTextContent(/^alpha recurring incident$/i);
    });

    await user.click(screen.getByRole("button", { name: /^severity$/i }));
    await waitFor(() => {
      expect(getImprovementLinks()[0]).toHaveTextContent(/^alpha recurring incident$/i);
    });

    await user.click(screen.getByRole("button", { name: /^status$/i }));
    await waitFor(() => {
      expect(getImprovementLinks()[0]).toHaveTextContent(/^zeta warning hotspot$/i);
    });

    await user.click(screen.getByRole("button", { name: /^occurrences$/i }));
    await waitFor(() => {
      expect(getImprovementLinks()[0]).toHaveTextContent(/^alpha recurring incident$/i);
    });
  });

  it("shows a not-found callout when an improvement detail route cannot load the improvement", async () => {
    const improvement = createImprovement();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);

        if (url.endsWith("/v1/auth/session")) {
          return jsonResponse(200, { session: createSession({ organization_plan: "solo" }) });
        }
        if (url.endsWith("/v1/projects") && init?.method === undefined) {
          return jsonResponse(200, {
            projects: [createProject({ project_id: improvement.project_id, organization_plan: "solo" })]
          });
        }
        if (url.endsWith(`/v1/improvements/${improvement.improvement_id}`) && init?.method === undefined) {
          return jsonResponse(404, { error: "not_found" });
        }

        return jsonResponse(404, { error: "not_found" });
      })
    );

    render(<App initialEntries={[`/projects/${improvement.project_id}/improvements/${improvement.improvement_id}`]} />);

    expect(await screen.findByText(/improvement not available/i)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /back to project improvements/i })[0]).toHaveAttribute(
      "href",
      `/projects/${improvement.project_id}/improvements`
    );
  });

  it("allows reopening and snoozing an improvement and supports copying and downloading a ready bundle", async () => {
    const user = userEvent.setup();
    const improvement = createImprovement({
      improvement_id: "imp_ready",
      kind: "post_deploy_regression",
      status: "resolved",
      resolved_at: "2026-05-18T13:00:00.000Z"
    });
    const reopenedImprovement = createImprovement({
      improvement_id: improvement.improvement_id,
      kind: "post_deploy_regression",
      status: "open",
      resolved_at: null,
      snoozed_until: null
    });
    const snoozedImprovement = createImprovement({
      improvement_id: improvement.improvement_id,
      kind: "post_deploy_regression",
      status: "snoozed",
      resolved_at: null,
      snoozed_until: "2026-05-25T13:00:00.000Z"
    });
    const clipboardWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: clipboardWriteText
      }
    });
    const createObjectURL = vi.fn(() => "blob:improvement-bundle");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL
    });
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession({ organization_plan: "solo" }) });
      }
      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject({ project_id: improvement.project_id, organization_plan: "solo" })]
        });
      }
      if (url.endsWith(`/v1/improvements/${improvement.improvement_id}`) && init?.method === undefined) {
        return jsonResponse(200, { improvement });
      }
      if (url.endsWith(`/v1/improvements/${improvement.improvement_id}/reopen`) && init?.method === "POST") {
        return jsonResponse(200, { improvement: reopenedImprovement });
      }
      if (url.endsWith(`/v1/improvements/${improvement.improvement_id}/snooze`) && init?.method === "POST") {
        return jsonResponse(200, { improvement: snoozedImprovement });
      }
      if (url.endsWith(`/v1/projects/${improvement.project_id}/improvements/${improvement.improvement_id}/bundle`)) {
        return jsonResponse(200, {
          bundle_id: "bundle_ready_123",
          incident_id: "inc_123",
          project_id: improvement.project_id,
          version: "v1",
          summary: {
            title: improvement.title,
            severity: improvement.severity,
            environment: improvement.environment
          }
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[`/projects/${improvement.project_id}/improvements/${improvement.improvement_id}`]} />);

    expect(await screen.findByText(/post-deploy regression/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /improvement bundle/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^reopen$/i }));
    expect(await screen.findByRole("button", { name: /snooze 7 days/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /snooze 7 days/i }));
    expect(await screen.findByText(/snoozed until/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^copy$/i }));
    expect(clipboardWriteText).toHaveBeenCalledWith(expect.stringContaining('"bundle_id": "bundle_ready_123"'));

    await user.click(screen.getByRole("button", { name: /^download$/i }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:improvement-bundle");

    expect(
      fetchMock.mock.calls.some(([input]) => requestUrl(input).includes(`/v1/improvements/${improvement.improvement_id}/reopen`))
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input]) => requestUrl(input).includes(`/v1/improvements/${improvement.improvement_id}/snooze`))
    ).toBe(true);
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

  it("renders pending and unavailable bundle states for improvement details", async () => {
    const pendingImprovement = createImprovement({
      improvement_id: "imp_pending",
      kind: "slow_request"
    });
    const unavailableImprovement = createImprovement({
      improvement_id: "imp_failed_bundle",
      kind: "request_failure_pattern"
    });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession({ organization_plan: "solo" }) });
      }
      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject({ project_id: pendingImprovement.project_id, organization_plan: "solo" })]
        });
      }
      if (url.endsWith(`/v1/improvements/${pendingImprovement.improvement_id}`) && init?.method === undefined) {
        return jsonResponse(200, { improvement: pendingImprovement });
      }
      if (url.endsWith(`/v1/projects/${pendingImprovement.project_id}/improvements/${pendingImprovement.improvement_id}/bundle`)) {
        return jsonResponse(200, { status: "pending" });
      }
      if (url.endsWith(`/v1/improvements/${unavailableImprovement.improvement_id}`) && init?.method === undefined) {
        return jsonResponse(200, { improvement: unavailableImprovement });
      }
      if (url.endsWith(`/v1/projects/${unavailableImprovement.project_id}/improvements/${unavailableImprovement.improvement_id}/bundle`)) {
        return jsonResponse(200, { status: "failed", reason: "bundle_generation_failed" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = render(
      <App initialEntries={[`/projects/${pendingImprovement.project_id}/improvements/${pendingImprovement.improvement_id}`]} />
    );

    expect(await screen.findByText(/slow request/i)).toBeInTheDocument();
    expect(await screen.findByText(/bundle is being generated/i)).toBeInTheDocument();

    unmount();
    render(<App initialEntries={[`/projects/${unavailableImprovement.project_id}/improvements/${unavailableImprovement.improvement_id}`]} />);

    expect(await screen.findByText(/request failure/i)).toBeInTheDocument();
    expect(await screen.findByText(/bundle not available/i)).toBeInTheDocument();
  });

  it("keeps the detail page stable when reopen, resolve, snooze, and copy actions fail", async () => {
    const user = userEvent.setup();
    const resolvedImprovement = createImprovement({
      improvement_id: "imp_reopen_failure",
      status: "resolved",
      resolved_at: "2026-05-18T13:00:00.000Z"
    });
    const openImprovement = createImprovement({
      improvement_id: "imp_action_failure",
      status: "open"
    });
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error("clipboard_failed"))
      }
    });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession({ organization_plan: "solo" }) });
      }
      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject({ project_id: resolvedImprovement.project_id, organization_plan: "solo" })]
        });
      }
      if (url.endsWith(`/v1/improvements/${resolvedImprovement.improvement_id}`) && init?.method === undefined) {
        return jsonResponse(200, { improvement: resolvedImprovement });
      }
      if (url.endsWith(`/v1/projects/${resolvedImprovement.project_id}/improvements/${resolvedImprovement.improvement_id}/bundle`)) {
        return jsonResponse(200, {
          bundle_id: "bundle_reopen_failure",
          project_id: resolvedImprovement.project_id,
          version: "v1"
        });
      }
      if (url.endsWith(`/v1/improvements/${resolvedImprovement.improvement_id}/reopen`) && init?.method === "POST") {
        return jsonResponse(500, { error: "boom" });
      }
      if (url.endsWith(`/v1/improvements/${openImprovement.improvement_id}`) && init?.method === undefined) {
        return jsonResponse(200, { improvement: openImprovement });
      }
      if (url.endsWith(`/v1/projects/${openImprovement.project_id}/improvements/${openImprovement.improvement_id}/bundle`)) {
        return jsonResponse(200, {
          bundle_id: "bundle_action_failure",
          project_id: openImprovement.project_id,
          version: "v1"
        });
      }
      if (url.endsWith(`/v1/improvements/${openImprovement.improvement_id}/resolve`) && init?.method === "POST") {
        return jsonResponse(500, { error: "boom" });
      }
      if (url.endsWith(`/v1/improvements/${openImprovement.improvement_id}/snooze`) && init?.method === "POST") {
        return jsonResponse(500, { error: "boom" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = render(
      <App initialEntries={[`/projects/${resolvedImprovement.project_id}/improvements/${resolvedImprovement.improvement_id}`]} />
    );

    expect(await screen.findByRole("button", { name: /^reopen$/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^reopen$/i }));
    expect(await screen.findByRole("button", { name: /^reopen$/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^copy$/i }));

    unmount();
    render(<App initialEntries={[`/projects/${openImprovement.project_id}/improvements/${openImprovement.improvement_id}`]} />);

    expect(await screen.findByRole("button", { name: /snooze 7 days/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /mark resolved/i }));
    expect(await screen.findByRole("button", { name: /mark resolved/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /snooze 7 days/i }));
    expect(await screen.findByRole("button", { name: /snooze 7 days/i })).toBeInTheDocument();
  });
});
