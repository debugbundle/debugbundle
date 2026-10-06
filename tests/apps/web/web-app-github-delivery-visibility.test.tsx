// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import {
  createGitHubDispatchDelivery,
  createGitHubDispatchRule,
  createGitHubInstallation,
  createGitHubRepository,
  createProject,
  createProjectGitHubRepo,
  createSession,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";

afterEach(() => {
  window.localStorage.clear();
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

describe("GitHub delivery visibility", () => {
  it("clears current failed deliveries in this browser while keeping new failures and history available", async () => {
    const user = userEvent.setup();
    const firstFailure = createGitHubDispatchDelivery({
      delivery_id: "gdd_first",
      target_title: "First failure",
      last_error: "github_dispatch_http_error_422"
    });
    const delivered = createGitHubDispatchDelivery({
      delivery_id: "gdd_delivered",
      target_title: "Delivered dispatch",
      status: "delivered",
      last_error: null
    });
    let deliveries = [firstFailure, delivered];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.endsWith("/v1/auth/session")) return jsonResponse(200, { session: createSession() });
      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, { projects: [createProject({ organization_plan: "solo" })] });
      }
      if (url.endsWith("/v1/github/installation?project_id=proj_123")) {
        return jsonResponse(200, { installation: createGitHubInstallation() });
      }
      if (url.includes("/v1/github/app/install-url")) {
        return jsonResponse(200, { install_url: "https://github.com/apps/debugbundle-automation/installations/new" });
      }
      if (url.endsWith("/v1/github/repositories?project_id=proj_123")) {
        return jsonResponse(200, { repositories: [createGitHubRepository()] });
      }
      if (url.endsWith("/v1/projects/proj_123/github/repo")) {
        return jsonResponse(200, { repo: createProjectGitHubRepo() });
      }
      if (url.endsWith("/v1/projects/proj_123/github/rules")) {
        return jsonResponse(200, { rules: [createGitHubDispatchRule()] });
      }
      if (url.endsWith("/v1/projects/proj_123/github/deliveries?limit=20")) {
        return jsonResponse(200, { deliveries });
      }
      if (url.endsWith("/v1/projects/proj_123/github/deliveries/gdd_first/retry") && init?.method === "POST") {
        return jsonResponse(200, {
          delivery: createGitHubDispatchDelivery({
            ...firstFailure,
            status: "retrying",
            last_error: null
          })
        });
      }
      return jsonResponse(404, { error: "not_found" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const firstView = render(<App initialEntries={["/projects/proj_123/github"]} />);
    expect(await screen.findByText("First failure")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear failed" }));
    expect(screen.queryByText("First failure")).toBeNull();
    expect(screen.getByText("Delivered dispatch")).toBeInTheDocument();

    deliveries = [
      firstFailure,
      createGitHubDispatchDelivery({ delivery_id: "gdd_new", target_title: "New failure" }),
      delivered
    ];
    firstView.unmount();
    const secondView = render(<App initialEntries={["/projects/proj_123/github"]} />);
    expect(await screen.findByText("New failure")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("First failure")).toBeNull());
    await user.click(screen.getByRole("button", { name: /show cleared/i }));
    expect(screen.getByText("First failure")).toBeInTheDocument();
    const firstFailureRow = screen.getByText("First failure").closest("tr");
    expect(firstFailureRow).not.toBeNull();
    await user.click(within(firstFailureRow as HTMLTableRowElement).getByRole("button", { name: "Retry delivery" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /hide cleared/i })).toBeNull());

    secondView.unmount();
    render(<App initialEntries={["/projects/proj_123/github"]} />);
    expect(await screen.findByText("First failure")).toBeInTheDocument();
    expect(fetchMock.mock.calls.every(([, request]) => request?.method !== "DELETE")).toBe(true);
  });
});
