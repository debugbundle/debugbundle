import { describe, expect, it, vi } from "vitest";

import {
  createPostgresAnalyticsSavedFunnelStore,
  type Queryable
} from "../../../packages/storage/src/index.js";

const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";

const savedFunnelRow = {
  project_id: PROJECT_ID,
  funnel_key: "checkout",
  display_name: "Checkout",
  steps: [
    { step_key: "cart", display_name: "Cart" },
    { step_key: "payment", display_name: "Payment" }
  ],
  created_at: "2026-07-11T10:00:00.000Z",
  updated_at: "2026-07-11T10:00:00.000Z",
  archived_at: null
};

describe("analytics saved funnel store", () => {
  it("lists active definitions within the owning organization", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [savedFunnelRow] });
    const store = createPostgresAnalyticsSavedFunnelStore({ query });

    await expect(
      store.listSavedFunnelsForProject({
        organization_id: ORGANIZATION_ID,
        project_id: PROJECT_ID
      })
    ).resolves.toEqual([savedFunnelRow]);

    expect(String(query.mock.calls[0]![0])).toContain("p.organization_id = $1::uuid");
    expect(String(query.mock.calls[0]![0])).toContain("afd.archived_at IS NULL");
    expect(query.mock.calls[0]![1]).toEqual([ORGANIZATION_ID, PROJECT_ID]);
  });

  it("locks the project and creates within the active saved-funnel limit", async () => {
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes("FOR UPDATE OF p")) {
        return { rows: [{ max_saved_funnels: 3, organization_plan: "team" }] };
      }
      if (sql.includes("SELECT archived_at")) return { rows: [] };
      if (sql.includes("COUNT(*)")) return { rows: [{ active_count: "2" }] };
      if (sql.includes("INSERT INTO analytics_funnel_definitions")) {
        expect(params).toEqual([
          PROJECT_ID,
          "checkout",
          "Checkout",
          JSON.stringify(savedFunnelRow.steps),
          USER_ID
        ]);
        return { rows: [savedFunnelRow] };
      }
      throw new Error(`Unhandled SQL: ${sql}`);
    });
    const store = createPostgresAnalyticsSavedFunnelStore(createTransactionalDb(query));

    await expect(
      store.createSavedFunnelForProject({
        organization_id: ORGANIZATION_ID,
        project_id: PROJECT_ID,
        created_by_user_id: USER_ID,
        definition: {
          funnel_key: "checkout",
          display_name: "Checkout",
          steps: savedFunnelRow.steps
        }
      })
    ).resolves.toEqual({ status: "created", funnel: savedFunnelRow });
  });

  it("returns project_not_found before reading or writing definitions", async () => {
    const query = vi.fn(async (sql: string) => {
      expect(sql).toContain("FOR UPDATE OF p");
      return { rows: [] };
    });
    const store = createPostgresAnalyticsSavedFunnelStore(createTransactionalDb(query));

    await expect(
      store.createSavedFunnelForProject({
        organization_id: ORGANIZATION_ID,
        project_id: PROJECT_ID,
        created_by_user_id: USER_ID,
        definition: {
          funnel_key: "checkout",
          display_name: "Checkout",
          steps: savedFunnelRow.steps
        }
      })
    ).resolves.toEqual({ status: "project_not_found" });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("rejects an active duplicate or exhausted limit without writing", async () => {
    const duplicateQuery = vi.fn(async (sql: string) => {
      if (sql.includes("FOR UPDATE OF p")) {
        return { rows: [{ max_saved_funnels: 3, organization_plan: "team" }] };
      }
      if (sql.includes("SELECT archived_at")) return { rows: [{ archived_at: null }] };
      throw new Error(`Unexpected duplicate SQL: ${sql}`);
    });
    const duplicateStore = createPostgresAnalyticsSavedFunnelStore(
      createTransactionalDb(duplicateQuery)
    );
    await expect(
      duplicateStore.createSavedFunnelForProject({
        organization_id: ORGANIZATION_ID,
        project_id: PROJECT_ID,
        created_by_user_id: USER_ID,
        definition: {
          funnel_key: "checkout",
          display_name: "Checkout",
          steps: savedFunnelRow.steps
        }
      })
    ).resolves.toEqual({ status: "funnel_key_taken" });

    const limitQuery = vi.fn(async (sql: string) => {
      if (sql.includes("FOR UPDATE OF p")) {
        return { rows: [{ max_saved_funnels: 50, organization_plan: "solo" }] };
      }
      if (sql.includes("SELECT archived_at")) return { rows: [] };
      if (sql.includes("COUNT(*)")) return { rows: [{ active_count: "10" }] };
      throw new Error(`Unexpected limit SQL: ${sql}`);
    });
    const limitStore = createPostgresAnalyticsSavedFunnelStore(createTransactionalDb(limitQuery));
    await expect(
      limitStore.createSavedFunnelForProject({
        organization_id: ORGANIZATION_ID,
        project_id: PROJECT_ID,
        created_by_user_id: USER_ID,
        definition: {
          funnel_key: "checkout",
          display_name: "Checkout",
          steps: savedFunnelRow.steps
        }
      })
    ).resolves.toEqual({ status: "limit_reached" });
  });

  it("reactivates an archived key and supports update and archival", async () => {
    const reactivatedRow = { ...savedFunnelRow, updated_at: "2026-07-11T11:00:00.000Z" };
    const createQuery = vi.fn(async (sql: string) => {
      if (sql.includes("FOR UPDATE OF p")) {
        return { rows: [{ max_saved_funnels: 3, organization_plan: "team" }] };
      }
      if (sql.includes("SELECT archived_at")) {
        return { rows: [{ archived_at: "2026-07-10T10:00:00.000Z" }] };
      }
      if (sql.includes("COUNT(*)")) return { rows: [{ active_count: "1" }] };
      if (sql.includes("INSERT INTO analytics_funnel_definitions")) {
        expect(sql).toContain("archived_at = NULL");
        return { rows: [reactivatedRow] };
      }
      throw new Error(`Unhandled reactivate SQL: ${sql}`);
    });
    const createStore = createPostgresAnalyticsSavedFunnelStore(createTransactionalDb(createQuery));
    await expect(
      createStore.createSavedFunnelForProject({
        organization_id: ORGANIZATION_ID,
        project_id: PROJECT_ID,
        created_by_user_id: USER_ID,
        definition: {
          funnel_key: "checkout",
          display_name: "Checkout",
          steps: savedFunnelRow.steps
        }
      })
    ).resolves.toEqual({ status: "created", funnel: reactivatedRow });

    const updateQuery = vi.fn().mockResolvedValue({
      rows: [{ ...savedFunnelRow, display_name: "Primary checkout" }]
    });
    const updateStore = createPostgresAnalyticsSavedFunnelStore({ query: updateQuery });
    await expect(
      updateStore.updateSavedFunnelForProject({
        organization_id: ORGANIZATION_ID,
        project_id: PROJECT_ID,
        funnel_key: "checkout",
        update: { display_name: "Primary checkout" }
      })
    ).resolves.toMatchObject({ display_name: "Primary checkout" });
    expect(String(updateQuery.mock.calls[0]![0])).toContain("afd.archived_at IS NULL");

    const archiveQuery = vi.fn().mockResolvedValue({
      rows: [{ ...savedFunnelRow, archived_at: "2026-07-11T12:00:00.000Z" }]
    });
    const archiveStore = createPostgresAnalyticsSavedFunnelStore({ query: archiveQuery });
    await expect(
      archiveStore.archiveSavedFunnelForProject({
        organization_id: ORGANIZATION_ID,
        project_id: PROJECT_ID,
        funnel_key: "checkout"
      })
    ).resolves.toMatchObject({ archived_at: "2026-07-11T12:00:00.000Z" });
  });
});

function createTransactionalDb(
  query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>
): Queryable {
  const typedQuery = query as Queryable["query"];
  const tx: Queryable = { query: typedQuery };
  return {
    query: typedQuery,
    transaction: async <Result>(callback: (database: Queryable) => Promise<Result>) => callback(tx)
  };
}
