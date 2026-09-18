import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDefaultMcpTools: vi.fn().mockResolvedValue({}),
  createMcpServer: vi.fn().mockReturnValue({ handleRequest: vi.fn() }),
  runMcpStdioServer: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("../../../apps/mcp/src/default-tools.js", () => ({
  createDefaultMcpTools: mocks.createDefaultMcpTools
}));
vi.mock("../../../apps/mcp/src/server.js", () => ({
  createMcpServer: mocks.createMcpServer,
  runMcpStdioServer: mocks.runMcpStdioServer
}));

import { main } from "../../../apps/mcp/src/main.js";

describe("MCP process authentication profile", () => {
  afterEach(() => vi.clearAllMocks());

  it.each([false, true])(
    "uses matching validation and credential modes when local-auth is %s",
    async (localAuth) => {
      await main(localAuth ? ["--local-auth"] : []);
      expect(mocks.createDefaultMcpTools).toHaveBeenCalledWith({ localAuth });
      expect(mocks.createMcpServer).toHaveBeenCalledWith({ tools: {}, localAuth });
      expect(mocks.runMcpStdioServer).toHaveBeenCalledWith({
        input: process.stdin,
        output: process.stdout,
        server: mocks.createMcpServer.mock.results[0]!.value
      });
    }
  );

  it("reads the opt-in from process arguments when launched through the package entrypoint", async () => {
    const argv = process.argv;
    process.argv = [argv[0]!, "debugbundle-mcp", "--local-auth"];
    try {
      await main();
      expect(mocks.createDefaultMcpTools).toHaveBeenCalledWith({ localAuth: true });
    } finally {
      process.argv = argv;
    }
  });
});
