import { RetrievalApiError } from "../../../packages/retrieval-client/src/index.js";

export const IMPROVEMENT_MCP_TOOL_NAMES = [
  "list_improvements",
  "get_improvement",
  "get_improvement_bundle",
  "resolve_improvement",
  "reopen_improvement",
  "snooze_improvement"
] as const;

function mapMcpError(error: unknown): never {
  if (error instanceof RetrievalApiError) {
    throw new Error(`mcp_tool_error:${error.code}`);
  }

  throw new Error("mcp_tool_error:unknown_error");
}

function requireBearerToken(input: Record<string, unknown>): string {
  const bearerToken = input["bearerToken"];
  if (typeof bearerToken !== "string" || bearerToken.length === 0) {
    throw new RetrievalApiError(401, "auth_required");
  }

  return bearerToken;
}

function readString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  return typeof value === "string" ? value : "";
}

export function createImprovementMcpTools(api: {
  listImprovements(input: {
    bearerToken: string;
    projectId?: string;
    environment?: string;
    service?: string;
    status?: string;
    severity?: string;
    kind?: string;
    cursor?: string;
    limit?: number;
  }): Promise<unknown>;
  getImprovement(input: { bearerToken: string; improvementId: string }): Promise<unknown>;
  getImprovementBundle(input: { bearerToken: string; projectId: string; improvementId: string }): Promise<unknown>;
  resolveImprovement(input: { bearerToken: string; improvementId: string }): Promise<unknown>;
  reopenImprovement(input: { bearerToken: string; improvementId: string }): Promise<unknown>;
  snoozeImprovement(input: { bearerToken: string; improvementId: string; snoozedUntil: string }): Promise<unknown>;
}): Record<(typeof IMPROVEMENT_MCP_TOOL_NAMES)[number], (input: Record<string, unknown>) => Promise<unknown>> {
  return {
    async list_improvements(input) {
      try {
        return await api.listImprovements({
          bearerToken: requireBearerToken(input),
          ...(typeof input["projectId"] === "string" ? { projectId: input["projectId"] } : {}),
          ...(typeof input["environment"] === "string" ? { environment: input["environment"] } : {}),
          ...(typeof input["service"] === "string" ? { service: input["service"] } : {}),
          ...(typeof input["status"] === "string" ? { status: input["status"] } : {}),
          ...(typeof input["severity"] === "string" ? { severity: input["severity"] } : {}),
          ...(typeof input["kind"] === "string" ? { kind: input["kind"] } : {}),
          ...(typeof input["cursor"] === "string" ? { cursor: input["cursor"] } : {}),
          ...(typeof input["limit"] === "number" ? { limit: input["limit"] } : {})
        });
      } catch (error) {
        mapMcpError(error);
      }
    },

    async get_improvement(input) {
      try {
        return await api.getImprovement({
          bearerToken: requireBearerToken(input),
          improvementId: readString(input, "improvementId")
        });
      } catch (error) {
        mapMcpError(error);
      }
    },

    async get_improvement_bundle(input) {
      try {
        return await api.getImprovementBundle({
          bearerToken: requireBearerToken(input),
          projectId: readString(input, "projectId"),
          improvementId: readString(input, "improvementId")
        });
      } catch (error) {
        mapMcpError(error);
      }
    },

    async resolve_improvement(input) {
      try {
        return await api.resolveImprovement({
          bearerToken: requireBearerToken(input),
          improvementId: readString(input, "improvementId")
        });
      } catch (error) {
        mapMcpError(error);
      }
    },

    async reopen_improvement(input) {
      try {
        return await api.reopenImprovement({
          bearerToken: requireBearerToken(input),
          improvementId: readString(input, "improvementId")
        });
      } catch (error) {
        mapMcpError(error);
      }
    },

    async snooze_improvement(input) {
      try {
        return await api.snoozeImprovement({
          bearerToken: requireBearerToken(input),
          improvementId: readString(input, "improvementId"),
          snoozedUntil: readString(input, "snoozedUntil")
        });
      } catch (error) {
        mapMcpError(error);
      }
    }
  };
}
