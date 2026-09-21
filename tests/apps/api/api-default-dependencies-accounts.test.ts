import { describe, expect, it, vi } from "vitest";
import { createPostgresAccountStoreMock } from "../../helpers/api-default-dependency-mocks.js";
import { gzipSync } from "node:zlib";
import { createApiDependencies } from "../../../apps/api/src/default-dependencies.ts";

describe("api-default-dependency-mocks accounts", () => {
  it("should enrich account exports with stored artifacts and error fallbacks", async (): Promise<void> => {
    createPostgresAccountStoreMock.mockReturnValue({
      exportAccountForOrganization: vi.fn().mockResolvedValue({
        export_version: 1,
        exported_at: "2026-03-20T00:00:00.000Z",
        user: { user_id: "usr_123" },
        organization: { organization_id: "org_123" },
        members: [],
        project_members: [],
        project_invites: [],
        member_tokens: [],
        projects: [],
        project_tokens: [],
        probe_activations: [],
        capture_policies: [],
        services: [],
        deployments: [],
        processed_events: [],
        improvement_opportunities: [
          {
            improvement_opportunity_id: "imp_123",
            project_id: "proj_123",
            bundle_generation_number: 1
          }
        ],
        improvement_opportunity_events: [
          {
            event_id: "evt_imp_123",
            project_id: "proj_123",
            occurred_at: "2026-03-20T00:01:00.000Z"
          }
        ],
        incidents: [{ incident_id: "inc_123", project_id: "proj_123" }],
        incident_events: [
          {
            event_id: "evt_123",
            project_id: "proj_123",
            occurred_at: "2026-03-20T00:00:00.000Z",
            is_sampled: true
          }
        ],
        bundle_generations: [],
        stored_artifacts: [],
        audit_logs: [],
        alert_rules: [],
        alert_deliveries: [],
        alert_email_digests: [],
        alert_email_digest_items: [],
        weekly_report_channels: [],
        weekly_report_deliveries: [],
        webhooks: [],
        webhook_deliveries: [],
        agent_webhooks: [],
        github_installations: [],
        project_github_repos: [],
        github_dispatch_rules: [],
        github_dispatch_deliveries: [],
        org_usage_counters: [],
        processed_billing_events: [],
        operational_email_deliveries: []
      }),
      deleteAccountForOrganization: vi.fn()
    });

    const objectStore = {
      putObject: vi.fn(),
      getObject: vi
        .fn()
        .mockResolvedValueOnce(
          gzipSync(
            Buffer.from(
              JSON.stringify({
                event: "raw",
                payload: { message: "accessToken=SYNTHETIC_ACCOUNT_EXPORT" }
              })
            )
          )
        )
        .mockResolvedValueOnce(
          gzipSync(
            Buffer.from(
              JSON.stringify({
                event: "improvement-raw",
                payload: { privateKey: "SYNTHETIC_ACCOUNT_EXPORT" }
              })
            )
          )
        )
        .mockResolvedValueOnce(Buffer.from("invalid-gzip"))
        .mockResolvedValueOnce(
          gzipSync(
            Buffer.from(
              JSON.stringify({
                bundle_type: "improvement",
                title: "clientSecret=SYNTHETIC_ACCOUNT_EXPORT"
              })
            )
          )
        )
        .mockRejectedValueOnce(new Error("s3_object_not_found")),
      deleteObjectsByPrefix: vi.fn()
    };
    const deps = createApiDependencies({
      objectStore,
      queue: { enqueue: vi.fn() },
      db: { query: vi.fn() }
    });

    await expect(
      deps.accountManagement.exportAccountForOrganization({
        organization_id: "org_123",
        user_id: "usr_123",
        exported_at: "2026-03-20T00:00:00.000Z"
      })
    ).resolves.toMatchObject({
      artifacts: {
        raw_events: [
          { content: { event: "raw", payload: { message: "accessToken=[REDACTED]" } } },
          { content: { event: "improvement-raw", payload: { privateKey: "[REDACTED]" } } }
        ],
        bundles: [
          { content: { error: "artifact_invalid" } },
          { content: { bundle_type: "improvement", title: "clientSecret=[REDACTED]" } }
        ],
        reproductions: [{ content: { error: "artifact_not_found" } }]
      }
    });
  });

  it("should delete every project object prefix and the user avatar during account deletion", async (): Promise<void> => {
    const accountStore = {
      exportAccountForOrganization: vi.fn().mockResolvedValue(null),
      deleteAccountForOrganization: vi.fn().mockResolvedValue({
        deleted_at: "2026-06-10T12:00:00.000Z",
        organization_id: "org_123",
        deleted_project_ids: ["proj_1", "proj_2"],
        user_deleted: true,
        deleted_member_token_count: 2
      }),
      getUserAvatar: vi.fn().mockResolvedValue(null),
      saveUserAvatar: vi.fn().mockResolvedValue(null)
    };
    createPostgresAccountStoreMock.mockReturnValue(accountStore);

    const objectStore = {
      putObject: vi.fn(),
      getObject: vi.fn(),
      deleteObjectsByPrefix: vi.fn().mockResolvedValue(undefined),
      deleteObject: vi.fn().mockResolvedValue(undefined)
    };
    const deps = createApiDependencies({
      objectStore,
      queue: { enqueue: vi.fn() },
      db: { query: vi.fn() }
    });

    const deleted = await deps.accountManagement.deleteAccountForOrganization({
      organization_id: "org_123",
      user_id: "usr_123",
      deleted_at: "2026-06-10T12:00:00.000Z"
    });

    expect(deleted).toMatchObject({
      organization_id: "org_123",
      deleted_project_ids: ["proj_1", "proj_2"],
      user_deleted: true
    });
    expect(objectStore.deleteObjectsByPrefix).toHaveBeenCalledTimes(8);
    expect(objectStore.deleteObjectsByPrefix.mock.calls).toEqual(
      expect.arrayContaining([
        ["raw-events/proj_1/"],
        ["bundles/proj_1/"],
        ["improvement-bundles/proj_1/"],
        ["reproductions/proj_1/"],
        ["raw-events/proj_2/"],
        ["bundles/proj_2/"],
        ["improvement-bundles/proj_2/"],
        ["reproductions/proj_2/"]
      ])
    );
    expect(objectStore.deleteObject).toHaveBeenCalledWith({
      key: "avatars/users/usr_123/profile"
    });
  });

  it("should not delete account objects when account deletion is blocked by external project ownership", async (): Promise<void> => {
    const accountStore = {
      exportAccountForOrganization: vi.fn().mockResolvedValue(null),
      deleteAccountForOrganization: vi.fn().mockResolvedValue("other_owned_projects_exist"),
      getUserAvatar: vi.fn().mockResolvedValue(null),
      saveUserAvatar: vi.fn().mockResolvedValue(null)
    };
    createPostgresAccountStoreMock.mockReturnValue(accountStore);

    const objectStore = {
      putObject: vi.fn(),
      getObject: vi.fn(),
      deleteObjectsByPrefix: vi.fn().mockResolvedValue(undefined),
      deleteObject: vi.fn().mockResolvedValue(undefined)
    };
    const deps = createApiDependencies({
      objectStore,
      queue: { enqueue: vi.fn() },
      db: { query: vi.fn() }
    });

    await expect(
      deps.accountManagement.deleteAccountForOrganization({
        organization_id: "org_123",
        user_id: "usr_123",
        deleted_at: "2026-06-10T12:00:00.000Z"
      })
    ).resolves.toBe("other_owned_projects_exist");

    expect(objectStore.deleteObjectsByPrefix).not.toHaveBeenCalled();
    expect(objectStore.deleteObject).not.toHaveBeenCalled();
  });
});
