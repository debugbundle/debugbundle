import { vi } from "vitest";
import type { AvailabilityCheckExecutionResult } from "../../packages/storage/src/availability-check-executor.js";

export function buildCheckRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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
    within_monitored_project_limit: true,
    within_organization_active_limit: true,
    ...overrides
  };
}

export function buildClaimedRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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

export function createSequentialDb(results: Array<{ rows: Record<string, unknown>[] }>) {
  const queue = [...results];
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (
      sql === "SELECT id FROM organizations WHERE id=$1::uuid FOR UPDATE" ||
      sql === "SELECT debugbundle_begin_project_rule_write($1::uuid)"
    )
      return { rows: [] };
    void values;
    const next = queue.shift();
    if (next === undefined) {
      throw new Error("unexpected query");
    }
    return next;
  });

  return {
    query,
    transaction: async <Result>(callback: (tx: { query: typeof query }) => Promise<Result>) =>
      callback({ query })
  };
}

export function createSplitTransactionalDb(input: {
  dbResults?: Array<{ rows: Record<string, unknown>[] }>;
  txResults: Array<{ rows: Record<string, unknown>[] }>;
}) {
  const dbQueue = [...(input.dbResults ?? [])];
  const txQueue = [...input.txResults];
  const dbQuery = vi.fn(async (sql: string, values?: unknown[]) => {
    if (
      sql === "SELECT id FROM organizations WHERE id=$1::uuid FOR UPDATE" ||
      sql === "SELECT debugbundle_begin_project_rule_write($1::uuid)"
    )
      return { rows: [] };
    void values;
    const next = dbQueue.shift();
    if (next === undefined) {
      throw new Error("unexpected db query");
    }
    return next;
  });
  const txQuery = vi.fn(async (sql: string, values?: unknown[]) => {
    if (
      sql === "SELECT id FROM organizations WHERE id=$1::uuid FOR UPDATE" ||
      sql === "SELECT debugbundle_begin_project_rule_write($1::uuid)"
    )
      return { rows: [] };
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

export const successResult: AvailabilityCheckExecutionResult = {
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
