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
      policy: {
        preset: "balanced",
        capture_logs: "warning",
        capture_request_events: "failures_only",
        capture_breadcrumbs: "exception_only",
        capture_probe_events: "buffer_only",
        immediate_client_error_statuses: []
      },
      overrides: {
        capture_logs: null,
        capture_request_events: null,
        capture_breadcrumbs: null,
        capture_probe_events: null,
        immediate_client_error_statuses: null
      }
    };

    const tools = createCapturePolicyMcpTools({
      getCapturePolicy: vi.fn().mockResolvedValue(policyFixture),
      updateCapturePolicy: vi
        .fn()
        .mockResolvedValue({
          policy: {
            preset: "investigative",
            capture_logs: "info",
            capture_request_events: "all",
            capture_breadcrumbs: "standalone",
            capture_probe_events: "standalone_when_activated",
            immediate_client_error_statuses: [401, 403, 409, 422]
          },
          overrides: {
            capture_logs: "info",
            capture_request_events: null,
            capture_breadcrumbs: null,
            capture_probe_events: null,
            immediate_client_error_statuses: [401, 403, 409, 422]
          }
        }),
    });

    await expect(
      tools.get_capture_policy({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
      })
    ).resolves.toEqual(policyFixture);

    await expect(
      tools.update_capture_policy({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        update: { preset: "investigative", capture_logs: "info" },
      })
    ).resolves.toEqual({
      policy: {
        preset: "investigative",
        capture_logs: "info",
        capture_request_events: "all",
        capture_breadcrumbs: "standalone",
        capture_probe_events: "standalone_when_activated",
        immediate_client_error_statuses: [401, 403, 409, 422]
      },
      overrides: {
        capture_logs: "info",
        capture_request_events: null,
        capture_breadcrumbs: null,
        capture_probe_events: null,
        immediate_client_error_statuses: [401, 403, 409, 422]
      }
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
