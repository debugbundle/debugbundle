import { BillingApiError } from "../../../packages/billing-client/src/index.js";

export const BILLING_MCP_TOOL_NAMES = [
  "get_billing_summary",
  "start_trial",
  "increase_capacity",
  "schedule_capacity_reduction",
  "cancel_capacity_reduction"
] as const;

function mapMcpError(error: unknown): never {
  if (error instanceof BillingApiError) {
    throw new Error(`mcp_tool_error:${error.code}`);
  }
  if (error instanceof Error && error.message.startsWith("mcp_tool_error:")) {
    throw error;
  }

  throw new Error("mcp_tool_error:unknown_error");
}

export function createBillingMcpTools(api: {
  getBillingSummary(input: { bearerToken: string }): Promise<unknown>;
  startTrial(input: { bearerToken: string; targetPlan: "solo" | "team" }): Promise<unknown>;
  increaseCapacity(input: { bearerToken: string; targetAdditionalCapacityUnits: number }): Promise<unknown>;
  scheduleCapacityReduction(input: { bearerToken: string; targetAdditionalCapacityUnits: number }): Promise<unknown>;
  cancelCapacityReduction(input: { bearerToken: string }): Promise<unknown>;
}): Record<(typeof BILLING_MCP_TOOL_NAMES)[number], (input: Record<string, unknown>) => Promise<unknown>> {
  return {
    async get_billing_summary(input) {
      try {
        return {
          billing: await api.getBillingSummary({
            bearerToken: String(input["bearerToken"])
          })
        };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async start_trial(input) {
      try {
        const targetPlan = input["targetPlan"] ?? input["target_plan"];
        if (targetPlan !== "solo" && targetPlan !== "team") {
          throw new Error("mcp_tool_error:invalid_arguments");
        }
        return {
          billing: await api.startTrial({
            bearerToken: String(input["bearerToken"]),
            targetPlan
          })
        };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async increase_capacity(input) {
      try {
        return {
          billing: await api.increaseCapacity({
            bearerToken: String(input["bearerToken"]),
            targetAdditionalCapacityUnits: Number(input["targetAdditionalCapacityUnits"])
          })
        };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async schedule_capacity_reduction(input) {
      try {
        return {
          billing: await api.scheduleCapacityReduction({
            bearerToken: String(input["bearerToken"]),
            targetAdditionalCapacityUnits: Number(input["targetAdditionalCapacityUnits"])
          })
        };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async cancel_capacity_reduction(input) {
      try {
        return {
          billing: await api.cancelCapacityReduction({
            bearerToken: String(input["bearerToken"])
          })
        };
      } catch (error) {
        mapMcpError(error);
      }
    }
  };
}
