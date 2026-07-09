import { describe, expect, it, vi } from "vitest";

import {
  buildAnalyticsJourneySamplesCursor,
  createPostgresAnalyticsJourneySampleStore,
  type Queryable
} from "../../../packages/storage/src/index.js";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const SAMPLE_ID = "22222222-2222-4222-8222-222222222222";
const OVERFLOW_SAMPLE_ID = "33333333-3333-4333-8333-333333333333";
const NOW = "2026-07-09T12:00:00.000Z";

const sampleRow = {
  sample_id: SAMPLE_ID,
  project_id: PROJECT_ID,
  service: "web",
  environment: "production",
  session_id_hash: "sha256:session",
  visitor_id_hash: "sha256:visitor",
  analysis_tags: ["checkout", "loop"],
  first_seen_at: "2026-07-09T10:00:00.000Z",
  last_seen_at: "2026-07-09T10:05:00.000Z",
  dimensions_summary: { device_type: "mobile" },
  object_key: "analytics-journeys/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.json.gz",
  expires_at: "2026-07-16T10:05:00.000Z",
  created_at: "2026-07-09T10:05:01.000Z"
};

describe("analytics journey sample store", () => {
  it("lists retained project samples with filters and cursor pagination", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string, params: unknown[]) => {
      expect(sqlText).toContain("FROM analytics_journey_samples");
      expect(sqlText).toContain("project_id = $1::uuid");
      expect(sqlText).toContain("expires_at > $2::timestamptz");
      expect(sqlText).toContain("service = $3");
      expect(sqlText).toContain("environment = $4");
      expect(sqlText).toContain("analysis_tags @> ARRAY[$5]::text[]");
      expect(sqlText).toContain("(last_seen_at, id) < ($6::timestamptz, $7::uuid)");
      expect(sqlText).toContain("ORDER BY last_seen_at DESC, id DESC");
      expect(sqlText).toContain("LIMIT $8");
      expect(params).toEqual([
        PROJECT_ID,
        NOW,
        "web",
        "production",
        "checkout",
        "2026-07-09T11:00:00.000Z",
        SAMPLE_ID,
        2
      ]);
      return {
        rows: [
          sampleRow,
          {
            ...sampleRow,
            sample_id: OVERFLOW_SAMPLE_ID,
            last_seen_at: "2026-07-09T09:00:00.000Z"
          }
        ]
      };
    });
    const store = createPostgresAnalyticsJourneySampleStore(createDb(queryMock));

    await expect(
      store.listAnalyticsJourneySamplesForProject({
        project_id: PROJECT_ID,
        service: "web",
        environment: "production",
        tag: "checkout",
        cursor: {
          last_seen_at: "2026-07-09T11:00:00.000Z",
          sample_id: SAMPLE_ID
        },
        limit: 1,
        now: NOW
      })
    ).resolves.toEqual({
      samples: [{
        sample_id: SAMPLE_ID,
        project_id: PROJECT_ID,
        service: "web",
        environment: "production",
        session_id_hash: "sha256:session",
        visitor_id_hash: "sha256:visitor",
        analysis_tags: ["checkout", "loop"],
        first_seen_at: "2026-07-09T10:00:00.000Z",
        last_seen_at: "2026-07-09T10:05:00.000Z",
        dimensions_summary: { device_type: "mobile" },
        has_artifact: true,
        object_key: sampleRow.object_key,
        expires_at: "2026-07-16T10:05:00.000Z",
        created_at: "2026-07-09T10:05:01.000Z"
      }],
      next_cursor: `2026-07-09T10:05:00.000Z|${SAMPLE_ID}`
    });
  });

  it("gets one retained project sample by id", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string, params: unknown[]) => {
      expect(sqlText).toContain("FROM analytics_journey_samples");
      expect(sqlText).toContain("project_id = $1::uuid");
      expect(sqlText).toContain("id = $2::uuid");
      expect(sqlText).toContain("expires_at > $3::timestamptz");
      expect(params).toEqual([PROJECT_ID, SAMPLE_ID, NOW]);
      return { rows: [{ ...sampleRow, service: "", environment: "" }] };
    });
    const store = createPostgresAnalyticsJourneySampleStore(createDb(queryMock));

    await expect(
      store.getAnalyticsJourneySampleForProject({
        project_id: PROJECT_ID,
        sample_id: SAMPLE_ID,
        now: NOW
      })
    ).resolves.toMatchObject({
      sample_id: SAMPLE_ID,
      project_id: PROJECT_ID,
      service: null,
      environment: null,
      object_key: sampleRow.object_key
    });
  });

  it("builds stable journey sample cursors", (): void => {
    expect(buildAnalyticsJourneySamplesCursor({
      last_seen_at: "2026-07-09T10:05:00.000Z",
      sample_id: SAMPLE_ID
    })).toBe(`2026-07-09T10:05:00.000Z|${SAMPLE_ID}`);
  });
});

function createDb(queryMock: unknown): Queryable {
  return {
    query: queryMock as Queryable["query"]
  };
}
