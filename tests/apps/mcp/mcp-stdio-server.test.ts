import { PassThrough } from "node:stream";
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { MCP_SERVER_VERSION, createMcpServer, runMcpStdioServer } from "../../../apps/mcp/src/server.js";

const mcpPackageJson = JSON.parse(readFileSync(new URL("../../../apps/mcp/package.json", import.meta.url), "utf8")) as {
  version: string;
};

describe("mcp stdio server", () => {
  it("reports the published package version during initialize", async () => {
    const server = createMcpServer({
      tools: {}
    });

    await expect(server.handleRequest({ jsonrpc: "2.0", id: 1, method: "initialize" })).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        serverInfo: {
          name: "@debugbundle/mcp",
          version: mcpPackageJson.version
        }
      }
    });
    expect(MCP_SERVER_VERSION).toBe(mcpPackageJson.version);
  });

  it("lists implemented tools with JSON schemas", async () => {
    const server = createMcpServer({
      tools: {
        doctor: vi.fn()
      }
    });

    await expect(server.handleRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" })).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        tools: expect.arrayContaining([
          expect.objectContaining({
            name: "doctor",
            description: "Run local DebugBundle environment diagnostics.",
            inputSchema: expect.objectContaining({
              type: "object"
            })
          })
        ])
      }
    });
  });

  it("calls tools and returns machine-readable JSON content", async () => {
    const doctor = vi.fn().mockResolvedValue({
      status: "healthy",
      suggested_actions: []
    });
    const server = createMcpServer({
      tools: {
        doctor
      }
    });

    await expect(
      server.handleRequest({
        jsonrpc: "2.0",
        id: "call-1",
        method: "tools/call",
        params: {
          name: "doctor",
          arguments: {
            authFilePath: "/tmp/auth.json"
          }
        }
      })
    ).resolves.toEqual({
      jsonrpc: "2.0",
      id: "call-1",
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "healthy",
              suggested_actions: []
            })
          }
        ]
      }
    });
    expect(doctor).toHaveBeenCalledWith({
      authFilePath: "/tmp/auth.json"
    });
  });

  it("bridges newline-delimited stdio JSON-RPC messages", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const chunks: string[] = [];
    output.on("data", (chunk) => chunks.push(String(chunk)));

    await runMcpStdioServer({
      input,
      output,
      server: createMcpServer({
        tools: {
          doctor: vi.fn().mockResolvedValue({ status: "healthy" })
        }
      })
    });

    input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "doctor", arguments: {} } })}\n`);
    await new Promise((resolve) => setImmediate(resolve));

    const response = JSON.parse(chunks.join("")) as {
      result: {
        content: Array<{ text: string }>;
      };
    };
    expect(JSON.parse(response.result.content[0]!.text)).toEqual({ status: "healthy" });
  });
});
