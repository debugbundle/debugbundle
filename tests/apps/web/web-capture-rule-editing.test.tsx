// @vitest-environment jsdom
import { parseRequestBody } from "./helpers/request-body.js";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "../../../node_modules/.pnpm/node_modules/react-router-dom/dist/index.js";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "../../../apps/web/src/components/ui/tooltip.js";
import { ProjectCaptureRulesCard } from "../../../apps/web/src/components/system/project-capture-rules-card.js";
import { jsonResponse, requestUrl } from "./web-test-helpers.js";
const rule = {
  id: "rule_1",
  project_id: "proj_123",
  name: "Exact lifecycle rule",
  description: null,
  enabled: false,
  action: "sample",
  matcher: {
    event_types: ["frontend_exception", "request_event"],
    runtime: ["browser", "node"],
    browser_page_visibility_state: "hidden",
    browser_page_ready_state: "complete",
    browser_target_attributes: { async: false },
    resource_url: { host_suffix: "example.com", path_prefix: "/assets/" }
  },
  sample_rate: 0.3,
  sample_event_class: "context",
  created_by_user_id: "usr_123",
  created_from_incident_id: null,
  created_from_event_id: null,
  expires_at: "2027-01-01T00:00:25.123Z",
  hit_count: 7,
  last_matched_at: null,
  created_at: "2026-10-07T00:00:00Z",
  updated_at: "2026-10-07T00:00:00Z"
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it.each([false, true])(
  "confirms capture deletion and retains retryable state on failure %s",
  async (failed) => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (init?.method === "DELETE")
        return failed
          ? jsonResponse(503, { error: "unavailable" })
          : jsonResponse(200, { success: true });
      return url.endsWith("/capture-rules")
        ? jsonResponse(200, { access_mode: "manage", rules: [rule] })
        : jsonResponse(200, { services: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <TooltipProvider>
          <ProjectCaptureRulesCard projectId="proj_123" environmentDefault="production" canEdit />
        </TooltipProvider>
      </MemoryRouter>
    );
    await user.click(screen.getByRole("button", { name: /^capture rules$/i }));
    await user.click(await screen.findByRole("button", { name: /^delete$/i }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent(rule.name);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
    await user.click(screen.getByRole("button", { name: /^delete rule$/i }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(true)
    );
    if (failed) {
      await waitFor(() => expect(screen.getByRole("button", { name: /^delete$/i })).toBeEnabled());
      expect(screen.getByText(rule.name)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /^delete$/i }));
      expect(screen.getByRole("alertdialog")).toHaveTextContent(rule.name);
    } else await waitFor(() => expect(screen.queryByText(rule.name)).not.toBeInTheDocument());
  }
);
function mock() {
  let saved: Record<string, unknown> | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.endsWith("/capture-rules/rule_1") && init?.method === "PATCH") {
        saved = parseRequestBody(init.body);
        return jsonResponse(200, { rule: { ...rule, ...saved } });
      }
      if (url.endsWith("/capture-rules"))
        return jsonResponse(200, { access_mode: "manage", rules: [rule] });
      return jsonResponse(200, { services: [] });
    })
  );
  return () => saved;
}
it("reuses create/edit action and sampling controls while preserving the full matcher and exact expiry", async () => {
  const saved = mock();
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <TooltipProvider>
        <ProjectCaptureRulesCard projectId="proj_123" environmentDefault="production" canEdit />
      </TooltipProvider>
    </MemoryRouter>
  );
  await user.click(screen.getByRole("button", { name: /^capture rules$/i }));
  await user.click(await screen.findByRole("button", { name: /^edit$/i }));
  expect(screen.getByLabelText(/^action$/i)).toHaveTextContent("Sample matching events");
  expect(screen.getByLabelText(/^matcher json$/i)).toHaveValue(
    JSON.stringify(rule.matcher, null, 2)
  );
  await user.clear(screen.getByLabelText(/^sample rate percent$/i));
  await user.type(screen.getByLabelText(/^sample rate percent$/i), "40");
  await user.click(screen.getByRole("button", { name: /^save capture rule$/i }));
  await waitFor(() =>
    expect(saved()).toMatchObject({
      matcher: rule.matcher,
      sample_rate: 0.4,
      sample_event_class: "context",
      enabled: false
    })
  );
  expect(saved()).not.toHaveProperty("expires_at");
  expect(saved()).not.toHaveProperty("created_by_user_id");
});
it("clears expiry explicitly and rejects invalid matcher JSON before HTTP", async () => {
  const saved = mock();
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <TooltipProvider>
        <ProjectCaptureRulesCard projectId="proj_123" environmentDefault="production" canEdit />
      </TooltipProvider>
    </MemoryRouter>
  );
  await user.click(screen.getByRole("button", { name: /^capture rules$/i }));
  await user.click(await screen.findByRole("button", { name: /^edit$/i }));
  fireEvent.change(screen.getByLabelText(/^expires at$/i), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText(/^matcher json$/i), {
    target: { value: '{"unknown":true}' }
  });
  expect(screen.getByRole("button", { name: /^save capture rule$/i })).toBeDisabled();
  expect(saved()).toBeUndefined();
  fireEvent.change(screen.getByLabelText(/^matcher json$/i), {
    target: { value: JSON.stringify(rule.matcher) }
  });
  await user.click(screen.getByRole("button", { name: /^save capture rule$/i }));
  await waitFor(() => expect(saved()).toHaveProperty("expires_at", null));
});

it("discards an old project's pending capture-rule edit after the context changes", async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (init?.method === "PATCH")
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      if (url.endsWith("/capture-rules"))
        return jsonResponse(200, {
          access_mode: "manage",
          rules: [
            {
              ...rule,
              project_id: url.includes("proj_other") ? "proj_other" : "proj_123",
              name: url.includes("proj_other") ? "Other project rule" : rule.name
            }
          ]
        });
      return jsonResponse(200, { services: [] });
    })
  );
  const tree = (projectId: string) => (
    <MemoryRouter>
      <TooltipProvider>
        <ProjectCaptureRulesCard projectId={projectId} environmentDefault="production" canEdit />
      </TooltipProvider>
    </MemoryRouter>
  );
  const user = userEvent.setup();
  const view = render(tree("proj_123"));
  await user.click(screen.getByRole("button", { name: /^capture rules$/i }));
  await user.click(await screen.findByRole("button", { name: /^edit$/i }));
  fireEvent.change(screen.getByLabelText("Rule name"), {
    target: { value: "Delayed old project rule" }
  });
  await user.click(screen.getByRole("button", { name: /^save capture rule$/i }));
  await waitFor(() => expect(finish).toBeDefined());
  view.rerender(tree("proj_other"));
  await screen.findByText("Other project rule");
  await act(async () =>
    finish(jsonResponse(200, { rule: { ...rule, name: "Delayed old project rule" } }))
  );
  expect(screen.queryByText("Delayed old project rule")).not.toBeInTheDocument();
  expect(screen.getByText("Other project rule")).toBeInTheDocument();
});
