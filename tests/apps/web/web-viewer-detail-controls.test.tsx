// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { App } from "../../../apps/web/src/app.js";
import {
  resetBrowserSessionClientState,
  type ImprovementRecord
} from "../../../apps/web/src/lib/api.js";
import {
  createIncident,
  createProject,
  createSession,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";
afterEach(() => {
  resetBrowserSessionClientState();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each(["viewer", "member", "admin"] as const)(
  "keeps incident mutation and capture controls consistent with a %s project role",
  async (role) => {
    const project = { ...createProject(), effective_role: role },
      incident = createIncident({ project_id: project.project_id });
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.endsWith("/v1/auth/session")) return jsonResponse(200, { session: createSession() });
      if (url.includes("/v1/projects")) return jsonResponse(200, { projects: [project] });
      if (url.endsWith(`/v1/incidents/${incident.incident_id}`))
        return jsonResponse(200, { incident });
      if (url.includes("/bundle")) return jsonResponse(200, { status: "pending" });
      return jsonResponse(404, { error: "not_found" });
    });
    vi.stubGlobal("fetch", fetch);
    render(<App initialEntries={[`/incidents/${incident.incident_id}`]} />);
    await screen.findByRole("heading", { name: incident.title });
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(([input]) =>
          requestUrl(input).includes(`project_id=${project.project_id}`)
        )
      ).toBe(true)
    );
    if (role === "viewer") {
      expect(screen.queryByRole("button", { name: "Mark resolved" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Reduce noise" })).not.toBeInTheDocument();
    } else {
      expect(await screen.findByRole("button", { name: "Mark resolved" })).toBeVisible();
      if (role === "admin")
        expect(screen.getByRole("button", { name: "Reduce noise" })).toBeVisible();
      else expect(screen.queryByRole("button", { name: "Reduce noise" })).not.toBeInTheDocument();
    }
  }
);
it.each(["viewer", "member"] as const)(
  "keeps improvement lifecycle controls consistent with a %s project role",
  async (role) => {
    const project = { ...createProject(), effective_role: role },
      improvement: ImprovementRecord = {
        improvement_id: "imp_detail",
        project_id: project.project_id,
        project_name: project.name,
        project_color_tag: null,
        project_slug: project.slug,
        service_id: null,
        service_name: "Checkout API",
        service_runtime: null,
        service_framework: null,
        environment: "production",
        kind: "warning_hotspot",
        status: "open",
        severity: "medium",
        confidence: 0.8,
        fingerprint: "fixture",
        title: "Retained improvement",
        summary: "A bounded captured signal.",
        occurrence_count: 2,
        evidence: { kind: "warning_hotspot", normalized_message: "signal" },
        related_incident_ids: [],
        first_detected_at: "2026-11-07T00:00:00.000Z",
        last_detected_at: "2026-11-07T00:00:00.000Z",
        resolved_at: null,
        snoozed_until: null,
        bundle_generation_number: 1,
        bundle_created_at: null,
        bundle_updated_at: null,
        bundle_failure_reason: null
      };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = requestUrl(input);
        if (url.endsWith("/v1/auth/session"))
          return jsonResponse(200, { session: createSession() });
        if (url.includes("/v1/projects")) return jsonResponse(200, { projects: [project] });
        if (url.endsWith(`/v1/improvements/${improvement.improvement_id}`))
          return jsonResponse(200, { improvement });
        if (url.includes("/bundle")) return jsonResponse(200, { status: "pending" });
        return jsonResponse(404, { error: "not_found" });
      })
    );
    render(
      <App
        initialEntries={[
          `/projects/${project.project_id}/improvements/${improvement.improvement_id}`
        ]}
      />
    );
    await screen.findByRole("heading", { name: improvement.title });
    if (role === "viewer") {
      expect(screen.queryByRole("button", { name: "Mark resolved" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Snooze/ })).not.toBeInTheDocument();
    } else expect(await screen.findByRole("button", { name: "Mark resolved" })).toBeVisible();
  }
);
