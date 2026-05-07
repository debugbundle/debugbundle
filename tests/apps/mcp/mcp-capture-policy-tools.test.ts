import { describe, expect, it, vi } from "vitest";

import {
  CapturePolicyApiError,
} from "../../../apps/cli/src/capture-policy-commands.js";
import {
  CAPTURE_POLICY_MCP_TOOL_NAMES,
  createCapturePolicyMcpTools,
} from "../../../apps/mcp/src/capture-policy-tools.ts";

describe("mcp capture-policy tools", () => {
  it("declares capture-policy tool parity", () => {
    expect(CAPTURE_POLICY_MCP_TOOL_NAMES).toEqual([
      "get_capture_policy",
      "update_capture_policy",
    ]);
  });

  it("returns capture policy payloads", async () => {
    const policyFixture = {
      preset: "balanced",
      capture_logs: "warning",
      capture_request_events: "failures_only",
      capture_breadcrumbs: "exception_only",
      capture_probe_events: "buffer_only",
    };

    const tools = createCapturePolicyMcpTools({
      getCapturePolicy: vi.fn().mockResolvedValue(policyFixture),
      updateCapturePolicy: vi
        .fn()
        .mockResolvedValue({ ...policyFixture, preset: "investigative", capture_logs: "info" }),
    });

    await expect(
      tools.get_capture_policy({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
      })
    ).resolves.toEqual({ policy: policyFixture });

    await expect(
      tools.update_capture_policy({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        update: { preset: "investigative", capture_logs: "info" },
      })
    ).resolves.toEqual({
      policy: { ...policyFixture, preset: "investigative", capture_logs: "info" },
    });
  });

  it("maps capture-policy api and unknown errors to mcp tool errors", async () => {
    const tools = createCapturePolicyMcpTools({
      getCapturePolicy: vi
        .fn()
        .mockRejectedValue(new CapturePolicyApiError(401, "invalid_member_token")),
      updateCapturePolicy: vi.fn().mockRejectedValue(new Error("boom")),
    });

    await expect(
      tools.get_capture_policy({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
      })
    ).rejects.toThrow("mcp_tool_error:invalid_member_token");

    await expect(
      tools.update_capture_policy({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        update: { preset: "minimal" },
      })
    ).rejects.toThrow("mcp_tool_error:unknown_error");
  });

  it("forwards optional update fields through update tool", async () => {
    const api = {
      getCapturePolicy: vi.fn().mockResolvedValue({}),
      updateCapturePolicy: vi.fn().mockResolvedValue({}),
    };
    const tools = createCapturePolicyMcpTools(api);

    await tools.update_capture_policy({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_1",
      update: {
        preset: "investigative",
        capture_logs: "info",
        capture_request_events: "all",
      },
    });

    expect(api.updateCapturePolicy).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_1",
      update: {
        preset: "investigative",
        capture_logs: "info",
        capture_request_events: "all",
      },
    });
  });
});
