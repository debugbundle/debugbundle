import { analyzeCommand } from "../../cli/src/analyze-command.js";

type JsonLikeObject = Record<string, unknown>;

type CommandResult = {
  output: string;
};

export const ANALYZE_MCP_TOOL_NAMES = ["analyze"] as const;

function mapMcpError(): never {
  throw new Error("mcp_tool_error:unknown_error");
}

function parseJsonOutput(output: string): JsonLikeObject {
  const parsed = JSON.parse(output) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("invalid_mcp_json_output");
  }

  return parsed as JsonLikeObject;
}

async function runJsonCommand(command: () => Promise<CommandResult>): Promise<JsonLikeObject> {
  try {
    const result = await command();
    return parseJsonOutput(result.output);
  } catch {
    mapMcpError();
  }
}

export function createAnalyzeMcpTools(commands: {
  analyzeCommand: typeof analyzeCommand;
}): Record<(typeof ANALYZE_MCP_TOOL_NAMES)[number], (input: Record<string, unknown>) => Promise<unknown>> {
  return {
    async analyze(input) {
      return runJsonCommand(() =>
        commands.analyzeCommand({
          ...(typeof input["type"] === "string" ? { type: input["type"] } : {}),
          ...(input["local"] === true ? { local: true } : {}),
          json: true
        })
      );
    }
  };
}