import { z } from "zod";
import {
  ServiceDefinitionCreateSchema,
  ServiceDefinitionUpdateSchema
} from "../../../packages/shared-types/src/project-services.js";
import { ProjectManagementApiError } from "../../../packages/project-management-client/src/index.js";
import type { ProjectServicesApi } from "../../../packages/project-management-client/src/project-services.js";
const scope = z.object({ bearerToken: z.string().min(1), projectId: z.string().guid() }).strict();
const identity = scope.extend({ serviceDefinitionId: z.string().guid() });
const read = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
};
const write = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false
};
export const SERVICE_DEFINITION_MCP_TOOL_CATALOG = [
  {
    name: "list_service_definitions",
    group: "services",
    description:
      "List logical project services, effective repository context and environments. Follow next_cursor to inspect the complete system.",
    inputSchema: scope.extend({
      limit: z.number().int().min(1).max(200).optional(),
      cursor: z.string().guid().optional()
    }),
    annotations: read
  },
  {
    name: "get_service_definition",
    group: "services",
    description:
      "Read one logical service and its repository context. Its definition ID is distinct from environment-specific service_id.",
    inputSchema: identity,
    annotations: read
  },
  {
    name: "create_service_definition",
    group: "services",
    description:
      "Create an application/process inside an existing project. Optional repository/root overrides its project default; does not edit a repository or deploy instrumentation.",
    inputSchema: scope.extend({ service: ServiceDefinitionCreateSchema }),
    annotations: write
  },
  {
    name: "update_service_definition",
    group: "services",
    description:
      "Update logical service metadata, preserving its identity and legacy input name. Null repository values restore project defaults. Requires project owner/admin access.",
    inputSchema: identity.extend({ update: ServiceDefinitionUpdateSchema }),
    annotations: write
  }
] as const;
export const SERVICE_DEFINITION_MCP_TOOL_NAMES = SERVICE_DEFINITION_MCP_TOOL_CATALOG.map(
  (tool) => tool.name
);
export function createServiceDefinitionMcpTools(
  api: ProjectServicesApi
): Record<string, (input: Record<string, unknown>) => Promise<unknown>> {
  return Object.fromEntries(
    SERVICE_DEFINITION_MCP_TOOL_CATALOG.map((tool) => [
      tool.name,
      async (input: Record<string, unknown>): Promise<unknown> => {
        try {
          if (tool.name === "create_service_definition")
            return {
              service: await api.createServiceDefinition(
                SERVICE_DEFINITION_MCP_TOOL_CATALOG[2].inputSchema.parse(input)
              )
            };
          if (tool.name === "update_service_definition")
            return {
              service: await api.updateServiceDefinition(
                SERVICE_DEFINITION_MCP_TOOL_CATALOG[3].inputSchema.parse(input)
              )
            };
          if (tool.name === "get_service_definition")
            return {
              service: await api.getServiceDefinition(
                SERVICE_DEFINITION_MCP_TOOL_CATALOG[1].inputSchema.parse(input)
              )
            };
          return api.listServiceDefinitions(
            SERVICE_DEFINITION_MCP_TOOL_CATALOG[0].inputSchema.parse(input)
          );
        } catch (error) {
          throw new Error(
            `mcp_tool_error:${error instanceof ProjectManagementApiError ? error.code : error instanceof z.ZodError ? "invalid_service_request" : "service_request_failed"}`
          );
        }
      }
    ])
  );
}
