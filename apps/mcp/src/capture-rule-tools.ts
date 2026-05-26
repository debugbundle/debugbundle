import { CaptureRuleApiError } from "../../cli/src/capture-rule-commands.js";

export const CAPTURE_RULE_MCP_TOOL_NAMES = [
  "list_capture_rules",
  "create_capture_rule",
  "update_capture_rule",
  "delete_capture_rule",
  "suggest_capture_rules_from_incident",
  "create_capture_rule_from_incident_suggestion"
] as const;

function mapMcpError(error: unknown): never {
  if (error instanceof CaptureRuleApiError) {
    throw new Error(`mcp_tool_error:${error.message}`);
  }

  throw new Error("mcp_tool_error:unknown_error");
}

export function createCaptureRuleMcpTools(api: {
  listCaptureRules(input: { bearerToken: string; projectId: string }): Promise<unknown>;
  createCaptureRule(input: { bearerToken: string; projectId: string; create: Record<string, unknown> }): Promise<unknown>;
  updateCaptureRule(input: {
    bearerToken: string;
    projectId: string;
    ruleId: string;
    update: Record<string, unknown>;
  }): Promise<unknown>;
  deleteCaptureRule(input: { bearerToken: string; projectId: string; ruleId: string }): Promise<unknown>;
  suggestCaptureRulesFromIncident(input: { bearerToken: string; incidentId: string }): Promise<unknown>;
  createCaptureRuleFromIncidentSuggestion(input: {
    bearerToken: string;
    incidentId: string;
    create: Record<string, unknown>;
  }): Promise<unknown>;
}): Record<(typeof CAPTURE_RULE_MCP_TOOL_NAMES)[number], (input: Record<string, unknown>) => Promise<unknown>> {
  return {
    async list_capture_rules(input) {
      try {
        return await api.listCaptureRules({
          bearerToken: String(input["bearerToken"]),
          projectId: String(input["projectId"])
        });
      } catch (error) {
        mapMcpError(error);
      }
    },

    async create_capture_rule(input) {
      try {
        return await api.createCaptureRule({
          bearerToken: String(input["bearerToken"]),
          projectId: String(input["projectId"]),
          create: typeof input["create"] === "object" && input["create"] !== null ? (input["create"] as Record<string, unknown>) : {}
        });
      } catch (error) {
        mapMcpError(error);
      }
    },

    async update_capture_rule(input) {
      try {
        return await api.updateCaptureRule({
          bearerToken: String(input["bearerToken"]),
          projectId: String(input["projectId"]),
          ruleId: String(input["ruleId"]),
          update: typeof input["update"] === "object" && input["update"] !== null ? (input["update"] as Record<string, unknown>) : {}
        });
      } catch (error) {
        mapMcpError(error);
      }
    },

    async delete_capture_rule(input) {
      try {
        return await api.deleteCaptureRule({
          bearerToken: String(input["bearerToken"]),
          projectId: String(input["projectId"]),
          ruleId: String(input["ruleId"])
        });
      } catch (error) {
        mapMcpError(error);
      }
    },

    async suggest_capture_rules_from_incident(input) {
      try {
        return await api.suggestCaptureRulesFromIncident({
          bearerToken: String(input["bearerToken"]),
          incidentId: String(input["incidentId"])
        });
      } catch (error) {
        mapMcpError(error);
      }
    },

    async create_capture_rule_from_incident_suggestion(input) {
      try {
        return await api.createCaptureRuleFromIncidentSuggestion({
          bearerToken: String(input["bearerToken"]),
          incidentId: String(input["incidentId"]),
          create: typeof input["create"] === "object" && input["create"] !== null ? (input["create"] as Record<string, unknown>) : {}
        });
      } catch (error) {
        mapMcpError(error);
      }
    }
  };
}
