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

describe("legacy MCP and OpenClaw contract", () => {
  it("matches the frozen stdio and OpenClaw public surface", async () => {
    const expected = JSON.parse(await readFile(legacyContractPath, "utf8")) as unknown;
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

    expect(actual).toEqual(expected);
  });
});
