import { configurationFixtureDb } from "../../helpers/project-configuration-fixture.js";
import { describe, expect, it, vi } from "vitest";

import { createPostgresGitHubStore as createRawGitHubStore } from "../../../packages/storage/src/index.js";

const createPostgresGitHubStore = (db: Parameters<typeof createRawGitHubStore>[0]) =>
  createRawGitHubStore(configurationFixtureDb(db.query));
describe("github management", () => {
  it("loads installation and project repo records", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: "ghi_1",
            installation_id: 123,
            account_login: "debugbundle",
            account_type: "Organization",
            status: "active",
            created_at: "2026-03-26T00:00:00.000Z",
            updated_at: "2026-03-26T00:00:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "pgr_1",
            project_id: "proj_1",
            installation_id: "ghi_1",
            repo_owner: "debugbundle",
            repo_name: "app",
            default_branch: "main",
            created_at: "2026-03-26T00:00:00.000Z",
            updated_at: "2026-03-26T00:00:00.000Z"
          }
        ]
      });

    const store = createPostgresGitHubStore({ query });

    await expect(
      store.getGitHubInstallationForOrganization({ organization_id: "org_1" })
    ).resolves.toEqual({
      id: "ghi_1",
      installation_id: 123,
      account_login: "debugbundle",
      account_type: "Organization",
      status: "active",
      created_at: "2026-03-26T00:00:00.000Z",
      updated_at: "2026-03-26T00:00:00.000Z"
    });
    await expect(
      store.getProjectGitHubRepoForOrganization({ organization_id: "org_1", project_id: "proj_1" })
    ).resolves.toEqual({
      id: "pgr_1",
      project_id: "proj_1",
      installation_id: "ghi_1",
      repo_owner: "debugbundle",
      repo_name: "app",
      default_branch: "main",
      created_at: "2026-03-26T00:00:00.000Z",
      updated_at: "2026-03-26T00:00:00.000Z"
    });
  });

  it("upserts installation and repo assignments and handles delete misses", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "ghi_1",
            installation_id: 123,
            account_login: "debugbundle",
            account_type: "Organization",
            status: "active",
            created_at: "2026-03-26T00:00:00.000Z",
            updated_at: "2026-03-26T00:00:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [{ id: "proj_1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "pgr_1",
            project_id: "proj_1",
            installation_id: "ghi_1",
            repo_owner: "debugbundle",
            repo_name: "app",
            default_branch: "main",
            created_at: "2026-03-26T00:00:00.000Z",
            updated_at: "2026-03-26T00:00:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const store = createPostgresGitHubStore({ query });

    const installation = await store.upsertGitHubInstallationForOrganization({
      organization_id: "org_1",
      installation_id: 123,
      account_login: "debugbundle",
      account_type: "Organization",
      status: "active"
    });
    const repo = await store.upsertProjectGitHubRepoForOrganization({
      organization_id: "org_1",
      project_id: "proj_1",
      installation_id: "ghi_1",
      repo_owner: "debugbundle",
      repo_name: "app",
      default_branch: "main"
    });
    const deleted = await store.deleteProjectGitHubRepoForOrganization({
      organization_id: "org_1",
      project_id: "proj_missing"
    });

    expect(installation.installation_id).toBe(123);
    expect(repo?.repo_name).toBe("app");
    expect(deleted).toBe(false);
  });

  it("creates, lists, updates, gets, and deletes github dispatch rules", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "00000000-0000-4000-8000-000000000001" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            rule_id: "11111111-1111-4111-8111-111111111111",
            project_id: "00000000-0000-4000-8000-000000000001",
            name: "High severity incidents",
            enabled: true,
            event_types: ["bundle.created", "bundle.reopened"],
            environments: ["production"],
            services: ["checkout-api"],
            severity_min: "high",
            bundle_type: "failure",
            incident_status: "new_or_reopened",
            cooldown_seconds: 300,
            created_at: "2026-03-26T00:00:00.000Z",
            updated_at: "2026-03-26T00:00:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [{ id: "00000000-0000-4000-8000-000000000001" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            rule_id: "11111111-1111-4111-8111-111111111111",
            project_id: "00000000-0000-4000-8000-000000000001",
            name: "High severity incidents",
            enabled: true,
            event_types: ["bundle.created", "bundle.reopened"],
            environments: ["production"],
            services: ["checkout-api"],
            severity_min: "high",
            bundle_type: "failure",
            incident_status: "new_or_reopened",
            cooldown_seconds: 300,
            created_at: "2026-03-26T00:00:00.000Z",
            updated_at: "2026-03-26T00:00:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            rule_id: "11111111-1111-4111-8111-111111111111",
            project_id: "00000000-0000-4000-8000-000000000001",
            name: "Critical incidents only",
            enabled: false,
            event_types: ["bundle.created"],
            environments: ["production", "staging"],
            services: [],
            severity_min: "critical",
            bundle_type: "failure",
            incident_status: "new_only",
            cooldown_seconds: 900,
            created_at: "2026-03-26T00:00:00.000Z",
            updated_at: "2026-03-26T00:05:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            rule_id: "11111111-1111-4111-8111-111111111111",
            project_id: "00000000-0000-4000-8000-000000000001",
            name: "Critical incidents only",
            enabled: false,
            event_types: ["bundle.created"],
            environments: ["production", "staging"],
            services: [],
            severity_min: "critical",
            bundle_type: "failure",
            incident_status: "new_only",
            cooldown_seconds: 900,
            created_at: "2026-03-26T00:00:00.000Z",
            updated_at: "2026-03-26T00:05:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [{ rule_id: "11111111-1111-4111-8111-111111111111" }] });

    const store = createPostgresGitHubStore({ query });

    const created = await store.createProjectGitHubRuleForOrganization({
      organization_id: "org_1",
      project_id: "00000000-0000-4000-8000-000000000001",
      created_by_user_id: "00000000-0000-4000-8000-000000000011",
      name: "High severity incidents",
      enabled: true,
      event_types: ["bundle.created", "bundle.reopened"],
      environments: ["production"],
      services: ["checkout-api"],
      severity_min: "high",
      bundle_type: "failure",
      incident_status: "new_or_reopened",
      cooldown_seconds: 300
    });
    const listed = await store.listProjectGitHubRulesForOrganization({
      organization_id: "org_1",
      project_id: "00000000-0000-4000-8000-000000000001"
    });
    const updated = await store.updateProjectGitHubRuleForOrganization({
      organization_id: "org_1",
      project_id: "00000000-0000-4000-8000-000000000001",
      rule_id: "11111111-1111-4111-8111-111111111111",
      name: "Critical incidents only",
      enabled: false,
      event_types: ["bundle.created"],
      environments: ["production", "staging"],
      services: [],
      severity_min: "critical",
      bundle_type: "failure",
      incident_status: "new_only",
      cooldown_seconds: 900
    });
    const fetched = await store.getProjectGitHubRuleForOrganization({
      organization_id: "org_1",
      project_id: "00000000-0000-4000-8000-000000000001",
      rule_id: "11111111-1111-4111-8111-111111111111"
    });
    const deleted = await store.deleteProjectGitHubRuleForOrganization({
      organization_id: "org_1",
      project_id: "00000000-0000-4000-8000-000000000001",
      rule_id: "11111111-1111-4111-8111-111111111111"
    });

    expect(created?.name).toBe("High severity incidents");
    expect(listed).toHaveLength(1);
    expect(updated?.name).toBe("Critical incidents only");
    expect(fetched?.incident_status).toBe("new_only");
    expect(deleted).toBe(true);
  });

  it("covers remaining github store branch combinations for repo, rule, and delivery helpers", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: "ghi_1",
            installation_id: 123,
            account_login: "debugbundle",
            account_type: "Organization",
            status: "suspended",
            created_at: "2026-03-26T00:00:00.000Z",
            updated_at: "2026-03-26T00:05:00.000Z"
          }
        ]
      })
      // Disconnect first sets the bounded lock timeout and refences the account.
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "org_1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "ghi_1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "existing_repo" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "existing_repo",
            project_id: "proj_1",
            installation_id: "ghi_1",
            repo_owner: "debugbundle",
            repo_name: "app",
            default_branch: "main",
            created_at: "2026-03-26T00:00:00.000Z",
            updated_at: "2026-03-26T00:05:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "existing_repo",
            project_id: "proj_1",
            installation_id: "ghi_1",
            repo_owner: "debugbundle",
            repo_name: "app",
            default_branch: "main",
            created_at: "2026-03-26T00:00:00.000Z",
            updated_at: "2026-03-26T00:05:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "present" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            delivery_id: "delivery_123",
            rule_id: "rule_123",
            project_id: "proj_1",
            organization_plan: "team",
            incident_id: "inc_1",
            installation_id: "123",
            repo_owner: "debugbundle",
            repo_name: "app",
            status: "pending",
            attempt_count: "1",
            next_attempt_at: null,
            last_attempt_at: null,
            last_error: null,
            github_status_code: "202",
            dispatch_payload: {
              debugbundle_event: "bundle.created",
              incident_id: "inc_1"
            }
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [] });

    const store = createPostgresGitHubStore({ query });

    await expect(
      store.updateGitHubInstallationStatus({
        installation_id: 123,
        status: "suspended",
        account_login: "debugbundle"
      })
    ).resolves.toEqual(
      expect.objectContaining({
        installation_id: 123,
        status: "suspended"
      })
    );
    await expect(
      store.deleteGitHubInstallationForOrganization({ organization_id: "org_1" })
    ).resolves.toBe(true);
    await expect(
      store.upsertProjectGitHubRepoForOrganization({
        organization_id: "org_1",
        project_id: "proj_missing",
        installation_id: "ghi_1",
        repo_owner: "debugbundle",
        repo_name: "missing",
        default_branch: "main"
      })
    ).resolves.toBeNull();
    await expect(
      store.upsertProjectGitHubRepoForOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        installation_id: "ghi_1",
        repo_owner: "debugbundle",
        repo_name: "app",
        default_branch: "main"
      })
    ).resolves.toEqual(
      expect.objectContaining({
        id: "existing_repo",
        repo_name: "app"
      })
    );
    await expect(
      store.listProjectGitHubRulesForOrganization({
        organization_id: "org_1",
        project_id: "proj_missing"
      })
    ).resolves.toBeNull();
    await expect(
      store.hasRecentGitHubDispatch({
        rule_id: "rule_1",
        incident_fingerprint: "fp",
        cooldown_seconds: 60
      })
    ).resolves.toBe(true);
    await expect(store.getGitHubDispatchDeliveryIntent("delivery_123")).resolves.toEqual({
      delivery_id: "delivery_123",
      rule_id: "rule_123",
      project_id: "proj_1",
      incident_id: "inc_1",
      installation_id: 123,
      repo_owner: "debugbundle",
      repo_name: "app",
      status: "pending",
      attempt_count: 1,
      next_attempt_at: null,
      last_attempt_at: null,
      last_error: null,
      github_status_code: 202,
      dispatch_payload: {
        debugbundle_event: "bundle.created",
        incident_id: "inc_1"
      }
    });
    await expect(
      store.updateProjectGitHubRuleForOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        rule_id: "missing_rule"
      })
    ).resolves.toBeNull();
  });
});
