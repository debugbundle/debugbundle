import { z } from "zod";

export const HEALTH_CHECK_MCP_TOOL_CATALOG = [
  {
    name: "list_health_checks",
    group: "health_checks",
    description: "List hosted health checks for a project.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      limit: z.number().optional()
    })
  },
  {
    name: "get_health_check",
    group: "health_checks",
    description: "Get one hosted health check by id.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      checkId: z.string()
    })
  },
  {
    name: "create_health_check",
    group: "health_checks",
    description: "Create a hosted health check for a project.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      name: z.string(),
      url: z.string(),
      method: z.enum(["GET", "HEAD"]).optional(),
      expectedStatusMin: z.number().optional(),
      expectedStatusMax: z.number().optional(),
      timeoutMs: z.number().optional(),
      intervalSeconds: z.number(),
      failureThreshold: z.number().optional(),
      recoveryThreshold: z.number().optional(),
      environment: z.string().optional(),
      serviceName: z.string().nullable().optional(),
      enabled: z.boolean().optional()
    })
  },
  {
    name: "update_health_check",
    group: "health_checks",
    description: "Update a hosted health check.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      checkId: z.string(),
      name: z.string().optional(),
      url: z.string().optional(),
      method: z.enum(["GET", "HEAD"]).optional(),
      expectedStatusMin: z.number().optional(),
      expectedStatusMax: z.number().optional(),
      timeoutMs: z.number().optional(),
      intervalSeconds: z.number().optional(),
      failureThreshold: z.number().optional(),
      recoveryThreshold: z.number().optional(),
      environment: z.string().optional(),
      serviceName: z.string().nullable().optional(),
      enabled: z.boolean().optional()
    })
  },
  {
    name: "delete_health_check",
    group: "health_checks",
    description: "Delete a hosted health check.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      checkId: z.string()
    })
  },
  {
    name: "test_health_check",
    group: "health_checks",
    description: "Run a side-effect-free test for a hosted health-check target.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      url: z.string(),
      method: z.enum(["GET", "HEAD"]).optional(),
      expectedStatusMin: z.number().optional(),
      expectedStatusMax: z.number().optional(),
      timeoutMs: z.number().optional()
    })
  },
  {
    name: "list_health_check_results",
    group: "health_checks",
    description: "List recent execution results for one hosted health check.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      checkId: z.string(),
      limit: z.number().optional()
    })
  },
  {
    name: "list_health_check_daily_rollups",
    group: "health_checks",
    description: "List retained per-day history for one hosted health check.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      checkId: z.string(),
      limit: z.number().optional()
    })
  }
] as const;
