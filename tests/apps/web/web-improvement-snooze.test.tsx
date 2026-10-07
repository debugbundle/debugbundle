// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "../../../apps/web/src/app.js";
import {
  resetBrowserSessionClientState,
  type ImprovementRecord
} from "../../../apps/web/src/lib/api.js";
import { createProject, createSession, jsonResponse, requestUrl } from "./web-test-helpers.js";
import { parseRequestBody } from "./helpers/request-body.js";
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

afterEach(() => {
  cleanup();
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});
it("snoozes until a chosen future instant and rejects invalid or past dates before HTTP", async () => {
  const improvement = createImprovement();
  const future = new Date(Date.now() + 14 * 86400000).toISOString();
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Response>((input) => {
    const url = requestUrl(input);
    if (url.endsWith("/auth/session"))
      return jsonResponse(200, { session: createSession({ organization_plan: "solo" }) });
    if (url.endsWith("/projects"))
      return jsonResponse(200, { projects: [createProject({ organization_plan: "solo" })] });
    if (url.endsWith("/improvements/imp_123")) return jsonResponse(200, { improvement });
    if (url.endsWith("/snooze"))
      return jsonResponse(200, {
        improvement: { ...improvement, status: "snoozed", snoozed_until: future }
      });
    return jsonResponse(404, { error: "not_found" });
  });
  vi.stubGlobal("fetch", fetchMock);
  const user = userEvent.setup();
  render(<App initialEntries={["/projects/proj_123/improvements/imp_123"]} />);
  await user.click(await screen.findByRole("button", { name: "Snooze until..." }));
  const input = screen.getByLabelText("Snooze until (UTC)");
  fireEvent.change(input, { target: { value: "2020-01-01T00:00:00Z" } });
  expect(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Snooze improvement" })
  ).toBeDisabled();
  fireEvent.change(input, { target: { value: future } });
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Snooze improvement" })
  );
  await waitFor(() =>
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true)
  );
  const request = fetchMock.mock.calls.find(([input]) => requestUrl(input).endsWith("/snooze"));
  expect(parseRequestBody(request?.[1]?.body)).toEqual({ snoozed_until: future });
});
