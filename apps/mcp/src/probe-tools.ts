import { ProbeApiError } from "../../cli/src/probe-commands.js";

export const PROBE_MCP_TOOL_NAMES = ["activate_probe", "list_active_probes", "deactivate_probe"] as const;

function mapMcpError(error: unknown): never {
  if (error instanceof ProbeApiError) {
    throw new Error(`mcp_tool_error:${error.code}`);
  }

  throw new Error("mcp_tool_error:unknown_error");
}

export function createProbeMcpTools(api: {
  activateProbe(input: {
    bearerToken: string;
    projectId: string;
    labelPattern: string;
    service?: string;
    environment?: string;
    ttlSeconds?: number;
    triggerTtlSeconds?: number;
  }): Promise<unknown>;
  listActiveProbes(input: {
    bearerToken: string;
    projectId: string;
  }): Promise<unknown>;
  deactivateProbe(input: {
    bearerToken: string;
    projectId: string;
    activationId: string;
  }): Promise<unknown>;
}): Record<(typeof PROBE_MCP_TOOL_NAMES)[number], (input: Record<string, unknown>) => Promise<unknown>> {
  return {
    async activate_probe(input) {
      try {
        const requestInput: {
          bearerToken: string;
          projectId: string;
          labelPattern: string;
          service?: string;
          environment?: string;
          ttlSeconds?: number;
          triggerTtlSeconds?: number;
        } = {
          bearerToken: String(input["bearerToken"]),
          projectId: String(input["projectId"]),
          labelPattern: String(input["labelPattern"])
        };
        if (typeof input["service"] === "string") {
          requestInput.service = input["service"];
        }
        if (typeof input["environment"] === "string") {
          requestInput.environment = input["environment"];
        }
        if (typeof input["ttlSeconds"] === "number") {
          requestInput.ttlSeconds = input["ttlSeconds"];
        }
        if (typeof input["triggerTtlSeconds"] === "number") {
          requestInput.triggerTtlSeconds = input["triggerTtlSeconds"];
        }

        return await api.activateProbe(requestInput);
      } catch (error) {
        mapMcpError(error);
      }
    },

    async list_active_probes(input) {
      try {
        return await api.listActiveProbes({
          bearerToken: String(input["bearerToken"]),
          projectId: String(input["projectId"])
        });
      } catch (error) {
        mapMcpError(error);
      }
    },

    async deactivate_probe(input) {
      try {
        return await api.deactivateProbe({
          bearerToken: String(input["bearerToken"]),
          projectId: String(input["projectId"]),
          activationId: String(input["activationId"])
        });
      } catch (error) {
        mapMcpError(error);
      }
    }
  };
}
