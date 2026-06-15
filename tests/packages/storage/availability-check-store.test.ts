import { describe, expect, it, vi } from "vitest";

import { createPostgresAvailabilityCheckStore } from "../../../packages/storage/src/availability-check-store.js";
import type { AvailabilityCheckExecutionResult } from "../../../packages/storage/src/availability-check-executor.js";

function buildCheckRow(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    check_id: "chk_1",
    project_id: "proj_1",
    name: "Primary app",
    url: "https://app.example.com/health",
    method: "GET",
    expected_status_min: 200,
    expected_status_max: 399,
    timeout_ms: 5000,
    interval_seconds: 60,
    failure_threshold: 3,
    recovery_threshold: 2,
    environment: "production",
    service_name: "web",
    enabled: true,
    base_status: "passing",
    organization_plan: "team",
    consecutive_failures: 0,
    consecutive_successes: 12,
    linked_incident_id: null,
    last_checked_at: "2026-06-15T10:00:00.000Z",
    next_check_at: "2026-06-15T10:01:00.000Z",
    last_result_status: "success",
    last_result_http_status: 200,
    last_result_error_kind: null,
    last_result_error_message: null,
    last_result_duration_ms: 180,
    created_at: "2026-06-15T09:00:00.000Z",
    updated_at: "2026-06-15T10:00:00.000Z",
    within_plan_limit: true,
    meets_plan_interval: true,
    ...overrides
  };
}

function buildClaimedRow(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    check_id: "chk_1",
    project_id: "proj_1",
    organization_id: "org_1",
    owner_user_id: "user_1",
    organization_plan: "team",
    name: "Primary app",
    url: "https://app.example.com/health",
    method: "GET",
    expected_status_min: 200,
    expected_status_max: 399,
    timeout_ms: 5000,
    interval_seconds: 60,
    failure_threshold: 3,
    recovery_threshold: 2,
    environment: "production",
    service_name: "web",
    due_at: "2026-06-15T10:00:00.000Z",
    claimed_at: "2026-06-15T10:00:00.000Z",
    linked_incident_id: null,
    prior_status: "passing",
    consecutive_failures: 0,
    consecutive_successes: 2,
    ...overrides
  };
}

function createSequentialDb(results: Array<{ rows: Record<string, unknown>[] }>) {
  const queue = [...results];
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    void sql;
    void values;
    const next = queue.shift();
    if (next === undefined) {
      throw new Error("unexpected query");
    }
    return next;
  });

  return {
    query,
    transaction: async <Result>(callback: (tx: { query: typeof query }) => Promise<Result>) => callback({ query })
  };
}

function createSplitTransactionalDb(input: {
  dbResults?: Array<{ rows: Record<string, unknown>[] }>;
  txResults: Array<{ rows: Record<string, unknown>[] }>;
}) {
  const dbQueue = [...(input.dbResults ?? [])];
  const txQueue = [...input.txResults];
  const dbQuery = vi.fn(async (sql: string, values?: unknown[]) => {
    void sql;
    void values;
    const next = dbQueue.shift();
    if (next === undefined) {
      throw new Error("unexpected db query");
    }
    return next;
  });
  const txQuery = vi.fn(async (sql: string, values?: unknown[]) => {
    void sql;
    void values;
    const next = txQueue.shift();
    if (next === undefined) {
      throw new Error("unexpected tx query");
    }
    return next;
  });

  return {
    query: dbQuery,
    txQuery,
    transaction: async <Result>(callback: (tx: { query: typeof txQuery }) => Promise<Result>) =>
      callback({ query: txQuery })
  };
}

const successResult: AvailabilityCheckExecutionResult = {
  status: "success",
  http_status: 200,
  duration_ms: 180,
  error_kind: null,
  error_message: null,
  checked_url_host: "app.example.com",
  checked_url_path: "/health",
  checked_url_query: {},
  final_url: "https://app.example.com/health",
  redirect_count: 0
};

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

    const createFailureStore = createPostgresAvailabilityCheckStore(
      createSequentialDb([
        { rows: [{ environment_default: "production", organization_plan: "team" }] },
        { rows: [{ count: "0" }] },
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

    const updateStoreDb = createSequentialDb([
        { rows: [{ organization_plan: "team" }] },
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
    const updateSql = updateStoreDb.query.mock.calls[1]?.[0];
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

  it("claims due checks and records executions across status transitions", async () => {
    const claimDb = createSequentialDb([{ rows: [buildClaimedRow()] }, { rows: [] }]);
    const claimStore = createPostgresAvailabilityCheckStore(claimDb as never);
    await expect(
      claimStore.claimNextDueCheck({
        now: "2026-06-15T10:00:00.000Z",
        claim_timeout_before: "2026-06-15T09:59:00.000Z"
      })
    ).resolves.toEqual(expect.objectContaining({ check_id: "chk_1", prior_status: "passing" }));
    const claimSql = String(claimDb.query.mock.calls[0]?.[0] ?? "");
    expect(claimSql).toMatch(/candidate AS \(\s+SELECT ranked\.id AS check_id\s+FROM ranked/s);
    expect(claimSql).toMatch(/ORDER BY ranked\.next_check_at ASC, ranked\.id ASC/s);
    expect(claimSql).toMatch(/JOIN candidate ON candidate\.check_id = ranked\.id/s);
    await expect(
      claimStore.claimNextDueCheck({
        now: "2026-06-15T10:00:00.000Z",
        claim_timeout_before: "2026-06-15T09:59:00.000Z"
      })
    ).resolves.toBeNull();

    const rowUndefinedDb = createSequentialDb([{ rows: [] }]);
    const rowUndefinedStore = createPostgresAvailabilityCheckStore(rowUndefinedDb as never);
    await expect(
      rowUndefinedStore.recordCheckExecution({
        check_id: "chk_1",
        scheduled_for: "2026-06-15T10:00:00.000Z",
        claimed_at: "2026-06-15T10:00:00.000Z",
        started_at: "2026-06-15T10:00:00.000Z",
        completed_at: "2026-06-15T10:00:00.180Z",
        result: successResult
      })
    ).resolves.toBeNull();
    const recordSql = String(rowUndefinedDb.query.mock.calls[0]?.[0] ?? "");
    expect(recordSql).toMatch(/SELECT\s+c\.id::text AS check_id/s);
    expect(recordSql).toMatch(/c\.project_id::text AS project_id/s);
    expect(recordSql).toMatch(/c\.name,\s+c\.url,\s+c\.method,/s);
    expect(recordSql).toMatch(/FOR UPDATE OF c/s);

    const failureStore = createPostgresAvailabilityCheckStore(
      createSequentialDb([
        {
          rows: [
            {
              ...buildClaimedRow({
                prior_status: "passing",
                consecutive_failures: 2,
                linked_incident_id: "inc_1"
              }),
              status: "passing",
              linked_incident_status: "resolved"
            }
          ]
        },
        { rows: [] },
        { rows: [] },
        { rows: [] }
      ]) as never
    );
    await expect(
      failureStore.recordCheckExecution({
        check_id: "chk_1",
        scheduled_for: "2026-06-15T10:00:00.000Z",
        claimed_at: "2026-06-15T10:00:00.000Z",
        started_at: "2026-06-15T10:00:00.000Z",
        completed_at: "2026-06-15T10:01:00.000Z",
        result: {
          ...successResult,
          status: "timeout",
          http_status: null,
          error_kind: "timeout",
          error_message: "timed out"
        }
      })
    ).resolves.toEqual(
      expect.objectContaining({
        next_status: "failing",
        emit_failure_event: true,
        resolve_incident_id: null
      })
    );

    const unlinkedFailureStore = createPostgresAvailabilityCheckStore(
      createSequentialDb([
        {
          rows: [
            {
              ...buildClaimedRow({
                prior_status: "failing",
                consecutive_failures: 3,
                linked_incident_id: null
              }),
              status: "failing",
              linked_incident_status: null
            }
          ]
        },
        { rows: [] },
        { rows: [] },
        { rows: [] }
      ]) as never
    );
    await expect(
      unlinkedFailureStore.recordCheckExecution({
        check_id: "chk_1",
        scheduled_for: "2026-06-15T10:00:00.000Z",
        claimed_at: "2026-06-15T10:00:00.000Z",
        started_at: "2026-06-15T10:00:00.000Z",
        completed_at: "2026-06-15T10:01:00.000Z",
        result: {
          ...successResult,
          status: "timeout",
          http_status: null,
          error_kind: "timeout",
          error_message: "timed out"
        }
      })
    ).resolves.toEqual(
      expect.objectContaining({
        next_status: "failing",
        emit_failure_event: true,
        resolve_incident_id: null
      })
    );

    const recoveryStore = createPostgresAvailabilityCheckStore(
      createSequentialDb([
        {
          rows: [
            {
              ...buildClaimedRow({
                prior_status: "failing",
                consecutive_failures: 1,
                consecutive_successes: 1,
                linked_incident_id: "inc_2"
              }),
              status: "failing",
              linked_incident_status: "open"
            }
          ]
        },
        { rows: [] },
        { rows: [] },
        { rows: [] }
      ]) as never
    );
    await expect(
      recoveryStore.recordCheckExecution({
        check_id: "chk_1",
        scheduled_for: "2026-06-15T10:00:00.000Z",
        claimed_at: "2026-06-15T10:00:00.000Z",
        started_at: "2026-06-15T10:00:00.000Z",
        completed_at: "2026-06-15T10:01:00.000Z",
        result: successResult
      })
    ).resolves.toEqual(
      expect.objectContaining({
        next_status: "passing",
        emit_failure_event: false,
        resolve_incident_id: "inc_2"
      })
    );
  });

  it("links incidents, appends rollup incidents, and purges expired history", async () => {
    const store = createPostgresAvailabilityCheckStore(
      createSequentialDb([
        { rows: [] },
        { rows: [] },
        { rows: [{ count: "4" }] },
        { rows: [{ count: "2" }] }
      ]) as never
    );

    await expect(
      store.linkIncidentToCheck({
        check_id: "chk_1",
        incident_id: "inc_1",
        linked_at: "2026-06-15T10:00:00.000Z"
      })
    ).resolves.toBeUndefined();

    await expect(
      store.appendIncidentToDailyRollup({
        check_id: "chk_1",
        project_id: "proj_1",
        day: "2026-06-15",
        incident_id: "inc_1"
      })
    ).resolves.toBeUndefined();

    await expect(
      store.purgeExpiredResults({ now: "2026-07-15T10:00:00.000Z" })
    ).resolves.toBe(4);

    await expect(
      store.purgeExpiredDailyRollups({ now: "2026-07-15T10:00:00.000Z" })
    ).resolves.toBe(2);
  });
});
