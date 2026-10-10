import { expect, it, vi } from "vitest";
import { runCli } from "../../../apps/cli/src/main.js";
import {
  createPublicStatusApi,
  publicStatusWithAuthCommand
} from "../../../apps/cli/src/public-status-commands.js";
import {
  statusPageFixture,
  statusProjectId,
  statusPublicId,
  statusSettings,
  statusCheckId
} from "../../helpers/public-status.ts";
const management = {
  settings: statusSettings,
  public_id: statusPublicId,
  public_url: `https://status.debugbundle.com/${statusPublicId}`,
  access_mode: "manage"
};
it("routes all public status commands and preserves explicit save selections", async () => {
  const command = vi.fn().mockResolvedValue({ exitCode: 0, output: "ok" });
  for (const action of ["get", "save", "options", "preview"]) {
    expect(
      (
        await runCli(
          [
            "health",
            "status",
            action,
            "--project-id",
            statusProjectId,
            "--json",
            ...(action === "save" ? ["--settings-json", JSON.stringify(statusSettings)] : [])
          ],
          { publicStatusCommand: command }
        )
      ).exitCode
    ).toBe(0);
  }
  expect(command).toHaveBeenCalledWith({
    action: "save",
    projectId: statusProjectId,
    settings: statusSettings,
    json: true
  });
  expect(
    (
      await runCli(
        ["health", "status", "save", "--project-id", statusProjectId, "--settings-json", "{}"],
        { publicStatusCommand: command }
      )
    ).exitCode
  ).not.toBe(0);
  expect(
    (
      await runCli(["health", "status", "get", "--project-id", statusProjectId, "--unknown"], {
        publicStatusCommand: command
      })
    ).exitCode
  ).not.toBe(0);
});
it("uses the authenticated API for settings, preview and both option cursors", async () => {
  const request = vi.fn().mockResolvedValue({ status: 200, body: management });
  const api = createPublicStatusApi({ request }),
    scope = { projectId: statusProjectId, bearerToken: "member-secret" };
  await api.get(scope);
  await api.save({ ...scope, settings: statusSettings });
  expect(request).toHaveBeenLastCalledWith({
    method: "PUT",
    path: `/v1/projects/${statusProjectId}/status-page`,
    bearerToken: "member-secret",
    body: statusSettings
  });
  request.mockResolvedValueOnce({ status: 200, body: { projects: [], next_cursor: null } });
  await api.options({ ...scope, check_project_id: statusProjectId, check_cursor: statusCheckId });
  expect(request.mock.lastCall?.[0].path).toContain(
    `check_project_id=${statusProjectId}&check_cursor=${statusCheckId}`
  );
  request.mockResolvedValueOnce({ status: 200, body: statusPageFixture() });
  expect(await api.preview(scope)).toEqual(statusPageFixture());
  expect(() => api.options({ ...scope, check_cursor: statusCheckId })).toThrow();
});
it("executes all actions through saved member authentication and returns validated JSON", async () => {
  for (const action of ["get", "save", "options", "preview"] as const) {
    const body =
      action === "preview"
        ? statusPageFixture()
        : action === "options"
          ? { projects: [], next_cursor: null }
          : management;
    const request = vi.fn().mockResolvedValue({ status: 200, body });
    const result = await publicStatusWithAuthCommand(
      {
        action,
        projectId: statusProjectId,
        json: true,
        ...(action === "save" ? { settings: statusSettings } : {}),
        ...(action === "options"
          ? { check_project_id: statusProjectId, check_cursor: statusCheckId }
          : {})
      },
      {
        readAuthState: vi.fn().mockResolvedValue({
          base_url: "https://api.example.com",
          bearer_token: "member-secret"
        }),
        createHttpClient: () => ({ request })
      }
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual(body);
    expect(result.output).not.toContain("member-secret");
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: action === "save" ? "PUT" : "GET",
        bearerToken: "member-secret"
      })
    );
  }
});
it.each([
  [401, 2],
  [403, 4],
  [404, 3],
  [500, 1]
])("maps HTTP %s to the existing CLI exit code %s", async (status, exitCode) => {
  const result = await publicStatusWithAuthCommand(
    { action: "get", projectId: statusProjectId },
    {
      readAuthState: vi
        .fn()
        .mockResolvedValue({ base_url: "https://api.example.com", bearer_token: "member-secret" }),
      createHttpClient: () => ({
        request: vi.fn().mockResolvedValue({ status, body: { error: "denied" } })
      })
    }
  );
  expect(result).toEqual({ exitCode, output: "denied" });
});
