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
    const listImprovements = vi.fn().mockResolvedValue({ improvements: [], next_cursor: null });
    const getImprovement = vi.fn().mockResolvedValue({ improvement_id: "imp_123" });
    const getImprovementBundle = vi.fn().mockResolvedValue({ status: "pending" });
    const resolveImprovement = vi.fn().mockResolvedValue({ improvement_id: "imp_123", status: "resolved" });
    const reopenImprovement = vi.fn().mockResolvedValue({ improvement_id: "imp_123", status: "open" });
    const snoozeImprovement = vi.fn().mockResolvedValue({ improvement_id: "imp_123", status: "snoozed" });
    const tools = createImprovementMcpTools({
      listImprovements,
      getImprovement,
      getImprovementBundle,
      resolveImprovement,
      reopenImprovement,
      snoozeImprovement
    });

    await expect(
      tools.list_improvements({
        bearerToken: "token",
        projectId: "proj_123",
        environment: "production",
        service: "checkout-api",
        status: "open",
        severity: "high",
        kind: "warning_hotspot",
        cursor: "cursor_2",
        limit: 10
      })
    ).resolves.toEqual({ improvements: [], next_cursor: null });
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

    expect(listImprovements).toHaveBeenCalledWith({
      bearerToken: "token",
      projectId: "proj_123",
      environment: "production",
      service: "checkout-api",
      status: "open",
      severity: "high",
      kind: "warning_hotspot",
      cursor: "cursor_2",
      limit: 10
    });
    expect(getImprovement).toHaveBeenCalledWith({ bearerToken: "token", improvementId: "imp_123" });
    expect(getImprovementBundle).toHaveBeenCalledWith({
      bearerToken: "token",
      projectId: "proj_123",
      improvementId: "imp_123"
    });
    expect(resolveImprovement).toHaveBeenCalledWith({ bearerToken: "token", improvementId: "imp_123" });
    expect(reopenImprovement).toHaveBeenCalledWith({ bearerToken: "token", improvementId: "imp_123" });
    expect(snoozeImprovement).toHaveBeenCalledWith({
      bearerToken: "token",
      improvementId: "imp_123",
      snoozedUntil: "2026-05-25T12:00:00.000Z"
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
    await expect(
      tools.get_improvement_bundle({ bearerToken: "token", projectId: "proj_123", improvementId: "imp_123" })
    ).rejects.toThrow("mcp_tool_error:improvement_not_found");
    await expect(tools.resolve_improvement({ bearerToken: "token", improvementId: "imp_123" })).rejects.toThrow(
      "mcp_tool_error:improvement_not_found"
    );
    await expect(tools.reopen_improvement({ bearerToken: "token", improvementId: "imp_123" })).rejects.toThrow(
      "mcp_tool_error:improvement_not_found"
    );
    await expect(
      tools.snooze_improvement({ bearerToken: "token", improvementId: "imp_123", snoozedUntil: "2026-05-25T12:00:00.000Z" })
    ).rejects.toThrow("mcp_tool_error:improvement_not_found");
  });

  it("rejects missing bearer tokens and maps unknown tool failures", async () => {
    const tools = createImprovementMcpTools({
      listImprovements: vi.fn(),
      getImprovement: vi.fn(),
      getImprovementBundle: vi.fn(),
      resolveImprovement: vi.fn(),
      reopenImprovement: vi.fn().mockRejectedValue(new Error("boom")),
      snoozeImprovement: vi.fn()
    });

    await expect(tools.list_improvements({})).rejects.toThrow("mcp_tool_error:auth_required");
    await expect(tools.reopen_improvement({ bearerToken: "token", improvementId: "imp_123" })).rejects.toThrow(
      "mcp_tool_error:unknown_error"
    );
  });

  it("coerces missing string inputs to empty strings before forwarding", async () => {
    const getImprovement = vi.fn().mockResolvedValue({ improvement_id: "" });
    const getImprovementBundle = vi.fn().mockResolvedValue({ status: "pending" });
    const snoozeImprovement = vi.fn().mockResolvedValue({ improvement_id: "", status: "snoozed" });
    const tools = createImprovementMcpTools({
      listImprovements: vi.fn().mockResolvedValue({ improvements: [], next_cursor: null }),
      getImprovement,
      getImprovementBundle,
      resolveImprovement: vi.fn().mockResolvedValue({ improvement_id: "", status: "resolved" }),
      reopenImprovement: vi.fn().mockResolvedValue({ improvement_id: "", status: "open" }),
      snoozeImprovement
    });

    await tools.get_improvement({ bearerToken: "token", improvementId: 123 });
    await tools.get_improvement_bundle({ bearerToken: "token", projectId: 456, improvementId: null });
    await tools.snooze_improvement({ bearerToken: "token", improvementId: {}, snoozedUntil: 789 });

    expect(getImprovement).toHaveBeenCalledWith({ bearerToken: "token", improvementId: "" });
    expect(getImprovementBundle).toHaveBeenCalledWith({ bearerToken: "token", projectId: "", improvementId: "" });
    expect(snoozeImprovement).toHaveBeenCalledWith({ bearerToken: "token", improvementId: "", snoozedUntil: "" });
  });

  it("rejects empty bearer tokens", async () => {
    const tools = createImprovementMcpTools({
      listImprovements: vi.fn(),
      getImprovement: vi.fn(),
      getImprovementBundle: vi.fn(),
      resolveImprovement: vi.fn(),
      reopenImprovement: vi.fn(),
      snoozeImprovement: vi.fn()
    });

    await expect(tools.resolve_improvement({ bearerToken: "", improvementId: "imp_123" })).rejects.toThrow(
      "mcp_tool_error:auth_required"
    );
  });
});
