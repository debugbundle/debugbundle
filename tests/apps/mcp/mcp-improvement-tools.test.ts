import { describe, expect, it, vi } from "vitest";

import { RetrievalApiError } from "../../../packages/retrieval-client/src/index.js";
import {
  createImprovementMcpTools,
  IMPROVEMENT_MCP_TOOL_NAMES
} from "../../../apps/mcp/src/improvement-tools.js";

describe("mcp improvement tools", () => {
  it("declares improvement tool parity", () => {
    expect(IMPROVEMENT_MCP_TOOL_NAMES).toEqual([
      "list_improvements",
      "get_improvement",
      "get_improvement_bundle",
      "resolve_improvement",
      "reopen_improvement",
      "snooze_improvement"
    ]);
  });

  it("forwards improvement requests to the hosted retrieval api", async () => {
    const tools = createImprovementMcpTools({
      listImprovements: vi.fn().mockResolvedValue({ improvements: [], next_cursor: null }),
      getImprovement: vi.fn().mockResolvedValue({ improvement_id: "imp_123" }),
      getImprovementBundle: vi.fn().mockResolvedValue({ status: "pending" }),
      resolveImprovement: vi.fn().mockResolvedValue({ improvement_id: "imp_123", status: "resolved" }),
      reopenImprovement: vi.fn().mockResolvedValue({ improvement_id: "imp_123", status: "open" }),
      snoozeImprovement: vi.fn().mockResolvedValue({ improvement_id: "imp_123", status: "snoozed" })
    });

    await expect(tools.list_improvements({ bearerToken: "token", projectId: "proj_123" })).resolves.toEqual({
      improvements: [],
      next_cursor: null
    });
    await expect(tools.get_improvement({ bearerToken: "token", improvementId: "imp_123" })).resolves.toEqual({
      improvement_id: "imp_123"
    });
    await expect(
      tools.get_improvement_bundle({ bearerToken: "token", projectId: "proj_123", improvementId: "imp_123" })
    ).resolves.toEqual({ status: "pending" });
    await expect(tools.resolve_improvement({ bearerToken: "token", improvementId: "imp_123" })).resolves.toEqual({
      improvement_id: "imp_123",
      status: "resolved"
    });
    await expect(tools.reopen_improvement({ bearerToken: "token", improvementId: "imp_123" })).resolves.toEqual({
      improvement_id: "imp_123",
      status: "open"
    });
    await expect(
      tools.snooze_improvement({ bearerToken: "token", improvementId: "imp_123", snoozedUntil: "2026-05-25T12:00:00.000Z" })
    ).resolves.toEqual({
      improvement_id: "imp_123",
      status: "snoozed"
    });
  });

  it("maps retrieval api failures to MCP tool errors", async () => {
    const tools = createImprovementMcpTools({
      listImprovements: vi.fn().mockRejectedValue(new RetrievalApiError(404, "improvement_not_found")),
      getImprovement: vi.fn().mockRejectedValue(new RetrievalApiError(404, "improvement_not_found")),
      getImprovementBundle: vi.fn().mockRejectedValue(new RetrievalApiError(404, "improvement_not_found")),
      resolveImprovement: vi.fn().mockRejectedValue(new RetrievalApiError(404, "improvement_not_found")),
      reopenImprovement: vi.fn().mockRejectedValue(new RetrievalApiError(404, "improvement_not_found")),
      snoozeImprovement: vi.fn().mockRejectedValue(new RetrievalApiError(404, "improvement_not_found"))
    });

    await expect(tools.list_improvements({ bearerToken: "token" })).rejects.toThrow("mcp_tool_error:improvement_not_found");
    await expect(tools.get_improvement({ bearerToken: "token", improvementId: "imp_123" })).rejects.toThrow("mcp_tool_error:improvement_not_found");
  });
});
