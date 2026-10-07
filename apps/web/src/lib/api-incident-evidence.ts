import type { z } from "zod";
import {
  IncidentContextSchema,
  LogsResponseSchema
} from "../../../../packages/retrieval-client/src/index.js";
import { API_BASE, readJson } from "./api-client.js";
export async function getIncidentContext(
  incidentId: string
): Promise<z.infer<typeof IncidentContextSchema>> {
  return IncidentContextSchema.parse(
    await readJson(
      await fetch(`${API_BASE}/v1/incidents/${encodeURIComponent(incidentId)}/context`, {
        credentials: "include"
      })
    )
  );
}
export async function listIncidentLogs(
  incidentId: string,
  options: { level?: string; cursor?: string; limit?: number } = {}
): Promise<z.infer<typeof LogsResponseSchema>> {
  const params = new URLSearchParams({
    incident_id: incidentId,
    limit: String(options.limit ?? 20)
  });
  if (options.level !== undefined) params.set("level", options.level);
  if (options.cursor !== undefined) params.set("cursor", options.cursor);
  return LogsResponseSchema.parse(
    await readJson(
      await fetch(`${API_BASE}/v1/logs?${params.toString()}`, { credentials: "include" })
    )
  );
}
