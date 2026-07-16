import { describe, expect, it, vi } from "vitest";

import {
  buildAnalyticsBundleGenerationCursor,
  buildAnalyticsBundleInputFingerprint,
  createPostgresAnalyticsBundleGenerationStore,
  type Queryable
} from "../../../packages/storage/src/index.js";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const OPPORTUNITY_ID = "22222222-2222-4222-8222-222222222222";
const GENERATION_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "44444444-4444-4444-8444-444444444444";

const generationRow = {
  generation_id: GENERATION_ID,
  project_id: PROJECT_ID,
  opportunity_id: OPPORTUNITY_ID,
  requested_by_user_id: USER_ID,
  analysis_kind: "funnel_dropoff",
  analysis_spec: { funnel_key: "checkout", step_key: "payment" },
  input_fingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  status: "pending",
  object_key: null,
  failure_reason: null,
  created_at: "2026-07-08T10:00:00.000Z",
  claimed_at: null,
  completed_at: null,
  updated_at: "2026-07-08T10:00:00.000Z"
};

describe("analytics bundle generation store", () => {
  it("builds deterministic input fingerprints independent of object key order", (): void => {
    const left = buildAnalyticsBundleInputFingerprint({
      opportunity_id: OPPORTUNITY_ID,
      analysis_kind: "funnel_dropoff",
      analysis_spec: {
        step_key: "payment",
        funnel_key: "checkout",
        window: { end: "2026-07-08T00:00:00.000Z", start: "2026-07-01T00:00:00.000Z" }
      }
    });
    const right = buildAnalyticsBundleInputFingerprint({
      opportunity_id: OPPORTUNITY_ID,
      analysis_kind: "funnel_dropoff",
      analysis_spec: {
        window: { start: "2026-07-01T00:00:00.000Z", end: "2026-07-08T00:00:00.000Z" },
        funnel_key: "checkout",
        step_key: "payment"
      }
    });

    expect(left).toBe(right);
    expect(left).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("reserves a pending generation and mirrors pending state to the linked opportunity", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string, params: unknown[]) => {
      if (sqlText.includes("INSERT INTO analytics_bundle_generations")) {
        expect(sqlText).toContain("ON CONFLICT (project_id, input_fingerprint) DO NOTHING");
        expect(params[1]).toBe(PROJECT_ID);
        expect(params[2]).toBe(OPPORTUNITY_ID);
        expect(params[3]).toBe(USER_ID);
        expect(params[4]).toBe("funnel_dropoff");
        expect(params[5]).toBe(JSON.stringify({ funnel_key: "checkout", step_key: "payment" }));
        expect(String(params[6])).toMatch(/^sha256:[a-f0-9]{64}$/);
        return { rows: [generationRow] };
      }

      if (sqlText.includes("UPDATE analytics_opportunities")) {
        expect(params).toEqual([OPPORTUNITY_ID, "pending", null, null]);
        return { rows: [] };
      }

      throw new Error(`Unhandled reserve SQL: ${sqlText}`);
    });
    const store = createPostgresAnalyticsBundleGenerationStore(createTransactionalDb(queryMock));

    await expect(
      store.reserveAnalyticsBundleGeneration({
        project_id: PROJECT_ID,
        opportunity_id: OPPORTUNITY_ID,
        requested_by_user_id: USER_ID,
        analysis_kind: "funnel_dropoff",
        analysis_spec: { funnel_key: "checkout", step_key: "payment" }
      })
    ).resolves.toMatchObject({
      generation_id: GENERATION_ID,
      project_id: PROJECT_ID,
      opportunity_id: OPPORTUNITY_ID,
      status: "pending",
      analysis_spec: { funnel_key: "checkout", step_key: "payment" }
    });
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("returns the existing generation for duplicate reservation fingerprints", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string, params: unknown[]) => {
      if (sqlText.includes("INSERT INTO analytics_bundle_generations")) {
        return { rows: [] };
      }

      if (
        sqlText.includes("WHERE project_id = $1::uuid") &&
        sqlText.includes("input_fingerprint = $2")
      ) {
        expect(params[0]).toBe(PROJECT_ID);
        expect(String(params[1])).toMatch(/^sha256:[a-f0-9]{64}$/);
        return { rows: [generationRow] };
      }

      throw new Error(`Unhandled duplicate reservation SQL: ${sqlText}`);
    });
    const store = createPostgresAnalyticsBundleGenerationStore(createTransactionalDb(queryMock));

    await expect(
      store.reserveAnalyticsBundleGeneration({
        project_id: PROJECT_ID,
        opportunity_id: OPPORTUNITY_ID,
        analysis_kind: "funnel_dropoff",
        analysis_spec: { step_key: "payment", funnel_key: "checkout" }
      })
    ).resolves.toMatchObject({
      generation_id: GENERATION_ID,
      status: "pending"
    });
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("resets a failed duplicate generation so the same deterministic request can be retried", async (): Promise<void> => {
    const failedRow = {
      ...generationRow,
      status: "failed",
      failure_reason: "object_store_unavailable",
      claimed_at: "2026-07-08T10:01:00.000Z",
      completed_at: "2026-07-08T10:02:00.000Z"
    };
    const retriedRow = {
      ...generationRow,
      status: "pending",
      failure_reason: null,
      claimed_at: null,
      completed_at: null,
      updated_at: "2026-07-08T10:03:00.000Z"
    };
    const queryMock = vi.fn(async (sqlText: string, params: unknown[]) => {
      if (sqlText.includes("INSERT INTO analytics_bundle_generations")) return { rows: [] };
      if (
        sqlText.includes("WHERE project_id = $1::uuid") &&
        sqlText.includes("input_fingerprint = $2")
      ) {
        return { rows: [failedRow] };
      }
      if (sqlText.includes("UPDATE analytics_bundle_generations")) {
        expect(sqlText).toContain("AND status = 'failed'");
        expect(sqlText).toContain("failure_reason = NULL");
        expect(sqlText).toContain("claimed_at = NULL");
        expect(params).toEqual([
          GENERATION_ID,
          USER_ID,
          OPPORTUNITY_ID,
          JSON.stringify({ funnel_key: "checkout", step_key: "payment" })
        ]);
        return { rows: [retriedRow] };
      }
      if (sqlText.includes("UPDATE analytics_opportunities")) {
        expect(params).toEqual([OPPORTUNITY_ID, "pending", null, null]);
        return { rows: [] };
      }
      throw new Error(`Unhandled failed retry SQL: ${sqlText}`);
    });
    const store = createPostgresAnalyticsBundleGenerationStore(createTransactionalDb(queryMock));

    await expect(
      store.reserveAnalyticsBundleGeneration({
        project_id: PROJECT_ID,
        opportunity_id: OPPORTUNITY_ID,
        requested_by_user_id: USER_ID,
        analysis_kind: "funnel_dropoff",
        analysis_spec: { funnel_key: "checkout", step_key: "payment" }
      })
    ).resolves.toMatchObject({
      generation_id: GENERATION_ID,
      status: "pending",
      failure_reason: null,
      claimed_at: null
    });
    expect(queryMock).toHaveBeenCalledTimes(4);
  });

  it("returns the current generation when another request wins a failed retry race", async (): Promise<void> => {
    const failedRow = { ...generationRow, status: "failed", failure_reason: "transient" };
    const pendingRow = { ...generationRow, status: "pending", failure_reason: null };
    let selectCount = 0;
    const queryMock = vi.fn(async (sqlText: string, params: unknown[]) => {
      if (sqlText.includes("INSERT INTO analytics_bundle_generations")) return { rows: [] };
      if (sqlText.includes("WHERE project_id = $1::uuid")) {
        selectCount += 1;
        return { rows: [failedRow] };
      }
      if (sqlText.includes("UPDATE analytics_bundle_generations")) return { rows: [] };
      if (sqlText.includes("WHERE id = $1::uuid")) {
        expect(params).toEqual([GENERATION_ID]);
        return { rows: [pendingRow] };
      }
      throw new Error(`Unhandled failed retry race SQL: ${sqlText}`);
    });
    const store = createPostgresAnalyticsBundleGenerationStore(createTransactionalDb(queryMock));

    await expect(
      store.reserveAnalyticsBundleGeneration({
        project_id: PROJECT_ID,
        opportunity_id: null,
        requested_by_user_id: USER_ID,
        analysis_kind: "usage_summary",
        analysis_spec: {}
      })
    ).resolves.toMatchObject({ generation_id: GENERATION_ID, status: "pending" });
    expect(selectCount).toBe(1);
    expect(queryMock).toHaveBeenCalledTimes(4);
  });

  it("gets a project-scoped generation by id", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string, params: unknown[]) => {
      expect(sqlText).toContain("FROM analytics_bundle_generations");
      expect(sqlText).toContain("WHERE project_id = $1::uuid");
      expect(sqlText).toContain("AND id = $2::uuid");
      expect(params).toEqual([PROJECT_ID, GENERATION_ID]);
      return { rows: [generationRow] };
    });
    const store = createPostgresAnalyticsBundleGenerationStore(createTransactionalDb(queryMock));

    await expect(
      store.getAnalyticsBundleGenerationForProject({
        project_id: PROJECT_ID,
        generation_id: GENERATION_ID
      })
    ).resolves.toMatchObject({
      generation_id: GENERATION_ID,
      project_id: PROJECT_ID,
      status: "pending"
    });
    expect(queryMock).toHaveBeenCalledOnce();
  });

  it("lists project-scoped generations with filters and cursor pagination", async (): Promise<void> => {
    const overflowGenerationId = "55555555-5555-4555-8555-555555555555";
    const queryMock = vi.fn(async (sqlText: string, params: unknown[]) => {
      expect(sqlText).toContain("FROM analytics_bundle_generations");
      expect(sqlText).toContain("project_id = $1::uuid");
      expect(sqlText).toContain("status = $2");
      expect(sqlText).toContain("analysis_kind = $3");
      expect(sqlText).toContain("(created_at, id) < ($4::timestamptz, $5::uuid)");
      expect(sqlText).toContain("ORDER BY created_at DESC, id DESC");
      expect(sqlText).toContain("LIMIT $6");
      expect(params).toEqual([
        PROJECT_ID,
        "completed",
        "funnel_dropoff",
        "2026-07-09T00:00:00.000Z",
        GENERATION_ID,
        2
      ]);
      return {
        rows: [
          { ...generationRow, status: "completed" },
          {
            ...generationRow,
            generation_id: overflowGenerationId,
            created_at: "2026-07-07T09:00:00.000Z"
          }
        ]
      };
    });
    const store = createPostgresAnalyticsBundleGenerationStore(createTransactionalDb(queryMock));

    await expect(
      store.listAnalyticsBundleGenerationsForProject({
        project_id: PROJECT_ID,
        status: "completed",
        analysis_kind: "funnel_dropoff",
        cursor: {
          created_at: "2026-07-09T00:00:00.000Z",
          generation_id: GENERATION_ID
        },
        limit: 1
      })
    ).resolves.toMatchObject({
      bundles: [
        {
          generation_id: GENERATION_ID,
          status: "completed"
        }
      ],
      next_cursor: `2026-07-08T10:00:00.000Z|${GENERATION_ID}`
    });
    expect(queryMock).toHaveBeenCalledOnce();
  });

  it("lists organization generations with project metadata and a globally stable cursor", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string, params: unknown[]) => {
      expect(sqlText).toContain("JOIN projects p ON p.id = abg.project_id");
      expect(sqlText).toContain("p.organization_id = $1::uuid");
      expect(sqlText).toContain("abg.analysis_spec #>> '{filters,service}' = $2");
      expect(sqlText).toContain("abg.analysis_spec #>> '{filters,environment}' = $3");
      expect(sqlText).toContain("abg.created_at >= $4::timestamptz");
      expect(sqlText).toContain("abg.created_at <= $5::timestamptz");
      expect(sqlText).toContain("(abg.created_at, abg.id) < ($6::timestamptz, $7::uuid)");
      expect(sqlText).toContain("ORDER BY abg.created_at DESC, abg.id DESC");
      expect(params).toEqual([
        "55555555-5555-4555-8555-555555555555",
        "web",
        "production",
        "2026-07-01T00:00:00.000Z",
        "2026-07-10T00:00:00.000Z",
        "2026-07-09T00:00:00.000Z",
        GENERATION_ID,
        2
      ]);
      return {
        rows: [
          {
            ...generationRow,
            status: "completed",
            project_name: "Marketing site",
            project_color_tag: "blue"
          }
        ]
      };
    });
    const store = createPostgresAnalyticsBundleGenerationStore(createTransactionalDb(queryMock));

    await expect(
      store.listAnalyticsBundleGenerationsForOrganization!({
        organization_id: "55555555-5555-4555-8555-555555555555",
        service: "web",
        environment: "production",
        from: "2026-07-01T00:00:00.000Z",
        to: "2026-07-10T00:00:00.000Z",
        cursor: {
          created_at: "2026-07-09T00:00:00.000Z",
          generation_id: GENERATION_ID
        },
        limit: 1
      })
    ).resolves.toMatchObject({
      bundles: [
        {
          generation_id: GENERATION_ID,
          project_name: "Marketing site",
          project_color_tag: "blue"
        }
      ],
      next_cursor: null
    });
  });

  it("builds stable AnalyticsBundle generation cursors", (): void => {
    expect(
      buildAnalyticsBundleGenerationCursor({
        generation_id: GENERATION_ID,
        created_at: "2026-07-08T10:00:00.000Z"
      })
    ).toBe(`2026-07-08T10:00:00.000Z|${GENERATION_ID}`);
  });

  it("claims the oldest pending generation with a skip-locked update", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string, params: unknown[]) => {
      if (sqlText.includes("WITH next_generation AS")) {
        expect(sqlText).toContain("FOR UPDATE SKIP LOCKED");
        expect(sqlText).toContain("ORDER BY created_at ASC, id ASC");
        expect(sqlText).toContain("status = 'running'");
        expect(params).toEqual(["2026-07-08T10:05:00.000Z"]);
        return {
          rows: [
            {
              ...generationRow,
              status: "running",
              claimed_at: "2026-07-08T10:05:00.000Z",
              updated_at: "2026-07-08T10:05:00.000Z"
            }
          ]
        };
      }

      if (sqlText.includes("UPDATE analytics_opportunities")) {
        expect(params).toEqual([OPPORTUNITY_ID, "running", null, null]);
        return { rows: [] };
      }

      throw new Error(`Unhandled claim SQL: ${sqlText}`);
    });
    const store = createPostgresAnalyticsBundleGenerationStore(createTransactionalDb(queryMock));

    await expect(
      store.claimPendingAnalyticsBundleGeneration({
        claimed_at: "2026-07-08T10:05:00.000Z"
      })
    ).resolves.toMatchObject({
      generation_id: GENERATION_ID,
      status: "running",
      claimed_at: "2026-07-08T10:05:00.000Z"
    });
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("claims a specific queued generation without selecting another pending generation", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string, params: unknown[]) => {
      if (sqlText.includes("UPDATE analytics_bundle_generations")) {
        expect(sqlText).toContain("AND id = $2::uuid");
        expect(sqlText).toContain("status IN ('pending', 'running')");
        expect(params).toEqual([PROJECT_ID, GENERATION_ID, "2026-07-08T10:05:00.000Z"]);
        return {
          rows: [
            {
              ...generationRow,
              status: "running",
              claimed_at: "2026-07-08T10:05:00.000Z",
              updated_at: "2026-07-08T10:05:00.000Z"
            }
          ]
        };
      }

      if (sqlText.includes("UPDATE analytics_opportunities")) {
        expect(params).toEqual([OPPORTUNITY_ID, "running", null, null]);
        return { rows: [] };
      }

      throw new Error(`Unhandled specific claim SQL: ${sqlText}`);
    });
    const store = createPostgresAnalyticsBundleGenerationStore(createTransactionalDb(queryMock));

    await expect(
      store.claimAnalyticsBundleGenerationForProject({
        project_id: PROJECT_ID,
        generation_id: GENERATION_ID,
        claimed_at: "2026-07-08T10:05:00.000Z"
      })
    ).resolves.toMatchObject({
      generation_id: GENERATION_ID,
      status: "running",
      claimed_at: "2026-07-08T10:05:00.000Z"
    });
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("marks a generation completed and records the deterministic artifact key", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string, params: unknown[]) => {
      if (sqlText.includes("UPDATE analytics_bundle_generations")) {
        expect(sqlText).toContain("status = 'completed'");
        expect(params).toEqual([
          PROJECT_ID,
          GENERATION_ID,
          `analytics-bundles/${PROJECT_ID}/${GENERATION_ID}/analytics-bundle.json.gz`,
          "2026-07-08T10:10:00.000Z"
        ]);
        return {
          rows: [
            {
              ...generationRow,
              status: "completed",
              object_key: `analytics-bundles/${PROJECT_ID}/${GENERATION_ID}/analytics-bundle.json.gz`,
              completed_at: "2026-07-08T10:10:00.000Z",
              updated_at: "2026-07-08T10:10:00.000Z"
            }
          ]
        };
      }

      if (sqlText.includes("UPDATE analytics_opportunities")) {
        expect(params).toEqual([
          OPPORTUNITY_ID,
          "completed",
          `analytics-bundles/${PROJECT_ID}/${GENERATION_ID}/analytics-bundle.json.gz`,
          null
        ]);
        return { rows: [] };
      }

      throw new Error(`Unhandled complete SQL: ${sqlText}`);
    });
    const store = createPostgresAnalyticsBundleGenerationStore(createTransactionalDb(queryMock));

    await expect(
      store.markAnalyticsBundleGenerationCompleted({
        project_id: PROJECT_ID,
        generation_id: GENERATION_ID,
        completed_at: "2026-07-08T10:10:00.000Z"
      })
    ).resolves.toMatchObject({
      generation_id: GENERATION_ID,
      status: "completed",
      object_key: `analytics-bundles/${PROJECT_ID}/${GENERATION_ID}/analytics-bundle.json.gz`
    });
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("marks a generation failed and stores the failure reason on the linked opportunity", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string, params: unknown[]) => {
      if (sqlText.includes("UPDATE analytics_bundle_generations")) {
        expect(sqlText).toContain("status = 'failed'");
        expect(params).toEqual([
          PROJECT_ID,
          GENERATION_ID,
          "insufficient aggregate inputs",
          "2026-07-08T10:15:00.000Z"
        ]);
        return {
          rows: [
            {
              ...generationRow,
              status: "failed",
              failure_reason: "insufficient aggregate inputs",
              updated_at: "2026-07-08T10:15:00.000Z"
            }
          ]
        };
      }

      if (sqlText.includes("UPDATE analytics_opportunities")) {
        expect(params).toEqual([OPPORTUNITY_ID, "failed", null, "insufficient aggregate inputs"]);
        return { rows: [] };
      }

      throw new Error(`Unhandled fail SQL: ${sqlText}`);
    });
    const store = createPostgresAnalyticsBundleGenerationStore(createTransactionalDb(queryMock));

    await expect(
      store.markAnalyticsBundleGenerationFailed({
        project_id: PROJECT_ID,
        generation_id: GENERATION_ID,
        failed_at: "2026-07-08T10:15:00.000Z",
        reason: "insufficient aggregate inputs"
      })
    ).resolves.toMatchObject({
      generation_id: GENERATION_ID,
      status: "failed",
      failure_reason: "insufficient aggregate inputs"
    });
    expect(queryMock).toHaveBeenCalledTimes(2);
  });
});

function createTransactionalDb(queryMock: unknown): Queryable {
  const query = queryMock as Queryable["query"];

  return {
    query,
    async transaction(callback) {
      return callback({ query });
    }
  };
}
