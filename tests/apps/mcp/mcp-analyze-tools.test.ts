import { describe, expect, it, vi } from "vitest";

import { ANALYZE_MCP_TOOL_NAMES, createAnalyzeMcpTools } from "../../../apps/mcp/src/analyze-tools.js";

describe("mcp analyze tools", () => {
  it("declares analysis tool parity", () => {
    expect(ANALYZE_MCP_TOOL_NAMES).toEqual(["analyze"]);
  });

  it("returns parsed analyze payloads and forwards local analysis input", async () => {
    const analyzeCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: JSON.stringify({
        bundle_version: 1,
        bundle_id: "analysis_improvement_bnd_inc_fixture",
        bundle_type: "improvement"
      })
    });

    const tools = createAnalyzeMcpTools({
      analyzeCommand
    });

    await expect(
      tools.analyze({
        type: "improvement",
        local: true
      })
    ).resolves.toEqual({
      bundle_version: 1,
      bundle_id: "analysis_improvement_bnd_inc_fixture",
      bundle_type: "improvement"
    });

    expect(analyzeCommand).toHaveBeenCalledWith({
      type: "improvement",
      local: true,
      json: true
    });
  });

  it("maps invalid wrapped output to mcp_tool_error:unknown_error", async () => {
    const tools = createAnalyzeMcpTools({
      analyzeCommand: vi.fn().mockResolvedValue({
        exitCode: 0,
        output: "not-json"
      })
    });

    await expect(tools.analyze({ type: "improvement", local: true })).rejects.toThrow("mcp_tool_error:unknown_error");
  });

  it("maps command failures and omitted optional input to mcp_tool_error:unknown_error", async () => {
    const analyzeCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: JSON.stringify({
        bundle_version: 1
      })
    });
    const tools = createAnalyzeMcpTools({
      analyzeCommand
    });

    await expect(tools.analyze({})).resolves.toEqual({ bundle_version: 1 });
    expect(analyzeCommand).toHaveBeenCalledWith({
      json: true
    });

    const failingTools = createAnalyzeMcpTools({
      analyzeCommand: vi.fn().mockRejectedValue(new Error("command_failed"))
    });

    await expect(failingTools.analyze({ type: "performance" })).rejects.toThrow("mcp_tool_error:unknown_error");
  });
});