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
    project_color_tag: null,
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
    related_incident_ids: [],
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

afterEach(() => {
  resetBrowserSessionClientState();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("web app — improvement table interactions", () => {
  it("opens the improvement detail route when users click anywhere on a workspace row", async () => {
    const user = userEvent.setup();
    const project = createProject({ project_id: "proj_123", organization_plan: "solo" });
    const improvement = createImprovement({ project_id: project.project_id, project_name: project.name, service_name: "Checkout API" });

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession({ organization_plan: "solo" }) });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, { projects: [project] });
      }

      if (url.includes("/v1/improvements?") && url.includes("status=open") && init?.method === undefined) {
        return jsonResponse(200, { improvements: [improvement], next_cursor: null });
      }

      if (url.endsWith(`/v1/improvements/${improvement.improvement_id}`) && init?.method === undefined) {
        return jsonResponse(200, { improvement });
      }

      if (url.endsWith(`/v1/projects/${project.project_id}/improvements/${improvement.improvement_id}/bundle`)) {
        return jsonResponse(200, { status: "pending" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/improvements"]} />);

    const row = (await screen.findByText(/checkout api/i)).closest("tr");
    expect(row).not.toBeNull();

    await user.click(row as HTMLTableRowElement);

    expect(await screen.findByRole("button", { name: /mark resolved/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to project improvements/i })).toHaveAttribute(
      "href",
      `/projects/${project.project_id}/improvements`
    );
  });

  it("bulk resolves and bulk reopens workspace improvements from the table", async () => {
    const user = userEvent.setup();
    const project = createProject({ project_id: "proj_123", organization_plan: "solo" });
    const improvementState = [
      createImprovement({
        improvement_id: "imp_workspace_open",
        project_id: project.project_id,
        project_name: project.name,
        title: "Open workspace improvement",
        status: "open"
      }),
      createImprovement({
        improvement_id: "imp_workspace_snoozed",
        project_id: project.project_id,
        project_name: project.name,
        title: "Snoozed workspace improvement",
        status: "snoozed",
        snoozed_until: "2026-05-25T13:00:00.000Z"
      }),
      createImprovement({
        improvement_id: "imp_workspace_resolved",
        project_id: project.project_id,
        project_name: project.name,
        title: "Resolved workspace improvement",
        status: "resolved",
        resolved_at: "2026-05-18T13:00:00.000Z"
      })
    ];

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession({ organization_plan: "solo" }) });
      }

      if (url.includes("/v1/improvements?") && init?.method === undefined) {
        const request = new URL(url, "https://app.debugbundle.test");
        const status = request.searchParams.get("status");
        const improvements = status === null ? improvementState : improvementState.filter((improvement) => improvement.status === status);
        return jsonResponse(200, { improvements, next_cursor: null });
      }

      if (url.endsWith("/resolve") && init?.method === "POST") {
        const improvementId = url.split("/").at(-2);
        const improvement = improvementState.find((item) => item.improvement_id === improvementId);

        if (improvement === undefined) {
          return jsonResponse(404, { error: "not_found" });
        }

        improvement.status = "resolved";
        improvement.resolved_at = "2026-05-18T13:20:00.000Z";
        improvement.snoozed_until = null;
        return jsonResponse(200, { improvement });
      }

      if (url.endsWith("/reopen") && init?.method === "POST") {
        const improvementId = url.split("/").at(-2);
        const improvement = improvementState.find((item) => item.improvement_id === improvementId);

        if (improvement === undefined) {
          return jsonResponse(404, { error: "not_found" });
        }

        improvement.status = "open";
        improvement.resolved_at = null;
        improvement.snoozed_until = null;
        return jsonResponse(200, { improvement });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/improvements"]} />);

    await screen.findByText(/open workspace improvement/i);
    await chooseStatusFilterOption(user, "workspace-improvements-status-filter", /all statuses/i);
    expect(await screen.findByText(/resolved workspace improvement/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /select all visible improvements/i }));
    await user.click(screen.getByRole("button", { name: /mark selected resolved/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(
          ([input, init]) => requestUrl(input).includes("/resolve") && init?.method === "POST"
        )
      ).toHaveLength(2);
    });

    await user.click(await screen.findByRole("button", { name: /select all visible improvements/i }));
    await user.click(screen.getByRole("button", { name: /mark selected unresolved/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(
          ([input, init]) => requestUrl(input).includes("/reopen") && init?.method === "POST"
        )
      ).toHaveLength(3);
    });
  });

  it("opens the improvement detail route when users click anywhere on a project row", async () => {
    const user = userEvent.setup();
    const project = createProject({ project_id: "proj_123", organization_plan: "solo" });
    const improvement = createImprovement({ project_id: project.project_id, project_name: project.name, service_name: "Project Checkout API" });

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession({ organization_plan: "solo" }) });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, { projects: [project] });
      }

      if (url.includes("/v1/improvements?") && url.includes(`project_id=${project.project_id}`) && url.includes("status=open") && init?.method === undefined) {
        return jsonResponse(200, { improvements: [improvement], next_cursor: null });
      }

      if (url.endsWith(`/v1/improvements/${improvement.improvement_id}`) && init?.method === undefined) {
        return jsonResponse(200, { improvement });
      }

      if (url.endsWith(`/v1/projects/${project.project_id}/improvements/${improvement.improvement_id}/bundle`)) {
        return jsonResponse(200, { status: "pending" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[`/projects/${project.project_id}/improvements`]} />);

    const row = (await screen.findByText(/project checkout api/i)).closest("tr");
    expect(row).not.toBeNull();

    await user.click(row as HTMLTableRowElement);

    expect(await screen.findByRole("button", { name: /mark resolved/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to project improvements/i })).toHaveAttribute(
      "href",
      `/projects/${project.project_id}/improvements`
    );
  });

  it("bulk resolves and bulk reopens project improvements from the table", async () => {
    const user = userEvent.setup();
    const project = createProject({ project_id: "proj_123", organization_plan: "solo" });
    const improvementState = [
      createImprovement({
        improvement_id: "imp_project_open",
        project_id: project.project_id,
        title: "Open project improvement",
        status: "open"
      }),
      createImprovement({
        improvement_id: "imp_project_snoozed",
        project_id: project.project_id,
        title: "Snoozed project improvement",
        status: "snoozed",
        snoozed_until: "2026-05-25T13:00:00.000Z"
      }),
      createImprovement({
        improvement_id: "imp_project_resolved",
        project_id: project.project_id,
        title: "Resolved project improvement",
        status: "resolved",
        resolved_at: "2026-05-18T13:00:00.000Z"
      })
    ];

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession({ organization_plan: "solo" }) });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, { projects: [project] });
      }

      if (url.includes("/v1/improvements?") && url.includes(`project_id=${project.project_id}`) && init?.method === undefined) {
        const request = new URL(url, "https://app.debugbundle.test");
        const status = request.searchParams.get("status");
        const improvements = status === null ? improvementState : improvementState.filter((improvement) => improvement.status === status);
        return jsonResponse(200, { improvements, next_cursor: null });
      }

      if (url.endsWith("/resolve") && init?.method === "POST") {
        const improvementId = url.split("/").at(-2);
        const improvement = improvementState.find((item) => item.improvement_id === improvementId);

        if (improvement === undefined) {
          return jsonResponse(404, { error: "not_found" });
        }

        improvement.status = "resolved";
        improvement.resolved_at = "2026-05-18T13:30:00.000Z";
        improvement.snoozed_until = null;
        return jsonResponse(200, { improvement });
      }

      if (url.endsWith("/reopen") && init?.method === "POST") {
        const improvementId = url.split("/").at(-2);
        const improvement = improvementState.find((item) => item.improvement_id === improvementId);

        if (improvement === undefined) {
          return jsonResponse(404, { error: "not_found" });
        }

        improvement.status = "open";
        improvement.resolved_at = null;
        improvement.snoozed_until = null;
        return jsonResponse(200, { improvement });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[`/projects/${project.project_id}/improvements`]} />);

    await screen.findByText(/open project improvement/i);
    await chooseStatusFilterOption(user, "project-improvements-status-filter", /all statuses/i);
    expect(await screen.findByText(/resolved project improvement/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /select all visible improvements/i }));
    await user.click(screen.getByRole("button", { name: /mark selected resolved/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(
          ([input, init]) => requestUrl(input).includes("/resolve") && init?.method === "POST"
        )
      ).toHaveLength(2);
    });

    await user.click(await screen.findByRole("button", { name: /select all visible improvements/i }));
    await user.click(screen.getByRole("button", { name: /mark selected unresolved/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(
          ([input, init]) => requestUrl(input).includes("/reopen") && init?.method === "POST"
        )
      ).toHaveLength(3);
    });
  });
});
