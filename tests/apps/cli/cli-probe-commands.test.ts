import { describe, expect, it, vi } from "vitest";

import {
  ProbeApiError,
  activateProbeCommand,
  createProbeApi,
  listActiveProbesCommand,
  deactivateProbeCommand,
  activateProbeWithAuthCommand,
  listActiveProbesWithAuthCommand,
  deactivateProbeWithAuthCommand
} from "../../../apps/cli/src/probe-commands.js";
import { CliAuthStateError } from "../../../apps/cli/src/auth-state.js";

const activationFixture = {
  activation_id: "act_1",
  label_pattern: "debug.*",
  service: "*",
  environment: "*",
  expires_at: "2026-04-01T00:00:00.000Z"
};

describe("cli probe commands", () => {
  it("retains API error codes for failed probe transports", async () => {
    const api = createProbeApi({
      request: async () => ({ status: 409, body: { error: "project_configuration_busy" } })
    });
    await expect(
      api.activateProbe({ bearerToken: "member", projectId: "project", labelPattern: "debug.*" })
    ).rejects.toMatchObject({ status: 409, code: "project_configuration_busy" });
  });
  it("reuses saved authentication for probe listing and deactivation", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, body: { activations: [activationFixture] } })
      .mockResolvedValueOnce({ status: 200, body: { deactivated: true } });
    const dependencies = {
      readAuthState: async () => ({ bearer_token: "member", base_url: "https://api.example.test" }),
      createHttpClient: () => ({ request })
    };
    const listed = await listActiveProbesWithAuthCommand(
      { projectId: "project", json: true },
      dependencies
    );
    expect(JSON.parse(listed.output)).toEqual({ activations: [activationFixture] });
    const stopped = await deactivateProbeWithAuthCommand(
      { projectId: "project", activationId: "act_1", json: true },
      dependencies
    );
    expect(JSON.parse(stopped.output)).toEqual({ deactivated: true });
    expect(request.mock.calls.every(([call]) => call.bearerToken === "member")).toBe(true);
  });
  it("forwards an explicitly adopted SDK issuer through the command and HTTP client", async () => {
    const request = vi.fn().mockResolvedValue({
      status: 201,
      body: { activation: activationFixture, trigger_token: "signed" }
    });
    const result = await activateProbeCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "canonical",
        labelPattern: "debug.*",
        sdkProjectId: "sdk-issuer",
        sdkTokenId: "token-id",
        sdkService: "old-name",
        json: true
      },
      createProbeApi({ request })
    );
    expect(result.exitCode).toBe(0);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          label_pattern: "debug.*",
          sdk_project_id: "sdk-issuer",
          sdk_token_id: "token-id",
          sdk_service: "old-name"
        }
      })
    );
  });
  it("renders activate probe output in human and json modes", async () => {
    const api = {
      activateProbe: vi.fn().mockResolvedValue({
        activation: activationFixture,
        trigger_token: "dbundle_trigger_abc"
      })
    };

    const humanResult = await activateProbeCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1", labelPattern: "debug.*" },
      api
    );
    expect(humanResult.exitCode).toBe(0);
    expect(humanResult.output).toContain("Probe activated: act_1 (debug.*)");
    expect(humanResult.output).toContain("Trigger token: dbundle_trigger_abc");

    const jsonResult = await activateProbeCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1", labelPattern: "debug.*", json: true },
      api
    );
    expect(jsonResult.exitCode).toBe(0);
    expect(JSON.parse(jsonResult.output)).toEqual({
      activation: activationFixture,
      trigger_token: "dbundle_trigger_abc"
    });
  });

  it("renders list active probes output", async () => {
    const api = {
      listActiveProbes: vi.fn().mockResolvedValue({ activations: [activationFixture] })
    };

    const humanResult = await listActiveProbesCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1" },
      api
    );
    expect(humanResult.exitCode).toBe(0);
    expect(humanResult.output).toContain("act_1 debug.* (*/*) expires");

    const emptyResult = await listActiveProbesCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1" },
      { listActiveProbes: vi.fn().mockResolvedValue({ activations: [] }) }
    );
    expect(emptyResult.exitCode).toBe(0);
    expect(emptyResult.output).toBe("No active probes.");

    const jsonResult = await listActiveProbesCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1", json: true },
      api
    );
    expect(jsonResult.exitCode).toBe(0);
    expect(JSON.parse(jsonResult.output)).toEqual({ activations: [activationFixture] });
  });

  it("renders deactivate probe output", async () => {
    const humanResult = await deactivateProbeCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1", activationId: "act_1" },
      { deactivateProbe: vi.fn().mockResolvedValue({ deactivated: true }) }
    );
    expect(humanResult.exitCode).toBe(0);
    expect(humanResult.output).toBe("Probe deactivated.");

    const alreadyResult = await deactivateProbeCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1", activationId: "act_1" },
      { deactivateProbe: vi.fn().mockResolvedValue({ deactivated: false }) }
    );
    expect(alreadyResult.exitCode).toBe(0);
    expect(alreadyResult.output).toBe("Probe was already inactive.");
  });

  it("maps probe api errors to deterministic exit codes", async () => {
    const authResult = await activateProbeCommand(
      { bearerToken: "bad", projectId: "proj_1", labelPattern: "x" },
      { activateProbe: vi.fn().mockRejectedValue(new ProbeApiError(401, "invalid_member_token")) }
    );
    expect(authResult.exitCode).toBe(2);

    const notFoundResult = await listActiveProbesCommand(
      { bearerToken: "dbundle_mem_x", projectId: "missing" },
      { listActiveProbes: vi.fn().mockRejectedValue(new ProbeApiError(404, "project_not_found")) }
    );
    expect(notFoundResult.exitCode).toBe(3);

    const upgradeResult = await activateProbeCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1", labelPattern: "x" },
      { activateProbe: vi.fn().mockRejectedValue(new ProbeApiError(403, "upgrade_required")) }
    );
    expect(upgradeResult.exitCode).toBe(5);

    const quotaResult = await activateProbeCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1", labelPattern: "x" },
      { activateProbe: vi.fn().mockRejectedValue(new ProbeApiError(429, "monthly_quota_exceeded")) }
    );
    expect(quotaResult.exitCode).toBe(6);
  });

  it("loads stored auth state for activate with auth", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const httpClient = { request: vi.fn() };
    const createHttpClient = vi.fn().mockReturnValue(httpClient);
    const activateProbe = vi.fn().mockResolvedValue({
      activation: activationFixture,
      trigger_token: "dbundle_trigger_abc"
    });
    const createApi = vi.fn().mockReturnValue({
      activateProbe,
      listActiveProbes: vi.fn(),
      deactivateProbe: vi.fn()
    });

    const result = await activateProbeWithAuthCommand(
      { projectId: "proj_1", labelPattern: "debug.*", json: true },
      { readAuthState, createHttpClient, createApi }
    );

    expect(result.exitCode).toBe(0);
    expect(activateProbe).toHaveBeenCalledWith(
      expect.objectContaining({
        bearerToken: "dbundle_mem_saved",
        projectId: "proj_1",
        labelPattern: "debug.*"
      })
    );
  });

  it("maps auth failures from auth wrapper", async () => {
    const result = await activateProbeWithAuthCommand(
      { projectId: "proj_1", labelPattern: "x" },
      {
        readAuthState: vi
          .fn()
          .mockRejectedValue(new CliAuthStateError("auth_state_missing", "Not logged in."))
      }
    );
    expect(result.exitCode).toBe(2);
    expect(result.output).toBe("Not logged in.");
  });
});
