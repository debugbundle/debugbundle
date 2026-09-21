import { nodeFetch } from "../../node-http/src/index.js";
import { sanitizeTelemetry } from "../../redaction/src/index.js";
import { projectOpenAiToolOutput, type OpenAiToolName } from "../../mcp-core/src/index.js";
import { z } from "zod";

export const AGENT_READ_NAMES = [
  "project_summary",
  "list_incidents",
  "get_incident",
  "get_incident_context",
  "get_bundle"
] as const;
export type AgentReadName = (typeof AGENT_READ_NAMES)[number];
const MAX_RESPONSE_BYTES = 600_000;

export interface AgentReadRequest {
  name: AgentReadName;
  projectId: string;
  incidentId?: string;
  limit?: number;
  cursor?: string;
}

export interface AgentReadClient {
  read(request: AgentReadRequest): Promise<unknown>;
}

function requestPath(input: AgentReadRequest): string {
  const project = encodeURIComponent(input.projectId);
  const prefix = `/v1/agent/projects/${project}`;
  if (input.name === "project_summary") return prefix;
  if (input.name === "list_incidents") {
    const query = new URLSearchParams();
    if (input.limit !== undefined) query.set("limit", String(input.limit));
    if (input.cursor !== undefined) query.set("cursor", input.cursor);
    return `${prefix}/incidents${query.size > 0 ? `?${query}` : ""}`;
  }
  if (input.incidentId === undefined) throw new Error("agent_read_invalid_input");
  const incident = `${prefix}/incidents/${encodeURIComponent(input.incidentId)}`;
  return input.name === "get_incident"
    ? incident
    : input.name === "get_incident_context"
      ? `${incident}/context`
      : `${incident}/bundle`;
}

async function boundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error("agent_read_unavailable");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > MAX_RESPONSE_BYTES) throw new Error("agent_read_unavailable");
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  try {
    const buffer = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
  } catch {
    throw new Error("agent_read_unavailable");
  }
}

export function createAgentReadClient(input: {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
}): AgentReadClient {
  if (!input.token.startsWith("dbundle_agent_")) throw new Error("agent_read_credential_required");
  let base: URL;
  try {
    base = new URL(input.baseUrl);
  } catch {
    throw new Error("agent_read_invalid_base_url");
  }
  if (
    base.username ||
    base.password ||
    (base.protocol !== "https:" &&
      !(base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)))
  ) {
    throw new Error("agent_read_invalid_base_url");
  }
  const fetchImpl = input.fetchImpl ?? nodeFetch;
  return {
    async read(request: AgentReadRequest): Promise<unknown> {
      if (!AGENT_READ_NAMES.includes(request.name)) throw new Error("agent_read_invalid_input");
      const path = requestPath(request);
      const url = new URL(path, base);
      let body: unknown;
      try {
        const response = await fetchImpl(url, {
          method: "GET",
          headers: { accept: "application/json", authorization: `Bearer ${input.token}` },
          redirect: "error",
          signal: AbortSignal.timeout(30_000)
        });
        if (!response.ok) {
          await response.body?.cancel().catch(() => undefined);
          throw new Error("agent_read_unavailable");
        }
        body = await boundedJson(response);
      } catch {
        throw new Error("agent_read_unavailable");
      }
      if (request.name === "project_summary") {
        const parsed = z
          .object({ project: z.object({ project_id: z.string(), name: z.string() }).passthrough() })
          .safeParse(body);
        if (!parsed.success || parsed.data.project.project_id !== request.projectId)
          throw new Error("agent_read_unavailable");
        const projected = sanitizeTelemetry(
          {
            project: { project_id: parsed.data.project.project_id, name: parsed.data.project.name }
          },
          { maxTotalBytes: 524_288 }
        );
        if (!projected.ok) throw new Error("agent_read_unavailable");
        return projected.value;
      }
      try {
        return projectOpenAiToolOutput(request.name as OpenAiToolName, body);
      } catch {
        throw new Error("agent_read_unavailable");
      }
    }
  };
}
