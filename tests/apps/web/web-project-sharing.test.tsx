// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import {
  createProject,
  createProjectInvite,
  createProjectMember,
  createSession,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

if (typeof HTMLElement !== "undefined" && HTMLElement.prototype.hasPointerCapture === undefined) {
  HTMLElement.prototype.hasPointerCapture = () => false;
}

if (typeof HTMLElement !== "undefined" && HTMLElement.prototype.setPointerCapture === undefined) {
  HTMLElement.prototype.setPointerCapture = () => {};
}

if (typeof HTMLElement !== "undefined" && HTMLElement.prototype.releasePointerCapture === undefined) {
  HTMLElement.prototype.releasePointerCapture = () => {};
}

describe("web app — project sharing", () => {
  it("renders shared project icons in project tables and project breadcrumbs", async () => {
    const sharedProject = createProject({
      project_id: "proj_shared",
      name: "Shared App",
      slug: "shared-app",
      organization_plan: "team",
      relationship: "shared",
      sharing_state: "shared_with_you",
      effective_role: "member",
      owner_email: "owner@example.com"
    });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({ organization_plan: "team" })
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [sharedProject]
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    const inventoryView = render(<App initialEntries={["/projects"]} />);

    expect(await screen.findByRole("heading", { name: /projects/i, level: 1 })).toBeInTheDocument();
    expect((await screen.findAllByText(/shared app/i)).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(document.querySelectorAll('[aria-label="Shared project"]')).toHaveLength(1);
    });

    inventoryView.unmount();

    render(<App initialEntries={["/projects/proj_shared"]} />);

    expect(await screen.findByText(/project details/i)).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /members/i })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(document.querySelectorAll('[aria-label="Shared project"]')).toHaveLength(1);
    });
  });

  it("invites collaborators, updates roles, removes access, and cancels invites from the members tab", async () => {
    const user = userEvent.setup();
    const project = createProject({
      project_id: "proj_123",
      name: "Main App",
      organization_plan: "team",
      relationship: "owned",
      effective_role: "owner"
    });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({ organization_plan: "team" })
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [project]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/members") && init?.method === undefined) {
        return jsonResponse(200, {
          members: [
            createProjectMember(),
            createProjectMember({
              user_id: "usr_456",
              email: "casey@example.com",
              role: "member",
              membership_type: "collaborator"
            })
          ]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/invites") && init?.method === undefined) {
        return jsonResponse(200, {
          invites: [createProjectInvite()]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/invite") && init?.method === "POST") {
        const body = JSON.parse(init.body as string) as { email: string; role: "admin" | "member" };
        return jsonResponse(201, {
          invite: createProjectInvite({ invite_id: "pinv_456", email: body.email, role: body.role })
        });
      }

      if (url.endsWith("/v1/projects/proj_123/members/usr_456") && init?.method === "PATCH") {
        const body = JSON.parse(init.body as string) as { role: "admin" | "member" };
        return jsonResponse(200, {
          member: createProjectMember({
            user_id: "usr_456",
            email: "casey@example.com",
            role: body.role,
            membership_type: "collaborator"
          })
        });
      }

      if (url.endsWith("/v1/projects/proj_123/members/usr_456") && init?.method === "DELETE") {
        return jsonResponse(200, { success: true });
      }

      if (url.endsWith("/v1/projects/proj_123/invites/pinv_123") && init?.method === "DELETE") {
        return jsonResponse(200, { success: true });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/members"]} />);

    expect(await screen.findByText(/casey@example.com/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /invite collaborator/i }));
    await user.type(screen.getByLabelText(/email address/i), "newbie@example.com");
    await user.click(screen.getByRole("button", { name: /send invite/i }));

    expect(await screen.findByText(/newbie@example.com/i)).toBeInTheDocument();

    await user.pointer([{ target: screen.getByLabelText(/role for casey@example.com/i), keys: "[MouseLeft]" }]);
    await user.click(await screen.findByRole("option", { name: /^admin$/i }));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) => requestUrl(input).endsWith("/v1/projects/proj_123/members/usr_456") && init?.method === "PATCH"
        )
      ).toBe(true);
    });

    const pendingInviteRow = screen.getByText(/^pending@example\.com$/i).closest("tr");
    expect(pendingInviteRow).not.toBeNull();
    await user.click(within(pendingInviteRow as HTMLTableRowElement).getByRole("button", { name: /^cancel$/i }));
    await user.click(await screen.findByRole("button", { name: /cancel invite/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) => requestUrl(input).endsWith("/v1/projects/proj_123/invites/pinv_123") && init?.method === "DELETE"
        )
      ).toBe(true);
    });

    const memberRow = screen.getByText(/^casey@example\.com$/i).closest("tr");
    expect(memberRow).not.toBeNull();
    await user.click(within(memberRow as HTMLTableRowElement).getByRole("button", { name: /remove/i }));
    await user.click(await screen.findByRole("button", { name: /remove access/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) => requestUrl(input).endsWith("/v1/projects/proj_123/members/usr_456") && init?.method === "DELETE"
        )
      ).toBe(true);
    });
  });

  it("returns email sign-in flows to the invite page and accepts the invite", async () => {
    const user = userEvent.setup();
    const project = createProject({
      project_id: "proj_123",
      name: "Shared App",
      slug: "shared-app",
      organization_plan: "team",
      relationship: "shared",
      sharing_state: "shared_with_you",
      effective_role: "member",
      owner_email: "owner@example.com"
    });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: null });
      }

      if (url.endsWith("/v1/auth/request-code") && init?.method === "POST") {
        return jsonResponse(200, {});
      }

      if (url.endsWith("/v1/auth/verify-code") && init?.method === "POST") {
        return jsonResponse(200, {
          session: createSession({ email: "invited@example.com", organization_plan: "team" })
        });
      }

      if (url.endsWith("/v1/auth/project-invite/accept") && init?.method === "POST") {
        return jsonResponse(200, {
          membership: {
            project_id: "proj_123",
            user_id: "usr_123",
            role: "member",
            membership_type: "collaborator"
          }
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [project]
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/login?next=%2Finvite%3Ftoken%3Dtok_123"]} />);

    expect(await screen.findByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign up here/i })).toHaveAttribute("href", "/signup?next=%2Finvite%3Ftoken%3Dtok_123");

    await user.type(screen.getByLabelText(/email/i), "invited@example.com");
    await user.click(screen.getByRole("button", { name: /^send code$/i }));

    expect(await screen.findByLabelText(/six-digit code/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/six-digit code/i), "123456");
    await user.click(screen.getByRole("button", { name: /verify code/i }));

    expect(await screen.findByText(/ready to accept invite/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /accept invite/i }));

    expect(await screen.findByText(/shared with you/i)).toBeInTheDocument();
    expect(screen.getByText(/owner@example.com/i)).toBeInTheDocument();
  });
});
