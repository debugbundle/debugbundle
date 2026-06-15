import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, expect, it } from "vitest";

import { createPostgresAvailabilityCheckStore } from "../../packages/storage/src/availability-check-store.js";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { migrateStorageSchema } from "../../packages/storage/src/schema-migrations.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.ts";

runIntegration("availability checks integration", () => {
  const pool = createIntegrationPool();

  beforeAll(async (): Promise<void> => {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    const db = createQueryable(pool);
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
  });

  afterAll(async (): Promise<void> => {
    await pool.end();
  });

  it("creates, claims, records, and reads a saved check through Postgres", async (): Promise<void> => {
    const organizationId = randomUUID();
    const projectId = randomUUID();
    const { ownerUserId } = await seedOwnedProject({
      pool,
      organizationId,
      projectId,
      organizationName: "Availability checks",
      organizationSlug: `availability-checks-${organizationId.slice(0, 8)}`,
      projectName: "Production app",
      projectSlug: `production-app-${projectId.slice(0, 8)}`,
      organizationPlan: "team"
    });

    const store = createPostgresAvailabilityCheckStore(createQueryable(pool));
    const created = await store.createCheckForProjectInOrganization({
      organization_id: organizationId,
      project_id: projectId,
      created_by_user_id: ownerUserId,
      name: "App login",
      url: "https://app.example.com/login",
      method: "GET",
      expected_status_min: 200,
      expected_status_max: 399,
      timeout_ms: 5000,
      interval_seconds: 60,
      failure_threshold: 3,
      recovery_threshold: 2,
      environment: "production",
      service_name: "debugbundle-app",
      enabled: true,
      now: "2026-06-15T10:00:00.000Z"
    });
    if (typeof created === "string") {
      throw new Error(`availability_check_create_failed:${created}`);
    }

    const claimed = await store.claimNextDueCheck({
      now: "2026-06-15T10:00:00.000Z",
      claim_timeout_before: "2026-06-15T09:59:00.000Z"
    });
    expect(claimed).toEqual(
      expect.objectContaining({
        check_id: created.check_id,
        project_id: projectId,
        organization_id: organizationId,
        service_name: "debugbundle-app",
        prior_status: "unknown"
      })
    );
    if (claimed === null) {
      throw new Error("availability_check_claim_failed");
    }

    const recorded = await store.recordCheckExecution({
      check_id: claimed.check_id,
      scheduled_for: claimed.due_at,
      claimed_at: claimed.claimed_at,
      started_at: "2026-06-15T10:00:01.000Z",
      completed_at: "2026-06-15T10:00:01.180Z",
      result: {
        status: "success",
        http_status: 200,
        duration_ms: 180,
        error_kind: null,
        error_message: null,
        checked_url_host: "app.example.com",
        checked_url_path: "/login",
        checked_url_query: {},
        final_url: "https://app.example.com/login",
        redirect_count: 0
      }
    });

    expect(recorded).toEqual(
      expect.objectContaining({
        next_status: "passing",
        emit_failure_event: false,
        resolve_incident_id: null
      })
    );

    const checks = await store.listChecksForProjectInOrganization({
      organization_id: organizationId,
      project_id: projectId,
      limit: 10
    });
    expect(checks?.[0]).toEqual(
      expect.objectContaining({
        check_id: created.check_id,
        status: "passing",
        last_checked_at: "2026-06-15 10:00:01.18+00",
        last_result_status: "success",
        last_result_http_status: 200
      })
    );

    const results = await store.listResultsForCheckInOrganization({
      organization_id: organizationId,
      project_id: projectId,
      check_id: created.check_id,
      limit: 10
    });
    expect(results).toEqual([
      expect.objectContaining({
        check_id: created.check_id,
        status: "success",
        http_status: 200
      })
    ]);

    const rollups = await store.listDailyRollupsForCheckInOrganization({
      organization_id: organizationId,
      project_id: projectId,
      check_id: created.check_id,
      limit: 10
    });
    expect(rollups).toEqual([
      expect.objectContaining({
        check_id: created.check_id,
        day: "2026-06-15",
        state: "operational",
        total_checks: 1,
        successful_checks: 1
      })
    ]);
  });
});
