import { PassThrough } from "node:stream";
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  MCP_SERVER_VERSION,
  createMcpServer,
  runMcpStdioServer
} from "../../../apps/mcp/src/server.js";

const mcpPackageJson = JSON.parse(
  readFileSync(new URL("../../../apps/mcp/package.json", import.meta.url), "utf8")
) as {
  version: string;
};

describe("mcp stdio server", () => {
  it("preserves cross-field validation in the local-auth catalog", async () => {
    const update = vi.fn().mockResolvedValue({ updated: true });
    const server = createMcpServer({
      tools: { update_saved_analytics_funnel: update },
      localAuth: true
    });
    const call = (args: Record<string, unknown>) =>
      server.handleRequest({
        id: 1,
        method: "tools/call",
        params: { name: "update_saved_analytics_funnel", arguments: args }
      });
    const args = { projectId: "project", funnelKey: "checkout" };
    await expect(call(args)).resolves.toMatchObject({ error: { code: -32602 } });
    expect(update).not.toHaveBeenCalled();
    await expect(call({ ...args, displayName: " Checkout " })).resolves.toMatchObject({
      result: { content: [{ text: '{"updated":true}' }] }
    });
    expect(update).toHaveBeenCalledWith({ ...args, displayName: "Checkout" });
  });

  it("supports local-auth project discovery without exposing per-tool credentials", async () => {
    const listProjects = vi.fn().mockResolvedValue({ projects: [] });
    const server = createMcpServer({ tools: { list_projects: listProjects }, localAuth: true });
    const response = await server.handleRequest({ id: 1, method: "tools/list" });
    const catalog = (
      response as {
        result: {
          tools: Array<{
            name: string;
            inputSchema: { properties: Record<string, unknown>; required?: string[] };
          }>;
        };
      }
    ).result.tools;
    for (const tool of catalog) {
      expect(tool.inputSchema.properties).not.toHaveProperty("bearerToken");
      expect(tool.inputSchema.required ?? []).not.toContain("bearerToken");
    }
    await expect(
      server.handleRequest({
        id: 2,
        method: "tools/call",
        params: { name: "list_projects", arguments: {} }
      })
    ).resolves.toMatchObject({ result: { content: [{ text: '{"projects":[]}' }] } });
    expect(listProjects).toHaveBeenCalledWith({});
  });

  it("rejects credential injection and unknown fields in local-auth mode before calling a handler", async () => {
    const listProjects = vi.fn();
    const server = createMcpServer({ tools: { list_projects: listProjects }, localAuth: true });
    for (const args of [
      { bearerToken: "must-not-be-used" },
      { unknown: true },
      { limit: "invalid" }
    ]) {
      await expect(
        server.handleRequest({
          id: 1,
          method: "tools/call",
          params: { name: "list_projects", arguments: args }
        })
      ).resolves.toMatchObject({ error: { code: -32602 } });
    }
    expect(listProjects).not.toHaveBeenCalled();
  });

  it("keeps the default credential schema and validation unchanged", async () => {
    const listProjects = vi.fn();
    const server = createMcpServer({ tools: { list_projects: listProjects } });
    await expect(
      server.handleRequest({
        id: 1,
        method: "tools/call",
        params: { name: "list_projects", arguments: {} }
      })
    ).resolves.toMatchObject({ error: { code: -32602 } });
    expect(listProjects).not.toHaveBeenCalled();
  });

  it("reports the published package version during initialize", async () => {
    const server = createMcpServer({
      tools: {}
    });

    await expect(
      server.handleRequest({ jsonrpc: "2.0", id: 1, method: "initialize" })
    ).resolves.toMatchObject({
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

    await expect(
      server.handleRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" })
    ).resolves.toMatchObject({
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

    input.write(
      `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "doctor", arguments: {} } })}\n`
    );
    await new Promise((resolve) => setImmediate(resolve));

    const response = JSON.parse(chunks.join("")) as {
      result: {
        content: Array<{ text: string }>;
      };
    };
    expect(JSON.parse(response.result.content[0]!.text)).toEqual({ status: "healthy" });
  });
});
