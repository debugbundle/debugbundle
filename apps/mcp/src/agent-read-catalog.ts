import { z } from "zod";

const projectId = z.string().uuid();
const incidentId = z.string().uuid();

export const AGENT_READ_MCP_TOOL_CATALOG = [
  { name: "agent_project_summary", description: "Read this credential's project summary.", inputSchema: z.object({ projectId }).strict() },
  { name: "agent_list_incidents", description: "List bounded, minimized incidents for this credential's project.", inputSchema: z.object({ projectId, limit: z.number().int().min(1).max(50).optional(), cursor: z.string().max(2048).optional() }).strict() },
  { name: "agent_get_incident", description: "Read a minimized incident in this credential's project.", inputSchema: z.object({ projectId, incidentId }).strict() },
  { name: "agent_get_incident_context", description: "Read bounded existing incident context without generating evidence.", inputSchema: z.object({ projectId, incidentId }).strict() },
  { name: "agent_get_bundle", description: "Read an existing minimized bundle or its availability status.", inputSchema: z.object({ projectId, incidentId }).strict() }
] as const;
