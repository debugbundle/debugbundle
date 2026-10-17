import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";
import { Type, type TSchema } from "typebox";
import { zodToJsonSchema } from "zod-to-json-schema";

import { createDefaultMcpTools } from "../../mcp/src/default-tools.js";
import { MCP_TOOL_CATALOG } from "../../mcp/src/tool-catalog.js";
import { isOptionalOpenClawTool } from "./tool-policy.js";

type DebugBundleMcpToolName = (typeof MCP_TOOL_CATALOG)[number]["name"];

type DebugBundleOpenClawToolMapEntry = {
  mcpToolName: DebugBundleMcpToolName;
  openClawToolName: `debugbundle_${DebugBundleMcpToolName}`;
  description: string;
  optional: boolean;
  parameters: TSchema;
};

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

export const DEBUGBUNDLE_OPENCLAW_TOOL_MAP: readonly DebugBundleOpenClawToolMapEntry[] =
  MCP_TOOL_CATALOG.map((tool) => ({
    mcpToolName: tool.name,
    openClawToolName: toOpenClawToolName(tool.name),
    description: tool.description,
    optional: isOptionalOpenClawTool(tool.name),
    parameters: toTypeBoxSchema(tool.inputSchema)
  }));

export const DEBUGBUNDLE_OPENCLAW_TOOL_NAMES = DEBUGBUNDLE_OPENCLAW_TOOL_MAP.map(
  (tool) => tool.openClawToolName
);

export const DEBUGBUNDLE_OPENCLAW_OPTIONAL_TOOL_NAMES = DEBUGBUNDLE_OPENCLAW_TOOL_MAP.filter(
  (tool) => tool.optional
).map((tool) => tool.openClawToolName);

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

const plugin = defineToolPlugin({
  id: "debugbundle",
  name: "DebugBundle",
  description:
    "Use DebugBundle for runtime error reporting, incident response, live app monitoring, health checks, debug bundles, and product analytics.",
  configSchema: Type.Object(
    {
      apiBaseUrl: Type.Optional(
        Type.String({
          description:
            "Optional DebugBundle API base URL for self-hosted or non-production environments."
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

// Preserve defineToolPlugin's non-enumerable manifest metadata while adding the
// native per-call gate. Register it first so unsupported hosts fail closed.
const registerTools = plugin.register;
plugin.register = (api) => {
  api.on("before_tool_call", (event) => {
    if (!DEBUGBUNDLE_OPENCLAW_OPTIONAL_TOOL_NAMES.some((name) => name === event.toolName)) {
      return;
    }
    return {
      requireApproval: {
        title: "Approve DebugBundle change",
        description: `Run ${event.toolName}. This can change DebugBundle account, project, or local state.`,
        severity: "warning",
        allowedDecisions: ["allow-once", "deny"],
        timeoutMs: 120_000,
        timeoutBehavior: "deny"
      }
    };
  });
  registerTools(api);
};

export default plugin;
