import { describe, expect, it, vi } from "vitest";
import {
  createPostgresAccountAnalyticsStore,
  createPostgresMetadataStore,
  type Queryable
} from "../../../packages/storage/src/index.js";

describe("postgres metadata probes", () => {
  it("should create/list/deactivate probe activations in organization scope", async (): Promise<void> => {
    const originalSecret = process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"];
    process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"] = "test-probe-trigger-secret-for-storage";
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: "proj_123",
            root_id: "proj_123",
            origins: ["proj_123"],
            actor_is_owner: true,
            organization_plan: "solo"
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            activation_id: "11111111-1111-4111-8111-111111111111",
            label_pattern: "checkout.*",
            service: "*",
            environment: "*",
            expires_at: "2026-03-11T01:00:00.000Z",
            trigger_expires_at: "2026-03-12T01:00:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "proj_123",
            root_id: "proj_123",
            origins: ["proj_123"],
            actor_is_owner: true,
            organization_plan: "solo"
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [{ cnt: "1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            activation_id: "11111111-1111-4111-8111-111111111111",
            label_pattern: "checkout.*",
            service: "*",
            environment: "*",
            expires_at: "2026-03-11T01:00:00.000Z",
            trigger_expires_at: "2026-03-12T01:00:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            organization_plan: "solo",
            activation_id: "11111111-1111-4111-8111-111111111111",
            deactivated_at: "2026-03-11T00:10:00.000Z"
          }
        ]
      });

    const db: Queryable = {
      query: query as Queryable["query"],
      transaction: async <Result>(callback: (tx: Queryable) => Promise<Result>) =>
        callback({ query: query as Queryable["query"] })
    };
    const store = createPostgresMetadataStore(db);

    const listed = await store.listActiveProbesForProjectInOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      now: "2026-03-11T00:00:00.000Z"
    });
    const created = await store.createProbeActivationForProjectInOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      created_by_member_id: "usr_123",
      label_pattern: "checkout.*",
      service: "*",
      environment: "*",
      expires_at: "2026-03-11T01:00:00.000Z",
      trigger_expires_at: "2026-03-12T01:00:00.000Z"
    });
    const deactivated = await store.deactivateProbeActivationForProjectInOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      activation_id: "11111111-1111-4111-8111-111111111111",
      deactivated_at: "2026-03-11T00:10:00.000Z"
    });

    expect(listed).toEqual({
      organization_plan: "solo",
      activations: [
        {
          activation_id: "11111111-1111-4111-8111-111111111111",
          label_pattern: "checkout.*",
          service: "*",
          environment: "*",
          expires_at: "2026-03-11T01:00:00.000Z",
          trigger_expires_at: "2026-03-12T01:00:00.000Z"
        }
      ]
    });
    expect(created).not.toBeNull();
    if (created === null) {
      throw new Error("expected_probe_activation_create_result");
    }
    expect(created.organization_plan).toBe("solo");
    expect(created.activation.activation_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(created.trigger_token).toMatch(/^dbundle_probe_/);
    expect(
      query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO probe_activations"))?.[1]
    ).toEqual([
      expect.any(String),
      "proj_123",
      "usr_123",
      "checkout.*",
      "*",
      "*",
      expect.stringMatching(/^[0-9a-f]{64}$/),
      "2026-03-12T01:00:00.000Z",
      "2026-03-11T01:00:00.000Z",
      ["proj_123"],
      null
    ]);
    expect(deactivated).toEqual({
      organization_plan: "solo",
      deactivated: {
        activation_id: "11111111-1111-4111-8111-111111111111",
        deactivated_at: "2026-03-11T00:10:00.000Z"
      }
    });

    if (originalSecret === undefined) {
      delete process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"];
    } else {
      process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"] = originalSecret;
    }
  });

  it("should list active probes for a project", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          activation_id: "11111111-1111-4111-8111-111111111111",
          label_pattern: "checkout.*",
          service: "*",
          environment: "*",
          expires_at: "2026-03-11T01:00:00.000Z",
          trigger_expires_at: "2026-03-12T01:00:00.000Z"
        }
      ]
    });
    const db: Queryable = { query: query as Queryable["query"] };
    const store = createPostgresMetadataStore(db);

    const activations = await store.listActiveProbesForProject({
      project_id: "proj_123",
      now: "2026-03-11T00:00:00.000Z"
    });

    expect(activations).toEqual([
      {
        activation_id: "11111111-1111-4111-8111-111111111111",
        label_pattern: "checkout.*",
        service: "*",
        environment: "*",
        expires_at: "2026-03-11T01:00:00.000Z",
        trigger_expires_at: "2026-03-12T01:00:00.000Z"
      }
    ]);
    expect(query).toHaveBeenCalledWith(expect.any(String), [
      "proj_123",
      "2026-03-11T00:00:00.000Z",
      ["proj_123"]
    ]);
  });

  it("falls back to the free plan when a scoped probe query returns an unknown organization plan", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: "proj_123",
            root_id: "proj_123",
            origins: ["proj_123"],
            actor_is_owner: true,
            organization_plan: "enterprise"
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [] });
    const store = createPostgresMetadataStore({ query });

    const listed = await store.listActiveProbesForProjectInOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      now: "2026-03-11T00:00:00.000Z"
    });

    expect(listed).toEqual({
      organization_plan: "free",
      activations: []
    });
  });

  it("should handle out-of-scope and insert-failure probe activation branches", async (): Promise<void> => {
    const originalSecret = process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"];
    process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"] = "test-probe-trigger-secret-for-storage";
    const outOfScopeQuery = vi.fn().mockResolvedValue({ rows: [] });
    const outOfScopeDb: Queryable = {
      query: outOfScopeQuery as Queryable["query"],
      transaction: async <Result>(callback: (tx: Queryable) => Promise<Result>) =>
        callback({ query: outOfScopeQuery as Queryable["query"] })
    };
    const outOfScopeStore = createPostgresMetadataStore(outOfScopeDb);

    const listed = await outOfScopeStore.listActiveProbesForProjectInOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      now: "2026-03-11T00:00:00.000Z"
    });
    const created = await outOfScopeStore.createProbeActivationForProjectInOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      created_by_member_id: "usr_123",
      label_pattern: "checkout.*",
      service: "*",
      environment: "*",
      expires_at: "2026-03-11T01:00:00.000Z",
      trigger_expires_at: "2026-03-12T01:00:00.000Z"
    });
    const deactivated = await outOfScopeStore.deactivateProbeActivationForProjectInOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      activation_id: "11111111-1111-4111-8111-111111111111",
      deactivated_at: "2026-03-11T00:10:00.000Z"
    });

    expect(listed).toBeNull();
    expect(created).toBeNull();
    expect(deactivated).toBeNull();

    const insertFailureQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "proj_123",
            root_id: "proj_123",
            origins: ["proj_123"],
            actor_is_owner: true,
            organization_plan: "solo"
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [{ cnt: "0" }] })
      .mockResolvedValueOnce({ rows: [] });
    const insertFailureDb: Queryable = {
      query: insertFailureQuery as Queryable["query"],
      transaction: async <Result>(callback: (tx: Queryable) => Promise<Result>) =>
        callback({ query: insertFailureQuery as Queryable["query"] })
    };
    const insertFailureStore = createPostgresMetadataStore(insertFailureDb);

    await expect(
      insertFailureStore.createProbeActivationForProjectInOrganization({
        organization_id: "org_123",
        project_id: "proj_123",
        created_by_member_id: "usr_123",
        label_pattern: "checkout.*",
        service: "*",
        environment: "*",
        expires_at: "2026-03-11T01:00:00.000Z",
        trigger_expires_at: "2026-03-12T01:00:00.000Z"
      })
    ).rejects.toThrow("probe_activation_insert_failed");

    if (originalSecret === undefined) {
      delete process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"];
    } else {
      process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"] = originalSecret;
    }
  });

  it("should report concurrent probe activation limits when the project is already saturated", async (): Promise<void> => {
    const originalSecret = process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"];
    process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"] = "test-probe-trigger-secret-for-storage";
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "proj_123",
            root_id: "proj_123",
            origins: ["proj_123"],
            actor_is_owner: true,
            organization_plan: "team"
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [{ cnt: "5" }] });
    const store = createPostgresMetadataStore({
      query,
      transaction: async <Result>(callback: (tx: Queryable) => Promise<Result>) =>
        callback({ query: query as Queryable["query"] })
    });

    const result = await store.createProbeActivationForProjectInOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      created_by_member_id: "usr_123",
      label_pattern: "checkout.*",
      service: "*",
      environment: "*",
      expires_at: "2026-03-11T01:00:00.000Z",
      trigger_expires_at: "2026-03-12T01:00:00.000Z"
    });

    expect(result).toEqual({
      organization_plan: "team",
      activation: {
        activation_id: "",
        label_pattern: "",
        service: "",
        environment: "",
        expires_at: "",
        trigger_expires_at: ""
      },
      trigger_token: "",
      concurrent_limit_exceeded: true
    });

    if (originalSecret === undefined) {
      delete process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"];
    } else {
      process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"] = originalSecret;
    }
  });

  it("records probe activation lifecycle metrics when analytics are enabled", async (): Promise<void> => {
    const originalSecret = process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"];
    process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"] = "test-probe-trigger-secret-for-storage";
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("debugbundle_assert_project_scope_write")) return { rows: [] };
      if (sql.includes("AS root_id")) {
        return {
          rows: [
            {
              id: "proj_123",
              root_id: "proj_123",
              origins: ["proj_123"],
              actor_is_owner: true,
              organization_plan: "solo"
            }
          ]
        };
      }

      if (sql.includes("SELECT count(*)::text AS cnt")) {
        return { rows: [{ cnt: "0" }] };
      }

      if (sql.includes("INSERT INTO probe_activations")) {
        return {
          rows: [
            {
              activation_id: "11111111-1111-4111-8111-111111111111",
              label_pattern: "checkout.*",
              service: "*",
              environment: "*",
              created_at: "2026-03-11T00:00:00.000Z",
              expires_at: "2026-03-11T01:00:00.000Z",
              trigger_expires_at: "2026-03-12T01:00:00.000Z"
            }
          ]
        };
      }

      if (sql.includes("UPDATE probe_activations pa")) {
        return {
          rows: [
            {
              organization_plan: "solo",
              activation_id: "11111111-1111-4111-8111-111111111111",
              deactivated_at: "2026-03-11T00:10:00.000Z"
            }
          ]
        };
      }

      if (sql.includes("FROM account_analytics_accounts")) {
        return { rows: [{ analytics_account_id: "analytics_123" }] };
      }

      if (sql.includes("INSERT INTO account_metric_events")) {
        return { rows: [{ dedupe_key_hash: "hash_123" }] };
      }

      if (sql.includes("INSERT INTO account_metric_periods")) {
        return { rows: [] };
      }

      throw new Error(`Unhandled SQL in probe analytics test: ${sql}`);
    });

    const transactionalDb: Queryable = {
      query: query as Queryable["query"],
      transaction: async <Result>(callback: (tx: Queryable) => Promise<Result>) =>
        callback({ query: query as Queryable["query"] })
    };
    const accountAnalyticsStore = createPostgresAccountAnalyticsStore({
      db: transactionalDb,
      analyticsHashSecret: "test-analytics-secret"
    });
    const store = createPostgresMetadataStore(transactionalDb, { accountAnalyticsStore });

    await store.createProbeActivationForProjectInOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      created_by_member_id: "usr_123",
      label_pattern: "checkout.*",
      service: "*",
      environment: "*",
      expires_at: "2026-03-11T01:00:00.000Z",
      trigger_expires_at: "2026-03-12T01:00:00.000Z"
    });
    await store.deactivateProbeActivationForProjectInOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      activation_id: "11111111-1111-4111-8111-111111111111",
      deactivated_at: "2026-03-11T00:10:00.000Z"
    });

    expect(query.mock.calls).toContainEqual([
      expect.stringContaining("INSERT INTO account_metric_events"),
      expect.arrayContaining([
        expect.any(String),
        "analytics_123",
        "remote_probe_activation_created"
      ])
    ]);
    expect(query.mock.calls).toContainEqual([
      expect.stringContaining("INSERT INTO account_metric_events"),
      expect.arrayContaining([
        expect.any(String),
        "analytics_123",
        "remote_probe_activation_expired"
      ])
    ]);

    if (originalSecret === undefined) {
      delete process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"];
    } else {
      process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"] = originalSecret;
    }
  });
});
