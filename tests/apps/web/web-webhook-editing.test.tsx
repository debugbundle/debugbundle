// @vitest-environment jsdom
import { parseRequestBody } from "./helpers/request-body.js";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { useState } from "react";
import {
  MemoryRouter,
  Outlet,
  Route,
  Routes
} from "../../../node_modules/.pnpm/node_modules/react-router-dom/dist/index.js";
import { SessionProvider } from "../../../apps/web/src/lib/session.js";
import { TooltipProvider } from "../../../apps/web/src/components/ui/tooltip.js";
import { ProjectWebhooksPage } from "../../../apps/web/src/pages/project-webhooks-page.js";
import { App } from "../../../apps/web/src/app.js";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.js";
import {
  createProject,
  createSession,
  createWebhook,
  createWebhookDelivery,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";
afterEach(() => {
  cleanup();
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});
function mockWebhook(role: "owner" | "member" = "owner", creator = "usr_123", enabled = false) {
  const webhook = createWebhook({
    is_enabled: enabled,
    created_by_user_id: creator,
    events: ["bundle.created", "verification.failed"],
    filters: { verification: false, environment: [], service: ["api"] }
  });
  const fetchMock = vi.fn(
    (input: RequestInfo | URL, init?: RequestInit): Response | Promise<Response> => {
      const url = requestUrl(input);
      if (url.endsWith("/v1/auth/session"))
        return jsonResponse(200, { session: createSession({ role }) });
      if (url.endsWith("/v1/projects"))
        return jsonResponse(200, { projects: [createProject({ effective_role: role })] });
      if (url.includes("/v1/webhooks?")) return jsonResponse(200, { webhooks: [webhook] });
      if (url.includes("/deliveries/del_123/retry"))
        return jsonResponse(200, { delivery_id: "del_123", event_type: "bundle.created" });
      if (url.includes("/deliveries?"))
        return jsonResponse(200, {
          deliveries: [createWebhookDelivery({ delivery_id: "del_123", status: "disabled" })]
        });
      if (url.includes("/test?") && init?.method === "POST")
        return jsonResponse(200, { delivery: createWebhookDelivery() });
      if (init?.method === "PATCH")
        return jsonResponse(200, { webhook: { ...webhook, ...parseRequestBody(init.body) } });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return jsonResponse(200, { services: [], alerts: [], channels: [], destinations: [] });
    }
  );
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, webhook };
}
it("round-trips disabled subscriptions and false/empty filters in the shared editor", async () => {
  const { fetchMock, webhook } = mockWebhook();
  const user = userEvent.setup();
  render(<App initialEntries={["/projects/proj_123/webhooks"]} />);
  await user.click(await screen.findByRole("button", { name: /^edit webhook$/i }));
  expect(screen.getByRole("switch", { name: /^enabled$/i })).not.toBeChecked();
  await user.click(screen.getByRole("button", { name: /^save webhook$/i }));
  await waitFor(() =>
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true)
  );
  const request = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
  expect(parseRequestBody(request?.[1]?.body)).toMatchObject({
    events: webhook.events,
    is_enabled: false,
    filters: webhook.filters
  });
});
it("uses complete test-event selection and retries disabled deliveries through scoped requests", async () => {
  const { fetchMock } = mockWebhook("owner", "usr_123", true);
  const user = userEvent.setup();
  render(<App initialEntries={["/projects/proj_123/webhooks"]} />);
  const trigger = await screen.findByLabelText(/^test event$/i);
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "ArrowDown", code: "ArrowDown" });
  await user.click(await screen.findByRole("option", { name: "bundle.resolved" }));
  await user.click(screen.getByRole("button", { name: "Send test webhook" }));
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          requestUrl(input).includes("/test?project_id=proj_123") &&
          init?.body === JSON.stringify({ event_type: "bundle.resolved" })
      )
    ).toBe(true)
  );
  await user.click(await screen.findByRole("button", { name: "Retry delivery" }));
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          requestUrl(input).includes("/deliveries/del_123/retry?project_id=proj_123") &&
          init?.method === "POST"
      )
    ).toBe(true)
  );
});
it("requires named deletion confirmation and hides another member's management actions", async () => {
  const { fetchMock, webhook } = mockWebhook();
  const user = userEvent.setup();
  const view = render(<App initialEntries={["/projects/proj_123/webhooks"]} />);
  await user.click(await screen.findByRole("button", { name: /^delete webhook$/i }));
  expect(screen.getByRole("alertdialog")).toHaveTextContent(webhook.url);
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
  await user.click(screen.getByRole("button", { name: /^delete endpoint$/i }));
  await waitFor(() =>
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(true)
  );
  view.unmount();
  resetBrowserSessionClientState();
  mockWebhook("member", "usr_other");
  render(<App initialEntries={["/projects/proj_123/webhooks"]} />);
  await screen.findByText(webhook.url);
  expect(screen.queryByRole("button", { name: /^edit webhook$/i })).toBeNull();
  expect(screen.queryByRole("button", { name: /^delete webhook$/i })).toBeNull();
  expect(screen.queryByRole("button", { name: "Retry delivery" })).toBeNull();
});

it("discards a pending creation response after leaving the page, including its secret and success toast", async () => {
  const { fetchMock, webhook } = mockWebhook();
  const fallback = fetchMock.getMockImplementation();
  let finish!: (response: Response) => void;
  fetchMock.mockImplementation((input, init) => {
    if (requestUrl(input).endsWith("/v1/webhooks") && init?.method === "POST")
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    return fallback!(input, init);
  });
  const user = userEvent.setup();
  const firstView = render(<App initialEntries={["/projects/proj_123/webhooks"]} />);
  await user.click(await screen.findByRole("button", { name: /^create webhook$/i }));
  await user.type(screen.getByLabelText(/endpoint url/i), "https://example.com/new");
  await user.click(screen.getByRole("button", { name: /^create webhook$/i }));
  await waitFor(() => expect(finish).toBeDefined());
  firstView.unmount();
  resetBrowserSessionClientState();
  render(<App initialEntries={["/projects/proj_123/webhooks"]} />);
  await screen.findByRole("button", { name: "Send test webhook" });
  await act(async () => {
    finish(jsonResponse(201, { webhook: { ...webhook, signing_secret: "delayed-secret" } }));
  });
  expect(screen.queryByText("delayed-secret")).toBeNull();
  expect(screen.queryByText("Webhook created successfully.")).toBeNull();
});

it("requires enabling an endpoint before retrying its disabled deliveries", async () => {
  mockWebhook();
  render(<App initialEntries={["/projects/proj_123/webhooks"]} />);
  expect(await screen.findByRole("button", { name: "Retry delivery" })).toBeDisabled();
});
it("does not reveal a pending secret in a different project context", async () => {
  const { fetchMock, webhook } = mockWebhook();
  const fallback = fetchMock.getMockImplementation();
  let finish!: (response: Response) => void;
  fetchMock.mockImplementation((input, init) => {
    if (requestUrl(input).endsWith("/v1/webhooks") && init?.method === "POST")
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    return fallback!(input, init);
  });
  function Layout(): JSX.Element {
    const [project, setProject] = useState(createProject());
    return (
      <>
        <button onClick={() => setProject(createProject({ project_id: "proj_other" }))}>
          Switch project
        </button>
        <Outlet
          context={{ project, projectId: project.project_id, onProjectUpdated: setProject }}
        />
      </>
    );
  }
  const user = userEvent.setup();
  render(
    <SessionProvider>
      <TooltipProvider>
        <MemoryRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<ProjectWebhooksPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </SessionProvider>
  );
  await user.click(await screen.findByRole("button", { name: /^create webhook$/i }));
  await user.type(screen.getByLabelText(/endpoint url/i), "https://example.com/new");
  await user.click(screen.getByRole("button", { name: /^create webhook$/i }));
  await waitFor(() => expect(finish).toBeDefined());
  await user.click(screen.getByRole("button", { name: "Close" }));
  await user.click(screen.getByRole("button", { name: "Switch project" }));
  await act(async () =>
    finish(jsonResponse(201, { webhook: { ...webhook, signing_secret: "wrong-project-secret" } }))
  );
  expect(screen.queryByText("wrong-project-secret")).toBeNull();
});
