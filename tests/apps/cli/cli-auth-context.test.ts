import { describe, expect, it, vi } from "vitest";

import { CliAuthStateError } from "../../../apps/cli/src/auth-state.js";
import {
  createAuthenticatedBillingApi,
  createAuthenticatedAlertApi,
  createAuthenticatedRetrievalApi,
  createAuthenticatedSlackApi,
  createAuthenticatedTokenManagementApi,
  createAuthenticatedWebhookApi,
  createAuthenticatedWeeklyReportApi,
  createCliHttpClient,
  mapCliAuthErrorToResult,
  runAuthenticatedCliCommand
} from "../../../apps/cli/src/auth-context.js";

describe("cli auth context", () => {
  it("builds authenticated GET requests from stored base url", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 200,
      text: vi.fn().mockResolvedValue('{"ok":true}')
    });

    const client = createCliHttpClient(
      {
        baseUrl: "https://debugbundle.example/"
      },
      {
        fetchImpl
      }
    );

    const response = await client.request({
      method: "GET",
      path: "/v1/incidents",
      bearerToken: "dbundle_mem_saved"
    });

    expect(fetchImpl).toHaveBeenCalledWith("https://debugbundle.example/v1/incidents", {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: "Bearer dbundle_mem_saved"
      }
    });
    expect(response).toEqual({
      status: 200,
      body: {
        ok: true
      }
    });
  });

  it("serializes JSON POST bodies for authenticated local API calls", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 201,
      text: vi.fn().mockResolvedValue('{"created":true}')
    });

    const client = createCliHttpClient(
      {
        baseUrl: "https://debugbundle.example"
      },
      {
        fetchImpl
      }
    );

    const response = await client.request({
      method: "POST",
      path: "/v1/member/tokens",
      bearerToken: "dbundle_mem_saved",
      body: {
        label: "cli"
      }
    });

    expect(fetchImpl).toHaveBeenCalledWith("https://debugbundle.example/v1/member/tokens", {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: "Bearer dbundle_mem_saved",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        label: "cli"
      })
    });
    expect(response).toEqual({
      status: 201,
      body: {
        created: true
      }
    });
  });

  it("parses empty and non-json response bodies from the CLI HTTP client", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        status: 204,
        text: vi.fn().mockResolvedValue("")
      })
      .mockResolvedValueOnce({
        status: 502,
        text: vi.fn().mockResolvedValue("upstream failure")
      });

    const client = createCliHttpClient(
      {
        baseUrl: "https://debugbundle.example/"
      },
      {
        fetchImpl
      }
    );

    const emptyResponse = await client.request({
      method: "GET",
      path: "/v1/health",
      bearerToken: "dbundle_mem_saved"
    });
    const textResponse = await client.request({
      method: "GET",
      path: "/v1/health",
      bearerToken: "dbundle_mem_saved"
    });

    expect(emptyResponse).toEqual({
      status: 204,
      body: null
    });
    expect(textResponse).toEqual({
      status: 502,
      body: "upstream failure"
    });
  });

  it("runs CLI commands through stored auth state with shared wrapper plumbing", async () => {
    const createApi = vi.fn().mockResolvedValue({
      authState: {
        bearer_token: "dbundle_mem_saved",
        base_url: "https://selfhost.debugbundle.test"
      },
      api: {
        listServices: vi.fn()
      }
    });
    const runCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "ok"
    });

    const result = await runAuthenticatedCliCommand(
      {
        authFilePath: "/tmp/auth.json"
      },
      {
        createApi,
        dependencies: undefined,
        runCommand
      }
    );

    expect(createApi).toHaveBeenCalledWith(
      {
        authFilePath: "/tmp/auth.json"
      },
      undefined
    );
    expect(runCommand).toHaveBeenCalledTimes(1);
    const [authStateArg, apiArg] = runCommand.mock.calls[0] as [
      { bearer_token: string; base_url: string },
      { listServices: () => void }
    ];
    expect(authStateArg).toEqual({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    expect(typeof apiArg.listServices).toBe("function");
    expect(result).toEqual({
      exitCode: 0,
      output: "ok"
    });
  });

  it("maps stored auth errors to CLI auth/config failures in the shared wrapper", async () => {
    const result = await runAuthenticatedCliCommand(
      {
        authFilePath: "/tmp/auth.json"
      },
      {
        createApi: vi.fn().mockRejectedValue(new CliAuthStateError("auth_state_missing", "Not logged in.")),
        dependencies: undefined,
        runCommand: vi.fn()
      }
    );

    expect(result).toEqual({
      exitCode: 2,
      output: "Not logged in."
    });
  });

  it("maps non-auth wrapper errors to exit code 1 and leaves unrelated errors unmapped", async () => {
    const wrapperResult = await runAuthenticatedCliCommand(
      {
        authFilePath: "/tmp/auth.json"
      },
      {
        createApi: vi.fn().mockRejectedValue(new Error("network_down")),
        dependencies: undefined,
        runCommand: vi.fn()
      }
    );

    expect(wrapperResult).toEqual({
      exitCode: 1,
      output: "network_down"
    });
    expect(mapCliAuthErrorToResult(new Error("network_down"))).toBeNull();
  });

  it("creates authenticated retrieval APIs with injected fetch transport and default auth path input", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test/"
    });
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 200,
      text: vi.fn().mockResolvedValue('{"incidents":[],"next_cursor":null}')
    });

    const { authState, api } = await createAuthenticatedRetrievalApi(
      {},
      {
        readAuthState,
        fetchImpl
      }
    );

    const response = await api.listIncidents({
      bearerToken: "dbundle_mem_saved"
    });

    expect(readAuthState).toHaveBeenCalledWith({});
    expect(fetchImpl).toHaveBeenCalledWith("https://selfhost.debugbundle.test/v1/incidents", {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: "Bearer dbundle_mem_saved"
      }
    });
    expect(authState).toEqual({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test/"
    });
    expect(response).toEqual({
      incidents: [],
      next_cursor: null
    });
  });

  it("creates authenticated token management APIs with explicit auth file and custom client factory", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const httpClient = { request: vi.fn() };
    const createHttpClient = vi.fn().mockReturnValue(httpClient);
    const listMemberTokens = vi.fn().mockResolvedValue([{ token_id: "mtok_1", label: "cli", revoked_at: null }]);
    const createApi = vi.fn().mockReturnValue({
      listProjectTokens: vi.fn(),
      createProjectToken: vi.fn(),
      revokeProjectToken: vi.fn(),
      listMemberTokens,
      createMemberToken: vi.fn(),
      revokeMemberToken: vi.fn()
    });

    const { authState, api } = await createAuthenticatedTokenManagementApi(
      {
        authFilePath: "/tmp/auth.json"
      },
      {
        readAuthState,
        createHttpClient,
        createApi
      }
    );

    const tokens = await api.listMemberTokens({
      bearerToken: "dbundle_mem_saved"
    });

    expect(readAuthState).toHaveBeenCalledWith({
      authFilePath: "/tmp/auth.json"
    });
    expect(createHttpClient).toHaveBeenCalledWith({
      baseUrl: "https://selfhost.debugbundle.test"
    });
    expect(createApi).toHaveBeenCalledWith(httpClient);
    expect(authState).toEqual({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    expect(tokens).toEqual([{ token_id: "mtok_1", label: "cli", revoked_at: null }]);
  });

  it("creates authenticated billing APIs with explicit auth file and custom client factory", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const httpClient = { request: vi.fn() };
    const createHttpClient = vi.fn().mockReturnValue(httpClient);
    const getBillingSummary = vi.fn().mockResolvedValue({ plan: "solo" });
    const createApi = vi.fn().mockReturnValue({
      getBillingSummary,
      increaseProjectSlots: vi.fn(),
      scheduleProjectSlotReduction: vi.fn(),
      cancelProjectSlotReduction: vi.fn()
    });

    const { authState, api } = await createAuthenticatedBillingApi(
      {
        authFilePath: "/tmp/auth.json"
      },
      {
        readAuthState,
        createHttpClient,
        createApi
      }
    );

    await api.getBillingSummary({
      bearerToken: "dbundle_mem_saved"
    });

    expect(readAuthState).toHaveBeenCalledWith({ authFilePath: "/tmp/auth.json" });
    expect(createHttpClient).toHaveBeenCalledWith({
      baseUrl: "https://selfhost.debugbundle.test"
    });
    expect(getBillingSummary).toHaveBeenCalledWith({ bearerToken: "dbundle_mem_saved" });
    expect(authState).toEqual({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
  });

  it("creates authenticated alert, webhook, slack, and weekly report APIs with injected factories", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test/"
    });
    const createHttpClient = vi.fn().mockReturnValue({ request: vi.fn() });
    const createAlertApi = vi.fn().mockReturnValue({ listAlerts: vi.fn().mockResolvedValue([]) });
    const createWebhookApi = vi.fn().mockReturnValue({ listWebhooks: vi.fn().mockResolvedValue([]) });
    const createSlackApi = vi.fn().mockReturnValue({ listSlackDestinations: vi.fn().mockResolvedValue([]) });
    const createWeeklyReportApi = vi.fn().mockReturnValue({
      listWeeklyReportChannels: vi.fn().mockResolvedValue([])
    });

    const alertResult = await createAuthenticatedAlertApi(
      {
        authFilePath: "/tmp/auth.json"
      },
      {
        readAuthState,
        createHttpClient,
        createApi: createAlertApi
      }
    );
    const webhookResult = await createAuthenticatedWebhookApi(
      {},
      {
        readAuthState,
        createHttpClient,
        createApi: createWebhookApi
      }
    );
    const slackResult = await createAuthenticatedSlackApi(
      {},
      {
        readAuthState,
        createHttpClient,
        createApi: createSlackApi
      }
    );
    const weeklyReportResult = await createAuthenticatedWeeklyReportApi(
      {},
      {
        readAuthState,
        createHttpClient,
        createApi: createWeeklyReportApi
      }
    );

    expect(alertResult.authState.base_url).toBe("https://selfhost.debugbundle.test/");
    expect(webhookResult.authState.bearer_token).toBe("dbundle_mem_saved");
    expect(slackResult.authState.bearer_token).toBe("dbundle_mem_saved");
    expect(weeklyReportResult.authState.bearer_token).toBe("dbundle_mem_saved");
    expect(createHttpClient).toHaveBeenCalledWith({ baseUrl: "https://selfhost.debugbundle.test/" });
    expect(createAlertApi).toHaveBeenCalled();
    expect(createWebhookApi).toHaveBeenCalled();
    expect(createSlackApi).toHaveBeenCalled();
    expect(createWeeklyReportApi).toHaveBeenCalled();
  });

  it("uses default HTTP client wiring for webhook and weekly report APIs when only fetch is injected", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test/"
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        text: vi.fn().mockResolvedValue('{"webhooks":[]}')
      })
      .mockResolvedValueOnce({
        status: 200,
        text: vi.fn().mockResolvedValue('{"channels":[]}')
      });

    const { api: webhookApi } = await createAuthenticatedWebhookApi(
      {},
      {
        readAuthState,
        fetchImpl
      }
    );
    const { api: weeklyReportApi } = await createAuthenticatedWeeklyReportApi(
      {},
      {
        readAuthState,
        fetchImpl
      }
    );

    await expect(webhookApi.listWebhooks({ bearerToken: "dbundle_mem_saved", projectId: "proj_1" })).resolves.toEqual([]);
    await expect(
      weeklyReportApi.listWeeklyReportChannels({ bearerToken: "dbundle_mem_saved", projectId: "proj_1" })
    ).resolves.toEqual([]);
    expect(fetchImpl).toHaveBeenCalledWith("https://selfhost.debugbundle.test/v1/webhooks?project_id=proj_1", expect.any(Object));
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://selfhost.debugbundle.test/v1/weekly-report-channels?project_id=proj_1",
      expect.any(Object)
    );
  });
});
