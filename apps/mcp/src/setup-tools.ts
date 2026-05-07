import { doctorCommand } from "../../cli/src/doctor-command.js";
import { smokeCommand } from "../../cli/src/smoke-command.js";
import { validateCommand } from "../../cli/src/validate-command.js";
import { verifyCloudCommand, verifyLocalCommand } from "../../cli/src/verify-command.js";

type JsonLikeObject = Record<string, unknown>;

type CommandResult = {
  output: string;
};

export const SETUP_MCP_TOOL_NAMES = ["doctor", "validate", "verify_local", "verify_cloud", "smoke"] as const;

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

export function createSetupMcpTools(commands: {
  doctorCommand: typeof doctorCommand;
  validateCommand: typeof validateCommand;
  verifyLocalCommand: typeof verifyLocalCommand;
  verifyCloudCommand: typeof verifyCloudCommand;
  smokeCommand: typeof smokeCommand;
}): Record<(typeof SETUP_MCP_TOOL_NAMES)[number], (input: Record<string, unknown>) => Promise<unknown>> {
  return {
    async doctor(input) {
      return runJsonCommand(() =>
        commands.doctorCommand({
          ...(typeof input["authFilePath"] === "string" ? { authFilePath: input["authFilePath"] } : {}),
          json: true
        })
      );
    },

    async validate(input) {
      return runJsonCommand(() =>
        commands.validateCommand({
          ...(input["fix"] === true ? { fix: true } : {}),
          json: true
        })
      );
    },

    async verify_local() {
      return runJsonCommand(() =>
        commands.verifyLocalCommand({
          json: true
        })
      );
    },

    async verify_cloud(input) {
      return runJsonCommand(() =>
        commands.verifyCloudCommand({
          projectId: String(input["projectId"]),
          ...(typeof input["service"] === "string" ? { service: input["service"] } : {}),
          ...(typeof input["environment"] === "string" ? { environment: input["environment"] } : {}),
          ...(typeof input["maxAgeMinutes"] === "number" ? { maxAgeMinutes: input["maxAgeMinutes"] } : {}),
          ...(typeof input["authFilePath"] === "string" ? { authFilePath: input["authFilePath"] } : {}),
          json: true
        })
      );
    },

    async smoke(input) {
      return runJsonCommand(() =>
        commands.smokeCommand({
          projectId: String(input["projectId"]),
          ...(typeof input["service"] === "string" ? { service: input["service"] } : {}),
          ...(typeof input["environment"] === "string" ? { environment: input["environment"] } : {}),
          ...(typeof input["maxAgeMinutes"] === "number" ? { maxAgeMinutes: input["maxAgeMinutes"] } : {}),
          ...(typeof input["authFilePath"] === "string" ? { authFilePath: input["authFilePath"] } : {}),
          json: true
        })
      );
    }
  };
}