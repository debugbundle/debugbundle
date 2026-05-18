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

  it("renders the remaining direct get/set output branches", async () => {
    const getResult = await getImprovementSettingsCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        json: true
      },
      {
        getImprovementSettings: vi.fn().mockResolvedValue({
          access_mode: "preview",
          cloud_automation_available: false,
          settings: {
            automated_improvement_bundles_enabled: false,
            improvement_bundle_sensitivity: "high_confidence"
          }
        })
      }
    );
    const setResult = await setImprovementSettingsCommand(
      {
        bearerToken: "dbundle_mem_owner",
        projectId: "proj_1",
        update: {
          automated_improvement_bundles_enabled: true,
          improvement_bundle_sensitivity: "balanced"
        }
      },
      {
        updateImprovementSettings: vi.fn().mockResolvedValue({
          access_mode: "manage",
          cloud_automation_available: true,
          settings: {
            automated_improvement_bundles_enabled: true,
            improvement_bundle_sensitivity: "balanced"
          }
        })
      }
    );

    expect(JSON.parse(getResult.output)).toEqual({
      access_mode: "preview",
      cloud_automation_available: false,
      settings: {
        automated_improvement_bundles_enabled: false,
        improvement_bundle_sensitivity: "high_confidence"
      }
    });
    expect(setResult.output).toContain("Improvement settings updated.");
    expect(setResult.output).toContain("automated_improvement_bundles_enabled: true");
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

  it("supports authenticated settings commands without explicit auth paths", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const createHttpClient = vi.fn().mockReturnValue({ request: vi.fn() });
    const createApi = vi.fn().mockReturnValue({
      getImprovementSettings: vi.fn().mockResolvedValue({
        access_mode: "preview",
        cloud_automation_available: true,
        settings: {
          automated_improvement_bundles_enabled: true,
          improvement_bundle_sensitivity: "balanced"
        }
      }),
      updateImprovementSettings: vi.fn().mockResolvedValue({
        access_mode: "manage",
        cloud_automation_available: true,
        settings: {
          automated_improvement_bundles_enabled: false,
          improvement_bundle_sensitivity: "verbose"
        }
      })
    });

    const result = await setImprovementSettingsWithAuthCommand(
      {
        projectId: "proj_1",
        update: { improvement_bundle_sensitivity: "verbose" },
        json: true
      },
      { readAuthState, createHttpClient, createApi }
    );

    expect(readAuthState).toHaveBeenCalledWith({});
    expect(createHttpClient).toHaveBeenCalledWith({ baseUrl: "https://selfhost.debugbundle.test" });
    expect(JSON.parse(result.output)).toEqual({
      access_mode: "manage",
      cloud_automation_available: true,
      settings: {
        automated_improvement_bundles_enabled: false,
        improvement_bundle_sensitivity: "verbose"
      }
    });
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

  it("maps invalid responses and unknown failures to exit code 1", async () => {
    const invalidResponse = await getImprovementSettingsCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1" },
      {
        getImprovementSettings: vi.fn().mockRejectedValue(new ImprovementSettingsApiError(500, "Invalid improvement settings response."))
      }
    );
    const unknownFailure = await setImprovementSettingsCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        update: { automated_improvement_bundles_enabled: true }
      },
      {
        updateImprovementSettings: vi.fn().mockRejectedValue(new Error("boom"))
      }
    );

    expect(invalidResponse).toEqual({ exitCode: 1, output: "Invalid improvement settings response." });
    expect(unknownFailure).toEqual({ exitCode: 1, output: "boom" });
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

  it("surfaces fallback and invalid-response API errors from the raw improvement settings client", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({
        status: 503,
        body: { message: "temporary outage" }
      })
      .mockResolvedValueOnce({
        status: 200,
        body: {
          access_mode: "manage"
        }
      });

    const api = createImprovementSettingsApi({ request });

    await expect(
      api.getImprovementSettings({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1"
      })
    ).rejects.toMatchObject({
      status: 503,
      message: "Failed to get improvement settings."
    });

    await expect(
      api.updateImprovementSettings({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        update: { automated_improvement_bundles_enabled: false }
      })
    ).rejects.toMatchObject({
      status: 500,
      message: "Invalid improvement settings response."
    });
  });

  it("surfaces explicit API error bodies from the raw improvement settings client", async () => {
    const request = vi.fn().mockResolvedValue({
      status: 401,
      body: { error: "invalid_member_token" }
    });

    const api = createImprovementSettingsApi({ request });

    await expect(
      api.updateImprovementSettings({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        update: { automated_improvement_bundles_enabled: false }
      })
    ).rejects.toMatchObject({
      status: 401,
      message: "invalid_member_token"
    });
  });
});
