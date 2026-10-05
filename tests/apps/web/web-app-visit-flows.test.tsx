// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "../../../apps/web/src/app.js";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.js";
import { flowDefinition, flowReport, flowInput } from "../../fixtures/analytics-flow-report.js";
import { createProject, createSession, jsonResponse, requestUrl } from "./web-test-helpers.js";
const projectId = flowDefinition.project_id;
function setup(
  input: {
    empty?: boolean;
    denied?: boolean;
    viewer?: boolean;
    reportFailure?: boolean;
    mutationFailure?: boolean;
  } = {}
) {
  let flows = input.empty ? [] : [flowDefinition];
  const request = vi.fn(async (req: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(req);
    if (url.endsWith("/v1/auth/session"))
      return jsonResponse(200, { session: createSession({ organization_plan: "team" }) });
    if (url.endsWith("/v1/projects"))
      return jsonResponse(200, {
        projects: [
          createProject({
            project_id: projectId,
            organization_plan: "team",
            effective_role: input.viewer ? "member" : "owner"
          })
        ]
      });
    if (url.endsWith("/analytics-settings"))
      return jsonResponse(200, {
        analytics_available: true,
        access_mode: input.viewer ? "read" : "manage",
        settings: { enabled: true }
      });
    if (url.includes("/v1/services?")) return jsonResponse(200, { services: [] });
    if (url.endsWith("/analytics/flows"))
      return input.denied
        ? jsonResponse(403, { error: "forbidden" })
        : jsonResponse(200, { flows });
    if (url.includes("/report?"))
      return input.reportFailure
        ? jsonResponse(500, { error: "unavailable" })
        : jsonResponse(200, flowReport);
    if (init?.method === "PUT") {
      if (input.mutationFailure) return jsonResponse(500, { error: "unavailable" });
      flows = [
        { ...flowDefinition, ...JSON.parse(typeof init.body === "string" ? init.body : "{}") }
      ];
      return jsonResponse(200, { flow: flows[0] });
    }
    if (init?.method === "DELETE") {
      if (input.mutationFailure) return jsonResponse(500, { error: "unavailable" });
      flows = [{ ...flowDefinition, archived_at: "2026-10-01T00:00:00.000Z" }];
      return jsonResponse(200, { archived: true });
    }
    return jsonResponse(200, {});
  });
  vi.stubGlobal("fetch", request);
  render(<App initialEntries={[`/projects/${projectId}/analytics/flows`]} />);
  return request;
}
afterEach(() => {
  cleanup();
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});
it("shows customer origins, aggregate counts and partial coverage using project-scoped requests", async () => {
  const request = setup();
  expect(await screen.findByText("newsletter")).toBeInTheDocument();
  expect(screen.getByText("https://blog.customer.test")).toBeInTheDocument();
  expect(screen.getByText("Partial observation")).toBeInTheDocument();
  expect(screen.getByText(/10 linked starts.*4 completions/)).toBeInTheDocument();
  expect(request).toHaveBeenCalledWith(
    expect.stringContaining(`/v1/projects/${projectId}/analytics/flows/reading/report?window=30d`),
    expect.anything()
  );
});
it("creates a project flow with the existing form primitives and ordered origin fields", async () => {
  const request = setup({ empty: true });
  const user = userEvent.setup();
  await screen.findByText("No flows yet");
  await user.click(screen.getByRole("button", { name: "Create flow" }));
  await user.type(screen.getByLabelText("Flow name"), flowInput.display_name);
  await user.type(screen.getByLabelText("Flow key"), flowInput.flow_key);
  for (const [index, step] of flowInput.steps.entries()) {
    await user.type(screen.getByLabelText(`Step ${index + 1} name`), step.display_name);
    await user.type(screen.getByLabelText(`Step ${index + 1} key`), step.step_key);
    await user.type(screen.getByLabelText(`Step ${index + 1} origin`), step.origin);
  }
  await user.click(screen.getByRole("button", { name: "Save flow" }));
  await screen.findByText("newsletter");
  expect(request).toHaveBeenCalledWith(
    expect.stringContaining(`/analytics/flows/${flowInput.flow_key}`),
    expect.objectContaining({ method: "PUT", body: JSON.stringify(flowInput) })
  );
});
it("archives a definition while keeping its retained report readable", async () => {
  const request = setup();
  const user = userEvent.setup();
  await screen.findByText("newsletter");
  await user.click(screen.getByRole("button", { name: "Archive flow" }));
  await waitFor(() => expect(screen.getByText("Archived")).toBeInTheDocument());
  expect(request).toHaveBeenCalledWith(
    expect.stringContaining("/analytics/flows/reading"),
    expect.objectContaining({ method: "DELETE" })
  );
  expect(await screen.findByText("newsletter")).toBeInTheDocument();
});
it("lets viewers read without exposing definition management", async () => {
  setup({ viewer: true });
  await screen.findByText("newsletter");
  expect(screen.queryByRole("button", { name: "Create flow" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Edit flow" })).not.toBeInTheDocument();
});
it("preserves the edit draft on save failure and reports archive failure without hiding the flow", async () => {
  setup({ mutationFailure: true });
  const user = userEvent.setup();
  await screen.findByText("newsletter");
  await user.click(screen.getByRole("button", { name: "Edit flow" }));
  await user.click(screen.getByRole("button", { name: "Save flow" }));
  expect(await screen.findByText("Unable to save flow")).toBeInTheDocument();
  expect(screen.getByLabelText("Flow name")).toHaveValue(flowInput.display_name);
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await user.click(screen.getByRole("button", { name: "Archive flow" }));
  expect(await screen.findByText("Unable to archive flow")).toBeInTheDocument();
  expect(screen.queryByText("Archived")).not.toBeInTheDocument();
  expect(screen.getByText("newsletter")).toBeInTheDocument();
});
it.each([
  { denied: true, title: "Flows unavailable" },
  { reportFailure: true, title: "Report unavailable" }
])("shows recoverable failure states: $title", async ({ title, ...input }) => {
  setup(input);
  expect(await screen.findByText(title)).toBeInTheDocument();
  expect(screen.queryByText("newsletter")).not.toBeInTheDocument();
});
