import { describe, expect, it, vi } from "vitest";

import { CliAuthStateError } from "../../../apps/cli/src/auth-state.js";
import {
  AnalyticsSettingsApiError,
  createAnalyticsSettingsApi,
  getAnalyticsSettingsCommand,
  getAnalyticsSettingsWithAuthCommand,
  setAnalyticsSettingsCommand,
  setAnalyticsSettingsWithAuthCommand
} from "../../../apps/cli/src/analytics-settings-commands.js";

const settingsResponse = {
  access_mode: "manage",
  analytics_available: true,
  settings: {
    enabled: true,
    privacy_mode: "standard",
    consent_required: false,
    capture_page_views: true,
    capture_route_changes: true,
    capture_actions: false,
    capture_friction_signals: true,
    journey_sample_rate: 0.25,
    raw_retention_days: 1,
    sample_retention_days: 7,
    hourly_retention_days: 30,
    aggregate_retention_months: 12,
    max_saved_funnels: 3,
    max_custom_dimensions: 2,
    approved_custom_dimensions: ["account_tier", "plan"]
  }
} as const;

describe("cli analytics settings commands", () => {
  it("renders analytics settings in human and json mode", async () => {
    const human = await getAnalyticsSettingsCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1" },
      { getAnalyticsSettings: vi.fn().mockResolvedValue(settingsResponse) }
    );
    const json = await getAnalyticsSettingsCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1", json: true },
      { getAnalyticsSettings: vi.fn().mockResolvedValue(settingsResponse) }
    );

    expect(human.exitCode).toBe(0);
    expect(human.output).toContain("analytics_available: true");
    expect(human.output).toContain("privacy_mode: standard");
    expect(JSON.parse(json.output)).toEqual(settingsResponse);
  });

  it("renders update results and validates update payloads", async () => {
    const updateAnalyticsSettings = vi.fn().mockResolvedValue(settingsResponse);
    const updated = await setAnalyticsSettingsCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        update: {
          enabled: true,
          privacy_mode: "standard",
          approved_custom_dimensions: ["account_tier", "plan"]
        }
      },
      { updateAnalyticsSettings }
    );
    const invalid = await setAnalyticsSettingsCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1", update: {} },
      { updateAnalyticsSettings }
    );

    expect(updated).toMatchObject({ exitCode: 0 });
    expect(updated.output).toContain("Analytics settings updated.");
    expect(invalid).toEqual({ exitCode: 4, output: "Invalid analytics settings update." });
  });

  it("loads auth state and forwards authenticated get/set calls", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const createHttpClient = vi.fn().mockReturnValue({ request: vi.fn() });
    const getAnalyticsSettings = vi.fn().mockResolvedValue(settingsResponse);
    const updateAnalyticsSettings = vi.fn().mockResolvedValue(settingsResponse);
    const createApi = vi.fn().mockReturnValue({ getAnalyticsSettings, updateAnalyticsSettings });

    const getResult = await getAnalyticsSettingsWithAuthCommand(
      { authFilePath: "/tmp/auth.json", projectId: "proj_1", json: true },
      { readAuthState, createHttpClient, createApi }
    );
    const setResult = await setAnalyticsSettingsWithAuthCommand(
      { projectId: "proj_1", update: { enabled: true } },
      { readAuthState, createHttpClient, createApi }
    );

    expect(createHttpClient).toHaveBeenCalledWith({ baseUrl: "https://selfhost.debugbundle.test" });
    expect(getAnalyticsSettings).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: "proj_1"
    });
    expect(updateAnalyticsSettings).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: "proj_1",
      update: { enabled: true }
    });
    expect(JSON.parse(getResult.output)).toEqual(settingsResponse);
    expect(setResult.output).toContain("Analytics settings updated.");
  });

  it("maps auth and API failures to stable exit codes", async () => {
    const authMissing = await getAnalyticsSettingsWithAuthCommand(
      { projectId: "proj_1" },
      { readAuthState: vi.fn().mockRejectedValue(new CliAuthStateError("auth_state_missing", "Not logged in.")) }
    );
    const unauthorized = await getAnalyticsSettingsCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1" },
      { getAnalyticsSettings: vi.fn().mockRejectedValue(new AnalyticsSettingsApiError(401, "invalid_member_token")) }
    );
    const forbidden = await setAnalyticsSettingsCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1", update: { enabled: true } },
      { updateAnalyticsSettings: vi.fn().mockRejectedValue(new AnalyticsSettingsApiError(403, "upgrade_required")) }
    );

    expect(authMissing).toEqual({ exitCode: 2, output: "Not logged in." });
    expect(unauthorized).toEqual({ exitCode: 2, output: "invalid_member_token" });
    expect(forbidden).toEqual({ exitCode: 4, output: "upgrade_required" });
  });

  it("builds GET and PATCH requests against the analytics-settings API", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ status: 200, body: settingsResponse })
      .mockResolvedValueOnce({ status: 200, body: settingsResponse });

    const api = createAnalyticsSettingsApi({ request });
    await api.getAnalyticsSettings({ bearerToken: "dbundle_mem_x", projectId: "proj_1" });
    await api.updateAnalyticsSettings({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_1",
      update: { enabled: true }
    });

    expect(request.mock.calls[0]?.[0]).toEqual({
      method: "GET",
      path: "/v1/projects/proj_1/analytics-settings",
      bearerToken: "dbundle_mem_x"
    });
    expect(request.mock.calls[1]?.[0]).toEqual({
      method: "PATCH",
      path: "/v1/projects/proj_1/analytics-settings",
      bearerToken: "dbundle_mem_x",
      body: { enabled: true }
    });
  });

  it("surfaces raw client fallback, explicit, and invalid-response errors", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ status: 503, body: { message: "temporary outage" } })
      .mockResolvedValueOnce({ status: 401, body: { error: "invalid_member_token" } })
      .mockResolvedValueOnce({ status: 200, body: { access_mode: "manage" } });
    const api = createAnalyticsSettingsApi({ request });

    await expect(api.getAnalyticsSettings({ bearerToken: "dbundle_mem_x", projectId: "proj_1" })).rejects.toMatchObject({
      status: 503,
      message: "Failed to get analytics settings."
    });
    await expect(
      api.updateAnalyticsSettings({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        update: { enabled: true }
      })
    ).rejects.toMatchObject({ status: 401, message: "invalid_member_token" });
    await expect(api.getAnalyticsSettings({ bearerToken: "dbundle_mem_x", projectId: "proj_1" })).rejects.toMatchObject({
      status: 500,
      message: "Invalid analytics settings response."
    });
  });
});
