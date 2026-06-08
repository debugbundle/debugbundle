import { describe, expect, it, vi } from "vitest";

import { CliAuthStateError } from "../../../apps/cli/src/auth-state.js";
import {
  createCapturePolicyApi,
  CapturePolicyApiError,
  getCapturePolicyCommand,
  getCapturePolicyWithAuthCommand,
  setCapturePolicyCommand,
  setCapturePolicyWithAuthCommand
} from "../../../apps/cli/src/capture-policy-commands.js";

describe("cli capture-policy commands", () => {
  it("renders capture policy in human mode", async () => {
    const result = await getCapturePolicyCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1"
      },
      {
        getCapturePolicy: vi.fn().mockResolvedValue({
          policy: {
            preset: "balanced",
            capture_logs: "warning",
            capture_request_events: "failures_only",
            capture_breadcrumbs: "exception_only",
            capture_probe_events: "buffer_only",
            immediate_client_error_statuses: [],
            immediate_client_error_path_rules: [
              { status_code: 404, path_pattern: "/checkout/*", methods: ["GET", "POST"] }
            ]
          },
          overrides: {
            capture_logs: null,
            capture_request_events: null,
            capture_breadcrumbs: null,
            capture_probe_events: null,
            immediate_client_error_statuses: null,
            immediate_client_error_path_rules: [
              { status_code: 404, path_pattern: "/checkout/*", methods: ["GET", "POST"] }
            ]
          }
        })
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("preset: balanced");
    expect(result.output).toContain("capture_logs: warning");
    expect(result.output).toContain("client_error_incidents: preset default (none)");
    expect(result.output).toContain("client_error_path_rules: custom (404=/checkout/*@GET,POST)");
  });

  it("renders update results in json mode", async () => {
    const result = await setCapturePolicyCommand(
      {
        bearerToken: "dbundle_mem_owner",
        projectId: "proj_1",
        update: {
          preset: "investigative",
          capture_logs: "info"
        },
        json: true
      },
      {
        updateCapturePolicy: vi.fn().mockResolvedValue({
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
        })
      }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual({
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

  it("loads stored auth state and forwards it into get/set commands", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const httpClient = { request: vi.fn() };
    const createHttpClient = vi.fn().mockReturnValue(httpClient);
    const getCapturePolicy = vi.fn().mockResolvedValue({
      policy: {
        preset: "minimal",
        capture_logs: "error",
        capture_request_events: "failures_only",
        capture_breadcrumbs: "local_only",
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
    });
    const updateCapturePolicy = vi.fn().mockResolvedValue({
      policy: {
        preset: "balanced",
        capture_logs: "warning",
        capture_request_events: "failures_only",
        capture_breadcrumbs: "exception_only",
        capture_probe_events: "buffer_only",
        immediate_client_error_statuses: []
      },
      overrides: {
        capture_logs: "warning",
        capture_request_events: null,
        capture_breadcrumbs: null,
        capture_probe_events: null,
        immediate_client_error_statuses: []
      }
    });
    const createApi = vi.fn().mockReturnValue({ getCapturePolicy, updateCapturePolicy });

    const getResult = await getCapturePolicyWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        projectId: "proj_1",
        json: true
      },
      {
        readAuthState,
        createHttpClient,
        createApi
      }
    );

    const setResult = await setCapturePolicyWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        projectId: "proj_1",
        update: { capture_logs: "warning" }
      },
      {
        readAuthState,
        createHttpClient,
        createApi
      }
    );

    expect(createHttpClient).toHaveBeenCalledWith({
      baseUrl: "https://selfhost.debugbundle.test"
    });
    expect(getCapturePolicy).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: "proj_1"
    });
    expect(updateCapturePolicy).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: "proj_1",
      update: { capture_logs: "warning" }
    });
    expect(JSON.parse(getResult.output)).toEqual({
      policy: {
        preset: "minimal",
        capture_logs: "error",
        capture_request_events: "failures_only",
        capture_breadcrumbs: "local_only",
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
    });
    expect(setResult.output).toContain("Capture policy updated.");
  });

  it("maps auth state failures to exit code 2", async () => {
    const result = await getCapturePolicyWithAuthCommand(
      {
        projectId: "proj_1"
      },
      {
        readAuthState: vi.fn().mockRejectedValue(new CliAuthStateError("auth_state_missing", "Not logged in."))
      }
    );

    expect(result.exitCode).toBe(2);
    expect(result.output).toBe("Not logged in.");
  });

  it("maps API error statuses to CLI exit codes", async () => {
    const unauthorized = await getCapturePolicyCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1" },
      { getCapturePolicy: vi.fn().mockRejectedValue(new CapturePolicyApiError(401, "invalid_member_token")) }
    );
    const notFound = await getCapturePolicyCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1" },
      { getCapturePolicy: vi.fn().mockRejectedValue(new CapturePolicyApiError(404, "project_not_found")) }
    );
    const badRequest = await setCapturePolicyCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1", update: { preset: "balanced" } },
      { updateCapturePolicy: vi.fn().mockRejectedValue(new CapturePolicyApiError(400, "invalid_payload")) }
    );

    expect(unauthorized.exitCode).toBe(2);
    expect(notFound.exitCode).toBe(3);
    expect(badRequest.exitCode).toBe(4);
  });

  it("validates update payloads before calling the API", async () => {
    const updateCapturePolicy = vi.fn();

    const result = await setCapturePolicyCommand(
      {
        bearerToken: "dbundle_mem_owner",
        projectId: "proj_1",
        update: { capture_logs: "verbose" as never }
      },
      { updateCapturePolicy }
    );

    expect(result.exitCode).toBe(4);
    expect(result.output).toBe("Invalid capture policy update.");
    expect(updateCapturePolicy).not.toHaveBeenCalled();
  });

  it("builds GET and PATCH requests against the capture-policy API", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({
        status: 200,
        body: {
          access_mode: "manage",
          policy: {
            preset: "minimal",
            capture_logs: "error",
            capture_request_events: "failures_only",
            capture_breadcrumbs: "local_only",
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
        }
      })
      .mockResolvedValueOnce({
        status: 200,
        body: {
          access_mode: "manage",
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
        }
      });
    const api = createCapturePolicyApi({ request });

    const policy = await api.getCapturePolicy({ bearerToken: "dbundle_mem_x", projectId: "proj_1" });
    const updated = await api.updateCapturePolicy({
      bearerToken: "dbundle_mem_owner",
      projectId: "proj_1",
      update: { preset: "balanced" }
    });

    expect(request).toHaveBeenNthCalledWith(1, {
      method: "GET",
      path: "/v1/projects/proj_1/capture-policy",
      bearerToken: "dbundle_mem_x"
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      method: "PATCH",
      path: "/v1/projects/proj_1/capture-policy",
      bearerToken: "dbundle_mem_owner",
      body: { preset: "balanced" }
    });
    expect(policy.policy.preset).toBe("minimal");
    expect(updated.policy.preset).toBe("balanced");
  });
});
