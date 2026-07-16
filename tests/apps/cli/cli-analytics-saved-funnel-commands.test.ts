import { describe, expect, it, vi } from "vitest";

import {
  AnalyticsSavedFunnelApiError,
  archiveAnalyticsSavedFunnelCommand,
  archiveAnalyticsSavedFunnelWithAuthCommand,
  createAnalyticsSavedFunnelApi,
  createAnalyticsSavedFunnelCommand,
  createAnalyticsSavedFunnelWithAuthCommand,
  listAnalyticsSavedFunnelsCommand,
  listAnalyticsSavedFunnelsWithAuthCommand,
  updateAnalyticsSavedFunnelCommand,
  updateAnalyticsSavedFunnelWithAuthCommand
} from "../../../apps/cli/src/analytics-saved-funnel-commands.js";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const FUNNEL = {
  project_id: PROJECT_ID,
  funnel_key: "signup",
  display_name: "Signup",
  steps: [
    { step_key: "landing", display_name: "Landing" },
    { step_key: "complete", display_name: "Complete" }
  ],
  created_at: "2026-07-11T10:00:00.000Z",
  updated_at: "2026-07-11T10:00:00.000Z",
  archived_at: null
};

describe("analytics saved funnel CLI commands", () => {
  it("uses the project-scoped API paths and validates responses", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, body: { funnels: [FUNNEL] } })
      .mockResolvedValueOnce({ status: 201, body: { funnel: FUNNEL } })
      .mockResolvedValueOnce({
        status: 200,
        body: { funnel: { ...FUNNEL, display_name: "Onboarding" } }
      })
      .mockResolvedValueOnce({
        status: 200,
        body: { funnel: { ...FUNNEL, archived_at: "2026-07-11T11:00:00.000Z" } }
      });
    const api = createAnalyticsSavedFunnelApi({ request });

    await api.list({ bearerToken: "member-token", projectId: PROJECT_ID });
    await api.create({
      bearerToken: "member-token",
      projectId: PROJECT_ID,
      definition: {
        funnel_key: FUNNEL.funnel_key,
        display_name: FUNNEL.display_name,
        steps: FUNNEL.steps
      }
    });
    await api.update({
      bearerToken: "member-token",
      projectId: PROJECT_ID,
      funnelKey: "signup",
      update: { display_name: "Onboarding" }
    });
    await api.archive({ bearerToken: "member-token", projectId: PROJECT_ID, funnelKey: "signup" });

    const collectionPath = `/v1/projects/${PROJECT_ID}/analytics/saved-funnels`;
    expect(request).toHaveBeenNthCalledWith(1, {
      method: "GET",
      path: collectionPath,
      bearerToken: "member-token"
    });
    expect(request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: "POST",
        path: collectionPath,
        body: expect.objectContaining({ funnel_key: "signup" })
      })
    );
    expect(request).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        method: "PATCH",
        path: `${collectionPath}/signup`,
        body: { display_name: "Onboarding" }
      })
    );
    expect(request).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        method: "DELETE",
        path: `${collectionPath}/signup`
      })
    );
  });

  it("renders list and mutation results in text or JSON", async () => {
    await expect(
      listAnalyticsSavedFunnelsCommand(
        { bearerToken: "token", projectId: PROJECT_ID },
        { list: vi.fn().mockResolvedValue({ funnels: [FUNNEL] }) }
      )
    ).resolves.toMatchObject({
      exitCode: 0,
      output: expect.stringContaining("funnel_key: signup")
    });

    await expect(
      createAnalyticsSavedFunnelCommand(
        {
          bearerToken: "token",
          projectId: PROJECT_ID,
          definition: {
            funnel_key: "signup",
            display_name: "Signup",
            steps: FUNNEL.steps
          },
          json: true
        },
        { create: vi.fn().mockResolvedValue(FUNNEL) }
      )
    ).resolves.toEqual({ exitCode: 0, output: JSON.stringify(FUNNEL) });
  });

  it("rejects malformed definitions and empty updates before calling the API", async () => {
    const create = vi.fn();
    const update = vi.fn();

    await expect(
      createAnalyticsSavedFunnelCommand(
        {
          bearerToken: "token",
          projectId: PROJECT_ID,
          definition: {
            funnel_key: "signup",
            display_name: "Signup",
            steps: [{ step_key: "only", display_name: "Only" }]
          }
        },
        { create }
      )
    ).resolves.toEqual({ exitCode: 4, output: "Invalid saved funnel definition." });
    await expect(
      updateAnalyticsSavedFunnelCommand(
        { bearerToken: "token", projectId: PROJECT_ID, funnelKey: "signup", update: {} },
        { update }
      )
    ).resolves.toEqual({ exitCode: 4, output: "Invalid saved funnel update." });
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("maps archive authorization, not-found, and conflict errors to stable exits", async () => {
    for (const [status, exitCode] of [
      [401, 2],
      [404, 3],
      [409, 4]
    ] as const) {
      await expect(
        archiveAnalyticsSavedFunnelCommand(
          { bearerToken: "token", projectId: PROJECT_ID, funnelKey: "signup" },
          { archive: vi.fn().mockRejectedValue(new AnalyticsSavedFunnelApiError(status, "failed")) }
        )
      ).resolves.toEqual({ exitCode, output: "failed" });
    }
  });

  it("rejects API error payloads and invalid successful responses", async () => {
    const apiError = createAnalyticsSavedFunnelApi({
      request: vi.fn().mockResolvedValue({ status: 403, body: { error: "forbidden" } })
    });
    const fallbackError = createAnalyticsSavedFunnelApi({
      request: vi.fn().mockResolvedValue({ status: 500, body: null })
    });
    const invalidList = createAnalyticsSavedFunnelApi({
      request: vi.fn().mockResolvedValue({ status: 200, body: { funnels: "invalid" } })
    });
    const invalidMutation = createAnalyticsSavedFunnelApi({
      request: vi.fn().mockResolvedValue({ status: 201, body: { funnel: null } })
    });

    await expect(apiError.list({ bearerToken: "token", projectId: PROJECT_ID })).rejects.toThrow(
      "forbidden"
    );
    await expect(
      listAnalyticsSavedFunnelsCommand(
        { bearerToken: "token", projectId: PROJECT_ID },
        fallbackError
      )
    ).resolves.toEqual({ exitCode: 1, output: "Failed to list saved analytics funnels." });
    await expect(invalidList.list({ bearerToken: "token", projectId: PROJECT_ID })).rejects.toThrow(
      "Invalid saved analytics funnel list response."
    );
    await expect(
      invalidMutation.create({
        bearerToken: "token",
        projectId: PROJECT_ID,
        definition: {
          funnel_key: "signup",
          display_name: "Signup",
          steps: FUNNEL.steps
        }
      })
    ).rejects.toThrow("Invalid saved analytics funnel response.");
  });

  it("updates valid definitions with text output", async () => {
    await expect(
      updateAnalyticsSavedFunnelCommand(
        {
          bearerToken: "token",
          projectId: PROJECT_ID,
          funnelKey: "signup",
          update: { display_name: "Onboarding" }
        },
        { update: vi.fn().mockResolvedValue({ ...FUNNEL, display_name: "Onboarding" }) }
      )
    ).resolves.toMatchObject({
      exitCode: 0,
      output: expect.stringContaining("Saved analytics funnel updated.")
    });
  });

  it("runs every lifecycle command through stored authentication", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "stored-token",
      base_url: "https://api.example.test"
    });
    const api = {
      list: vi.fn().mockResolvedValue({ funnels: [] }),
      create: vi.fn().mockResolvedValue(FUNNEL),
      update: vi.fn().mockResolvedValue({ ...FUNNEL, display_name: "Onboarding" }),
      archive: vi.fn().mockResolvedValue({
        ...FUNNEL,
        archived_at: "2026-07-11T11:00:00.000Z"
      })
    };
    const dependencies = {
      readAuthState,
      createHttpClient: vi.fn().mockReturnValue({ request: vi.fn() }),
      createApi: vi.fn().mockReturnValue(api)
    };

    await expect(
      createAnalyticsSavedFunnelWithAuthCommand(
        {
          projectId: PROJECT_ID,
          authFilePath: "/tmp/auth.json",
          definition: {
            funnel_key: "signup",
            display_name: "Signup",
            steps: FUNNEL.steps
          }
        },
        dependencies
      )
    ).resolves.toMatchObject({ exitCode: 0 });
    await expect(
      updateAnalyticsSavedFunnelWithAuthCommand(
        {
          projectId: PROJECT_ID,
          funnelKey: "signup",
          update: { display_name: "Onboarding" }
        },
        dependencies
      )
    ).resolves.toMatchObject({ exitCode: 0 });
    await expect(
      archiveAnalyticsSavedFunnelWithAuthCommand(
        { projectId: PROJECT_ID, funnelKey: "signup" },
        dependencies
      )
    ).resolves.toMatchObject({ exitCode: 0 });

    expect(readAuthState).toHaveBeenCalledWith({ authFilePath: "/tmp/auth.json" });
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ bearerToken: "stored-token" }));
    expect(api.update).toHaveBeenCalledWith(expect.objectContaining({ bearerToken: "stored-token" }));
    expect(api.archive).toHaveBeenCalledWith(expect.objectContaining({ bearerToken: "stored-token" }));
  });

  it("uses the default HTTP client when only fetch is injected", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ funnels: [] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    await expect(
      listAnalyticsSavedFunnelsWithAuthCommand(
        { projectId: PROJECT_ID, json: true },
        {
          readAuthState: vi.fn().mockResolvedValue({
            bearer_token: "stored-token",
            base_url: "https://api.example.test"
          }),
          fetchImpl
        }
      )
    ).resolves.toEqual({ exitCode: 0, output: JSON.stringify({ funnels: [] }) });
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://api.example.test/v1/projects/${PROJECT_ID}/analytics/saved-funnels`,
      expect.objectContaining({ method: "GET" })
    );
  });
});
