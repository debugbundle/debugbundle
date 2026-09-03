import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  DEBUGBUNDLE_OPENCLAW_TOOL_MAP,
  DEBUGBUNDLE_OPENCLAW_TOOL_NAMES
} from "../apps/openclaw-plugin/src/index.js";
import { createMcpServer } from "../apps/mcp/src/server.js";

const outputPath = new URL(
  "../tests/fixtures/mcp/legacy-stdio-openclaw-contract.json",
  import.meta.url
);
const successfulServer = createMcpServer({
  tools: {
    doctor: async () => ({ status: "healthy" })
  }
});
const failingServer = createMcpServer({
  tools: {
    doctor: async () => {
      throw new Error("legacy_failure");
    }
  }
});

const contract = {
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

mkdirSync(dirname(outputPath.pathname), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
