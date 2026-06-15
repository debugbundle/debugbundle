import { z } from "zod";

export const PROBE_MCP_TOOL_CATALOG = [
  {
    name: "activate_probe",
    group: "probes",
    description: "Activate a remote probe on a project.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      labelPattern: z.string(),
      service: z.string().optional(),
      environment: z.string().optional(),
      ttlSeconds: z.number().optional(),
      triggerTtlSeconds: z.number().optional()
    })
  },
  {
    name: "list_active_probes",
    group: "probes",
    description: "List active probe activations for a project.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string()
    })
  },
  {
    name: "deactivate_probe",
    group: "probes",
    description: "Deactivate a probe activation.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      activationId: z.string()
    })
  }
] as const;
