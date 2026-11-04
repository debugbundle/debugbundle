import { describe, expect, it, vi } from "vitest";
import {
  createServiceDefinitionMcpTools,
  SERVICE_DEFINITION_MCP_TOOL_CATALOG
} from "../../../apps/mcp/src/service-definition-tools.js";
const id = "10000000-0000-4000-8000-000000000001";
describe("service catalogue MCP adapters", () => {
  it("exposes matching typed operations and honest mutation annotations", async () => {
    const api = {
      listServiceDefinitions: vi.fn().mockResolvedValue({ services: [], next_cursor: null }),
      getServiceDefinition: vi.fn(),
      createServiceDefinition: vi.fn(),
      updateServiceDefinition: vi.fn().mockResolvedValue({ name: "api" })
    };
    const tools = createServiceDefinitionMcpTools(api);
    expect(
      await tools["list_service_definitions"]!({
        bearerToken: "test",
        projectId: id,
        limit: 1,
        cursor: id
      })
    ).toEqual({ services: [], next_cursor: null });
    expect(api.listServiceDefinitions).toHaveBeenCalledWith({
      bearerToken: "test",
      projectId: id,
      limit: 1,
      cursor: id
    });
    await tools["update_service_definition"]!({
      bearerToken: "test",
      projectId: id,
      serviceDefinitionId: id,
      update: { repository_url: null }
    });
    expect(api.updateServiceDefinition).toHaveBeenCalledWith({
      bearerToken: "test",
      projectId: id,
      serviceDefinitionId: id,
      update: { repository_url: null }
    });
    expect(SERVICE_DEFINITION_MCP_TOOL_CATALOG.map((t) => t.annotations.readOnlyHint)).toEqual([
      true,
      true,
      false,
      false
    ]);
    await expect(
      tools["create_service_definition"]!({
        bearerToken: "test",
        projectId: id,
        service: { name: "api", repository_root: "../other" }
      })
    ).rejects.toThrow("invalid_service_request");
    expect(api.createServiceDefinition).not.toHaveBeenCalled();
  });
});
