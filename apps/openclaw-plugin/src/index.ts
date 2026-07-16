import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";
import { Type, type TSchema } from "typebox";
import { zodToJsonSchema } from "zod-to-json-schema";

import { createDefaultMcpTools } from "../../mcp/src/default-tools.js";
import { MCP_TOOL_CATALOG } from "../../mcp/src/tool-catalog.js";

type DebugBundleMcpToolName = (typeof MCP_TOOL_CATALOG)[number]["name"];

type DebugBundleOpenClawToolMapEntry = {
  mcpToolName: DebugBundleMcpToolName;
  openClawToolName: `debugbundle_${DebugBundleMcpToolName}`;
  description: string;
  optional: boolean;
  parameters: TSchema;
};

const MUTATION_MCP_TOOLS = new Set<DebugBundleMcpToolName>([
  "validate",
  "verify_local",
  "verify_cloud",
  "smoke",
  "analyze",
  "resolve_incident",
  "resolve_incidents",
  "reopen_incident",
  "reopen_incidents",
  "resolve_improvement",
  "reopen_improvement",
  "snooze_improvement",
  "create_github_dispatch_rule",
  "update_github_dispatch_rule",
  "delete_github_dispatch_rule",
  "retry_github_delivery",
  "set_project_github_repo",
  "remove_project_github_repo",
  "create_project_token",
  "revoke_project_token",
  "create_member_token",
  "revoke_member_token",
  "create_webhook",
  "update_webhook",
  "delete_webhook",
  "test_webhook",
  "retry_webhook_delivery",
  "test_slack_destination",
  "delete_slack_destination",
  "create_weekly_report_channel",
  "update_weekly_report_channel",
  "delete_weekly_report_channel",
  "create_alert",
  "update_alert",
  "delete_alert",
  "create_project",
  "update_project",
  "delete_project",
  "create_capture_rule",
  "update_capture_rule",
  "delete_capture_rule",
  "create_capture_rule_from_incident_suggestion",
  "update_capture_policy",
  "update_improvement_settings",
  "generate_analytics_bundle",
  "update_analytics_settings",
  "create_saved_analytics_funnel",
  "update_saved_analytics_funnel",
  "archive_saved_analytics_funnel",
  "activate_probe",
  "deactivate_probe",
  "create_health_check",
  "update_health_check",
  "delete_health_check",
  "start_trial",
  "increase_capacity",
  "schedule_capacity_reduction",
  "cancel_capacity_reduction",
  "invite_project_member",
  "cancel_project_member_invite",
  "update_project_member_role",
  "remove_project_member",
  "leave_project"
]);

function toOpenClawToolName(name: DebugBundleMcpToolName): `debugbundle_${DebugBundleMcpToolName}` {
  return `debugbundle_${name}`;
}

function toTypeBoxSchema(schema: unknown): TSchema {
  return Type.Unsafe(
    zodToJsonSchema(schema as never, {
      target: "jsonSchema2019-09",
      $refStrategy: "none"
    }) as Record<string, unknown>
  );
}

function toMcpFactoryInput(apiBaseUrl: string | undefined): { apiBaseUrl?: string } {
  return apiBaseUrl === undefined ? {} : { apiBaseUrl };
}

export const DEBUGBUNDLE_OPENCLAW_TOOL_MAP: readonly DebugBundleOpenClawToolMapEntry[] = MCP_TOOL_CATALOG.map((tool) => ({
  mcpToolName: tool.name,
  openClawToolName: toOpenClawToolName(tool.name),
  description: tool.description,
  optional: MUTATION_MCP_TOOLS.has(tool.name),
  parameters: toTypeBoxSchema(tool.inputSchema)
}));

export const DEBUGBUNDLE_OPENCLAW_TOOL_NAMES = DEBUGBUNDLE_OPENCLAW_TOOL_MAP.map((tool) => tool.openClawToolName);

export const DEBUGBUNDLE_OPENCLAW_OPTIONAL_TOOL_NAMES = DEBUGBUNDLE_OPENCLAW_TOOL_MAP.filter((tool) => tool.optional).map(
  (tool) => tool.openClawToolName
);

export async function executeDebugBundleOpenClawTool(
  mcpToolName: DebugBundleMcpToolName,
  params: Record<string, unknown>,
  input: { apiBaseUrl?: string } = {}
): Promise<unknown> {
  const tools = await createDefaultMcpTools(toMcpFactoryInput(input.apiBaseUrl));
  const handler = tools[mcpToolName];

  if (handler === undefined) {
    throw new Error(`debugbundle_openclaw_unknown_tool:${mcpToolName}`);
  }

  return handler(params);
}

export default defineToolPlugin({
  id: "debugbundle",
  name: "DebugBundle",
  description:
    "Use DebugBundle tools to inspect incidents, product analytics, bundles, reproductions, health checks, and operational debugging surfaces.",
  configSchema: Type.Object(
    {
      apiBaseUrl: Type.Optional(
        Type.String({
          description: "Optional DebugBundle API base URL for self-hosted or non-production environments."
        })
      )
    },
    { additionalProperties: false }
  ),
  tools: (tool) =>
    DEBUGBUNDLE_OPENCLAW_TOOL_MAP.map((entry) =>
      tool({
        name: entry.openClawToolName,
        description: entry.description,
        parameters: entry.parameters,
        optional: entry.optional,
        async execute(params, config, context) {
          context.signal?.throwIfAborted();
          return executeDebugBundleOpenClawTool(
            entry.mcpToolName,
            params as Record<string, unknown>,
            toMcpFactoryInput(config.apiBaseUrl)
          );
        }
      })
    )
});
