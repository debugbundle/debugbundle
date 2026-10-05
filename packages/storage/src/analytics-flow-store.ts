import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import {
  AnalyticsFlowDefinitionInputSchema,
  getTierCapabilities,
  type AnalyticsFlowDefinition,
  type AnalyticsFlowDefinitionInput,
  type AnalyticsFlowReport
} from "../../shared-types/src/index.js";
import { readAnalyticsFlowReport } from "./analytics-flow-reports.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";

type Scope = { project_id: string; flow_key: string };
type Capture = Scope & { context: string; origin: string; now: string };
type DefinitionRow = {
  id: string;
  project_id: string;
  version: number;
  definition: AnalyticsFlowDefinitionInput;
  archived_at: Date | string | null;
};
type Run = {
  id: string;
  flow_id: string;
  version: number;
  context_hash: string;
  origin: string;
  start_index: number;
  last_index: number;
  source: string;
  campaign: string;
  started_at: Date | string;
  last_step_at: Date | string;
  expires_at: Date | string;
};
export class AnalyticsFlowError extends Error {
  constructor(
    public readonly code:
      | "not_found"
      | "invalid_step"
      | "origin_not_allowed"
      | "expired_context"
      | "out_of_order"
      | "invalid_handoff"
      | "limit_reached"
      | "context_conflict"
  ) {
    super(code);
  }
}
const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
const iso = (value: Date | string): string => new Date(value).toISOString();
function sameHash(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
function mapDefinition(row: DefinitionRow): AnalyticsFlowDefinition {
  return {
    ...AnalyticsFlowDefinitionInputSchema.parse(row.definition),
    id: row.id,
    project_id: row.project_id,
    version: row.version,
    archived_at: row.archived_at === null ? null : iso(row.archived_at)
  };
}
async function definition(
  db: Queryable,
  scope: Scope,
  active = true
): Promise<AnalyticsFlowDefinition> {
  const result = await db.query<DefinitionRow>(
    `SELECT id,project_id,version,definition,archived_at
    FROM analytics_flow_definitions WHERE project_id=$1 AND flow_key=$2`,
    [scope.project_id, scope.flow_key]
  );
  if (!result.rows[0] || (active && result.rows[0].archived_at !== null))
    throw new AnalyticsFlowError("not_found");
  return mapDefinition(result.rows[0]);
}
function indexFor(flow: AnalyticsFlowDefinition, key: string): number {
  const index = flow.steps.findIndex((step) => step.step_key === key);
  if (index < 0) throw new AnalyticsFlowError("invalid_step");
  return index;
}
function assertRun(
  run: Run | undefined,
  flow: AnalyticsFlowDefinition,
  now: string
): asserts run is Run {
  if (
    !run ||
    run.flow_id !== flow.id ||
    run.version !== flow.version ||
    Date.parse(iso(run.expires_at)) <= Date.parse(now) ||
    Date.parse(now) < Date.parse(iso(run.last_step_at))
  ) {
    throw new AnalyticsFlowError("expired_context");
  }
}
async function lockedRun(
  db: Queryable,
  flow: AnalyticsFlowDefinition,
  input: Capture
): Promise<Run> {
  const result = await db.query<Run>(
    `SELECT * FROM analytics_flow_runs
    WHERE flow_id=$1 AND context_hash=$2 FOR UPDATE`,
    [flow.id, hash(input.context)]
  );
  const run = result.rows[0];
  assertRun(run, flow, input.now);
  if (run.origin !== input.origin) throw new AnalyticsFlowError("origin_not_allowed");
  return run;
}
async function increment(db: Queryable, run: Run, index: number, now: string): Promise<void> {
  const linked = run.start_index === 0;
  const hasElapsed = linked && index > 0;
  await db.query(
    `INSERT INTO analytics_flow_rollups
    (flow_id,version,cohort_date,step_index,source,campaign,reached,unlinked,elapsed_ms,elapsed_count)
    VALUES ($1,$2,($3::timestamptz AT TIME ZONE 'UTC')::date,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT(flow_id,version,cohort_date,step_index,source,campaign) DO UPDATE SET
    reached=analytics_flow_rollups.reached+EXCLUDED.reached,
    unlinked=analytics_flow_rollups.unlinked+EXCLUDED.unlinked,
    elapsed_ms=analytics_flow_rollups.elapsed_ms+EXCLUDED.elapsed_ms,
    elapsed_count=analytics_flow_rollups.elapsed_count+EXCLUDED.elapsed_count`,
    [
      run.flow_id,
      run.version,
      iso(run.started_at),
      index,
      run.source,
      run.campaign,
      linked ? 1 : 0,
      linked ? 0 : 1,
      hasElapsed ? Math.max(0, Date.parse(now) - Date.parse(iso(run.last_step_at))) : 0,
      hasElapsed ? 1 : 0
    ]
  );
}
async function advance(db: Queryable, run: Run, index: number, now: string): Promise<void> {
  if (index <= run.last_index) return;
  if (index !== run.last_index + 1) throw new AnalyticsFlowError("out_of_order");
  await increment(db, run, index, now);
  await db.query(`UPDATE analytics_flow_runs SET last_index=$2,last_step_at=$3 WHERE id=$1`, [
    run.id,
    index,
    now
  ]);
}

export function createPostgresAnalyticsFlowStore(db: Queryable): AnalyticsFlowStore {
  return {
    async list(input: { project_id: string }): Promise<AnalyticsFlowDefinition[]> {
      const rows = await db.query<DefinitionRow>(
        `SELECT id,project_id,version,definition,archived_at
        FROM analytics_flow_definitions WHERE project_id=$1 ORDER BY flow_key LIMIT 100`,
        [input.project_id]
      );
      return rows.rows.map(mapDefinition);
    },
    get(input: Scope): Promise<AnalyticsFlowDefinition> {
      return definition(db, input, false);
    },
    async save(input: {
      project_id: string;
      definition: AnalyticsFlowDefinitionInput;
      now: string;
    }): Promise<AnalyticsFlowDefinition> {
      const parsed = AnalyticsFlowDefinitionInputSchema.parse(input.definition);
      return runInTransaction(db, async (tx) => {
        // Project locking serializes definition admission against the fixed tier cap.
        const projects = await tx.query<{ plan: string; max_saved_funnels: number | null }>(
          `SELECT o.plan,settings.max_saved_funnels FROM projects p
          JOIN organizations o ON o.id=p.organization_id LEFT JOIN project_analytics_settings settings ON settings.project_id=p.id
          WHERE p.id=$1 FOR UPDATE OF p`,
          [input.project_id]
        );
        if (!projects.rows[0]) throw new AnalyticsFlowError("not_found");
        const existing = await tx.query<DefinitionRow>(
          `SELECT id,project_id,version,definition,archived_at FROM analytics_flow_definitions
          WHERE project_id=$1 AND flow_key=$2 FOR UPDATE`,
          [input.project_id, parsed.flow_key]
        );
        const counts = await tx.query<{ active: string; total: string }>(
          `SELECT COUNT(*) FILTER(WHERE archived_at IS NULL)::text active,
          COUNT(*)::text total FROM analytics_flow_definitions WHERE project_id=$1`,
          [input.project_id]
        );
        const cap = Math.min(
          getTierCapabilities(projects.rows[0].plan).max_analytics_saved_funnels,
          projects.rows[0].max_saved_funnels ?? 100
        );
        if (
          ((!existing.rows[0] || existing.rows[0].archived_at !== null) &&
            Number(counts.rows[0]?.active ?? 0) >= cap) ||
          (!existing.rows[0] && Number(counts.rows[0]?.total ?? 0) >= 100)
        )
          throw new AnalyticsFlowError("limit_reached");
        // Identical saves are idempotent; structural edits start a new report version.
        if (
          existing.rows[0]?.archived_at === null &&
          JSON.stringify(AnalyticsFlowDefinitionInputSchema.parse(existing.rows[0].definition)) ===
            JSON.stringify(parsed)
        )
          return mapDefinition(existing.rows[0]);
        const result = await tx.query<DefinitionRow>(
          `INSERT INTO analytics_flow_definitions(id,project_id,flow_key,definition,created_at,updated_at)
          VALUES($1,$2,$3,$4::jsonb,$5,$5) ON CONFLICT(project_id,flow_key) DO UPDATE SET
          definition=EXCLUDED.definition,version=analytics_flow_definitions.version+1,archived_at=NULL,updated_at=EXCLUDED.updated_at
          RETURNING id,project_id,version,definition,archived_at`,
          [randomUUID(), input.project_id, parsed.flow_key, JSON.stringify(parsed), input.now]
        );
        return mapDefinition(result.rows[0]!);
      });
    },
    async archive(input: Scope & { now: string }): Promise<void> {
      const flow = await definition(db, input, false);
      await db.query(
        `UPDATE analytics_flow_definitions SET archived_at=COALESCE(archived_at,$2),updated_at=$2 WHERE id=$1`,
        [flow.id, input.now]
      );
    },
    async start(
      input: Capture & { step_key: string; source?: string; campaign?: string }
    ): Promise<{ expires_at: string }> {
      return runInTransaction(db, async (tx) => {
        const flow = await definition(tx, input);
        const index = indexFor(flow, input.step_key);
        if (flow.steps[index]!.origin !== input.origin)
          throw new AnalyticsFlowError("origin_not_allowed");
        await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
          `analytics-flow:${hash(input.context)}`
        ]);
        const existing = await tx.query<Run>(
          "SELECT * FROM analytics_flow_runs WHERE context_hash=$1",
          [hash(input.context)]
        );
        if (existing.rows[0]) {
          assertRun(existing.rows[0], flow, input.now);
          if (existing.rows[0].origin !== input.origin || existing.rows[0].start_index !== index)
            throw new AnalyticsFlowError("context_conflict");
          return { expires_at: iso(existing.rows[0].expires_at) };
        }
        const run: Run = {
          id: randomUUID(),
          flow_id: flow.id,
          version: flow.version,
          context_hash: hash(input.context),
          origin: input.origin,
          start_index: index,
          last_index: index,
          source: input.source ?? "unknown",
          campaign: input.campaign ?? "",
          started_at: input.now,
          last_step_at: input.now,
          expires_at: new Date(Date.parse(input.now) + flow.timeout_minutes * 60_000).toISOString()
        };
        await tx.query(
          `INSERT INTO analytics_flow_runs(id,flow_id,version,context_hash,origin,start_index,last_index,source,campaign,started_at,last_step_at,expires_at)
          VALUES($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$9,$10)`,
          [
            run.id,
            flow.id,
            flow.version,
            run.context_hash,
            input.origin,
            index,
            run.source,
            run.campaign,
            input.now,
            run.expires_at
          ]
        );
        await increment(tx, run, index, input.now);
        return { expires_at: iso(run.expires_at) };
      });
    },
    async step(input: Capture & { step_key: string }): Promise<void> {
      await runInTransaction(db, async (tx) => {
        const flow = await definition(tx, input);
        const run = await lockedRun(tx, flow, input);
        const index = indexFor(flow, input.step_key);
        if (flow.steps[index]!.origin !== input.origin)
          throw new AnalyticsFlowError("origin_not_allowed");
        await advance(tx, run, index, input.now);
      });
    },
    async handoff(
      input: Capture & { step_key: string; token: string }
    ): Promise<{ origin: string; expires_at: string }> {
      return runInTransaction(db, async (tx) => {
        const flow = await definition(tx, input);
        const run = await lockedRun(tx, flow, input);
        const index = indexFor(flow, input.step_key);
        if (index !== run.last_index + 1) throw new AnalyticsFlowError("out_of_order");
        const expires = new Date(
          Math.min(Date.parse(iso(run.expires_at)), Date.parse(input.now) + 600_000)
        ).toISOString();
        await tx.query(
          `INSERT INTO analytics_flow_handoffs(id,run_id,token_hash,step_index,expires_at)
          VALUES($1,$2,$3,$4,$5) ON CONFLICT(run_id,step_index) DO UPDATE SET
          token_hash=EXCLUDED.token_hash,expires_at=EXCLUDED.expires_at WHERE analytics_flow_handoffs.redeemed_context_hash IS NULL`,
          [randomUUID(), run.id, hash(input.token), index, expires]
        );
        return { origin: flow.steps[index]!.origin, expires_at: expires };
      });
    },
    async arrive(input: Capture & { token: string }): Promise<{ expires_at: string }> {
      return runInTransaction(db, async (tx) => {
        const flow = await definition(tx, input);
        // Lock the run before its token, matching the issue path's lock order.
        const result = await tx.query<Run>(
          `SELECT * FROM analytics_flow_runs WHERE flow_id=$1 AND id IN
          (SELECT run_id FROM analytics_flow_handoffs WHERE token_hash=$2) FOR UPDATE`,
          [flow.id, hash(input.token)]
        );
        const run = result.rows[0];
        assertRun(run, flow, input.now);
        const tokens = await tx.query<{
          id: string;
          step_index: number;
          expires_at: Date | string;
          redeemed_context_hash: string | null;
        }>("SELECT * FROM analytics_flow_handoffs WHERE run_id=$1 AND token_hash=$2 FOR UPDATE", [
          run.id,
          hash(input.token)
        ]);
        const token = tokens.rows[0];
        if (!token || Date.parse(iso(token.expires_at)) <= Date.parse(input.now))
          throw new AnalyticsFlowError("invalid_handoff");
        if (flow.steps[token.step_index]!.origin !== input.origin)
          throw new AnalyticsFlowError("origin_not_allowed");
        if (token.redeemed_context_hash !== null) {
          if (
            !sameHash(token.redeemed_context_hash, hash(input.context)) ||
            !sameHash(run.context_hash, hash(input.context)) ||
            run.origin !== input.origin
          )
            throw new AnalyticsFlowError("invalid_handoff");
          return { expires_at: iso(run.expires_at) };
        }
        if (token.step_index !== run.last_index + 1) throw new AnalyticsFlowError("out_of_order");
        await advance(tx, run, token.step_index, input.now);
        await tx.query("UPDATE analytics_flow_runs SET context_hash=$2,origin=$3 WHERE id=$1", [
          run.id,
          hash(input.context),
          input.origin
        ]);
        await tx.query("UPDATE analytics_flow_handoffs SET redeemed_context_hash=$2 WHERE id=$1", [
          token.id,
          hash(input.context)
        ]);
        return { expires_at: iso(run.expires_at) };
      });
    },
    async withdraw(input: Scope & { context: string; origin: string }): Promise<void> {
      await db.query(
        `DELETE FROM analytics_flow_runs WHERE context_hash=$1 AND origin=$2 AND flow_id IN
        (SELECT id FROM analytics_flow_definitions WHERE project_id=$3 AND flow_key=$4)`,
        [hash(input.context), input.origin, input.project_id, input.flow_key]
      );
    },
    async report(input: Scope & AnalyticsFlowReport["window"]): Promise<AnalyticsFlowReport> {
      return readAnalyticsFlowReport(db, await definition(db, input, false), {
        from: input.from,
        to: input.to,
        previous_from: input.previous_from
      });
    }
  };
}
export interface AnalyticsFlowStore {
  list(input: { project_id: string }): Promise<AnalyticsFlowDefinition[]>;
  get(input: Scope): Promise<AnalyticsFlowDefinition>;
  save(input: {
    project_id: string;
    definition: AnalyticsFlowDefinitionInput;
    now: string;
  }): Promise<AnalyticsFlowDefinition>;
  archive(input: Scope & { now: string }): Promise<void>;
  start(
    input: Capture & { step_key: string; source?: string; campaign?: string }
  ): Promise<{ expires_at: string }>;
  step(input: Capture & { step_key: string }): Promise<void>;
  handoff(
    input: Capture & { step_key: string; token: string }
  ): Promise<{ origin: string; expires_at: string }>;
  arrive(input: Capture & { token: string }): Promise<{ expires_at: string }>;
  withdraw(input: Scope & { context: string; origin: string }): Promise<void>;
  report(input: Scope & AnalyticsFlowReport["window"]): Promise<AnalyticsFlowReport>;
}
