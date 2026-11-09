// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { App } from "../../../apps/web/src/app.js";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.js";
import { createSession, jsonResponse, requestUrl } from "./web-test-helpers.js";

const org = "11111111-1111-4111-8111-111111111111",
  owner = "22222222-2222-4222-8222-222222222222",
  member = "33333333-3333-4333-8333-333333333333";
const person = {
  user_id: member,
  email: "member@example.test",
  role: "member",
  project_access: "selected",
  default_project_role: "viewer",
  suspended_at: null,
  grants_paused_at: null,
  direct_project_count: 1
};
afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});
function setup(role: "owner" | "admin" | "member" = "owner") {
  const mutate = vi
    .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValue(jsonResponse(503, { error: "organization_invite_delivery_failed" }));
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    if (url.endsWith("/v1/auth/session"))
      return jsonResponse(200, {
        session: createSession({
          organization_id: org,
          organization_plan: "business",
          user_id: owner,
          role
        })
      });
    if (url.endsWith("/v1/organizations"))
      return jsonResponse(200, {
        organizations: [{ organization_id: org, name: "Example", plan: "business", role }]
      });
    if (url.endsWith("/people"))
      return jsonResponse(200, {
        people: [
          { ...person, user_id: owner, email: "owner@example.test", role: "owner" },
          person,
          {
            ...person,
            user_id: org,
            email: "admin@example.test",
            role: "admin",
            project_access: "all"
          }
        ]
      });
    if (url.endsWith("/invites") && init?.method === "POST") return mutate(input, init);
    if (url.endsWith("/invites")) return jsonResponse(200, { invites: [] });
    if (url.endsWith("/ownership-transfer")) return jsonResponse(200, { transfer: null });
    if (url.endsWith("/v1/projects")) return jsonResponse(200, { projects: [] });
    return jsonResponse(404, { error: "not_found" });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { mutate, fetchMock };
}
describe("organisation people controls", () => {
  it("keeps a failed ownership cancellation visible and refreshes current ownership after a successful retry", async () => {
    const { fetchMock: base } = setup(),
      user = userEvent.setup();
    let canceled = false;
    const cancel = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse(503, { error: "service_unavailable" }))
      .mockImplementation(async () => {
        canceled = true;
        return jsonResponse(200, { canceled: true });
      });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (requestUrl(input).endsWith("/ownership-transfer")) {
          if (init?.method === "DELETE") return cancel(input, init);
          return jsonResponse(200, {
            transfer: canceled
              ? null
              : { transfer_id: org, recipient_user_id: member, expires_at: "2026-11-09T00:00:00Z" }
          });
        }
        return base(input, init);
      })
    );
    render(<App initialEntries={["/settings/people"]} />);
    await user.click(await screen.findByRole("button", { name: "Cancel transfer" }));
    await screen.findByText(/Could not update the transfer/);
    await user.click(await screen.findByRole("button", { name: "Cancel transfer" }));
    expect(
      await screen.findByRole("button", { name: "Request ownership transfer" })
    ).toBeDisabled();
    expect(cancel).toHaveBeenCalledTimes(2);
  });
  it("requires the explicit recipient and responsibility choice before requesting ownership", async () => {
    const { fetchMock: base } = setup(),
      user = userEvent.setup();
    const transfer = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(jsonResponse(200, { transfer: { transfer_id: org } }));
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
        requestUrl(input).endsWith("/ownership-transfer") && init?.method === "POST"
          ? transfer(input, init)
          : base(input, init)
      )
    );
    render(<App initialEntries={["/settings/people"]} />);
    const button = await screen.findByRole("button", { name: "Request ownership transfer" });
    expect(button).toBeDisabled();
    const select = screen.getByLabelText("New Owner");
    select.focus();
    fireEvent.keyDown(select, { key: "ArrowDown", code: "ArrowDown" });
    await user.click(await screen.findByRole("option", { name: "member@example.test" }));
    expect(button).toBeDisabled();
    await user.click(screen.getByLabelText(/I understand that I become/));
    await user.click(button);
    await waitFor(() => expect(transfer).toHaveBeenCalledOnce());
    expect(JSON.parse(transfer.mock.calls[0]![1]!.body as string) as unknown).toEqual({
      recipient_user_id: member
    });
  });
  it("retains a failed invitation action and allows cancellation after retry", async () => {
    const { fetchMock: base } = setup(),
      user = userEvent.setup();
    let canceled = false;
    const invite = {
      invite_id: org,
      organization_id: org,
      email: "pending@example.test",
      role: "member",
      project_access: "selected",
      default_project_role: "viewer",
      project_ids: [],
      created_at: "2026-11-07T00:00:00Z",
      expires_at: "2026-11-14T00:00:00Z"
    };
    const cancel = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse(503, { error: "unavailable" }))
      .mockImplementation(async () => {
        canceled = true;
        return jsonResponse(200, { canceled: true });
      });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);
        if (url.endsWith(`/invites/${org}`) && init?.method === "DELETE")
          return cancel(input, init);
        if (url.endsWith("/invites") && (init?.method ?? "GET") === "GET")
          return jsonResponse(200, { invites: canceled ? [] : [invite] });
        return base(input, init);
      })
    );
    render(<App initialEntries={["/settings/people"]} />);
    await user.click(await screen.findByRole("button", { name: "Cancel invitation" }));
    await screen.findByText(/Could not complete the change/);
    await user.click(screen.getByRole("button", { name: "Cancel invitation" }));
    await screen.findByText("No pending invitations.");
    expect(cancel).toHaveBeenCalledTimes(2);
  });
  it("keeps an invitation draft after mail failure and defaults to selected access", async () => {
    const { mutate } = setup(),
      user = userEvent.setup();
    render(<App initialEntries={["/settings/people"]} />);
    await screen.findByRole("heading", { name: "People", level: 1 });
    await user.click(await screen.findByRole("button", { name: "Invite person" }));
    await user.type(screen.getByLabelText("Email address"), "invited@example.test");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));
    await screen.findByText(/saved.*resend/i);
    expect(screen.getByLabelText("Email address")).toHaveValue("invited@example.test");
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    const body = JSON.parse(mutate.mock.calls[0]![1]!.body as string) as unknown;
    expect(body).toEqual({
      email: "invited@example.test",
      role: "member",
      project_access: "selected",
      default_project_role: "member",
      project_ids: []
    });
  });
  it("does not offer an Org Admin controls over the Owner or a peer Admin", async () => {
    setup("admin");
    render(<App initialEntries={["/settings/people"]} />);
    expect(await screen.findByRole("button", { name: "Edit member@example.test" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Edit owner@example.test" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit admin@example.test" })).toBeNull();
  });
  it("denies the management screen to an ordinary member without requesting people", async () => {
    const { fetchMock } = setup("member");
    render(<App initialEntries={["/settings/people"]} />);
    await screen.findByText(/Owner or Admin access is required/i);
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).endsWith("/people"))).toBe(
      false
    );
  });

  it("never accepts an ownership link on GET and requires an explicit responsibility choice", async () => {
    const accept = vi
        .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
        .mockResolvedValue(jsonResponse(200, { organization_id: org })),
      user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.endsWith("/v1/auth/session"))
        return jsonResponse(200, {
          session: createSession({ organization_id: org, user_id: member })
        });
      if (url.endsWith("/ownership-transfer/accept")) return accept(input, init);
      if (url.endsWith("/v1/organizations/switch"))
        return jsonResponse(403, { error: "forbidden" });
      return jsonResponse(404, { error: "not_found" });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <App
        initialEntries={[
          "/organizations/accept?kind=ownership_transfer&token=dbundle_org_transfer_example_secret"
        ]}
      />
    );
    const button = await screen.findByRole("button", { name: "Accept ownership" });
    expect(button).toBeDisabled();
    expect(accept).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox"));
    await user.click(button);
    await screen.findByText(/Acceptance succeeded/i);
    expect(accept).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(accept.mock.calls[0]![1]).toMatchObject({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ token: "dbundle_org_transfer_example_secret" })
    });
  });

  it("switches live browser context and clears the old management page", async () => {
    const user = userEvent.setup();
    let switched = false;
    const { fetchMock: base } = setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.endsWith("/v1/organizations"))
        return jsonResponse(200, {
          organizations: [
            { organization_id: org, name: "Example", plan: "business", role: "owner" },
            { organization_id: member, name: "Other", plan: "business", role: "member" }
          ]
        });
      if (url.endsWith("/v1/organizations/switch")) {
        switched = true;
        return jsonResponse(200, { organization_id: member });
      }
      if (url.endsWith("/v1/auth/session") && switched)
        return jsonResponse(200, {
          session: createSession({
            organization_id: member,
            organization_plan: "business",
            role: "member"
          })
        });
      return base(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App initialEntries={["/settings/people"]} />);
    await screen.findByRole("button", { name: "Edit member@example.test" });
    await user.click(await screen.findByRole("button", { name: /Workspace: Example/i }));
    await user.click(await screen.findByRole("menuitem", { name: /Other/i }));
    await screen.findByRole("heading", { name: "Projects", level: 1 });
    expect(screen.queryByRole("button", { name: "Edit member@example.test" })).toBeNull();
    expect(
      fetchMock.mock.calls.find(([input]) =>
        requestUrl(input).endsWith("/v1/organizations/switch")
      )?.[1]
    ).toMatchObject({ method: "POST", body: JSON.stringify({ organization_id: member }) });
  });
});

it("hides workspace switching when only the current organisation is available, including a shared workspace", async () => {
  setup();
  render(<App initialEntries={["/settings/people"]} />);
  await screen.findByRole("button", { name: "Edit member@example.test" });
  expect(screen.queryByRole("button", { name: /^Workspace:/ })).not.toBeInTheDocument();
});

it("discovers newly available workspaces on focus after hiding the single choice", async () => {
  const { fetchMock: base } = setup();
  let shared = false;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (requestUrl(input).endsWith("/v1/organizations"))
        return jsonResponse(200, {
          organizations: [
            { organization_id: org, name: "Example", plan: "business", role: "owner" },
            ...(shared
              ? [{ organization_id: member, name: "Other", plan: "business", role: "member" }]
              : [])
          ]
        });
      return base(input, init);
    })
  );
  render(<App initialEntries={["/settings/people"]} />);
  await screen.findByRole("button", { name: "Edit member@example.test" });
  expect(screen.queryByRole("button", { name: /^Workspace:/ })).not.toBeInTheDocument();
  shared = true;
  fireEvent.focus(window);
  expect(await screen.findByRole("button", { name: /^Workspace: Example/ })).toBeVisible();
});
