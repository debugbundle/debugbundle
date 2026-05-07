import { describe, expect, it, vi } from "vitest";

import { RetrievalApiError } from "../../../packages/retrieval-client/src/index.js";
import { SERVICE_MCP_TOOL_NAMES, createServicesMcpTools } from "../../../apps/mcp/src/services-tools.js";

describe("mcp services tools", () => {
  it("declares service tool parity", () => {
    expect(SERVICE_MCP_TOOL_NAMES).toEqual(["list_services"]);
  });

  it("returns services payload for list_services", async () => {
    const tools = createServicesMcpTools({
      listServices: vi.fn().mockResolvedValue([
        {
          service_id: "svc_123",
          project_id: "proj_123",
          name: "checkout-api",
          runtime: "node",
          framework: "fastify",
          environment: "production"
        }
      ])
    });

    await expect(
      tools.list_services({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_123",
        limit: 10
      })
    ).resolves.toEqual({
      services: [
        {
          service_id: "svc_123",
          project_id: "proj_123",
          name: "checkout-api",
          runtime: "node",
          framework: "fastify",
          environment: "production"
        }
      ]
    });
  });

  it("maps api failures to mcp tool errors", async () => {
    const tools = createServicesMcpTools({
      listServices: vi.fn().mockRejectedValue(new RetrievalApiError(401, "invalid_member_token"))
    });

    await expect(
      tools.list_services({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_123"
      })
    ).rejects.toThrow("mcp_tool_error:invalid_member_token");
  });
});