import { describe, expect, it, vi } from "vitest";

import { createPostgresGitHubStore } from "../../../packages/storage/src/index.js";

describe("github dispatch runtime", () => {
  it("persists skipped dispatch deliveries for rate-limited GitHub automation", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ id: "gdd_skipped" }] });
    const store = createPostgresGitHubStore({ query });

    const created = await store.createSkippedGitHubDispatchDelivery({
      rule_id: "11111111-1111-4111-8111-111111111111",
      rule_name: "High severity incidents",
      project_id: "22222222-2222-4222-8222-222222222222",
      incident_id: "33333333-3333-4333-8333-333333333333",
      improvement_id: null,
      target_fingerprint: "fp_123",
      dedupe_key: "bundle.created:3",
      installation_id: 99,
      repo_owner: "debugbundle",
      repo_name: "app",
      reason: "project_hourly_rate_limited",
      dispatch_payload: {
        debugbundle_event: "bundle.created",
        incident_id: "33333333-3333-4333-8333-333333333333"
      }
    });

    expect(created.created).toBe(true);
    expect(String(query.mock.calls[0]?.[0])).toContain("'skipped'");
    expect(query.mock.calls[0]?.[1]).toContain("project_hourly_rate_limited");
  });

  it("lists and retries github dispatch deliveries", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            delivery_id: "22222222-2222-4222-8222-222222222222",
            rule_id: "11111111-1111-4111-8111-111111111111",
            rule_name: "High severity incidents",
            incident_id: "33333333-3333-4333-8333-333333333333",
            improvement_id: null,
            target_title: "TypeError in checkout",
            status: "failed",
            attempt_count: 2,
            last_attempt_at: "2026-03-26T00:10:00.000Z",
            last_error: "Repository not found",
            github_status_code: 404,
            created_at: "2026-03-26T00:00:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            delivery_id: "22222222-2222-4222-8222-222222222222",
            rule_id: "11111111-1111-4111-8111-111111111111",
            rule_name: "High severity incidents",
            incident_id: "33333333-3333-4333-8333-333333333333",
            improvement_id: null,
            target_title: "TypeError in checkout",
            status: "retrying",
            attempt_count: 2,
            last_attempt_at: "2026-03-26T00:10:00.000Z",
            last_error: null,
            github_status_code: null,
            created_at: "2026-03-26T00:00:00.000Z"
          }
        ]
      });

    const store = createPostgresGitHubStore({ query });

    const deliveries = await store.listProjectGitHubDeliveriesForOrganization({
      organization_id: "org_1",
      project_id: "00000000-0000-4000-8000-000000000001",
      status: "failed",
      limit: 10
    });
    const retried = await store.retryProjectGitHubDeliveryForOrganization({
      organization_id: "org_1",
      project_id: "00000000-0000-4000-8000-000000000001",
      delivery_id: "22222222-2222-4222-8222-222222222222"
    });

    expect(deliveries).toEqual([
      expect.objectContaining({
        delivery_id: "22222222-2222-4222-8222-222222222222",
        incident_id: "33333333-3333-4333-8333-333333333333",
        improvement_id: null,
        target_title: "TypeError in checkout"
      })
    ]);
    expect(retried?.status).toBe("retrying");
  });

  it("lists matching github dispatch rules and records delivery attempts", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            rule_id: "11111111-1111-4111-8111-111111111111",
            rule_name: "High severity incidents",
            organization_plan: "team",
            installation_id: 99,
            repo_owner: "debugbundle",
            repo_name: "app",
            default_branch: "main",
            cooldown_seconds: 300
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [{ id: "44444444-4444-4444-8444-444444444444" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            status: "retrying",
            next_attempt: 2
          }
        ]
      });

    const store = createPostgresGitHubStore({ query });

    const matches = await store.listMatchingGitHubDispatchRules({
      project_id: "proj_123",
      event_type: "bundle.created",
      environment: "production",
      service_name: "checkout-api",
      severity: "high",
      bundle_type: "failure",
      incident_status: "new_or_reopened"
    });
    expect(String(query.mock.calls[0]?.[0] ?? "")).toContain(
      "COALESCE(o.plan, 'free') AS organization_plan"
    );
    const created = await store.createGitHubDispatchDeliveryIntent({
      rule_id: "11111111-1111-4111-8111-111111111111",
      rule_name: "High severity incidents",
      project_id: "proj_123",
      incident_id: "inc_123",
      improvement_id: null,
      target_fingerprint: "fp_123",
      dedupe_key: "bundle.created:3",
      installation_id: 99,
      repo_owner: "debugbundle",
      repo_name: "app",
      dispatch_payload: {
        debugbundle_event: "bundle.created",
        incident_id: "inc_123",
        debugbundle: {
          project_id: "proj_123"
        }
      }
    });
    const markResult = await store.markGitHubDispatchDeliveryAttempt({
      delivery_id: "44444444-4444-4444-8444-444444444444",
      attempt: 1,
      delivered: false,
      error_message: "github_dispatch_http_error_503",
      github_status_code: 503
    });

    expect(matches).toEqual([
      {
        rule_id: "11111111-1111-4111-8111-111111111111",
        rule_name: "High severity incidents",
        installation_id: 99,
        repo_owner: "debugbundle",
        repo_name: "app",
        default_branch: "main",
        cooldown_seconds: 300
      }
    ]);
    expect(created.created).toBe(true);
    expect(created.delivery_id).toMatch(/^[0-9a-f-]+$/i);
    expect(markResult).toEqual({ status: "retrying", next_attempt: 2 });
  });

  it("filters non-matching github dispatch rules before mapping the survivors", async () => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [
        {
          rule_id: "rule_env",
          rule_name: "Wrong environment",
          organization_plan: "team",
          installation_id: "91",
          repo_owner: "debugbundle",
          repo_name: "app",
          default_branch: "main",
          cooldown_seconds: "60",
          environments: ["staging"],
          services: ["checkout-api"],
          severity_min: "low",
          bundle_type: "failure",
          incident_status: "new_or_reopened"
        },
        {
          rule_id: "rule_service",
          rule_name: "Wrong service",
          organization_plan: "team",
          installation_id: "92",
          repo_owner: "debugbundle",
          repo_name: "app",
          default_branch: "main",
          cooldown_seconds: "120",
          environments: ["production"],
          services: ["payments-api"],
          severity_min: "low",
          bundle_type: "failure",
          incident_status: "new_or_reopened"
        },
        {
          rule_id: "rule_severity",
          rule_name: "Too strict",
          organization_plan: "team",
          installation_id: "93",
          repo_owner: "debugbundle",
          repo_name: "app",
          default_branch: "main",
          cooldown_seconds: "180",
          environments: ["production"],
          services: ["checkout-api"],
          severity_min: "critical",
          bundle_type: "failure",
          incident_status: "new_or_reopened"
        },
        {
          rule_id: "rule_bundle",
          rule_name: "Improvement only",
          organization_plan: "team",
          installation_id: "94",
          repo_owner: "debugbundle",
          repo_name: "app",
          default_branch: "main",
          cooldown_seconds: "240",
          environments: ["production"],
          services: ["checkout-api"],
          severity_min: "low",
          bundle_type: "improvement",
          incident_status: "new_or_reopened"
        },
        {
          rule_id: "rule_created_only",
          rule_name: "Reopened only",
          organization_plan: "team",
          installation_id: "95",
          repo_owner: "debugbundle",
          repo_name: "app",
          default_branch: "main",
          cooldown_seconds: "300",
          environments: ["production"],
          services: ["checkout-api"],
          severity_min: "low",
          bundle_type: "failure",
          incident_status: "reopened_only"
        },
        {
          rule_id: "rule_match",
          rule_name: "Match",
          organization_plan: "team",
          installation_id: "96",
          repo_owner: "debugbundle",
          repo_name: "app",
          default_branch: "main",
          cooldown_seconds: "360",
          environments: ["production"],
          services: ["checkout-api"],
          severity_min: "medium",
          bundle_type: "failure",
          incident_status: "new_or_reopened"
        }
      ]
    });

    const store = createPostgresGitHubStore({ query });

    await expect(
      store.listMatchingGitHubDispatchRules({
        project_id: "proj_123",
        event_type: "bundle.created",
        environment: "production",
        service_name: "checkout-api",
        severity: "high",
        bundle_type: "failure",
        incident_status: "new_or_reopened"
      })
    ).resolves.toEqual([
      {
        rule_id: "rule_match",
        rule_name: "Match",
        installation_id: 96,
        repo_owner: "debugbundle",
        repo_name: "app",
        default_branch: "main",
        cooldown_seconds: 360
      }
    ]);
  });

  it("maps github dispatch delivery intents with numeric conversions and payload fallback", async () => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [
        {
          delivery_id: "44444444-4444-4444-8444-444444444444",
          rule_id: "11111111-1111-4111-8111-111111111111",
          project_id: "proj_123",
          organization_plan: "team",
          incident_id: "inc_123",
          improvement_id: null,
          installation_id: "99",
          repo_owner: "debugbundle",
          repo_name: "app",
          status: "retrying",
          attempt_count: "2",
          next_attempt_at: "2026-03-26T00:05:00.000Z",
          last_attempt_at: "2026-03-26T00:01:00.000Z",
          last_error: "github_dispatch_http_error_429",
          github_status_code: null,
          dispatch_payload: "not-an-object"
        }
      ]
    });

    const store = createPostgresGitHubStore({ query });

    await expect(
      store.getGitHubDispatchDeliveryIntent("44444444-4444-4444-8444-444444444444")
    ).resolves.toEqual({
      delivery_id: "44444444-4444-4444-8444-444444444444",
      rule_id: "11111111-1111-4111-8111-111111111111",
      project_id: "proj_123",
      incident_id: "inc_123",
      improvement_id: null,
      installation_id: 99,
      repo_owner: "debugbundle",
      repo_name: "app",
      status: "retrying",
      attempt_count: 2,
      next_attempt_at: "2026-03-26T00:05:00.000Z",
      last_attempt_at: "2026-03-26T00:01:00.000Z",
      last_error: "github_dispatch_http_error_429",
      github_status_code: null,
      dispatch_payload: {}
    });
  });

  it("suppresses github dispatch matches and queued deliveries when the current plan is free", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            rule_id: "rule_old",
            rule_name: "Stale rule",
            organization_plan: "free",
            installation_id: 96,
            repo_owner: "debugbundle",
            repo_name: "app",
            default_branch: "main",
            cooldown_seconds: 360,
            environments: [],
            services: [],
            severity_min: null,
            bundle_type: "failure",
            incident_status: "new_or_reopened"
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            delivery_id: "44444444-4444-4444-8444-444444444444",
            rule_id: "11111111-1111-4111-8111-111111111111",
            project_id: "proj_123",
            organization_plan: "free",
            incident_id: "inc_123",
            improvement_id: null,
            installation_id: "99",
            repo_owner: "debugbundle",
            repo_name: "app",
            status: "retrying",
            attempt_count: "2",
            next_attempt_at: "2026-03-26T00:05:00.000Z",
            last_attempt_at: "2026-03-26T00:01:00.000Z",
            last_error: "github_dispatch_http_error_429",
            github_status_code: null,
            dispatch_payload: {}
          }
        ]
      });

    const store = createPostgresGitHubStore({ query });

    await expect(
      store.listMatchingGitHubDispatchRules({
        project_id: "proj_123",
        event_type: "bundle.created",
        environment: "production",
        service_name: "checkout-api",
        severity: "high",
        bundle_type: "failure",
        incident_status: "new_or_reopened"
      })
    ).resolves.toEqual([]);
    await expect(
      store.getGitHubDispatchDeliveryIntent("44444444-4444-4444-8444-444444444444")
    ).resolves.toBeNull();
  });

  it("suppresses duplicate github dispatch intents for the same rule and dedupe key", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "55555555-5555-4555-8555-555555555555" }] });

    const store = createPostgresGitHubStore({ query });

    const duplicate = await store.createGitHubDispatchDeliveryIntent({
      rule_id: "11111111-1111-4111-8111-111111111111",
      rule_name: "High severity incidents",
      project_id: "proj_123",
      incident_id: "inc_123",
      improvement_id: null,
      target_fingerprint: "inc_123:bundle.created",
      dedupe_key: "bundle.created:3",
      installation_id: 99,
      repo_owner: "debugbundle",
      repo_name: "app",
      dispatch_payload: {
        debugbundle_event: "bundle.created",
        incident_id: "inc_123",
        debugbundle: {
          project_id: "proj_123"
        },
        bundle_version: 3
      }
    });

    const created = await store.createGitHubDispatchDeliveryIntent({
      rule_id: "11111111-1111-4111-8111-111111111111",
      rule_name: "High severity incidents",
      project_id: "proj_123",
      incident_id: "inc_123",
      improvement_id: null,
      target_fingerprint: "inc_123:bundle.created",
      dedupe_key: "bundle.created:4",
      installation_id: 99,
      repo_owner: "debugbundle",
      repo_name: "app",
      dispatch_payload: {
        debugbundle_event: "bundle.created",
        incident_id: "inc_123",
        debugbundle: {
          project_id: "proj_123"
        },
        bundle_version: 4
      }
    });

    expect(duplicate.created).toBe(false);
    expect(duplicate.delivery_id).toMatch(/^[0-9a-f-]+$/i);
    expect(created.created).toBe(true);
    expect(created.delivery_id).toMatch(/^[0-9a-f-]+$/i);
  });

  it("lists improvement github dispatch deliveries with the improvement target title", async () => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [
        {
          delivery_id: "44444444-4444-4444-8444-444444444444",
          rule_id: "11111111-1111-4111-8111-111111111111",
          rule_name: "Hosted improvements",
          incident_id: null,
          improvement_id: "imp_123",
          target_title: "Repeated warning hotspot",
          status: "failed",
          attempt_count: "2",
          last_attempt_at: "2026-03-26T00:10:00.000Z",
          last_error: "Repository not found",
          github_status_code: "404",
          created_at: "2026-03-26T00:00:00.000Z"
        }
      ]
    });

    const store = createPostgresGitHubStore({ query });

    await expect(
      store.listProjectGitHubDeliveriesForOrganization({
        organization_id: "org_123",
        project_id: "proj_123",
        limit: 20
      })
    ).resolves.toEqual([
      {
        delivery_id: "44444444-4444-4444-8444-444444444444",
        rule_id: "11111111-1111-4111-8111-111111111111",
        rule_name: "Hosted improvements",
        incident_id: null,
        improvement_id: "imp_123",
        target_title: "Repeated warning hotspot",
        status: "failed",
        attempt_count: 2,
        last_attempt_at: "2026-03-26T00:10:00.000Z",
        last_error: "Repository not found",
        github_status_code: 404,
        created_at: "2026-03-26T00:00:00.000Z"
      }
    ]);
  });

  it("uses explicit Retry-After overrides for github dispatch retries", async () => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [
        {
          status: "retrying",
          next_attempt: 2
        }
      ]
    });

    const store = createPostgresGitHubStore({ query });

    const result = await store.markGitHubDispatchDeliveryAttempt({
      delivery_id: "44444444-4444-4444-8444-444444444444",
      attempt: 1,
      delivered: false,
      error_message: "github_dispatch_http_error_429",
      github_status_code: 429,
      retry_after_seconds: 17
    });

    expect(result).toEqual({ status: "retrying", next_attempt: 2 });
    expect(query).toHaveBeenCalledWith(expect.any(String), [
      "44444444-4444-4444-8444-444444444444",
      1,
      17,
      "github_dispatch_http_error_429",
      429
    ]);
  });

  it("stops github dispatch retries after the bounded retry ladder is exhausted", async () => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [
        {
          status: "failed",
          next_attempt: null
        }
      ]
    });

    const store = createPostgresGitHubStore({ query });

    const result = await store.markGitHubDispatchDeliveryAttempt({
      delivery_id: "44444444-4444-4444-8444-444444444444",
      attempt: 6,
      delivered: false,
      error_message: "github_dispatch_http_error_503",
      github_status_code: 503
    });

    expect(result).toEqual({ status: "failed", next_attempt: null });
    expect(query).toHaveBeenCalledWith(expect.any(String), [
      "44444444-4444-4444-8444-444444444444",
      6,
      "github_dispatch_http_error_503",
      503
    ]);
  });

  it("returns null and zero fallbacks for github store miss paths and delivered attempts", async () => {
    const query = vi
      .fn()
      // A missing installation's account check now runs in a bounded transaction.
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: "0" }] })
      .mockResolvedValueOnce({ rows: [{ count: "0" }] })
      .mockResolvedValueOnce({ rows: [{ delivery_id: "aaa", attempt: "3" }] })
      .mockResolvedValueOnce({ rows: [{ status: "delivered", next_attempt: null }] });

    const store = createPostgresGitHubStore({ query });

    await expect(
      store.getGitHubInstallationForOrganization({ organization_id: "org_missing" })
    ).resolves.toBeNull();
    await expect(
      store.updateGitHubInstallationStatus({
        installation_id: 404,
        status: "removed"
      })
    ).resolves.toBeNull();
    await expect(
      store.deleteGitHubInstallationForOrganization({ organization_id: "org_missing" })
    ).resolves.toBe(false);
    await expect(
      store.getProjectGitHubRepoForOrganization({
        organization_id: "org_1",
        project_id: "proj_missing"
      })
    ).resolves.toBeNull();
    await expect(
      store.getProjectGitHubRuleForOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        rule_id: "rule_missing"
      })
    ).resolves.toBeNull();
    await expect(store.getGitHubDispatchDeliveryIntent("delivery_missing")).resolves.toBeNull();
    await expect(
      store.countProjectGitHubDispatchesSince({
        project_id: "proj_1",
        since: "2026-03-26T00:00:00.000Z"
      })
    ).resolves.toBe(0);
    await expect(
      store.countInstallationGitHubDispatchesSince({
        installation_id: 99,
        since: "2026-03-26T00:00:00.000Z"
      })
    ).resolves.toBe(0);
    await expect(store.claimDueGitHubDispatchDeliveries(5)).resolves.toEqual([
      { delivery_id: "aaa", attempt: 3 }
    ]);
    await expect(
      store.markGitHubDispatchDeliveryAttempt({
        delivery_id: "44444444-4444-4444-8444-444444444444",
        attempt: 2,
        delivered: true,
        error_message: null,
        github_status_code: 204
      })
    ).resolves.toEqual({ status: "delivered", next_attempt: null });
  });
});
