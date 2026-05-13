import { afterEach, describe, expect, it, vi } from "vitest";

import { createApiServer } from "../../../apps/api/src/server.ts";
import { encryptIntegrationSecret } from "../../../packages/storage/src/index.ts";
import { mockedObject, type MockedMethods } from "../../helpers/vitest.ts";

type ApiServerDependencies = Parameters<typeof createApiServer>[0];
type MemberAuthDependency = MockedMethods<ApiServerDependencies["memberAuth"]>;
type SlackManagementDependency = MockedMethods<NonNullable<ApiServerDependencies["slackManagement"]>>;
type BillingManagementDependency = MockedMethods<NonNullable<ApiServerDependencies["billingManagement"]>>;
const slackDestinationId = "11111111-1111-4111-8111-111111111111";

function createServer(overrides: {
  memberAuth?: MemberAuthDependency | undefined;
  slackManagement?: SlackManagementDependency | undefined;
  billingManagement?: BillingManagementDependency | undefined;
} = {}): ReturnType<typeof createApiServer> {
  return createApiServer({
    ingestionPersistence: {
      persistAndEnqueue: vi.fn()
    },
    ingestionMetadata: {
      resolveProjectByTokenHash: vi.fn()
    },
    memberAuth:
      overrides.memberAuth ??
      mockedObject<ApiServerDependencies["memberAuth"]>({
        resolveMemberByTokenHash: vi
          .fn()
          .mockResolvedValue({ member_id: "usr_123", organization_id: "org_123", role: "owner" })
      }),
    tokenManagement: mockedObject<ApiServerDependencies["tokenManagement"]>({
      listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
      createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
      createMemberTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
    }),
    incidentRetrieval: {
      listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
      getIncidentForOrganization: vi.fn().mockResolvedValue(null),
      listIncidentLogsForOrganization: vi.fn().mockResolvedValue([]),
      listServicesForOrganization: vi.fn().mockResolvedValue([])
    },
    objectStoreReader: {
      getObject: vi.fn()
    },
    webhookDelivery: {
      listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] })
    },
    billingManagement:
      overrides.billingManagement ??
      mockedObject<NonNullable<ApiServerDependencies["billingManagement"]>>({
        getBillingSummaryForOrganization: vi.fn().mockResolvedValue({ plan: "team" })
      }),
    slackManagement:
      overrides.slackManagement ??
      mockedObject<NonNullable<ApiServerDependencies["slackManagement"]>>({
        listSlackDestinationsForProjectInOrganization: vi.fn().mockResolvedValue([]),
        getSlackDestinationForOrganization: vi.fn().mockResolvedValue(null),
        getSlackDestinationSecretForOrganization: vi.fn().mockResolvedValue(null),
        upsertSlackDestinationForOrganization: vi.fn().mockResolvedValue({
          slack_destination_id: slackDestinationId
        }),
        deleteSlackDestinationForProjectInOrganization: vi.fn().mockResolvedValue(null)
      })
  });
}

describe("api slack routes", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it("returns a signed Slack install URL for owner callers on team tier", async () => {
    process.env["SLACK_CLIENT_ID"] = "111.222";
    process.env["SLACK_CLIENT_SECRET"] = "secret";
    process.env["SLACK_OAUTH_CALLBACK_URL"] = "https://api.debugbundle.com/v1/slack/app/callback";
    process.env["SLACK_OAUTH_STATE_SECRET"] = "slack-state-secret";

    const slackManagement = mockedObject<NonNullable<ApiServerDependencies["slackManagement"]>>({
      listSlackDestinationsForProjectInOrganization: vi.fn().mockResolvedValue([]),
      getSlackDestinationForOrganization: vi.fn().mockResolvedValue(null),
      getSlackDestinationSecretForOrganization: vi.fn().mockResolvedValue(null),
      upsertSlackDestinationForOrganization: vi.fn().mockResolvedValue({ slack_destination_id: slackDestinationId }),
      deleteSlackDestinationForProjectInOrganization: vi.fn().mockResolvedValue(null)
    });
    const app = createServer({ slackManagement });

    const response = await app.inject({
      method: "GET",
      url: "/v1/slack/app/install-url?project_id=00000000-0000-4000-8000-000000000001&return_to=%2Fprojects%2Fproj_123%2Falerts",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ install_url: string }>().install_url).toContain("https://slack.com/oauth/v2/authorize");
    expect(response.headers["set-cookie"]).toContain("dbundle_slack_app_install_state=");
  });

  it("completes the Slack callback, stores the destination, and redirects back to the alerts page", async () => {
    process.env["APP_BASE_URL"] = "https://app.debugbundle.com";
    process.env["SLACK_CLIENT_ID"] = "111.222";
    process.env["SLACK_CLIENT_SECRET"] = "secret";
    process.env["SLACK_OAUTH_CALLBACK_URL"] = "https://api.debugbundle.com/v1/slack/app/callback";
    process.env["SLACK_OAUTH_STATE_SECRET"] = "slack-state-secret";
    process.env["INTEGRATION_SECRET_ENCRYPTION_KEY"] = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

    const slackManagement = mockedObject<NonNullable<ApiServerDependencies["slackManagement"]>>({
      listSlackDestinationsForProjectInOrganization: vi.fn().mockResolvedValue([]),
      getSlackDestinationForOrganization: vi.fn().mockResolvedValue(null),
      getSlackDestinationSecretForOrganization: vi.fn().mockResolvedValue(null),
      upsertSlackDestinationForOrganization: vi.fn().mockResolvedValue({
        slack_destination_id: slackDestinationId,
        organization_id: "org_123",
        slack_team_id: "T123",
        slack_team_name: "Acme",
        slack_channel_id: "C123",
        slack_channel_name: "#alerts",
        installed_by_member_id: "usr_123",
        is_active: true,
        created_at: "2026-05-13T10:00:00.000Z",
        updated_at: "2026-05-13T10:00:00.000Z"
      }),
      deleteSlackDestinationForProjectInOrganization: vi.fn().mockResolvedValue(null)
    });
    const app = createServer({ slackManagement });

    const installUrlResponse = await app.inject({
      method: "GET",
      url: "/v1/slack/app/install-url?project_id=00000000-0000-4000-8000-000000000001&return_to=%2Fprojects%2Fproj_123%2Falerts",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });
    const installUrl = new URL(installUrlResponse.json<{ install_url: string }>().install_url);
    const state = installUrl.searchParams.get("state");
    if (state === null) {
      throw new Error("Expected Slack install state");
    }

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          ok: true,
          access_token: "xoxb-test",
          team: { id: "T123", name: "Acme" },
          incoming_webhook: {
            channel: "#alerts",
            channel_id: "C123",
            url: "https://hooks.slack.com/services/T/B/X"
          }
        })
      })
    );

    const callback = await app.inject({
      method: "GET",
      url: `/v1/slack/app/callback?code=slack-code&state=${encodeURIComponent(state)}`,
      headers: {
        cookie: Array.isArray(installUrlResponse.headers["set-cookie"])
          ? installUrlResponse.headers["set-cookie"][0]
          : installUrlResponse.headers["set-cookie"] ?? ""
      }
    });

    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toBe(
      `https://app.debugbundle.com/projects/proj_123/alerts?slack_connect=success&slack_destination_id=${slackDestinationId}`
    );
    expect(slackManagement.upsertSlackDestinationForOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org_123",
        slack_team_id: "T123",
        slack_channel_id: "C123"
      })
    );
  });

  it("lists connected Slack destinations for the scoped project", async () => {
    const slackManagement = mockedObject<NonNullable<ApiServerDependencies["slackManagement"]>>({
      listSlackDestinationsForProjectInOrganization: vi.fn().mockResolvedValue([
        {
          slack_destination_id: slackDestinationId,
          organization_id: "org_123",
          slack_team_id: "T123",
          slack_team_name: "Acme",
          slack_channel_id: "C123",
          slack_channel_name: "#alerts",
          installed_by_member_id: "usr_123",
          is_active: true,
          created_at: "2026-05-13T10:00:00.000Z",
          updated_at: "2026-05-13T10:00:00.000Z"
        }
      ]),
      getSlackDestinationForOrganization: vi.fn().mockResolvedValue(null),
      getSlackDestinationSecretForOrganization: vi.fn().mockResolvedValue(null),
      upsertSlackDestinationForOrganization: vi.fn().mockResolvedValue({ slack_destination_id: slackDestinationId }),
      deleteSlackDestinationForProjectInOrganization: vi.fn().mockResolvedValue(null)
    });
    const app = createServer({ slackManagement });

    const response = await app.inject({
      method: "GET",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/slack/destinations",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      destinations: [
        expect.objectContaining({
          slack_destination_id: slackDestinationId,
          slack_channel_name: "#alerts"
        })
      ]
    });
  });

  it("tests and protects connected Slack destinations through the project route family", async () => {
    process.env["INTEGRATION_SECRET_ENCRYPTION_KEY"] = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const webhookCiphertext = encryptIntegrationSecret(
      "https://hooks.slack.com/services/T/B/X",
      process.env["INTEGRATION_SECRET_ENCRYPTION_KEY"]
    );

    const slackManagement = mockedObject<NonNullable<ApiServerDependencies["slackManagement"]>>({
      listSlackDestinationsForProjectInOrganization: vi.fn().mockResolvedValue([]),
      getSlackDestinationForOrganization: vi.fn().mockResolvedValue(null),
      getSlackDestinationSecretForOrganization: vi
        .fn()
        .mockResolvedValueOnce({
          webhook_url_ciphertext: webhookCiphertext
        })
        .mockResolvedValueOnce({
          webhook_url_ciphertext: webhookCiphertext
        }),
      upsertSlackDestinationForOrganization: vi.fn().mockResolvedValue({ slack_destination_id: slackDestinationId }),
      deleteSlackDestinationForProjectInOrganization: vi
        .fn()
        .mockResolvedValueOnce("destination_in_use")
        .mockResolvedValueOnce({ slack_destination_id: slackDestinationId })
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true
      })
    );
    const app = createServer({ slackManagement });

    const inUseDelete = await app.inject({
      method: "DELETE",
      url: `/v1/projects/00000000-0000-4000-8000-000000000001/slack/destinations/${slackDestinationId}`,
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });
    const testResponse = await app.inject({
      method: "POST",
      url: `/v1/projects/00000000-0000-4000-8000-000000000001/slack/destinations/${slackDestinationId}/test`,
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });
    const deleted = await app.inject({
      method: "DELETE",
      url: `/v1/projects/00000000-0000-4000-8000-000000000001/slack/destinations/${slackDestinationId}`,
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(inUseDelete.statusCode).toBe(409);
    expect(inUseDelete.json()).toEqual({ error: "slack_destination_in_use" });
    expect(testResponse.statusCode).toBe(200);
    expect(testResponse.json()).toEqual({ delivered: true });
    expect(deleted.statusCode).toBe(204);
  });

  it("surfaces Slack delivery failures from the test route", async () => {
    process.env["INTEGRATION_SECRET_ENCRYPTION_KEY"] = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const webhookCiphertext = encryptIntegrationSecret(
      "https://hooks.slack.com/services/T/B/X",
      process.env["INTEGRATION_SECRET_ENCRYPTION_KEY"]
    );

    const slackManagement = mockedObject<NonNullable<ApiServerDependencies["slackManagement"]>>({
      listSlackDestinationsForProjectInOrganization: vi.fn().mockResolvedValue([]),
      getSlackDestinationForOrganization: vi.fn().mockResolvedValue(null),
      getSlackDestinationSecretForOrganization: vi.fn().mockResolvedValue({
        webhook_url_ciphertext: webhookCiphertext
      }),
      upsertSlackDestinationForOrganization: vi.fn().mockResolvedValue({ slack_destination_id: slackDestinationId }),
      deleteSlackDestinationForProjectInOrganization: vi.fn().mockResolvedValue(null)
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: vi.fn().mockResolvedValue("channel_not_found")
      })
    );
    const app = createServer({ slackManagement });

    const response = await app.inject({
      method: "POST",
      url: `/v1/projects/00000000-0000-4000-8000-000000000001/slack/destinations/${slackDestinationId}/test`,
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ error: "slack_destination_unavailable" });
  });

  it("rejects non-team Slack management and invalid callback state", async () => {
    process.env["APP_BASE_URL"] = "https://app.debugbundle.com";
    process.env["SLACK_CLIENT_ID"] = "111.222";
    process.env["SLACK_CLIENT_SECRET"] = "secret";
    process.env["SLACK_OAUTH_CALLBACK_URL"] = "https://api.debugbundle.com/v1/slack/app/callback";
    process.env["SLACK_OAUTH_STATE_SECRET"] = "slack-state-secret";

    const app = createServer({
      billingManagement: mockedObject<NonNullable<ApiServerDependencies["billingManagement"]>>({
        getBillingSummaryForOrganization: vi.fn().mockResolvedValue({ plan: "solo" })
      })
    });

    const upgradeRequired = await app.inject({
      method: "GET",
      url: "/v1/slack/app/install-url?project_id=00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });
    const invalidState = await app.inject({
      method: "GET",
      url: "/v1/slack/app/callback?code=slack-code&state=invalid",
      headers: {
        cookie: "dbundle_slack_app_install_state=invalid"
      }
    });

    expect(upgradeRequired.statusCode).toBe(403);
    expect(upgradeRequired.json()).toEqual({ error: "upgrade_required" });
    expect(invalidState.statusCode).toBe(302);
    expect(invalidState.headers.location).toBe("https://app.debugbundle.com/projects?slack_connect=error");
  });
});
