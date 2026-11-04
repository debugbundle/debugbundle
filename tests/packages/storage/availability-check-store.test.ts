import { describe, expect, it } from "vitest";
import { createPostgresAvailabilityCheckStore } from "../../../packages/storage/src/availability-check-store.js";
import {
  buildCheckRow,
  createSequentialDb,
  createSplitTransactionalDb
} from "../../helpers/availability-check-storage.js";

describe("availability check store", () => {
  it("lists and gets project checks, including project-not-found fallback", async () => {
    const db = createSequentialDb([
      { rows: [buildCheckRow()] },
      { rows: [buildCheckRow({ check_id: "chk_2" })] },
      { rows: [] },
      { rows: [] }
    ]);
    const store = createPostgresAvailabilityCheckStore(db as never);

    await expect(
      store.listChecksForProjectInOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        limit: 20
      })
    ).resolves.toEqual([
      expect.objectContaining({
        check_id: "chk_1",
        status: "passing",
        paused_reason: null
      })
    ]);

    await expect(
      store.getCheckForProjectInOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        check_id: "chk_2"
      })
    ).resolves.toEqual(expect.objectContaining({ check_id: "chk_2" }));
    const getCheckSql = db.query.mock.calls[1]?.[0];
    expect(String(getCheckSql)).toMatch(
      /FROM ranked\s+WHERE \(\$4::text IS NULL OR ranked\.check_id = \$4\)\s+ORDER BY ranked\.created_at DESC\s+LIMIT \$3/
    );

    await expect(
      store.listChecksForProjectInOrganization({
        organization_id: "org_missing",
        project_id: "proj_missing",
        limit: 20
      })
    ).resolves.toBeNull();
  });

  it("creates, updates, and deletes checks across success and guardrail paths", async () => {
    const missingProjectStore = createPostgresAvailabilityCheckStore(
      createSequentialDb([{ rows: [] }]) as never
    );
    await expect(
      missingProjectStore.createCheckForProjectInOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        created_by_user_id: "user_1",
        name: "Primary app",
        url: "https://app.example.com/health",
        method: "GET",
        expected_status_min: 200,
        expected_status_max: 399,
        timeout_ms: 5000,
        interval_seconds: 60,
        failure_threshold: 3,
        recovery_threshold: 2,
        enabled: true,
        now: "2026-06-15T10:00:00.000Z"
      })
    ).resolves.toBe("project_not_found");

    const intervalTooLowStore = createPostgresAvailabilityCheckStore(
      createSequentialDb([
        { rows: [{ environment_default: "production", organization_plan: "free" }] }
      ]) as never
    );
    await expect(
      intervalTooLowStore.createCheckForProjectInOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        created_by_user_id: "user_1",
        name: "Primary app",
        url: "https://app.example.com/health",
        method: "GET",
        expected_status_min: 200,
        expected_status_max: 399,
        timeout_ms: 5000,
        interval_seconds: 60,
        failure_threshold: 3,
        recovery_threshold: 2,
        enabled: true,
        now: "2026-06-15T10:00:00.000Z"
      })
    ).resolves.toBe("interval_too_low");

    const limitReachedStore = createPostgresAvailabilityCheckStore(
      createSequentialDb([
        { rows: [{ environment_default: "production", organization_plan: "free" }] },
        { rows: [{ count: "1" }] }
      ]) as never
    );
    await expect(
      limitReachedStore.createCheckForProjectInOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        created_by_user_id: "user_1",
        name: "Primary app",
        url: "https://app.example.com/health",
        method: "GET",
        expected_status_min: 200,
        expected_status_max: 399,
        timeout_ms: 5000,
        interval_seconds: 300,
        failure_threshold: 3,
        recovery_threshold: 2,
        enabled: true,
        now: "2026-06-15T10:00:00.000Z"
      })
    ).resolves.toBe("limit_reached");

    const createStore = createPostgresAvailabilityCheckStore(
      createSequentialDb([
        { rows: [{ environment_default: "production", organization_plan: "team" }] },
        { rows: [{ count: "0" }] },
        {
          rows: [
            { active_check_count: "0", monitored_project_count: "0", project_is_monitored: false }
          ]
        },
        { rows: [] },
        { rows: [buildCheckRow()] }
      ]) as never
    );
    await expect(
      createStore.createCheckForProjectInOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        created_by_user_id: "user_1",
        name: "Primary app",
        url: "https://app.example.com/health",
        method: "GET",
        expected_status_min: 200,
        expected_status_max: 399,
        timeout_ms: 5000,
        interval_seconds: 60,
        failure_threshold: 3,
        recovery_threshold: 2,
        enabled: true,
        now: "2026-06-15T10:00:00.000Z"
      })
    ).resolves.toEqual(expect.objectContaining({ check_id: "chk_1" }));

    const transactionalCreateStoreDb = createSplitTransactionalDb({
      txResults: [
        { rows: [{ environment_default: "production", organization_plan: "team" }] },
        { rows: [{ count: "0" }] },
        {
          rows: [
            { active_check_count: "0", monitored_project_count: "0", project_is_monitored: false }
          ]
        },
        { rows: [] },
        { rows: [buildCheckRow()] }
      ]
    });
    const transactionalCreateStore = createPostgresAvailabilityCheckStore(
      transactionalCreateStoreDb as never
    );
    await expect(
      transactionalCreateStore.createCheckForProjectInOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        created_by_user_id: "user_1",
        name: "Primary app",
        url: "https://app.example.com/health",
        method: "GET",
        expected_status_min: 200,
        expected_status_max: 399,
        timeout_ms: 5000,
        interval_seconds: 60,
        failure_threshold: 3,
        recovery_threshold: 2,
        enabled: true,
        now: "2026-06-15T10:00:00.000Z"
      })
    ).resolves.toEqual(expect.objectContaining({ check_id: "chk_1" }));
    expect(transactionalCreateStoreDb.query).not.toHaveBeenCalled();
    expect(String(transactionalCreateStoreDb.txQuery.mock.calls[0]?.[0])).toContain(
      "FROM organizations WHERE id=$1::uuid FOR UPDATE"
    );
    expect(String(transactionalCreateStoreDb.txQuery.mock.calls[1]?.[0])).toContain(
      "debugbundle_begin_project_rule_write"
    );

    const createFailureStore = createPostgresAvailabilityCheckStore(
      createSequentialDb([
        { rows: [{ environment_default: "production", organization_plan: "team" }] },
        { rows: [{ count: "0" }] },
        {
          rows: [
            { active_check_count: "0", monitored_project_count: "0", project_is_monitored: false }
          ]
        },
        { rows: [] },
        { rows: [] }
      ]) as never
    );
    await expect(
      createFailureStore.createCheckForProjectInOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        created_by_user_id: "user_1",
        name: "Primary app",
        url: "https://app.example.com/health",
        method: "GET",
        expected_status_min: 200,
        expected_status_max: 399,
        timeout_ms: 5000,
        interval_seconds: 60,
        failure_threshold: 3,
        recovery_threshold: 2,
        enabled: true,
        now: "2026-06-15T10:00:00.000Z"
      })
    ).rejects.toThrow("availability_check_insert_failed");

    const organizationLimitStore = createPostgresAvailabilityCheckStore(
      createSequentialDb([
        { rows: [{ environment_default: "production", organization_plan: "team" }] },
        { rows: [{ count: "0" }] },
        {
          rows: [
            {
              active_check_count: "50",
              monitored_project_count: "10",
              project_is_monitored: false
            }
          ]
        }
      ]) as never
    );
    await expect(
      organizationLimitStore.createCheckForProjectInOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        created_by_user_id: "user_1",
        name: "Primary app",
        url: "https://app.example.com/health",
        method: "GET",
        expected_status_min: 200,
        expected_status_max: 399,
        timeout_ms: 5000,
        interval_seconds: 60,
        failure_threshold: 2,
        recovery_threshold: 2,
        enabled: true,
        now: "2026-06-15T10:00:00.000Z"
      })
    ).resolves.toBe("limit_reached");

    const missingUpdateStore = createPostgresAvailabilityCheckStore(
      createSequentialDb([{ rows: [] }]) as never
    );
    await expect(
      missingUpdateStore.updateCheckForProjectInOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        check_id: "chk_1",
        now: "2026-06-15T10:00:00.000Z"
      })
    ).resolves.toBe("check_not_found");

    const lowIntervalUpdateStore = createPostgresAvailabilityCheckStore(
      createSequentialDb([{ rows: [{ organization_plan: "solo" }] }]) as never
    );
    await expect(
      lowIntervalUpdateStore.updateCheckForProjectInOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        check_id: "chk_1",
        interval_seconds: 30,
        now: "2026-06-15T10:00:00.000Z"
      })
    ).resolves.toBe("interval_too_low");

    const projectLimitActivationStore = createPostgresAvailabilityCheckStore(
      createSequentialDb([
        {
          rows: [{ organization_plan: "free", enabled: false, project_check_rank: "2" }]
        }
      ]) as never
    );
    await expect(
      projectLimitActivationStore.updateCheckForProjectInOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        check_id: "chk_2",
        enabled: true,
        now: "2026-06-15T10:00:00.000Z"
      })
    ).resolves.toBe("limit_reached");

    const activationLimitStore = createPostgresAvailabilityCheckStore(
      createSequentialDb([
        {
          rows: [{ organization_plan: "free", enabled: false, project_check_rank: "1" }]
        },
        {
          rows: [
            {
              active_check_count: "3",
              monitored_project_count: "3",
              project_is_monitored: false
            }
          ]
        }
      ]) as never
    );
    await expect(
      activationLimitStore.updateCheckForProjectInOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        check_id: "chk_1",
        enabled: true,
        now: "2026-06-15T10:00:00.000Z"
      })
    ).resolves.toBe("limit_reached");

    const updateStoreDb = createSequentialDb([
      { rows: [{ organization_plan: "team", origin_id: "proj_1" }] },
      { rows: [] },
      { rows: [buildCheckRow({ enabled: false })] }
    ]);
    const updateStore = createPostgresAvailabilityCheckStore(updateStoreDb as never);
    await expect(
      updateStore.updateCheckForProjectInOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        check_id: "chk_1",
        enabled: false,
        service_name: null,
        now: "2026-06-15T10:00:00.000Z"
      })
    ).resolves.toEqual(expect.objectContaining({ enabled: false }));
    const updateSql = updateStoreDb.query.mock.calls.find(([sql]) =>
      sql.includes("UPDATE availability_checks c")
    )?.[0];
    expect(String(updateSql)).toMatch(/FROM projects p/);
    expect(String(updateSql)).toMatch(/p\.organization_id = \$3::uuid/);

    const transactionalUpdateStoreDb = createSplitTransactionalDb({
      txResults: [
        { rows: [{ organization_plan: "team" }] },
        { rows: [] },
        { rows: [buildCheckRow({ enabled: false })] }
      ]
    });
    const transactionalUpdateStore = createPostgresAvailabilityCheckStore(
      transactionalUpdateStoreDb as never
    );
    await expect(
      transactionalUpdateStore.updateCheckForProjectInOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        check_id: "chk_1",
        enabled: false,
        now: "2026-06-15T10:00:00.000Z"
      })
    ).resolves.toEqual(expect.objectContaining({ enabled: false }));
    expect(transactionalUpdateStoreDb.query).not.toHaveBeenCalled();

    const updateFallbackStore = createPostgresAvailabilityCheckStore(
      createSequentialDb([
        { rows: [{ organization_plan: "team" }] },
        { rows: [] },
        { rows: [] }
      ]) as never
    );
    await expect(
      updateFallbackStore.updateCheckForProjectInOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        check_id: "chk_1",
        name: "Updated",
        now: "2026-06-15T10:00:00.000Z"
      })
    ).resolves.toBe("check_not_found");

    const deleteStore = createPostgresAvailabilityCheckStore(
      createSequentialDb([{ rows: [{ check_id: "chk_1" }] }, { rows: [] }]) as never
    );
    await expect(
      deleteStore.deleteCheckForProjectInOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        check_id: "chk_1",
        deleted_at: "2026-06-15T10:00:00.000Z"
      })
    ).resolves.toBe(true);
    await expect(
      deleteStore.deleteCheckForProjectInOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        check_id: "chk_missing",
        deleted_at: "2026-06-15T10:00:00.000Z"
      })
    ).resolves.toBe(false);
  });

  it("lists retained results and rollups and handles empty lookups", async () => {
    const store = createPostgresAvailabilityCheckStore(
      createSequentialDb([
        {
          rows: [
            {
              result_id: "res_1",
              check_id: "chk_1",
              project_id: "proj_1",
              started_at: "2026-06-15T10:00:00.000Z",
              completed_at: "2026-06-15T10:00:00.180Z",
              duration_ms: 180,
              status: "success",
              http_status: 200,
              error_kind: null,
              error_message: null,
              redirect_count: 0,
              checked_url_host: "app.example.com",
              final_url: "https://app.example.com/health"
            }
          ]
        },
        {
          rows: [
            {
              check_id: "chk_1",
              project_id: "proj_1",
              day: "2026-06-15",
              state: "operational",
              total_checks: 1440,
              successful_checks: 1438,
              failed_checks: 2,
              degraded_checks: 0,
              avg_duration_ms: 185,
              first_checked_at: "2026-06-15T00:00:00.000Z",
              last_checked_at: "2026-06-15T23:59:00.000Z",
              downtime_seconds: 60,
              incident_ids: null
            }
          ]
        },
        { rows: [] },
        { rows: [buildCheckRow()] },
        { rows: [] },
        { rows: [] }
      ]) as never
    );

    await expect(
      store.listResultsForCheckInOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        check_id: "chk_1",
        limit: 20
      })
    ).resolves.toEqual([expect.objectContaining({ result_id: "res_1" })]);

    await expect(
      store.listDailyRollupsForCheckInOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        check_id: "chk_1",
        limit: 20
      })
    ).resolves.toEqual([
      expect.objectContaining({
        day: "2026-06-15",
        incident_ids: []
      })
    ]);

    await expect(
      store.listResultsForCheckInOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        check_id: "chk_1",
        limit: 20
      })
    ).resolves.toEqual([]);

    await expect(
      store.listDailyRollupsForCheckInOrganization({
        organization_id: "org_1",
        project_id: "proj_missing",
        check_id: "chk_missing",
        limit: 20
      })
    ).resolves.toBeNull();
  });
});
