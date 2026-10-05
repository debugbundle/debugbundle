import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createPostgresAnalyticsFlowStore } from "../../../packages/storage/src/analytics-flow-store.js";
import type { Queryable } from "../../../packages/storage/src/types.js";
import { flowDefinition, flowInput, flowReport } from "../../fixtures/analytics-flow-report.js";

const now = "2026-09-01T10:00:00.000Z";
const context = "a".repeat(43);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const scope = { project_id: flowDefinition.project_id, flow_key: flowDefinition.flow_key };
const input = { ...scope, context, origin: flowInput.steps[0]!.origin, now };
const row = { ...flowDefinition, definition: flowInput };
const run = {
  id: "33333333-3333-4333-8333-333333333333",
  flow_id: row.id,
  version: 1,
  context_hash: hash(context),
  origin: input.origin,
  start_index: 0,
  last_index: 0,
  source: "newsletter",
  campaign: "launch",
  started_at: now,
  last_step_at: now,
  expires_at: "2026-09-01T10:05:00.000Z"
};
const token = {
  id: "handoff",
  step_index: 1,
  expires_at: run.expires_at,
  redeemed_context_hash: null as string | null
};
function setup(
  options: {
    definition?: typeof row | null;
    currentRun?: Partial<typeof run> | null;
    handoff?: Partial<typeof token> | null;
    existing?: typeof row;
    counts?: { active: string; total: string };
    missingProject?: boolean;
    reportCounts?: Record<string, unknown>[];
    sources?: Record<string, unknown>[];
  } = {}
) {
  const query = vi.fn(async (sql: string, _params: unknown[]) => {
    void _params;
    let rows: unknown[] = [];
    if (sql.includes("FOR UPDATE OF p"))
      rows = options.missingProject ? [] : [{ plan: "free", max_saved_funnels: null }];
    else if (sql.includes("COUNT(*)")) rows = [options.counts ?? { active: "0", total: "0" }];
    else if (sql.startsWith("SELECT") && sql.includes("analytics_flow_definitions")) {
      rows = sql.includes("FOR UPDATE")
        ? options.existing
          ? [options.existing]
          : []
        : options.definition === null
          ? []
          : [options.definition ?? row];
    } else if (sql.startsWith("INSERT INTO analytics_flow_definitions"))
      rows = [options.definition ?? row];
    else if (sql.startsWith("SELECT") && sql.includes("analytics_flow_runs"))
      rows = options.currentRun === null ? [] : [{ ...run, ...options.currentRun }];
    else if (sql.startsWith("SELECT") && sql.includes("analytics_flow_handoffs"))
      rows = options.handoff === null ? [] : [{ ...token, ...options.handoff }];
    else if (sql.startsWith("SELECT step_index")) rows = options.reportCounts ?? [];
    else if (sql.startsWith("SELECT source")) rows = options.sources ?? [];
    else if (!/^(INSERT|UPDATE|DELETE|SELECT pg_advisory)/.test(sql))
      throw new Error("unexpected_test_query");
    return { rows };
  });
  const db: Queryable = { query: query as Queryable["query"], transaction: (work) => work(db) };
  return { store: createPostgresAnalyticsFlowStore(db), query };
}
const writes = (query: ReturnType<typeof setup>["query"]) =>
  query.mock.calls.filter(([sql]) => /^(INSERT|UPDATE|DELETE)/.test(sql));

it("lists and reads project definitions, including archived history, and archives by definition id", async () => {
  const archived = { ...row, archived_at: now };
  const { store, query } = setup({ definition: archived });
  expect(await store.list(scope)).toEqual([{ ...flowDefinition, archived_at: now }]);
  expect(await store.get(scope)).toEqual({ ...flowDefinition, archived_at: now });
  await store.archive({ ...scope, now });
  expect(writes(query)[0]?.[1]).toEqual([row.id, now]);
});
it("saves valid definitions and treats identical saves as idempotent", async () => {
  const fresh = setup();
  expect(
    await fresh.store.save({ project_id: scope.project_id, definition: flowInput, now })
  ).toEqual(flowDefinition);
  const identical = setup({ existing: row, counts: { active: "1", total: "100" } });
  expect(
    await identical.store.save({ project_id: scope.project_id, definition: flowInput, now })
  ).toEqual(flowDefinition);
  expect(writes(identical.query)).toEqual([]);
  const edited = setup({ existing: row });
  await edited.store.save({
    project_id: scope.project_id,
    definition: { ...flowInput, display_name: "New name" },
    now
  });
  expect(writes(edited.query)).toHaveLength(1);
});
it.each([
  { options: { missingProject: true }, error: "not_found" },
  { options: { counts: { active: "1", total: "1" } }, error: "limit_reached" },
  { options: { counts: { active: "0", total: "100" } }, error: "limit_reached" }
])("rejects definition admission: $error", async ({ options, error }) => {
  const { store, query } = setup(options);
  await expect(
    store.save({ project_id: scope.project_id, definition: flowInput, now })
  ).rejects.toThrow(error);
  expect(writes(query)).toEqual([]);
});
it("stores only hashed context and increments linked or unlinked observations separately", async () => {
  for (const index of [0, 1]) {
    const { store, query } = setup({ currentRun: null });
    const step = flowInput.steps[index]!;
    expect(await store.start({ ...input, step_key: step.step_key, origin: step.origin })).toEqual({
      expires_at: "2026-09-01T11:00:00.000Z"
    });
    const insert = writes(query).find(([sql]) => sql.startsWith("INSERT INTO analytics_flow_runs"));
    expect(insert?.[1]).toContain(hash(context));
    expect(insert?.[1]).not.toContain(context);
    const rollup = writes(query).find(([sql]) =>
      sql.startsWith("INSERT INTO analytics_flow_rollups")
    );
    expect(rollup?.[1].slice(4)).toEqual([
      "unknown",
      "",
      index === 0 ? 1 : 0,
      index === 0 ? 0 : 1,
      0,
      0
    ]);
  }
});
it("returns the original expiry on a start retry without duplicate counters", async () => {
  const { store, query } = setup();
  expect(await store.start({ ...input, step_key: "home" })).toEqual({ expires_at: run.expires_at });
  expect(writes(query)).toEqual([]);
});
it.each([
  { options: { definition: null }, step: "home", error: "not_found" },
  { options: { definition: { ...row, archived_at: now } }, step: "home", error: "not_found" },
  { options: {}, step: "missing", error: "invalid_step" },
  { options: {}, step: "blog", error: "origin_not_allowed" },
  { options: { currentRun: { start_index: 1 } }, step: "home", error: "context_conflict" },
  { options: { currentRun: { expires_at: now } }, step: "home", error: "expired_context" },
  { options: { currentRun: { version: 2 } }, step: "home", error: "expired_context" }
])("rejects invalid starts without writes: $error", async ({ options, step, error }) => {
  const { store, query } = setup(options);
  await expect(store.start({ ...input, step_key: step })).rejects.toThrow(error);
  expect(writes(query)).toEqual([]);
});
it("advances a same-origin step exactly once and measures elapsed time from the preceding step", async () => {
  const definition = {
    ...row,
    definition: {
      ...flowInput,
      steps: flowInput.steps.map((step) => ({ ...step, origin: input.origin }))
    }
  };
  const { store, query } = setup({ definition });
  await store.step({ ...input, step_key: "blog", now: "2026-09-01T10:00:30.000Z" });
  expect(writes(query)[0]?.[1].slice(6)).toEqual([1, 0, 30000, 1]);
  expect(writes(query)[1]?.[1]).toEqual([run.id, 1, "2026-09-01T10:00:30.000Z"]);
  const retry = setup({ definition, currentRun: { last_index: 1 } });
  await retry.store.step({ ...input, step_key: "blog" });
  expect(writes(retry.query)).toEqual([]);
});
it.each([
  { currentRun: null, error: "expired_context" },
  { currentRun: { origin: "https://other.test" }, error: "origin_not_allowed" },
  { currentRun: { last_step_at: "2026-09-01T10:01:00.000Z" }, error: "expired_context" }
])(
  "fails closed on unavailable or mismatched continuity: $error",
  async ({ currentRun, error }) => {
    const { store, query } = setup({ currentRun });
    await expect(store.step({ ...input, step_key: "home" })).rejects.toThrow(error);
    expect(writes(query)).toEqual([]);
  }
);
it("cannot skip a same-origin step or mark another origin's step directly", async () => {
  const { store } = setup();
  await expect(store.step({ ...input, step_key: "blog" })).rejects.toThrow("origin_not_allowed");
  const steps = [
    flowInput.steps[0]!,
    { step_key: "middle", display_name: "Middle", origin: input.origin },
    { ...flowInput.steps[1]!, origin: input.origin }
  ];
  const skipped = setup({ definition: { ...row, definition: { ...flowInput, steps } } });
  await expect(skipped.store.step({ ...input, step_key: "blog" })).rejects.toThrow("out_of_order");
});
it("bounds handoffs by run expiry and hashes their credentials", async () => {
  const { store, query } = setup();
  expect(await store.handoff({ ...input, step_key: "blog", token: "b".repeat(43) })).toEqual({
    origin: flowInput.steps[1]!.origin,
    expires_at: run.expires_at
  });
  expect(writes(query)[0]?.[1]).toContain(hash("b".repeat(43)));
  expect(writes(query)[0]?.[1]).not.toContain("b".repeat(43));
  await expect(
    store.handoff({ ...input, step_key: "home", token: "b".repeat(43) })
  ).rejects.toThrow("out_of_order");
});
it("rotates receiver context on arrival and does not recount an acknowledged retry", async () => {
  const arrival = {
    ...input,
    token: "b".repeat(43),
    context: "c".repeat(43),
    origin: flowInput.steps[1]!.origin
  };
  const { store, query } = setup();
  expect(await store.arrive(arrival)).toEqual({ expires_at: run.expires_at });
  expect(writes(query).some(([, params]) => params.includes(hash(arrival.context)))).toBe(true);
  expect(writes(query).some(([, params]) => params.includes(arrival.context))).toBe(false);
  const retry = setup({
    currentRun: { context_hash: hash(arrival.context), origin: arrival.origin, last_index: 1 },
    handoff: { redeemed_context_hash: hash(arrival.context) }
  });
  expect(await retry.store.arrive(arrival)).toEqual({ expires_at: run.expires_at });
  expect(writes(retry.query)).toEqual([]);
});
it.each([
  { handoff: null, error: "invalid_handoff" },
  { handoff: { expires_at: now }, error: "invalid_handoff" },
  { handoff: { redeemed_context_hash: hash("c".repeat(43)) }, error: "invalid_handoff" },
  { handoff: { step_index: 0 }, error: "origin_not_allowed" }
])("rejects invalid or replayed arrivals: $error", async ({ handoff, error }) => {
  const { store, query } = setup({ handoff });
  await expect(
    store.arrive({ ...input, token: "b".repeat(43), origin: flowInput.steps[1]!.origin })
  ).rejects.toThrow(error);
  expect(writes(query)).toEqual([]);
});
it("withdraws only the hashed context at the exact project, flow and origin", async () => {
  const { store, query } = setup();
  await store.withdraw(input);
  expect(writes(query)[0]?.[1]).toEqual([
    hash(context),
    input.origin,
    scope.project_id,
    scope.flow_key
  ]);
});
it("reports bounded aggregate comparisons, drop-off and average elapsed seconds", async () => {
  const { store } = setup({
    reportCounts: [
      {
        step_index: 0,
        reached: "10",
        previous_reached: "8",
        unlinked: "0",
        elapsed_ms: "0",
        elapsed_count: "0"
      },
      {
        step_index: 1,
        reached: "4",
        previous_reached: "3",
        unlinked: "2",
        elapsed_ms: "120000",
        elapsed_count: "4"
      }
    ],
    sources: [{ source: "newsletter", campaign: "launch", starts: "10", completions: "4" }]
  });
  expect(await store.report({ ...scope, ...flowReport.window })).toEqual(flowReport);
  const empty = setup();
  const emptyReport = await empty.store.report({ ...scope, ...flowReport.window });
  expect(emptyReport.starts).toBe(0);
  expect(emptyReport.steps.every((step) => step.average_seconds === null)).toBe(true);
  const truncated = setup({
    sources: Array.from({ length: 51 }, (_, index) => ({
      source: `source-${index}`,
      campaign: "",
      starts: "1",
      completions: null
    }))
  });
  const report = await truncated.store.report({ ...scope, ...flowReport.window });
  expect(report.sources).toHaveLength(50);
  expect(report.coverage.sources_truncated).toBe(true);
});
