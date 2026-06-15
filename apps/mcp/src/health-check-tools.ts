import { HealthCheckApiError } from "../../cli/src/health-check-commands.js";

export const HEALTH_CHECK_MCP_TOOL_NAMES = [
  "list_health_checks",
  "get_health_check",
  "create_health_check",
  "update_health_check",
  "delete_health_check",
  "test_health_check",
  "list_health_check_results",
  "list_health_check_daily_rollups"
] as const;

function mapMcpError(error: unknown): never {
  if (error instanceof HealthCheckApiError) {
    throw new Error(`mcp_tool_error:${error.code}`);
  }

  throw new Error("mcp_tool_error:unknown_error");
}

export function createHealthCheckMcpTools(api: {
  listHealthChecks(input: {
    bearerToken: string;
    projectId: string;
    limit?: number;
  }): Promise<unknown>;
  getHealthCheck(input: {
    bearerToken: string;
    projectId: string;
    checkId: string;
  }): Promise<unknown>;
  createHealthCheck(input: {
    bearerToken: string;
    projectId: string;
    name: string;
    url: string;
    method: "GET" | "HEAD";
    expectedStatusMin: number;
    expectedStatusMax: number;
    timeoutMs: number;
    intervalSeconds: number;
    failureThreshold: number;
    recoveryThreshold: number;
    environment?: string;
    serviceName?: string | null;
    enabled: boolean;
  }): Promise<unknown>;
  updateHealthCheck(input: {
    bearerToken: string;
    projectId: string;
    checkId: string;
    name?: string;
    url?: string;
    method?: "GET" | "HEAD";
    expectedStatusMin?: number;
    expectedStatusMax?: number;
    timeoutMs?: number;
    intervalSeconds?: number;
    failureThreshold?: number;
    recoveryThreshold?: number;
    environment?: string;
    serviceName?: string | null;
    enabled?: boolean;
  }): Promise<unknown>;
  deleteHealthCheck(input: {
    bearerToken: string;
    projectId: string;
    checkId: string;
  }): Promise<unknown>;
  testHealthCheck(input: {
    bearerToken: string;
    projectId: string;
    url: string;
    method: "GET" | "HEAD";
    expectedStatusMin: number;
    expectedStatusMax: number;
    timeoutMs: number;
  }): Promise<unknown>;
  listHealthCheckResults(input: {
    bearerToken: string;
    projectId: string;
    checkId: string;
    limit?: number;
  }): Promise<unknown>;
  listHealthCheckDailyRollups(input: {
    bearerToken: string;
    projectId: string;
    checkId: string;
    limit?: number;
  }): Promise<unknown>;
}): Record<(typeof HEALTH_CHECK_MCP_TOOL_NAMES)[number], (input: Record<string, unknown>) => Promise<unknown>> {
  return {
    async list_health_checks(input) {
      try {
        const requestInput: {
          bearerToken: string;
          projectId: string;
          limit?: number;
        } = {
          bearerToken: String(input["bearerToken"]),
          projectId: String(input["projectId"])
        };
        if (typeof input["limit"] === "number") {
          requestInput.limit = input["limit"];
        }

        return await api.listHealthChecks(requestInput);
      } catch (error) {
        mapMcpError(error);
      }
    },

    async get_health_check(input) {
      try {
        return await api.getHealthCheck({
          bearerToken: String(input["bearerToken"]),
          projectId: String(input["projectId"]),
          checkId: String(input["checkId"])
        });
      } catch (error) {
        mapMcpError(error);
      }
    },

    async create_health_check(input) {
      try {
        const requestInput: {
          bearerToken: string;
          projectId: string;
          name: string;
          url: string;
          method: "GET" | "HEAD";
          expectedStatusMin: number;
          expectedStatusMax: number;
          timeoutMs: number;
          intervalSeconds: number;
          failureThreshold: number;
          recoveryThreshold: number;
          environment?: string;
          serviceName?: string | null;
          enabled: boolean;
        } = {
          bearerToken: String(input["bearerToken"]),
          projectId: String(input["projectId"]),
          name: String(input["name"]),
          url: String(input["url"]),
          method: input["method"] === "HEAD" ? "HEAD" : "GET",
          expectedStatusMin: typeof input["expectedStatusMin"] === "number" ? input["expectedStatusMin"] : 200,
          expectedStatusMax: typeof input["expectedStatusMax"] === "number" ? input["expectedStatusMax"] : 399,
          timeoutMs: typeof input["timeoutMs"] === "number" ? input["timeoutMs"] : 5000,
          intervalSeconds: Number(input["intervalSeconds"]),
          failureThreshold: typeof input["failureThreshold"] === "number" ? input["failureThreshold"] : 3,
          recoveryThreshold: typeof input["recoveryThreshold"] === "number" ? input["recoveryThreshold"] : 2,
          enabled: typeof input["enabled"] === "boolean" ? input["enabled"] : true
        };
        if (typeof input["environment"] === "string") {
          requestInput.environment = input["environment"];
        }
        if (typeof input["serviceName"] === "string" || input["serviceName"] === null) {
          requestInput.serviceName = input["serviceName"];
        }

        return await api.createHealthCheck(requestInput);
      } catch (error) {
        mapMcpError(error);
      }
    },

    async update_health_check(input) {
      try {
        const requestInput: {
          bearerToken: string;
          projectId: string;
          checkId: string;
          name?: string;
          url?: string;
          method?: "GET" | "HEAD";
          expectedStatusMin?: number;
          expectedStatusMax?: number;
          timeoutMs?: number;
          intervalSeconds?: number;
          failureThreshold?: number;
          recoveryThreshold?: number;
          environment?: string;
          serviceName?: string | null;
          enabled?: boolean;
        } = {
          bearerToken: String(input["bearerToken"]),
          projectId: String(input["projectId"]),
          checkId: String(input["checkId"])
        };
        if (typeof input["name"] === "string") {
          requestInput.name = input["name"];
        }
        if (typeof input["url"] === "string") {
          requestInput.url = input["url"];
        }
        if (input["method"] === "GET" || input["method"] === "HEAD") {
          requestInput.method = input["method"];
        }
        if (typeof input["expectedStatusMin"] === "number") {
          requestInput.expectedStatusMin = input["expectedStatusMin"];
        }
        if (typeof input["expectedStatusMax"] === "number") {
          requestInput.expectedStatusMax = input["expectedStatusMax"];
        }
        if (typeof input["timeoutMs"] === "number") {
          requestInput.timeoutMs = input["timeoutMs"];
        }
        if (typeof input["intervalSeconds"] === "number") {
          requestInput.intervalSeconds = input["intervalSeconds"];
        }
        if (typeof input["failureThreshold"] === "number") {
          requestInput.failureThreshold = input["failureThreshold"];
        }
        if (typeof input["recoveryThreshold"] === "number") {
          requestInput.recoveryThreshold = input["recoveryThreshold"];
        }
        if (typeof input["environment"] === "string") {
          requestInput.environment = input["environment"];
        }
        if (typeof input["serviceName"] === "string" || input["serviceName"] === null) {
          requestInput.serviceName = input["serviceName"];
        }
        if (typeof input["enabled"] === "boolean") {
          requestInput.enabled = input["enabled"];
        }

        return await api.updateHealthCheck(requestInput);
      } catch (error) {
        mapMcpError(error);
      }
    },

    async delete_health_check(input) {
      try {
        return await api.deleteHealthCheck({
          bearerToken: String(input["bearerToken"]),
          projectId: String(input["projectId"]),
          checkId: String(input["checkId"])
        });
      } catch (error) {
        mapMcpError(error);
      }
    },

    async test_health_check(input) {
      try {
        return await api.testHealthCheck({
          bearerToken: String(input["bearerToken"]),
          projectId: String(input["projectId"]),
          url: String(input["url"]),
          method: input["method"] === "HEAD" ? "HEAD" : "GET",
          expectedStatusMin: typeof input["expectedStatusMin"] === "number" ? input["expectedStatusMin"] : 200,
          expectedStatusMax: typeof input["expectedStatusMax"] === "number" ? input["expectedStatusMax"] : 399,
          timeoutMs: typeof input["timeoutMs"] === "number" ? input["timeoutMs"] : 5000
        });
      } catch (error) {
        mapMcpError(error);
      }
    },

    async list_health_check_results(input) {
      try {
        const requestInput: {
          bearerToken: string;
          projectId: string;
          checkId: string;
          limit?: number;
        } = {
          bearerToken: String(input["bearerToken"]),
          projectId: String(input["projectId"]),
          checkId: String(input["checkId"])
        };
        if (typeof input["limit"] === "number") {
          requestInput.limit = input["limit"];
        }

        return await api.listHealthCheckResults(requestInput);
      } catch (error) {
        mapMcpError(error);
      }
    },

    async list_health_check_daily_rollups(input) {
      try {
        const requestInput: {
          bearerToken: string;
          projectId: string;
          checkId: string;
          limit?: number;
        } = {
          bearerToken: String(input["bearerToken"]),
          projectId: String(input["projectId"]),
          checkId: String(input["checkId"])
        };
        if (typeof input["limit"] === "number") {
          requestInput.limit = input["limit"];
        }

        return await api.listHealthCheckDailyRollups(requestInput);
      } catch (error) {
        mapMcpError(error);
      }
    }
  };
}
