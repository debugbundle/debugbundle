import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import {
  DEBUGBUNDLE_OPENCLAW_TOOL_MAP,
  DEBUGBUNDLE_OPENCLAW_TOOL_NAMES
} from "../../../apps/openclaw-plugin/src/index.js";
import { createMcpServer } from "../../../apps/mcp/src/server.js";

const legacyContractPath = new URL(
  "../../fixtures/mcp/legacy-stdio-openclaw-contract.json",
  import.meta.url
);

type PolicySchema = {
  properties: { update: { properties: Record<string, unknown>; required?: string[] } };
};

function addOptionalDiagnosticPolicy(schema: PolicySchema): void {
  // FR-EVID-05: this sole additive input is optional. The frozen fixture still
  // protects every existing policy field and the remaining tool contracts.
  expect(schema.properties.update.properties).not.toHaveProperty("capture_diagnostic_context");
  schema.properties.update.properties["capture_diagnostic_context"] = {
    description:
      "Enable standalone diagnostic context, disable it, or restore preset defaults with null. Minimal policy always disables it; SDK opt-in and verified path support remain required.",
    type: ["boolean", "null"]
  };
}

describe("legacy MCP and OpenClaw contract", () => {
  it("preserves the frozen stdio and OpenClaw public surface as tools are added", async () => {
    const expected = JSON.parse(await readFile(legacyContractPath, "utf8")) as {
      initialization: { result: { serverInfo: { version: string } } };
      tools: { result: { tools: Array<{ name: string; inputSchema: PolicySchema }> } };
      openClaw: {
        names: string[];
        tools: Array<{ openClawToolName: string; optional: boolean; parameters: PolicySchema }>;
      };
    };
    // AC-OPENCLAW-02 security correction: retain the historical fixture and
    // permit only these two default-exposure changes, not schema/catalog drift.
    for (const tool of expected.openClaw.tools) {
      if (
        ["debugbundle_create_agent_token", "debugbundle_revoke_agent_token"].includes(
          tool.openClawToolName
        )
      ) {
        expect(tool.optional).toBe(false);
        tool.optional = true;
      }
    }
    addOptionalDiagnosticPolicy(
      expected.tools.result.tools.find((tool) => tool.name === "update_capture_policy")!.inputSchema
    );
    addOptionalDiagnosticPolicy(
      expected.openClaw.tools.find(
        (tool) => tool.openClawToolName === "debugbundle_update_capture_policy"
      )!.parameters
    );
    const successfulServer = createMcpServer({
      tools: {
        doctor: vi.fn().mockResolvedValue({ status: "healthy" })
      }
    });
    const failingServer = createMcpServer({
      tools: {
        doctor: vi.fn().mockRejectedValue(new Error("legacy_failure"))
      }
    });

    const actual = {
      initialization: await successfulServer.handleRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize"
      }),
      tools: await successfulServer.handleRequest({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
      successEnvelope: await successfulServer.handleRequest({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "doctor", arguments: {} }
      }),
      errorEnvelope: await failingServer.handleRequest({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "doctor", arguments: {} }
      }),
      openClaw: {
        names: DEBUGBUNDLE_OPENCLAW_TOOL_NAMES,
        tools: DEBUGBUNDLE_OPENCLAW_TOOL_MAP
      },
      compatibility: {
        authenticationPrecedence: [
          "explicit_bearer_token",
          "environment_member_token",
          "cli_auth_state"
        ],
        retrievalSourceAliases: ["local", "cloud"]
      }
    };

    const toolsResponse = actual.tools as { result: { tools: Array<{ name: string }> } };
    const initialization = actual.initialization as {
      result: { serverInfo: { version: string } };
    };
    const mcpPackage = JSON.parse(
      await readFile(new URL("../../../apps/mcp/package.json", import.meta.url), "utf8")
    ) as { version: string };
    expect(initialization.result.serverInfo.version).toBe(mcpPackage.version);
    const legacyToolNames = new Set(expected.tools.result.tools.map((tool) => tool.name));
    const legacyOpenClawNames = new Set(expected.openClaw.names);
    expect({
      ...actual,
      initialization: {
        ...initialization,
        result: {
          ...initialization.result,
          serverInfo: {
            ...initialization.result.serverInfo,
            version: expected.initialization.result.serverInfo.version
          }
        }
      },
      tools: {
        ...toolsResponse,
        result: {
          tools: toolsResponse.result.tools.filter((tool) => legacyToolNames.has(tool.name))
        }
      },
      openClaw: {
        names: actual.openClaw.names.filter((name) => legacyOpenClawNames.has(name)),
        tools: actual.openClaw.tools.filter((tool) =>
          legacyOpenClawNames.has(tool.openClawToolName)
        )
      }
    }).toEqual(expected);
    expect(toolsResponse.result.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "list_alert_groups",
        "get_alert_group",
        "rotate_alert_webhook_secret"
      ])
    );
    expect(actual.openClaw.names).toEqual(
      expect.arrayContaining([
        "debugbundle_list_alert_groups",
        "debugbundle_get_alert_group",
        "debugbundle_rotate_alert_webhook_secret"
      ])
    );
  });
});
