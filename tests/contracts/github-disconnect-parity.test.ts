import { describe, expect, it, vi } from "vitest";
import {
  createGitHubManagementApi,
  GitHubManagementApiError
} from "../../packages/github-client/src/index.js";
import { createGitHubMcpTools } from "../../apps/mcp/src/github-tools.js";
import { runCli } from "../../apps/cli/src/main.js";
import {
  disconnectGitHubInstallationCommand,
  disconnectGitHubInstallationWithAuthCommand
} from "../../apps/cli/src/github-commands.js";

import { MCP_TOOL_CATALOG } from "../../apps/mcp/src/tool-catalog.js";
import { AGENT_READ_MCP_TOOL_CATALOG } from "../../apps/mcp/src/agent-read-catalog.js";
import { OPENAI_TOOL_NAMES } from "../../packages/mcp-core/src/index.js";

describe("GitHub organization installation disconnect parity", () => {
  it("uses the existing organization DELETE route without project scope", async () => {
    const request = vi.fn().mockResolvedValue({ status: 204, body: null });
    const api = createGitHubManagementApi({ request });
    await api.disconnectInstallation({ bearerToken: "member" });
    expect(request).toHaveBeenCalledWith({
      method: "DELETE",
      path: "/v1/github/installation",
      bearerToken: "member"
    });
  });
  it("routes CLI auth options and rejects misleading project scope", async () => {
    const disconnectGitHubInstallationCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "disconnected" });
    expect(
      (
        await runCli(["github", "disconnect", "--auth-file", "/tmp/auth", "--json"], {
          disconnectGitHubInstallationCommand
        })
      ).exitCode
    ).toBe(0);
    expect(disconnectGitHubInstallationCommand).toHaveBeenCalledWith({
      authFilePath: "/tmp/auth",
      json: true
    });
    expect(
      (
        await runCli(["github", "disconnect", "--project-id", "proj"], {
          disconnectGitHubInstallationCommand
        })
      ).exitCode
    ).toBe(4);
    expect(disconnectGitHubInstallationCommand).toHaveBeenCalledTimes(1);
  });
  it("maps owner authorization failures and returns the same successful outcome", async () => {
    const disconnectInstallation = vi.fn().mockResolvedValue(undefined);
    const tools = createGitHubMcpTools({
      getInstallation: vi.fn(),
      listRepositories: vi.fn(),
      setProjectRepo: vi.fn(),
      removeProjectRepo: vi.fn(),
      disconnectInstallation
    });
    await expect(tools.disconnect_github_installation({ bearerToken: "member" })).resolves.toEqual({
      disconnected: true
    });
    expect(disconnectInstallation).toHaveBeenCalledWith({ bearerToken: "member" });
    expect(
      await disconnectGitHubInstallationCommand(
        { bearerToken: "member", json: true },
        { disconnectInstallation }
      )
    ).toEqual({ exitCode: 0, output: '{"disconnected":true}' });
    disconnectInstallation.mockRejectedValue(new GitHubManagementApiError(403, "forbidden"));
    await expect(tools.disconnect_github_installation({ bearerToken: "member" })).rejects.toThrow(
      "mcp_tool_error:forbidden"
    );
    expect(
      (
        await disconnectGitHubInstallationCommand(
          { bearerToken: "member" },
          { disconnectInstallation }
        )
      ).exitCode
    ).toBe(5);
  });
  it("retains strict organization scope and restricted catalog boundaries", () => {
    const descriptor = MCP_TOOL_CATALOG.find(
      (tool) => tool.name === "disconnect_github_installation"
    )!;
    expect(descriptor.inputSchema.safeParse({ bearerToken: "member" }).success).toBe(true);
    expect(
      descriptor.inputSchema.safeParse({ bearerToken: "member", projectId: "proj" }).success
    ).toBe(false);
    expect(AGENT_READ_MCP_TOOL_CATALOG).toHaveLength(5);
    expect(OPENAI_TOOL_NAMES).toHaveLength(23);
    expect(AGENT_READ_MCP_TOOL_CATALOG.map((entry) => entry.name)).not.toContain(
      "disconnect_github_installation"
    );
    expect(OPENAI_TOOL_NAMES).not.toContain("disconnect_github_installation");
  });
  it("uses stored member auth through the real CLI HTTP transport", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const result = await disconnectGitHubInstallationWithAuthCommand(
      { authFilePath: "/tmp/auth", json: true },
      {
        readAuthState: vi
          .fn()
          .mockResolvedValue({ bearer_token: "stored_member", base_url: "https://example.test" }),
        fetchImpl
      }
    );
    expect(result.exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://example.test/v1/github/installation",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({ authorization: "Bearer stored_member" })
      })
    );
  });
});
