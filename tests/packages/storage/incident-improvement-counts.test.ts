import { describe, expect, it, vi } from "vitest";

import {
  countImprovementsForOrganization,
  countIncidentsForOrganization
} from "../../../packages/storage/src/incident-improvement-counts.js";
import { createPostgresImprovementOpportunityStore } from "../../../packages/storage/src/improvement-opportunity-store.js";
import { createPostgresMetadataStore } from "../../../packages/storage/src/metadata-store.js";
import type { Queryable } from "../../../packages/storage/src/types.js";

function mainWhere(sql: string): string {
  return sql.slice(sql.lastIndexOf("WHERE ") + 6).split("ORDER BY")[0]!.replace(/\s+/g, " ").trim();
}

describe("filtered list counts", () => {
  it("keeps incident count predicates in sync with the paginated list", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ total: "0" }] });
    const db = { query: query as Queryable["query"] };
    const input = {
      organization_id: "org-id",
      user_id: "user-id",
      project_id: "project-id",
      environment: "production",
      service: "api",
      status: "active" as const,
      severity: "high" as const,
      first_seen_after: "2026-10-01T00:00:00.000Z",
      attention_after: "2026-10-02T00:00:00.000Z"
    };

    await createPostgresMetadataStore(db).listIncidentsForOrganization({ ...input, limit: 20 });
    await countIncidentsForOrganization(db, input);

    const calls = query.mock.calls as unknown as Array<[string, unknown[]]>;
    expect(mainWhere(calls[0]![0])).toBe(mainWhere(calls[1]![0]));
    expect(calls[1]![1]).toEqual(calls[0]![1].slice(0, -1));
  });

  it("keeps improvement count predicates in sync with the paginated list", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ total: "0" }] });
    const db = { query: query as Queryable["query"] };
    const input = {
      organization_id: "org-id",
      user_id: "user-id",
      project_id: "project-id",
      environment: "production",
      service: "api",
      status: "open" as const,
      severity: "high" as const,
      kind: "warning_hotspot" as const
    };

    await createPostgresImprovementOpportunityStore(db).listImprovementsForOrganization({ ...input, limit: 20 });
    await countImprovementsForOrganization(db, input);

    const calls = query.mock.calls as unknown as Array<[string, unknown[]]>;
    expect(mainWhere(calls[0]![0])).toBe(mainWhere(calls[1]![0]));
    expect(calls[1]![1]).toEqual(calls[0]![1].slice(0, -1));
  });

  it("counts only incidents visible to the member under the active list filters", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ total: "41" }] });
    const count = await countIncidentsForOrganization(
      { query: query as Queryable["query"] },
      {
        organization_id: "org-id",
        user_id: "user-id",
        project_id: "project-id",
        status: "active",
        service: "api",
        first_seen_after: "2026-10-01T00:00:00.000Z",
        attention_after: "2026-10-02T00:00:00.000Z"
      }
    );

    expect(count).toBe(41);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("FROM incidents i");
    expect(sql).toContain("pm.user_id = $2::uuid");
    expect(sql).toContain("i.status IN ('open', 'regressed')");
    expect(sql).toContain("i.first_seen_at >= $5::timestamptz");
    expect(sql).toContain("i.regressed_at >= $6::timestamptz");
    expect(params).toEqual([
      "org-id",
      "user-id",
      "project-id",
      "api",
      "2026-10-01T00:00:00.000Z",
      "2026-10-02T00:00:00.000Z"
    ]);
  });

  it("counts improvements with the list's visibility and effective status rules", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ total: "0" }] });
    const count = await countImprovementsForOrganization(
      { query: query as Queryable["query"] },
      {
        organization_id: "org-id",
        user_id: "user-id",
        project_id: "project-id",
        status: "open",
        kind: "warning_hotspot"
      }
    );

    expect(count).toBe(0);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("FROM improvement_opportunities io");
    expect(sql).toContain("io.bundle_generation_number > 0");
    expect(sql).toContain("io.evidence->>'response_status'");
    expect(sql).toContain("io.snoozed_until <= now()");
    expect(sql).toContain("pm.user_id = $2::uuid");
    expect(params).toEqual(["org-id", "user-id", "project-id", "open", "warning_hotspot"]);
  });
});
