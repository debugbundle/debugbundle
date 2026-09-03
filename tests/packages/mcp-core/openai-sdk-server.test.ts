import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { describe, expect, it, vi } from "vitest";

import {
  OPENAI_TOOL_CATALOG,
  OPENAI_TOOL_NAMES,
  createOpenAiSdkServer
} from "../../../packages/mcp-core/src/index.js";

const RESOURCE_METADATA_URL =
  "https://mcp.debugbundle.com/.well-known/oauth-protected-resource";

const AUTH: AuthInfo = {
  token: "not-a-real-token",
  clientId: "https://chatgpt.com/oauth/client.json",
  scopes: [
    "debugbundle:projects:read",
    "debugbundle:incidents:read",
    "debugbundle:artifacts:read",
    "debugbundle:improvements:read",
    "debugbundle:health:read"
  ],
  expiresAt: 1_900_000_000,
  resource: new URL("https://mcp.debugbundle.com"),
  extra: {
    userId: "user_1",
    grantId: "grant_1",
    organizationId: "org_1"
  }
};

async function sendRequest(input: {
  method: string;
  params?: Record<string, unknown>;
  authInfo?: AuthInfo;
}): Promise<Record<string, unknown>> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createOpenAiSdkServer({
    operations: {
      list_projects: vi.fn(async () => ({ projects: [], next_cursor: null }))
    }
  });
  await server.connect(serverTransport);
  await clientTransport.start();

  const response = new Promise<Record<string, unknown>>((resolve) => {
    clientTransport.onmessage = (message) => resolve(message as Record<string, unknown>);
  });
  await clientTransport.send(
    {
      jsonrpc: "2.0",
      id: 1,
      method: input.method,
      ...(input.params === undefined ? {} : { params: input.params })
    },
    input.authInfo === undefined ? {} : { authInfo: input.authInfo }
  );
  const result = await response;
  await server.close();
  return result;
}

describe("OpenAI SDK MCP server", () => {
  it("advertises exactly the frozen twenty-three tools with schemas and annotations", async () => {
    const response = await sendRequest({ method: "tools/list", authInfo: AUTH });
    const tools = (response["result"] as { tools: Array<Record<string, unknown>> }).tools;

    expect(tools.map((tool) => tool["name"])).toEqual(OPENAI_TOOL_NAMES);
    for (const [index, tool] of tools.entries()) {
      expect(tool["inputSchema"]).toMatchObject({
        type: "object",
        additionalProperties: false
      });
      expect(tool["outputSchema"]).toMatchObject({
        type: "object",
        additionalProperties: false
      });
      expect(tool["annotations"]).toEqual({
        readOnlyHint: true,
        openWorldHint: false,
        destructiveHint: false
      });
      expect(tool["_meta"]).toEqual({
        securitySchemes: OPENAI_TOOL_CATALOG[index]?.securitySchemes
      });
    }
  });

  it("requires an authenticated principal and both incident-context scopes", async () => {
    const unauthenticated = await sendRequest({
      method: "tools/call",
      params: { name: "list_projects", arguments: {} }
    });
    expect(unauthenticated["result"]).toMatchObject({
      isError: true,
      _meta: {
        "mcp/www_authenticate": [
          `Bearer resource_metadata="${RESOURCE_METADATA_URL}", error="invalid_token", error_description="A valid DebugBundle connection is required."`
        ]
      }
    });

    const oneScope = await sendRequest({
      method: "tools/call",
      params: { name: "get_incident_context", arguments: { incident_id: "incident_1" } },
      authInfo: { ...AUTH, scopes: ["debugbundle:incidents:read"] }
    });
    expect(oneScope["result"]).toMatchObject({
      isError: true,
      _meta: {
        "mcp/www_authenticate": [
          `Bearer resource_metadata="${RESOURCE_METADATA_URL}", error="insufficient_scope", error_description="The connection does not grant the required DebugBundle scope.", scope="debugbundle:artifacts:read"`
        ]
      }
    });
  });
});
