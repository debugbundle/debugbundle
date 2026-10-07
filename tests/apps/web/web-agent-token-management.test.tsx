// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "../../../apps/web/src/app.js";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.js";
import { createProject, createSession, jsonResponse, requestUrl } from "./web-test-helpers.js";
import { parseRequestBody } from "./helpers/request-body.js";
const token = {
  token_id: "agent_1",
  issuer_user_id: "usr_123",
  organization_id: "org_123",
  project_id: "proj_123",
  label: "Incident assistant",
  scope: "incident:read-minimized",
  policy_version: "telemetry-privacy-v1",
  created_at: "2026-10-07T10:00:00Z",
  expires_at: "2026-11-07T10:00:00Z",
  revoked_at: null
};
afterEach(() => {
  cleanup();
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});
function mockTokens(enabled = false, role: "owner" | "member" = "owner") {
  const fetchMock = vi.fn(
    (input: RequestInfo | URL, init?: RequestInit): Response | Promise<Response> => {
      const url = requestUrl(input);
      if (url.endsWith("/auth/session"))
        return jsonResponse(200, { session: createSession({ role }) });
      if (url.endsWith("/projects"))
        return jsonResponse(200, { projects: [createProject({ effective_role: role })] });
      if (url.endsWith("/agent-tokens/agent_1/revoke"))
        return jsonResponse(200, { token: { ...token, revoked_at: "2026-10-07T11:00:00Z" } });
      if (url.endsWith("/agent-tokens") && init?.method === "POST")
        return enabled
          ? jsonResponse(201, {
              token: {
                ...token,
                ...parseRequestBody(init.body),
                plaintext: "dbundle_agent_one_time"
              }
            })
          : jsonResponse(503, { error: "agent_token_issuance_unavailable" });
      if (url.endsWith("/agent-tokens")) return jsonResponse(200, { tokens: [token] });
      if (url.endsWith("/tokens")) return jsonResponse(200, { tokens: [] });
      return jsonResponse(404, { error: "not_found" });
    }
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
it("lists and confirms revocation using project-scoped management routes", async () => {
  const fetchMock = mockTokens();
  const user = userEvent.setup();
  render(<App initialEntries={["/projects/proj_123/tokens"]} />);
  await user.click(await screen.findByRole("button", { name: "Revoke agent credential" }));
  expect(screen.getByRole("alertdialog")).toHaveTextContent(token.label);
  expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).endsWith("/revoke"))).toBe(false);
  await user.click(
    within(screen.getByRole("alertdialog")).getByRole("button", { name: "Revoke agent credential" })
  );
  expect(await screen.findByText("Revoked")).toBeInTheDocument();
});
it("retains the default-disabled issuance state without changing configuration", async () => {
  const fetchMock = mockTokens();
  const user = userEvent.setup();
  render(<App initialEntries={["/projects/proj_123/tokens"]} />);
  await user.click(await screen.findByRole("button", { name: "Create agent credential" }));
  await user.type(screen.getByLabelText("Credential label"), "Assistant");
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Create agent credential" })
  );
  expect(
    await screen.findByText("Agent credential creation is unavailable on this server.")
  ).toBeInTheDocument();
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
});
it("reveals a created secret once and hides all credential management from project members", async () => {
  mockTokens(true);
  const user = userEvent.setup();
  const view = render(<App initialEntries={["/projects/proj_123/tokens"]} />);
  await user.click(await screen.findByRole("button", { name: "Create agent credential" }));
  await user.type(screen.getByLabelText("Credential label"), "Assistant");
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Create agent credential" })
  );
  expect(await screen.findByText("dbundle_agent_one_time")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Dismiss agent secret" }));
  expect(screen.queryByText("dbundle_agent_one_time")).toBeNull();
  view.unmount();
  resetBrowserSessionClientState();
  const fetchMock = mockTokens(false, "member");
  render(<App initialEntries={["/projects/proj_123/tokens"]} />);
  await screen.findByText("Issued project tokens");
  expect(screen.queryByRole("button", { name: "Create agent credential" })).toBeNull();
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.some(([input]) => requestUrl(input).includes("/agent-tokens"))
    ).toBe(false)
  );
});

it("rejects expired credential input before making an issuance request", async () => {
  const fetchMock = mockTokens(true);
  const user = userEvent.setup();
  render(<App initialEntries={["/projects/proj_123/tokens"]} />);
  await user.click(await screen.findByRole("button", { name: "Create agent credential" }));
  fireEvent.change(screen.getByLabelText("Credential label"), { target: { value: "Assistant" } });
  fireEvent.change(screen.getByLabelText(/Expiry/), { target: { value: "2020-01-01T00:00:00Z" } });
  expect(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Create agent credential" })
  ).toBeDisabled();
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
});
it("drops a delayed issuance secret after leaving the credentials page", async () => {
  const fetchMock = mockTokens(true);
  const fallback = fetchMock.getMockImplementation()!;
  let finish!: (response: Response) => void;
  fetchMock.mockImplementation((input, init) =>
    requestUrl(input).endsWith("/agent-tokens") && init?.method === "POST"
      ? new Promise<Response>((resolve) => {
          finish = resolve;
        })
      : fallback(input, init)
  );
  const user = userEvent.setup();
  const view = render(<App initialEntries={["/projects/proj_123/tokens"]} />);
  await user.click(await screen.findByRole("button", { name: "Create agent credential" }));
  fireEvent.change(screen.getByLabelText("Credential label"), { target: { value: "Assistant" } });
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Create agent credential" })
  );
  await waitFor(() => expect(finish).toBeDefined());
  view.unmount();
  render(<App initialEntries={["/projects/proj_123/tokens"]} />);
  await screen.findByRole("button", { name: "Create agent credential" });
  await act(async () =>
    finish(jsonResponse(201, { token: { ...token, plaintext: "delayed_agent_secret" } }))
  );
  expect(screen.queryByText("delayed_agent_secret")).not.toBeInTheDocument();
});
