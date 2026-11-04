import { describe, expect, it } from "vitest";
import { createPostgresAvailabilityCheckStore } from "../../../packages/storage/src/availability-check-store.js";
import {
  buildClaimedRow,
  createSequentialDb,
  successResult
} from "../../helpers/availability-check-storage.js";

describe("availability check execution storage", () => {
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
    expect(claimSql).toMatch(/LIMIT \$3/s);
    expect(claimSql).toMatch(/JOIN candidate ON candidate\.check_id = ranked\.id/s);
    expect(claimSql).toContain("monitored_project_rank <=");
    expect(claimSql).toContain("organization_check_rank <=");
    expect(claimSql).toMatch(
      /JOIN monitored_project_ranks monitored_ranks[\s\S]+monitored_ranks\.monitored_project_rank <=/
    );
    expect(claimSql).not.toContain("interval_seconds >=");
    expect(claimDb.query.mock.calls[0]?.[1]).toEqual([
      "2026-06-15T10:00:00.000Z",
      "2026-06-15T09:59:00.000Z",
      1
    ]);
    await expect(
      claimStore.claimNextDueCheck({
        now: "2026-06-15T10:00:00.000Z",
        claim_timeout_before: "2026-06-15T09:59:00.000Z"
      })
    ).resolves.toBeNull();

    const batchClaimDb = createSequentialDb([
      {
        rows: [
          buildClaimedRow({
            check_id: "chk_2",
            due_at: "2026-06-15T10:00:30.000Z"
          }),
          buildClaimedRow({
            check_id: "chk_1",
            due_at: "2026-06-15T10:00:00.000Z"
          })
        ]
      }
    ]);
    const batchClaimStore = createPostgresAvailabilityCheckStore(batchClaimDb as never);
    await expect(
      batchClaimStore.claimDueChecks({
        now: "2026-06-15T10:01:00.000Z",
        claim_timeout_before: "2026-06-15T09:56:00.000Z",
        limit: 20
      })
    ).resolves.toEqual([
      expect.objectContaining({ check_id: "chk_1" }),
      expect.objectContaining({ check_id: "chk_2" })
    ]);
    expect(batchClaimDb.query.mock.calls[0]?.[1]).toEqual([
      "2026-06-15T10:01:00.000Z",
      "2026-06-15T09:56:00.000Z",
      20
    ]);

    const legacyIntervalStore = createPostgresAvailabilityCheckStore(
      createSequentialDb([{ rows: [buildClaimedRow({ interval_seconds: 30 })] }]) as never
    );
    await expect(
      legacyIntervalStore.claimNextDueCheck({
        now: "2026-06-15T10:00:00.000Z",
        claim_timeout_before: "2026-06-15T09:59:00.000Z"
      })
    ).resolves.toEqual(expect.objectContaining({ interval_seconds: 60 }));

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

  it("records a continuing outage on a new UTC day without emitting another failure event", async () => {
    const db = createSequentialDb([
      {
        rows: [
          {
            ...buildClaimedRow({
              prior_status: "failing",
              consecutive_failures: 10,
              linked_incident_id: "inc_1"
            }),
            status: "failing",
            linked_incident_status: "open"
          }
        ]
      },
      { rows: [] },
      { rows: [] },
      { rows: [] }
    ]);
    const store = createPostgresAvailabilityCheckStore(db as never);
    const recorded = await store.recordCheckExecution({
      check_id: "chk_1",
      scheduled_for: "2026-06-16T00:00:00.000Z",
      claimed_at: "2026-06-16T00:00:00.000Z",
      started_at: "2026-06-16T00:00:00.000Z",
      completed_at: "2026-06-16T00:00:00.180Z",
      result: { ...successResult, status: "timeout", http_status: null, error_kind: "timeout" }
    });
    expect(recorded).toMatchObject({
      next_status: "failing",
      emit_failure_event: false,
      resolve_incident_id: null
    });
    const rollupValues = db.query.mock.calls.at(-1)?.[1];
    expect(rollupValues?.[3]).toBe("2026-06-16");
    expect(rollupValues?.[4]).toBe("down");
    expect(rollupValues?.[12]).toBe("inc_1");
  });

  it.each(["passing", "failing"] as const)(
    "retains raw internal errors without changing %s customer health or uptime",
    async (priorStatus) => {
      const db = createSequentialDb([
        {
          rows: [
            {
              ...buildClaimedRow({
                prior_status: priorStatus,
                consecutive_failures: 2,
                consecutive_successes: 1,
                linked_incident_id: "inc_1"
              }),
              status: priorStatus,
              linked_incident_status: "open"
            }
          ]
        },
        { rows: [] },
        { rows: [] }
      ]);
      const store = createPostgresAvailabilityCheckStore(db as never);

      await expect(
        store.recordCheckExecution({
          check_id: "chk_1",
          scheduled_for: "2026-06-15T10:00:00.000Z",
          claimed_at: "2026-06-15T10:00:00.000Z",
          started_at: "2026-06-15T10:00:00.000Z",
          completed_at: "2026-06-15T10:00:00.180Z",
          result: {
            ...successResult,
            status: "internal_error",
            http_status: null,
            error_kind: "internal_error",
            error_message: "fetch failed"
          }
        })
      ).resolves.toEqual(
        expect.objectContaining({
          next_status: priorStatus,
          emit_failure_event: false,
          resolve_incident_id: null
        })
      );
      expect(db.query).toHaveBeenCalledTimes(3);
      expect(db.query.mock.calls[2]?.[1]).toEqual(
        expect.arrayContaining([priorStatus, 2, 1, "internal_error"])
      );
      expect(
        db.query.mock.calls.some(([sql]) =>
          String(sql).includes("availability_check_daily_rollups")
        )
      ).toBe(false);
    }
  );

  it("links incidents, appends rollup incidents, and purges expired history", async () => {
    const db = createSequentialDb([
      { rows: [] },
      { rows: [] },
      { rows: [{ count: "4" }] },
      { rows: [{ count: "2" }] }
    ]);
    const store = createPostgresAvailabilityCheckStore(db as never);

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
    expect(String(db.query.mock.calls[1]?.[0] ?? "")).toContain("state = 'down'");

    await expect(store.purgeExpiredResults({ now: "2026-07-15T10:00:00.000Z" })).resolves.toBe(4);

    await expect(store.purgeExpiredDailyRollups({ now: "2026-07-15T10:00:00.000Z" })).resolves.toBe(
      2
    );
  });
});
