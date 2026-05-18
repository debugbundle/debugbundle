import { describe, expect, it, vi } from "vitest";

import { CliAuthStateError } from "../../../apps/cli/src/auth-state.js";
import {
  createImprovementSettingsApi,
  getImprovementSettingsCommand,
  getImprovementSettingsWithAuthCommand,
  ImprovementSettingsApiError,
  setImprovementSettingsCommand,
  setImprovementSettingsWithAuthCommand
} from "../../../apps/cli/src/improvement-settings-commands.js";

describe("cli improvement settings commands", () => {
  it("renders improvement settings in human mode", async () => {
    const result = await getImprovementSettingsCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1"
      },
      {
        getImprovementSettings: vi.fn().mockResolvedValue({
          access_mode: "manage",
          cloud_automation_available: true,
          settings: {
            automated_improvement_bundles_enabled: true,
            improvement_bundle_sensitivity: "balanced"
          }
        })
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("access_mode: manage");
    expect(result.output).toContain("cloud_automation_available: true");
    expect(result.output).toContain("improvement_bundle_sensitivity: balanced");
  });

  it("renders update results in json mode", async () => {
    const result = await setImprovementSettingsCommand(
      {
        bearerToken: "dbundle_mem_owner",
        projectId: "proj_1",
        update: {
          automated_improvement_bundles_enabled: false,
          improvement_bundle_sensitivity: "verbose"
        },
        json: true
      },
      {
        updateImprovementSettings: vi.fn().mockResolvedValue({
          access_mode: "manage",
          cloud_automation_available: true,
          settings: {
            automated_improvement_bundles_enabled: false,
            improvement_bundle_sensitivity: "verbose"
          }
        })
      }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual({
      access_mode: "manage",
      cloud_automation_available: true,
      settings: {
        automated_improvement_bundles_enabled: false,
        improvement_bundle_sensitivity: "verbose"
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
    const getImprovementSettings = vi.fn().mockResolvedValue({
      access_mode: "preview",
      cloud_automation_available: true,
      settings: {
        automated_improvement_bundles_enabled: true,
        improvement_bundle_sensitivity: "balanced"
      }
    });
    const updateImprovementSettings = vi.fn().mockResolvedValue({
      access_mode: "manage",
      cloud_automation_available: true,
      settings: {
        automated_improvement_bundles_enabled: false,
        improvement_bundle_sensitivity: "high_confidence"
      }
    });
    const createApi = vi.fn().mockReturnValue({ getImprovementSettings, updateImprovementSettings });

    const getResult = await getImprovementSettingsWithAuthCommand(
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

    const setResult = await setImprovementSettingsWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        projectId: "proj_1",
        update: { improvement_bundle_sensitivity: "high_confidence" }
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
    expect(getImprovementSettings).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: "proj_1"
    });
    expect(updateImprovementSettings).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: "proj_1",
      update: { improvement_bundle_sensitivity: "high_confidence" }
    });
    expect(JSON.parse(getResult.output)).toEqual({
      access_mode: "preview",
      cloud_automation_available: true,
      settings: {
        automated_improvement_bundles_enabled: true,
        improvement_bundle_sensitivity: "balanced"
      }
    });
    expect(setResult.output).toContain("Improvement settings updated.");
  });

  it("maps auth state failures to exit code 2", async () => {
    const result = await getImprovementSettingsWithAuthCommand(
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
    const unauthorized = await getImprovementSettingsCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1" },
      { getImprovementSettings: vi.fn().mockRejectedValue(new ImprovementSettingsApiError(401, "invalid_member_token")) }
    );
    const notFound = await getImprovementSettingsCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1" },
      { getImprovementSettings: vi.fn().mockRejectedValue(new ImprovementSettingsApiError(404, "project_not_found")) }
    );
    const badRequest = await setImprovementSettingsCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        update: { automated_improvement_bundles_enabled: false }
      },
      { updateImprovementSettings: vi.fn().mockRejectedValue(new ImprovementSettingsApiError(400, "invalid_payload")) }
    );

    expect(unauthorized.exitCode).toBe(2);
    expect(notFound.exitCode).toBe(3);
    expect(badRequest.exitCode).toBe(4);
  });

  it("validates update payloads before calling the API", async () => {
    const updateImprovementSettings = vi.fn();

    const result = await setImprovementSettingsCommand(
      {
        bearerToken: "dbundle_mem_owner",
        projectId: "proj_1",
        update: {}
      },
      { updateImprovementSettings }
    );

    expect(result.exitCode).toBe(4);
    expect(result.output).toBe("Invalid improvement settings update.");
    expect(updateImprovementSettings).not.toHaveBeenCalled();
  });

  it("builds GET and PATCH requests against the improvement-settings API", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({
        status: 200,
        body: {
          access_mode: "manage",
          cloud_automation_available: true,
          settings: {
            automated_improvement_bundles_enabled: true,
            improvement_bundle_sensitivity: "balanced"
          }
        }
      })
      .mockResolvedValueOnce({
        status: 200,
        body: {
          access_mode: "manage",
          cloud_automation_available: true,
          settings: {
            automated_improvement_bundles_enabled: false,
            improvement_bundle_sensitivity: "verbose"
          }
        }
      });

    const api = createImprovementSettingsApi({ request });
    const getResponse = await api.getImprovementSettings({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_1"
    });
    const updateResponse = await api.updateImprovementSettings({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_1",
      update: {
        automated_improvement_bundles_enabled: false,
        improvement_bundle_sensitivity: "verbose"
      }
    });

    expect(getResponse.settings.improvement_bundle_sensitivity).toBe("balanced");
    expect(updateResponse.settings.improvement_bundle_sensitivity).toBe("verbose");
    expect(request.mock.calls[0]?.[0]).toEqual({
      method: "GET",
      path: "/v1/projects/proj_1/improvement-settings",
      bearerToken: "dbundle_mem_x"
    });
    expect(request.mock.calls[1]?.[0]).toEqual({
      method: "PATCH",
      path: "/v1/projects/proj_1/improvement-settings",
      bearerToken: "dbundle_mem_x",
      body: {
        automated_improvement_bundles_enabled: false,
        improvement_bundle_sensitivity: "verbose"
      }
    });
  });
});
