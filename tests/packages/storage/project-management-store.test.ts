import { describe, expect, it, vi } from "vitest";

import { createPostgresMetadataStore } from "../../../packages/storage/src/index.js";

describe("project management store", () => {
  it("uses the updated project CTE alias when computing billing metrics after project updates", async (): Promise<void> => {
    const userUpdateSql = await captureUpdateSql((store) =>
      store.updateProjectForUser!({
        user_id: "00000000-0000-4000-8000-000000000001",
        project_id: "00000000-0000-4000-8000-000000000002",
        environment_default: "development"
      })
    );
    const organizationUpdateSql = await captureUpdateSql((store) =>
      store.updateProjectForOrganization({
        organization_id: "00000000-0000-4000-8000-000000000003",
        project_id: "00000000-0000-4000-8000-000000000002",
        environment_default: "development"
      })
    );

    for (const sql of [userUpdateSql, organizationUpdateSql]) {
      expect(sql).toContain("WHERE o.id = up.organization_id");
      expect(sql).not.toContain("WHERE o.id = projects.organization_id");
    }
  });
});

async function captureUpdateSql(
  runUpdate: (store: ReturnType<typeof createPostgresMetadataStore>) => Promise<unknown>
): Promise<string> {
  const calls: string[] = [];
  const query = vi.fn().mockImplementation((sql: string) => {
    calls.push(sql);

    if (sql.includes("information_schema.tables")) {
      return { rows: [{ exists: false }] };
    }

    return {
      rows: [
        {
          project_id: "00000000-0000-4000-8000-000000000002",
          organization_id: "00000000-0000-4000-8000-000000000003",
          owner_user_id: "00000000-0000-4000-8000-000000000001",
          owner_email: "owner@example.com",
          relationship: "owned",
          sharing_state: "private",
          effective_role: "owner",
          name: "Main App",
          slug: "main-app",
          environment_default: "development",
          organization_plan: "free",
          metrics: {
            monthly_bundle_requests: 0,
            monthly_raw_ingested_events: 0,
            retained_bundles: 0,
            monthly_alert_deliveries: 0
          },
          created_at: "2026-03-16T00:00:00.000Z",
          updated_at: "2026-03-18T00:00:00.000Z"
        }
      ]
    };
  });
  const store = createPostgresMetadataStore({ query });

  await runUpdate(store);

  const updateSql = calls.find((sql) => sql.includes("WITH updated_project AS"));
  if (updateSql === undefined) {
    throw new Error("update_sql_not_captured");
  }

  return updateSql;
}
