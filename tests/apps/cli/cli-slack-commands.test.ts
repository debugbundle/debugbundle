import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import { CliAuthStateError } from "../../../apps/cli/src/auth-state.js";
import {
  deleteSlackDestinationCommand,
  deleteSlackDestinationWithAuthCommand,
  getSlackConnectUrlCommand,
  getSlackConnectUrlWithAuthCommand,
  listSlackDestinationsCommand,
  listSlackDestinationsWithAuthCommand,
  testSlackDestinationCommand,
  testSlackDestinationWithAuthCommand
} from "../../../apps/cli/src/slack-commands.js";
import { SlackApiError } from "../../../packages/slack-client/src/index.js";

const SlackListOutputSchema = z
  .object({
    destinations: z.array(z.object({ slack_destination_id: z.string() }).passthrough())
  })
  .strict();

describe("cli slack commands", () => {
  it("renders slack destination list output in human mode", async () => {
    const result = await listSlackDestinationsCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1"
      },
      {
        listSlackDestinations: vi.fn().mockResolvedValue([
          {
            slack_destination_id: "sd_1",
            organization_id: "org_1",
            slack_team_id: "T1",
            slack_team_name: "Acme",
            slack_channel_id: "C1",
            slack_channel_name: "#alerts",
            installed_by_member_id: "usr_1",
            is_active: true,
            created_at: "2026-05-13T10:00:00.000Z",
            updated_at: "2026-05-13T10:00:00.000Z"
          }
        ])
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("sd_1 | active | Acme | #alerts");
  });

  it("formats remaining slack command outputs and json branches", async () => {
    const listResult = await listSlackDestinationsCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        json: true
      },
      {
        listSlackDestinations: vi.fn().mockResolvedValue([{ slack_destination_id: "sd_1" }])
      }
    );
    const connectUrlResult = await getSlackConnectUrlCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        returnTo: "/projects/proj_1/alerts"
      },
      {
        getSlackInstallUrl: vi.fn().mockResolvedValue("https://slack.com/oauth/v2/authorize?client_id=1")
      }
    );
    const testResult = await testSlackDestinationCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        destinationId: "sd_1",
        json: true
      },
      {
        testSlackDestination: vi.fn().mockResolvedValue({ delivered: true })
      }
    );
    const deleteResult = await deleteSlackDestinationCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        destinationId: "sd_1"
      },
      {
        deleteSlackDestination: vi.fn().mockResolvedValue({ slack_destination_id: "sd_1" })
      }
    );

    expect(SlackListOutputSchema.parse(JSON.parse(listResult.output))).toEqual({
      destinations: [{ slack_destination_id: "sd_1" }]
    });
    expect(connectUrlResult.output).toBe("https://slack.com/oauth/v2/authorize?client_id=1");
    expect(JSON.parse(testResult.output)).toEqual({ delivery: { delivered: true } });
    expect(deleteResult.output).toBe("Slack destination deleted: sd_1");
  });

  it("loads stored auth state and forwards it into slack commands", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const createHttpClient = vi.fn().mockReturnValue({ request: vi.fn() });
    const createSlackApi = vi.fn().mockReturnValue({
      listSlackDestinations: vi.fn().mockResolvedValue([]),
      getSlackInstallUrl: vi.fn().mockResolvedValue("https://slack.com/oauth/v2/authorize?client_id=1"),
      testSlackDestination: vi.fn().mockResolvedValue({ delivered: true }),
      deleteSlackDestination: vi.fn().mockResolvedValue({ slack_destination_id: "sd_1" })
    });

    await listSlackDestinationsWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        projectId: "proj_1"
      },
      {
        readAuthState,
        createHttpClient,
        createApi: createSlackApi
      }
    );
    await getSlackConnectUrlWithAuthCommand(
      {
        projectId: "proj_1"
      },
      {
        readAuthState,
        createHttpClient,
        createApi: createSlackApi
      }
    );
    await testSlackDestinationWithAuthCommand(
      {
        projectId: "proj_1",
        destinationId: "sd_1"
      },
      {
        readAuthState,
        createHttpClient,
        createApi: createSlackApi
      }
    );
    await deleteSlackDestinationWithAuthCommand(
      {
        projectId: "proj_1",
        destinationId: "sd_1"
      },
      {
        readAuthState,
        createHttpClient,
        createApi: createSlackApi
      }
    );

    expect(createHttpClient).toHaveBeenCalledWith({ baseUrl: "https://selfhost.debugbundle.test" });
    expect(createSlackApi).toHaveBeenCalled();
  });

  it("maps auth and api errors for slack commands", async () => {
    const authResult = await listSlackDestinationsWithAuthCommand(
      {
        projectId: "proj_1"
      },
      {
        readAuthState: vi.fn().mockRejectedValue(new CliAuthStateError("auth_state_missing", "Not logged in."))
      }
    );
    const apiResult = await testSlackDestinationCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        destinationId: "sd_1"
      },
      {
        testSlackDestination: vi.fn().mockRejectedValue(new SlackApiError(403, "upgrade_required"))
      }
    );

    expect(authResult.exitCode).toBe(2);
    expect(authResult.output).toBe("Not logged in.");
    expect(apiResult.exitCode).toBe(4);
    expect(apiResult.output).toContain("slack_api_error: 403:upgrade_required".replace(": ", ":"));
  });
});
