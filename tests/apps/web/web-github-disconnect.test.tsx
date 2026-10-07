// @vitest-environment jsdom
import { render, screen, within, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../../apps/web/src/app.js";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.js";
import {
  createProject,
  createSession,
  createGitHubInstallation,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";
afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});
function install(role: "owner" | "admin", organizationId = "org_123") {
  let disconnected = false;
  const requests: RequestInit[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.endsWith("/v1/auth/session"))
        return jsonResponse(200, {
          session: createSession({ role: role === "admin" ? "member" : "owner" })
        });
      if (url.endsWith("/v1/projects"))
        return jsonResponse(200, {
          projects: [
            createProject({
              organization_id: organizationId,
              organization_plan: "free",
              effective_role: role
            })
          ]
        });
      if (url.includes("/v1/github/installation") && init?.method === "DELETE") {
        requests.push(init);
        disconnected = true;
        return new Response(null, { status: 204 });
      }
      if (url.includes("/v1/github/installation"))
        return jsonResponse(200, {
          installation: disconnected ? null : createGitHubInstallation()
        });
      if (url.endsWith("/github/repo")) return jsonResponse(200, { repo: null });
      if (url.endsWith("/github/rules")) return jsonResponse(200, { rules: [] });
      if (url.includes("/github/deliveries")) return jsonResponse(200, { deliveries: [] });
      return jsonResponse(404, { error: "not_found" });
    })
  );
  return requests;
}
describe("dashboard organization GitHub disconnect", () => {
  it("requires a named all-projects confirmation and permits Free downgrade cleanup", async () => {
    const user = userEvent.setup();
    const requests = install("owner");
    render(<App initialEntries={["/projects/proj_123/github"]} />);
    await user.click(await screen.findByRole("button", { name: "Disconnect GitHub installation" }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText(/all its projects/)).toBeInTheDocument();
    expect(requests).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(requests).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Disconnect GitHub installation" }));
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Disconnect GitHub installation"
      })
    );
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.credentials).toBe("include");
    expect(new Headers(requests[0]?.headers).get("X-CSRF-Token")).toBe("csrf-token-123");
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Disconnect GitHub installation" })
      ).not.toBeInTheDocument()
    );
  });
  it.each([
    ["admin", "org_123"],
    ["owner", "other_org"]
  ] as const)("hides organization disconnect for %s on %s", async (role, organizationId) => {
    const requests = install(role, organizationId);
    render(<App initialEntries={["/projects/proj_123/github"]} />);
    await screen.findByText("Repository connected to this project");
    expect(
      screen.queryByRole("button", { name: "Disconnect GitHub installation" })
    ).not.toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });
});
