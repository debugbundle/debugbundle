// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, afterEach, expect, it, vi } from "vitest";
import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import {
  createGitHubDispatchRule,
  createGitHubInstallation,
  createGitHubRepository,
  createProject,
  createProjectGitHubRepo,
  createSession,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";
import { chooseSelectOption, addCustomScopeValues } from "./helpers/management-ui.js";

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

describe("github rules", () => {
  it("creates an improvement github dispatch rule with the improvement bundle type", async () => {
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

      if (
        url.endsWith("/v1/github/repositories?project_id=proj_123") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, {
          repositories: [createGitHubRepository()]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/github/repo") && init?.method === undefined) {
        return jsonResponse(200, {
          repo: createProjectGitHubRepo()
        });
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

      if (url.endsWith("/v1/projects/proj_123/github/rules") && init?.method === "POST") {
        const requestBody = init.body;
        if (typeof requestBody !== "string") {
          throw new Error("expected GitHub dispatch rule request body");
        }
        expect(JSON.parse(requestBody)).toEqual(
          expect.objectContaining({
            name: "Hosted improvements",
            event_types: ["improvement_bundle.created"],
            bundle_type: "improvement",
            incident_status: "new_or_reopened"
          })
        );

        return jsonResponse(201, {
          rule: createGitHubDispatchRule({
            rule_id: "ghr_999",
            name: "Hosted improvements",
            event_types: ["improvement_bundle.created"],
            severity_min: "medium",
            bundle_type: "improvement",
            incident_status: "new_or_reopened",
            cooldown_seconds: 600
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/github"]} />);

    expect(
      await screen.findByText(/no github dispatch rules are configured yet/i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /create rule/i }));
    await user.type(screen.getByLabelText(/^rule name$/i), "Hosted improvements");
    await user.click(screen.getByRole("checkbox", { name: /^bundle\.created$/i }));
    await user.click(screen.getByRole("checkbox", { name: /^improvement_bundle\.created$/i }));
    await chooseSelectOption(user, /bundle type/i, /^improvement$/i);
    expect(screen.getByLabelText(/incident state/i)).toHaveTextContent("new_or_reopened");
    await chooseSelectOption(user, /minimum severity/i, /^medium$/i);
    await chooseSelectOption(user, /cooldown unit/i, /^seconds$/i);
    await user.clear(screen.getByLabelText(/^cooldown$/i));
    await user.type(screen.getByLabelText(/^cooldown$/i), "600");
    await user.click(screen.getByRole("button", { name: /^create rule$/i }));

    expect(await screen.findByText(/^hosted improvements$/i)).toBeInTheDocument();
  });

  it("lets owners create and delete a github dispatch rule from the project github page", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject({ organization_plan: "solo" })]
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

      if (
        url.endsWith("/v1/github/repositories?project_id=proj_123") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, {
          repositories: [createGitHubRepository()]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/github/repo") && init?.method === undefined) {
        return jsonResponse(200, {
          repo: createProjectGitHubRepo()
        });
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

      if (url.endsWith("/v1/projects/proj_123/github/rules") && init?.method === "POST") {
        return jsonResponse(201, {
          rule: createGitHubDispatchRule({
            rule_id: "ghr_999",
            name: "Critical incidents",
            event_types: ["bundle.created"],
            environments: ["production"],
            services: ["checkout-api"],
            severity_min: "critical",
            incident_status: "new_only",
            cooldown_seconds: 900
          })
        });
      }

      if (url.endsWith("/v1/projects/proj_123/github/rules/ghr_999") && init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/github"]} />);

    expect(
      await screen.findByText(/no github dispatch rules are configured yet/i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /create rule/i }));
    await user.type(screen.getByLabelText(/^rule name$/i), "Critical incidents");
    expect(screen.getByRole("checkbox", { name: /^bundle\.created$/i })).toBeChecked();
    await addCustomScopeValues(user, "Environments", ["production"]);
    await addCustomScopeValues(user, "Services", ["checkout-api"]);
    await chooseSelectOption(user, /minimum severity/i, /^critical$/i);
    await chooseSelectOption(user, /incident state/i, /^new_only$/i);
    await chooseSelectOption(user, /cooldown unit/i, /^seconds$/i);
    await user.clear(screen.getByLabelText(/^cooldown$/i));
    await user.type(screen.getByLabelText(/^cooldown$/i), "900");
    await user.click(screen.getByRole("button", { name: /^create rule$/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, requestInit]) =>
            requestUrl(input).endsWith("/v1/projects/proj_123/github/rules") &&
            requestInit?.method === "POST"
        )
      ).toBe(true);
    });

    expect(await screen.findByText(/^critical incidents$/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /delete rule critical incidents/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, requestInit]) =>
            requestUrl(input).endsWith("/v1/projects/proj_123/github/rules/ghr_999") &&
            requestInit?.method === "DELETE"
        )
      ).toBe(true);
    });

    expect(
      await screen.findByText(/no github dispatch rules are configured yet/i)
    ).toBeInTheDocument();
  });

  it("lets owners edit a github dispatch rule from the project github page", async () => {
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

      if (
        url.endsWith("/v1/github/repositories?project_id=proj_123") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, {
          repositories: [createGitHubRepository()]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/github/repo") && init?.method === undefined) {
        return jsonResponse(200, {
          repo: createProjectGitHubRepo()
        });
      }

      if (url.endsWith("/v1/projects/proj_123/github/rules") && init?.method === undefined) {
        return jsonResponse(200, {
          rules: [createGitHubDispatchRule()]
        });
      }

      if (
        url.endsWith("/v1/projects/proj_123/github/deliveries?limit=20") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, { deliveries: [] });
      }

      if (url.endsWith("/v1/projects/proj_123/github/rules/ghr_123") && init?.method === "PATCH") {
        return jsonResponse(200, {
          rule: createGitHubDispatchRule({
            name: "Critical only",
            severity_min: "critical",
            cooldown_seconds: 900,
            incident_status: "new_only"
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/github"]} />);

    expect(await screen.findByText(/high severity incidents/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /edit rule high severity incidents/i }));
    await user.clear(screen.getByLabelText(/^rule name$/i));
    await user.type(screen.getByLabelText(/^rule name$/i), "Critical only");
    await chooseSelectOption(user, /minimum severity/i, /^critical$/i);
    await chooseSelectOption(user, /incident state/i, /^new_only$/i);
    await chooseSelectOption(user, /cooldown unit/i, /^seconds$/i);
    await user.clear(screen.getByLabelText(/^cooldown$/i));
    await user.type(screen.getByLabelText(/^cooldown$/i), "900");
    await user.click(screen.getByRole("button", { name: /^save rule$/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, requestInit]) =>
            requestUrl(input).endsWith("/v1/projects/proj_123/github/rules/ghr_123") &&
            requestInit?.method === "PATCH"
        )
      ).toBe(true);
    });

    expect(await screen.findByText(/^critical only$/i)).toBeInTheDocument();
  });
});
