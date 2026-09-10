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

    // Production may contain Team rows created when 30-second polling was allowed.
    await pool.query("UPDATE availability_checks SET interval_seconds = 30 WHERE id = $1::uuid", [
      created.check_id
    ]);

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
        prior_status: "unknown",
        interval_seconds: 60
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
        check: expect.objectContaining({ interval_seconds: 60 }),
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
        interval_seconds: 60,
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

    const persisted = await pool.query<{ interval_seconds: number }>(
      "SELECT interval_seconds FROM availability_checks WHERE id = $1::uuid",
      [created.check_id]
    );
    expect(persisted.rows[0]?.interval_seconds).toBe(30);
  });

  it("enforces Free monitored-project capacity when creating and re-enabling checks", async () => {
    const organizationId = randomUUID();
    const projectIds = Array.from({ length: 4 }, () => randomUUID());
    const { ownerUserId } = await seedOwnedProject({
      pool,
      organizationId,
      projectId: projectIds[0]!,
      organizationName: "Free availability capacity",
      organizationSlug: `free-availability-${organizationId.slice(0, 8)}`,
      projectName: "Free app 1",
      projectSlug: `free-app-1-${organizationId.slice(0, 8)}`,
      organizationPlan: "free"
    });

    for (const [index, projectId] of projectIds.slice(1).entries()) {
      await pool.query(
        `
          INSERT INTO projects (id, organization_id, owner_user_id, name, slug, environment_default)
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, 'production')
        `,
        [
          projectId,
          organizationId,
          ownerUserId,
          `Free app ${index + 2}`,
          `free-app-${index + 2}-${organizationId.slice(0, 8)}`
        ]
      );
    }

    const store = createPostgresAvailabilityCheckStore(createQueryable(pool));
    const createForProject = async (projectId: string, enabled: boolean) =>
      await store.createCheckForProjectInOrganization({
        organization_id: organizationId,
        project_id: projectId,
        created_by_user_id: ownerUserId,
        name: "Public health",
        url: "https://app.example.com/health",
        method: "GET",
        expected_status_min: 200,
        expected_status_max: 399,
        timeout_ms: 2500,
        interval_seconds: 300,
        failure_threshold: 3,
        recovery_threshold: 2,
        enabled,
        now: "2026-06-15T10:00:00.000Z"
      });

    for (const projectId of projectIds.slice(0, 3)) {
      expect(await createForProject(projectId, true)).not.toBe("limit_reached");
    }

    const preserved = await createForProject(projectIds[3]!, false);
    if (typeof preserved === "string") {
      throw new Error(`availability_check_create_failed:${preserved}`);
    }
    await expect(
      store.updateCheckForProjectInOrganization({
        organization_id: organizationId,
        project_id: projectIds[3]!,
        check_id: preserved.check_id,
        enabled: true,
        now: "2026-06-15T10:00:00.000Z"
      })
    ).resolves.toBe("limit_reached");

    // Simulate an enabled row preserved after a downgrade below the monitored-project cap.
    await pool.query(
      `
        UPDATE availability_checks
        SET enabled = true,
            created_at = now() + INTERVAL '1 minute'
        WHERE id = $1::uuid
      `,
      [preserved.check_id]
    );

    const preservedChecks = await store.listChecksForProjectInOrganization({
      organization_id: organizationId,
      project_id: projectIds[3]!,
      limit: 10
    });
    expect(preservedChecks?.[0]).toEqual(
      expect.objectContaining({
        check_id: preserved.check_id,
        enabled: true,
        status: "paused",
        paused_reason: "plan_monitored_project_limit_exceeded"
      })
    );

    const claimed = await store.claimDueChecks({
      now: "2026-06-15T10:00:00.000Z",
      claim_timeout_before: "2026-06-15T09:59:00.000Z",
      limit: 10
    });
    expect(claimed).toHaveLength(3);
    expect(claimed.map((check) => check.check_id)).not.toContain(preserved.check_id);
  });

  it.each([
    { plan: "free", counts: [3, 1, 1], checksPerProject: 1 },
    { plan: "solo", counts: [10, 10, 10, 3, 3, 3, 3, 3, 3], checksPerProject: 3 }
  ])(
    "does not let per-project-paused checks consume $plan execution capacity",
    async ({ plan, counts, checksPerProject }) => {
      const organizationId = randomUUID();
      const projectIds = counts.map(() => randomUUID());
      const { ownerUserId } = await seedOwnedProject({
        pool,
        organizationId,
        projectId: projectIds[0]!,
        organizationName: "Availability downgrade",
        organizationSlug: `availability-downgrade-${organizationId}`,
        projectName: "Downgrade app 1",
        projectSlug: "downgrade-app-1",
        organizationPlan: "team"
      });
      const store = createPostgresAvailabilityCheckStore(createQueryable(pool));
      const eligibleIds: string[] = [];
      const pausedIds: string[] = [];
      const dueAt = "2026-06-15T10:00:00.000Z";
      let ordinal = 0;

      for (const [projectIndex, count] of counts.entries()) {
        const projectId = projectIds[projectIndex]!;
        if (projectIndex > 0) {
          await pool.query(
            `INSERT INTO projects (id, organization_id, owner_user_id, name, slug)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5)`,
            [projectId, organizationId, ownerUserId, "Downgrade app", `app-${projectIndex}`]
          );
        }
        for (let checkIndex = 0; checkIndex < count; checkIndex += 1) {
          const created = await store.createCheckForProjectInOrganization({
            organization_id: organizationId,
            project_id: projectId,
            created_by_user_id: ownerUserId,
            name: `Check ${checkIndex}`,
            url: "https://app.example.com/health",
            method: "GET",
            expected_status_min: 200,
            expected_status_max: 399,
            timeout_ms: 2500,
            interval_seconds: 60,
            failure_threshold: 2,
            recovery_threshold: 2,
            enabled: true,
            now: dueAt
          });
          if (typeof created === "string") {
            throw new Error(`availability_check_create_failed:${created}`);
          }
          // Make the excess checks precede the later projects deterministically.
          await pool.query("UPDATE availability_checks SET created_at = $2 WHERE id = $1::uuid", [
            created.check_id,
            new Date(Date.UTC(2026, 5, 1, 0, 0, ordinal++)).toISOString()
          ]);
          (checkIndex < checksPerProject ? eligibleIds : pausedIds).push(created.check_id);
        }
      }

      await pool.query("UPDATE organizations SET plan = $2 WHERE id = $1::uuid", [
        organizationId,
        plan
      ]);
      const checks = (
        await Promise.all(
          projectIds.map((projectId) =>
            store.listChecksForProjectInOrganization({
              organization_id: organizationId,
              project_id: projectId,
              limit: 100
            })
          )
        )
      ).flat();
      expect(checks).toHaveLength(eligibleIds.length + pausedIds.length);
      expect(
        checks
          .filter((check) => check?.status !== "paused")
          .map((check) => check?.check_id)
          .sort()
      ).toEqual([...eligibleIds].sort());
      for (const check of checks.filter((row) => pausedIds.includes(row!.check_id))) {
        expect(check).toMatchObject({
          enabled: true,
          status: "paused",
          paused_reason: "plan_check_limit_exceeded"
        });
      }

      const claimed = await store.claimDueChecks({
        now: dueAt,
        claim_timeout_before: "2026-06-15T09:59:00.000Z",
        limit: 100
      });
      expect(
        claimed
          .filter((check) => check.organization_id === organizationId)
          .map((check) => check.check_id)
          .sort()
      ).toEqual([...eligibleIds].sort());
      const preserved = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM availability_checks c
       JOIN projects p ON p.id = c.project_id
       WHERE p.organization_id = $1::uuid AND c.enabled = true AND c.deleted_at IS NULL`,
        [organizationId]
      );
      expect(Number(preserved.rows[0]?.count)).toBe(eligibleIds.length + pausedIds.length);
    }
  );
});
