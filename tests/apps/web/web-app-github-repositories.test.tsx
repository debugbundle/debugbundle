// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, afterEach, expect, it, vi } from "vitest";
import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import {
  createGitHubInstallation,
  createGitHubRepository,
  createProject,
  createProjectGitHubRepo,
  createSession,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";
import { openSelect, chooseSelectOption } from "./helpers/management-ui.js";

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

describe("github repositories", () => {
  it("lets owners connect and remove a github repository from the project github page", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject({ organization_plan: "team" })]
        });
      }

      if (
        url.endsWith("/v1/github/installation?project_id=proj_123") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, {
          installation: createGitHubInstallation()
        });
      }

      if (url.includes("/v1/github/app/install-url") && init?.method === undefined) {
        return jsonResponse(200, {
          install_url: "https://github.com/apps/debugbundle-automation/installations/new"
        });
      }

      if (
        url.endsWith("/v1/github/repositories?project_id=proj_123") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, {
          repositories: [
            createGitHubRepository(),
            createGitHubRepository({ id: 2, name: "worker", full_name: "debugbundle/worker" })
          ]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/github/repo") && init?.method === undefined) {
        return jsonResponse(200, { repo: null });
      }

      if (url.endsWith("/v1/projects/proj_123/github/rules") && init?.method === undefined) {
        return jsonResponse(200, { rules: [] });
      }

      if (
        url.endsWith("/v1/projects/proj_123/github/deliveries?limit=20") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, { deliveries: [] });
      }

      if (url.endsWith("/v1/projects/proj_123/github/repo") && init?.method === "PUT") {
        expect(init.body).toBe(JSON.stringify({ owner: "debugbundle", repo: "worker" }));
        return jsonResponse(200, {
          repo: createProjectGitHubRepo({ repo_name: "worker", default_branch: "main" })
        });
      }

      if (url.endsWith("/v1/projects/proj_123/github/repo") && init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/github"]} />);

    expect(
      await screen.findByText(/no github repository is assigned to this project yet/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/choose one repository from the repos currently granted/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /manage repositories in github/i })).toHaveAttribute(
      "href",
      "https://github.com/apps/debugbundle-automation/installations/new"
    );

    await chooseSelectOption(
      user,
      /repositories accessible to this github app installation/i,
      /^debugbundle\/worker$/i
    );
    await user.click(screen.getByRole("button", { name: /connect to this project/i }));

    expect((await screen.findAllByText(/debugbundle\/worker/i)).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /disconnect from this project/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, requestInit]) =>
            requestUrl(input).endsWith("/v1/projects/proj_123/github/repo") &&
            requestInit?.method === "DELETE"
        )
      ).toBe(true);
    });

    expect(
      await screen.findByText(/no github repository is assigned to this project yet/i)
    ).toBeInTheDocument();
  });

  it("refreshes the accessible repository list after github-side installation changes", async () => {
    const user = userEvent.setup();
    let repositoryListRequestCount = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject({ organization_plan: "team" })]
        });
      }

      if (
        url.endsWith("/v1/github/installation?project_id=proj_123") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, {
          installation: createGitHubInstallation()
        });
      }

      if (url.includes("/v1/github/app/install-url") && init?.method === undefined) {
        return jsonResponse(200, {
          install_url: "https://github.com/apps/debugbundle-automation/installations/new"
        });
      }

      if (
        url.endsWith("/v1/github/repositories?project_id=proj_123") &&
        init?.method === undefined
      ) {
        repositoryListRequestCount += 1;

        return jsonResponse(200, {
          repositories:
            repositoryListRequestCount === 1
              ? [createGitHubRepository()]
              : [
                  createGitHubRepository(),
                  createGitHubRepository({ id: 2, name: "worker", full_name: "debugbundle/worker" })
                ]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/github/repo") && init?.method === undefined) {
        return jsonResponse(200, { repo: null });
      }

      if (url.endsWith("/v1/projects/proj_123/github/rules") && init?.method === undefined) {
        return jsonResponse(200, { rules: [] });
      }

      if (
        url.endsWith("/v1/projects/proj_123/github/deliveries?limit=20") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, { deliveries: [] });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/github"]} />);

    expect(
      await screen.findByText(/no github repository is assigned to this project yet/i)
    ).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "debugbundle/worker" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /refresh list/i }));

    await openSelect(/repositories accessible to this github app installation/i);
    expect(await screen.findByRole("option", { name: "debugbundle/worker" })).toBeInTheDocument();
  });
});
