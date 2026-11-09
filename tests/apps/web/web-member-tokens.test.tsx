// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { App } from "../../../apps/web/src/app.js";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.js";
import {
  createSession,
  createProject,
  createMemberTokenRecord,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";

const org = "11111111-1111-4111-8111-111111111111",
  project = "22222222-2222-4222-8222-222222222222";
afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});
function setup(verified = true) {
  const create = vi
    .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValue(jsonResponse(403, { error: "token_scope_forbidden" }));
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.endsWith("/v1/auth/session"))
        return jsonResponse(200, {
          session: createSession({
            organization_id: org,
            email_verified_at: verified ? new Date().toISOString() : null
          })
        });
      if (url.endsWith("/v1/projects"))
        return jsonResponse(200, {
          projects: [createProject({ project_id: project, organization_id: org })]
        });
      if (url.includes("/v1/member/tokens") && init?.method === "POST") return create(input, init);
      if (url.endsWith("/v1/member/tokens?include_scope=true"))
        return jsonResponse(200, { tokens: [createMemberTokenRecord()] });
      return jsonResponse(404, { error: "not_found" });
    })
  );
  return create;
}
describe("scoped member token controls", () => {
  it("defaults to explicit projects and read access, keeps a failed draft and reviews expiry", async () => {
    const create = setup(),
      user = userEvent.setup();
    render(<App initialEntries={["/member-tokens"]} />);
    await screen.findByText("Legacy broad access");
    await user.click(screen.getByRole("button", { name: "Create member token" }));
    expect(screen.getByRole("radio", { name: "Selected projects" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Read" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Expires in days")).toHaveValue(90);
    await user.type(screen.getByLabelText("Token label"), "CI read");
    await user.click(screen.getByRole("button", { name: "Create token" }));
    expect(await screen.findByText(/choose at least one project/i)).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
    await user.click(screen.getByRole("radio", { name: "Current organisation" }));
    await user.click(screen.getByRole("button", { name: "Create token" }));
    await screen.findByText(/could not create this token/i);
    expect(screen.getByLabelText("Token label")).toHaveValue("CI read");
    expect(screen.getByRole("radio", { name: "Current organisation" })).toBeChecked();
    const body = JSON.parse(create.mock.calls[0]![1]!.body as string) as {
      scope: unknown;
      expires_at: string;
    };
    expect(body.scope).toEqual({
      mode: "organization",
      organization_id: org,
      permissions: ["project:read"]
    });
    expect(Date.parse(body.expires_at) - Date.now()).toBeGreaterThan(89 * 86_400_000);
    expect(Date.parse(body.expires_at) - Date.now()).toBeLessThanOrEqual(90 * 86_400_000);
    expect(within(screen.getByRole("dialog")).queryByText("Legacy broad access")).toBeNull();
  });
  it("requires verification even when a legacy token already exists", async () => {
    const create = setup(false);
    render(<App initialEntries={["/member-tokens"]} />);
    await screen.findByText("Legacy broad access");
    expect(screen.getByRole("button", { name: "Create member token" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create replacement" })).toBeDisabled();
    expect(create).not.toHaveBeenCalled();
  });
  it("keeps replacement in row actions and explains the manual handover before creating anything", async () => {
    const create = setup(),
      user = userEvent.setup();
    render(<App initialEntries={["/member-tokens"]} />);
    const access = await screen.findByText("Legacy broad access");
    const row = access.closest("tr")!;
    const cells = within(row).getAllByRole("cell");
    expect(within(cells[2]!).queryByRole("button")).toBeNull();
    const actions = within(cells.at(-1)!);
    expect(actions.getByRole("button", { name: "Revoke" })).toBeInTheDocument();
    await user.click(actions.getByRole("button", { name: "Create replacement" }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Create replacement token" })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/existing token stays active until you revoke it/i)
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Token label")).toHaveValue(
      `${row.cells[0]!.textContent} replacement`
    );
    expect(screen.getByRole("radio", { name: "Selected projects" })).toBeChecked();
    expect(screen.getByLabelText("Expires in days")).toHaveValue(90);
    expect(create).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Create member token" }));
    expect(screen.getByRole("heading", { name: "Create token" })).toBeInTheDocument();
    expect(screen.getByLabelText("Token label")).toHaveValue("");
    expect(screen.queryByText(/existing token stays active until you revoke it/i)).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });
});
