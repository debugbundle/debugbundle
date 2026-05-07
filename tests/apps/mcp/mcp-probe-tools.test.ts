import { describe, expect, it, vi } from "vitest";

import { ProbeApiError } from "../../../apps/cli/src/probe-commands.js";
import { PROBE_MCP_TOOL_NAMES, createProbeMcpTools } from "../../../apps/mcp/src/probe-tools.js";

const activationFixture = {
  activation_id: "act_1",
  label_pattern: "debug.*",
  service: "*",
  environment: "*",
  expires_at: "2026-04-01T00:00:00.000Z"
};

describe("mcp probe tools", () => {
  it("declares probe tool parity", () => {
    expect(PROBE_MCP_TOOL_NAMES).toEqual([
      "activate_probe",
      "list_active_probes",
      "deactivate_probe"
    ]);
  });

  it("returns probe payloads for all operations", async () => {
    const tools = createProbeMcpTools({
      activateProbe: vi.fn().mockResolvedValue({
        activation: activationFixture,
        trigger_token: "dbundle_trigger_abc"
      }),
      listActiveProbes: vi.fn().mockResolvedValue({ activations: [activationFixture] }),
      deactivateProbe: vi.fn().mockResolvedValue({ deactivated: true })
    });

    await expect(
      tools.activate_probe({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        labelPattern: "debug.*"
      })
    ).resolves.toEqual({
      activation: activationFixture,
      trigger_token: "dbundle_trigger_abc"
    });

    await expect(
      tools.list_active_probes({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1"
      })
    ).resolves.toEqual({ activations: [activationFixture] });

    await expect(
      tools.deactivate_probe({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        activationId: "act_1"
      })
    ).resolves.toEqual({ deactivated: true });
  });

  it("maps probe api and unknown errors to mcp tool errors", async () => {
    const tools = createProbeMcpTools({
      activateProbe: vi.fn().mockRejectedValue(new ProbeApiError(403, "upgrade_required")),
      listActiveProbes: vi.fn().mockRejectedValue(new ProbeApiError(401, "invalid_member_token")),
      deactivateProbe: vi.fn().mockRejectedValue(new Error("network"))
    });

    await expect(
      tools.activate_probe({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        labelPattern: "test"
      })
    ).rejects.toThrow("mcp_tool_error:upgrade_required");

    await expect(
      tools.list_active_probes({
        bearerToken: "bad",
        projectId: "proj_1"
      })
    ).rejects.toThrow("mcp_tool_error:invalid_member_token");

    await expect(
      tools.deactivate_probe({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        activationId: "act_1"
      })
    ).rejects.toThrow("mcp_tool_error:unknown_error");
  });

  it("forwards optional fields through activate tool", async () => {
    const api = {
      activateProbe: vi.fn().mockResolvedValue({}),
      listActiveProbes: vi.fn().mockResolvedValue({ activations: [] }),
      deactivateProbe: vi.fn().mockResolvedValue({ deactivated: false })
    };
    const tools = createProbeMcpTools(api);

    await tools.activate_probe({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_1",
      labelPattern: "debug.*",
      service: "api",
      environment: "production",
      ttlSeconds: 1800,
      triggerTtlSeconds: 3600
    });

    expect(api.activateProbe).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_1",
      labelPattern: "debug.*",
      service: "api",
      environment: "production",
      ttlSeconds: 1800,
      triggerTtlSeconds: 3600
    });
  });
});
