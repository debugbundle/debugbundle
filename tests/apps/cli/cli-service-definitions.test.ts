import { describe, expect, it, vi } from "vitest";
import { runCli } from "../../../apps/cli/src/main.js";
import {
  serviceDefinitionWithAuthCommand,
  type ServiceDefinitionCommandInput
} from "../../../apps/cli/src/service-definition-commands.js";
const id = "10000000-0000-4000-8000-000000000001";
const service = {
  service_definition_id: id,
  project_id: id,
  origin_project_id: id,
  name: "Site",
  input_name: "web",
  description: null,
  repository_url: null,
  repository_root: null,
  repository: null,
  environments: ["production"],
  created_at: "2026-11-04T12:00:00.000Z",
  updated_at: "2026-11-04T12:00:00.000Z"
};
describe("service catalogue commands", () => {
  it("authenticates all catalogue actions and renders their validated results", async () => {
    const request = vi.fn();
    const dependencies = {
      readAuthState: async () => ({ bearer_token: "member", base_url: "https://api.example.test" }),
      createHttpClient: () => ({ request })
    };
    const actions: ServiceDefinitionCommandInput[] = [
      { action: "list", projectId: id, limit: 1, cursor: id, authFilePath: "fixture-auth" },
      { action: "get", projectId: id, serviceDefinitionId: id, json: true },
      { action: "create", projectId: id, service: { name: "Site" } },
      {
        action: "update",
        projectId: id,
        serviceDefinitionId: id,
        update: { description: "Website" }
      }
    ];
    for (const input of actions) {
      request.mockResolvedValueOnce({
        status: input.action === "create" ? 201 : 200,
        body: input.action === "list" ? { services: [service], next_cursor: id } : { service }
      });
      const result = await serviceDefinitionWithAuthCommand(input, dependencies);
      expect(result.exitCode).toBe(0);
      if (input.action === "list") expect(result.output).toContain(`Next cursor: ${id}`);
      else if (input.json) expect(JSON.parse(result.output)).toEqual({ service });
      else expect(result.output).toBe(`${id} Site`);
    }
    request.mockResolvedValueOnce({ status: 200, body: { services: [], next_cursor: null } });
    expect(
      (await serviceDefinitionWithAuthCommand({ action: "list", projectId: id }, dependencies))
        .output
    ).toBe("No services found.");
    request.mockResolvedValueOnce({
      status: 200,
      body: { services: [{ ...service, environments: [] }], next_cursor: null }
    });
    expect(
      (await serviceDefinitionWithAuthCommand({ action: "list", projectId: id }, dependencies))
        .output
    ).toContain("no environments yet");
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        bearerToken: "member",
        path: expect.stringContaining("/service-definitions")
      })
    );
  });
  it.each([
    [401, 2],
    [404, 3],
    [400, 4],
    [409, 1]
  ])("preserves exit-code semantics for catalogue HTTP %i", async (status, exitCode) => {
    const result = await serviceDefinitionWithAuthCommand(
      { action: "list", projectId: id },
      {
        readAuthState: async () => ({
          bearer_token: "member",
          base_url: "https://api.example.test"
        }),
        createHttpClient: () => ({
          request: async () => ({ status, body: { error: "catalogue_unavailable" } })
        })
      }
    );
    expect(result.exitCode).toBe(exitCode);
    expect(result.output).toContain("catalogue_unavailable");
  });
  it("keeps authentication failure details out of catalogue output", async () => {
    const result = await serviceDefinitionWithAuthCommand(
      { action: "list", projectId: id },
      {
        readAuthState: async () => {
          throw new Error("synthetic-private-detail");
        }
      }
    );
    expect(result.exitCode).toBe(2);
    expect(result.output).not.toContain("synthetic-private-detail");
  });
  it("keeps the existing instance listing and routes explicit catalogue actions", async () => {
    const listServicesCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "instances" });
    const serviceDefinitionCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "definitions" });
    expect((await runCli(["services", "--project-id", id], { listServicesCommand })).output).toBe(
      "instances"
    );
    expect(
      (
        await runCli(
          ["services", "list", "--project-id", id, "--cursor", id, "--limit", "1", "--json"],
          { serviceDefinitionCommand }
        )
      ).output
    ).toBe("definitions");
    expect(serviceDefinitionCommand).toHaveBeenCalledWith({
      action: "list",
      projectId: id,
      cursor: id,
      limit: 1,
      json: true
    });
  });
  it("preserves explicit clears and rejects malformed input before authentication", async () => {
    const serviceDefinitionCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "updated" });
    await runCli(["services", "update", id, "--project-id", id, "--clear-repository", "--json"], {
      serviceDefinitionCommand
    });
    expect(serviceDefinitionCommand).toHaveBeenCalledWith({
      action: "update",
      projectId: id,
      serviceDefinitionId: id,
      update: { repository_url: null, repository_root: null },
      json: true
    });
    serviceDefinitionCommand.mockClear();
    for (const args of [
      ["services", "list", "--project-id", "../other"],
      ["services", "create", "--project-id", id, "--name", "api", "--repository-root", "../other"],
      ["services", "update", id, "--project-id", id],
      ["services", "list", "--project-id", id, "--force"]
    ])
      expect((await runCli(args, { serviceDefinitionCommand })).exitCode).toBe(4);
    expect(serviceDefinitionCommand).not.toHaveBeenCalled();
  });
});
