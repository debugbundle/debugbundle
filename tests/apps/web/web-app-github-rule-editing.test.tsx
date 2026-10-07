// @vitest-environment jsdom
import { parseRequestBody } from "./helpers/request-body.js";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "../../../apps/web/src/app.js";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.js";
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
afterEach(() => {
  cleanup();
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});
function mockRule(
  rule: ReturnType<typeof createGitHubDispatchRule>,
  project = createProject({ organization_plan: "team" })
) {
  let saved: Record<string, unknown> | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.endsWith("/v1/auth/session")) return jsonResponse(200, { session: createSession() });
      if (url.endsWith("/v1/projects")) return jsonResponse(200, { projects: [project] });
      if (url.includes("/v1/github/installation"))
        return jsonResponse(200, { installation: createGitHubInstallation() });
      if (url.includes("/v1/github/app/install-url"))
        return jsonResponse(200, {
          install_url: "https://github.com/apps/debugbundle/installations/new"
        });
      if (url.includes("/v1/github/repositories"))
        return jsonResponse(200, { repositories: [createGitHubRepository()] });
      if (url.endsWith("/github/repo"))
        return jsonResponse(200, { repo: createProjectGitHubRepo() });
      if (url.endsWith("/github/rules")) return jsonResponse(200, { rules: [rule] });
      if (url.includes("/github/deliveries")) return jsonResponse(200, { deliveries: [] });
      if (url.includes("/github/rules/") && init?.method === "PATCH") {
        saved = parseRequestBody(init.body);
        return jsonResponse(200, { rule: { ...rule, ...saved } });
      }
      return jsonResponse(404, { error: "not_found" });
    })
  );
  return () => saved;
}
it.each([
  { enabled: false, event_types: ["bundle.created", "bundle.reopened"] },
  {
    enabled: false,
    event_types: ["bundle.updated", "verification.failed", "incident.spike_detected"],
    severity_min: null,
    bundle_type: null,
    incident_status: "reopened_only" as const
  },
  {
    enabled: true,
    event_types: ["improvement_bundle.created"],
    bundle_type: "failure" as const,
    incident_status: "new_only" as const
  }
])("preserves existing GitHub rule fields on save: %j", async (overrides) => {
  const user = userEvent.setup();
  const rule = createGitHubDispatchRule(overrides);
  const saved = mockRule(rule);
  render(<App initialEntries={["/projects/proj_123/github"]} />);
  await user.click(
    await screen.findByRole("button", { name: /edit rule high severity incidents/i })
  );
  await user.click(screen.getByRole("button", { name: /^save rule$/i }));
  await waitFor(() => expect(saved()).toBeDefined());
  expect({ ...rule, ...saved() }).toEqual(rule);
  if (rule.severity_min === null) expect(saved()).not.toHaveProperty("severity_min");
  if (rule.bundle_type === null) expect(saved()).not.toHaveProperty("bundle_type");
});
it("allows members to create rules and edit their own rules", async () => {
  mockRule(
    createGitHubDispatchRule({ created_by_user_id: "usr_123" }),
    createProject({ organization_plan: "team", effective_role: "member" })
  );
  render(<App initialEntries={["/projects/proj_123/github"]} />);
  expect(await screen.findByRole("button", { name: /^create rule$/i })).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /edit rule high severity incidents/i })
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /disconnect from this project/i })).toBeNull();
});
it("retains cleanup after a Free downgrade without enabling paid writes", async () => {
  mockRule(createGitHubDispatchRule(), createProject({ organization_plan: "free" }));
  render(<App initialEntries={["/projects/proj_123/github"]} />);
  expect(
    await screen.findByRole("button", { name: /delete rule high severity incidents/i })
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /disconnect from this project/i })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^create rule$/i })).toBeNull();
  expect(screen.queryByRole("button", { name: /edit rule high severity incidents/i })).toBeNull();
});
