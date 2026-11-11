import { REPORT_TRIAL_ENTITLEMENT_SQL } from "./report-trial-entitlement.js";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { reportPolicy } from "../../smart-reports/src/report-policy.js";
import {
  CreateReportDefinitionSchema,
  ReplaceReportDefinitionSchema,
  ReportDefinitionRecordSchema,
  type AcceptedReportScope,
  type CreateReportDefinition,
  type ReportDefinitionRecord
} from "../../smart-reports/src/report-definition.js";
import { SmartReportError } from "../../smart-reports/src/report-errors.js";
import { lastCompletedReportPeriod } from "../../smart-reports/src/report-period.js";
import { nextReportSchedule, reportDeliveryAt } from "../../smart-reports/src/report-schedule.js";
import { isCurrentBillingOwner } from "./billing-owner.js";
import { ProjectJobInitiatorSchema } from "./project-job-authorization.js";
import {
  canAccessReportScope,
  captureReportScope,
  requireReportRecipients
} from "./report-authorization.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";

const ActorSchema = z
  .object({ organization_id: z.uuid(), initiator: ProjectJobInitiatorSchema })
  .strict();
const IdentitySchema = ActorSchema.extend({ id: z.uuid() });
type Actor = z.infer<typeof ActorSchema>;
type Identity = z.infer<typeof IdentitySchema>;
type DefinitionRow = Record<string, unknown> & {
  accepted_scope: unknown;
  creation_digest: string;
  initiating_authority: unknown;
};
const columns = `id,organization_id,created_by_user_id,initiating_authority,creation_digest,
  name,cadence,accepted_scope,recipient_user_ids,privacy_mode,source_collection_consent,schedule,
  enabled,version,next_due_at,next_period_ends_at,requires_owner_review,pause_reason,paused_at,
  weekly_overlap,created_at,updated_at,report_mode`;
function iso(value: unknown): string | null {
  if (value === null) return null;
  return (value instanceof Date ? value : new Date(z.string().parse(value))).toISOString();
}
function record(row: DefinitionRow): ReportDefinitionRecord {
  return ReportDefinitionRecordSchema.parse({
    id: row["id"],
    organization_id: row["organization_id"],
    created_by_user_id: row["created_by_user_id"],
    name: row["name"],
    cadence: row["cadence"],
    scope: row.accepted_scope,
    recipient_user_ids: row["recipient_user_ids"],
    privacy_mode: row["privacy_mode"],
    source_collection_consent: row["source_collection_consent"],
    schedule: row["schedule"],
    enabled: row["enabled"],
    version: row["version"],
    next_due_at: iso(row["next_due_at"]),
    next_period_ends_at: iso(row["next_period_ends_at"]),
    requires_owner_review: row["requires_owner_review"],
    pause_reason: row["pause_reason"],
    paused_at: iso(row["paused_at"]),
    weekly_overlap: row["weekly_overlap"],
    created_at: iso(row["created_at"]),
    updated_at: iso(row["updated_at"])
  });
}
function checkContext(input: Actor, definition: CreateReportDefinition): void {
  if (
    definition.expected_organization_id !== undefined &&
    definition.expected_organization_id !== input.organization_id
  )
    throw new SmartReportError("organization_context_changed");
}
function digest(definition: CreateReportDefinition, userId: string): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        user_id: userId,
        name: definition.name,
        cadence: definition.cadence,
        project_ids: [...definition.project_ids].sort(),
        recipient_user_ids: [...definition.recipient_user_ids].sort(),
        privacy_mode: definition.privacy_mode,
        source_collection_consent: definition.source_collection_consent,
        schedule:
          definition.schedule === null
            ? null
            : { time: definition.schedule.time, timezone: definition.schedule.timezone },
        enabled: definition.enabled,
        weekly_overlap: definition.weekly_overlap ?? null
      })
    )
    .digest("hex");
}
async function lockOrganization(tx: Queryable, organizationId: string): Promise<void> {
  await tx.query("SET LOCAL lock_timeout='5s'", []);
  await tx.query("SET LOCAL statement_timeout='30s'", []);
  const result = await tx.query("SELECT id FROM organizations WHERE id=$1::uuid FOR UPDATE", [
    organizationId
  ]);
  if (result.rows.length !== 1) throw new SmartReportError("forbidden");
}
async function requirePlan(
  tx: Queryable,
  organizationId: string
): Promise<ReturnType<typeof reportPolicy>> {
  // Read after the lock wait, so an entitlement change cannot use an old statement snapshot.
  const row = (
    await tx.query<{ plan: string; suspended_at: unknown }>(
      `SELECT plan,suspended_at FROM organizations WHERE id=$1::uuid AND ${REPORT_TRIAL_ENTITLEMENT_SQL}`,
      [organizationId]
    )
  ).rows[0];
  if (!row || row.suspended_at !== null) throw new SmartReportError("forbidden");
  const caps = reportPolicy(row.plan);
  if (!caps.smart_reports) throw new SmartReportError("upgrade_required");
  return caps;
}
function requireSelection(
  caps: ReturnType<typeof reportPolicy>,
  definition: CreateReportDefinition
): void {
  if (
    !caps.cadences.includes(definition.cadence) ||
    definition.project_ids.length > caps.max_smart_report_projects ||
    definition.recipient_user_ids.length > caps.max_smart_report_recipients
  )
    throw new SmartReportError("upgrade_required");
}
async function requireManagement(tx: Queryable, input: Actor, scope: unknown): Promise<void> {
  if (
    !(await canAccessReportScope(tx, {
      organization_id: input.organization_id,
      initiator: input.initiator,
      scope,
      manage: true
    }))
  )
    throw new SmartReportError("forbidden");
}
async function requireOverlap(
  tx: Queryable,
  definition: CreateReportDefinition,
  scope: AcceptedReportScope
): Promise<void> {
  if (definition.cadence !== "weekly" || definition.weekly_overlap === "keep_existing") return;
  const existing = await tx.query(
    "SELECT id FROM weekly_report_channels WHERE project_id=ANY($1::uuid[]) AND is_enabled LIMIT 1",
    [scope.flatMap((project) => project.origin_project_ids)]
  );
  if (existing.rows.length) throw new SmartReportError("weekly_overlap_confirmation_required");
}
function due(
  definition: CreateReportDefinition,
  previous?: ReportDefinitionRecord
): { due_at: string | null; period_ends_at: string | null } {
  if (!definition.enabled || definition.schedule === null)
    return { due_at: null, period_ends_at: null };
  const now = new Date().toISOString();
  // Unclaimed future periods survive ordinary edits. Paused/overdue schedules
  // resume from the next future delivery instead of flooding historical reports.
  if (
    previous?.cadence === definition.cadence &&
    previous.paused_at === null &&
    previous.next_period_ends_at !== null
  ) {
    const period = lastCompletedReportPeriod(definition.cadence, previous.next_period_ends_at);
    const delivery = reportDeliveryAt({ period, schedule: definition.schedule });
    if (Date.parse(delivery) > Date.parse(now))
      return { due_at: delivery, period_ends_at: period.ends_at };
  }
  const next = nextReportSchedule({
    cadence: definition.cadence,
    schedule: definition.schedule,
    after: now
  });
  return { due_at: next.due_at, period_ends_at: next.period.ends_at };
}
async function find(tx: Queryable, input: Identity): Promise<DefinitionRow | undefined> {
  return (
    await tx.query<DefinitionRow>(
      `SELECT ${columns} FROM report_definitions WHERE organization_id=$1::uuid AND id=$2::uuid`,
      [input.organization_id, input.id]
    )
  ).rows[0];
}

export interface ReportDefinitionStore {
  create(
    input: Actor & { request_id: string; definition: z.input<typeof CreateReportDefinitionSchema> }
  ): Promise<ReportDefinitionRecord>;
  get(input: Identity): Promise<ReportDefinitionRecord | null>;
  list(input: Actor): Promise<ReportDefinitionRecord[]>;
  replace(
    input: Identity & { definition: z.input<typeof ReplaceReportDefinitionSchema> }
  ): Promise<ReportDefinitionRecord>;
  remove(input: Identity & { expected_version: number }): Promise<boolean>;
}

export function createReportDefinitionStore(db: Queryable): ReportDefinitionStore {
  return {
    async create(raw) {
      const input = ActorSchema.parse({
        organization_id: raw.organization_id,
        initiator: raw.initiator
      });
      const requestId = z.uuid().parse(raw.request_id),
        definition = CreateReportDefinitionSchema.parse(raw.definition);
      checkContext(input, definition);
      const creationDigest = digest(definition, input.initiator.user_id);
      return runInTransaction(db, async (tx) => {
        await lockOrganization(tx, input.organization_id);
        const prior = (
          await tx.query<DefinitionRow>(
            `SELECT ${columns} FROM report_definitions WHERE organization_id=$1::uuid AND creation_request_id=$2::uuid`,
            [input.organization_id, requestId]
          )
        ).rows[0];
        if (prior) {
          await requireManagement(tx, input, prior.accepted_scope);
          if (prior.creation_digest !== creationDigest)
            throw new SmartReportError("report_request_conflict");
          return record(prior);
        }
        const caps = await requirePlan(tx, input.organization_id);
        requireSelection(caps, definition);
        const scope = await captureReportScope(tx, {
          organization_id: input.organization_id,
          initiator: input.initiator,
          project_ids: definition.project_ids
        });
        await requireReportRecipients(tx, {
          organization_id: input.organization_id,
          scope,
          user_ids: definition.recipient_user_ids
        });
        await requireOverlap(tx, definition, scope);
        const count = (
          await tx.query<{ count: string }>(
            "SELECT count(*)::text AS count FROM report_definitions WHERE organization_id=$1::uuid",
            [input.organization_id]
          )
        ).rows[0];
        if (Number(count?.count ?? 0) >= caps.max_smart_report_definitions)
          throw new SmartReportError("report_definition_limit_reached");
        const next = due(definition);
        const row = (
          await tx.query<DefinitionRow>(
            `INSERT INTO report_definitions(
          id,organization_id,created_by_user_id,initiating_authority,creation_request_id,creation_digest,
          name,cadence,privacy_mode,source_collection_consent,accepted_scope,recipient_user_ids,schedule,
          enabled,next_due_at,next_period_ends_at,weekly_overlap,report_mode)
          VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::uuid[],$13::jsonb,$14,$15,$16,$17,$18)
          RETURNING ${columns}`,
            [
              randomUUID(),
              input.organization_id,
              input.initiator.user_id,
              JSON.stringify(input.initiator),
              requestId,
              creationDigest,
              definition.name,
              definition.cadence,
              definition.privacy_mode,
              definition.source_collection_consent,
              JSON.stringify(scope),
              [...definition.recipient_user_ids].sort(),
              definition.schedule === null ? null : JSON.stringify(definition.schedule),
              definition.enabled,
              next.due_at,
              next.period_ends_at,
              definition.weekly_overlap ?? null,
              caps.ai ? "ai" : "factual"
            ]
          )
        ).rows[0];
        if (!row) throw new Error("report_definition_insert_failed");
        return record(row);
      });
    },
    async get(raw) {
      const input = IdentitySchema.parse(raw),
        row = await find(db, input);
      if (
        !row ||
        !(await canAccessReportScope(db, {
          organization_id: input.organization_id,
          initiator: input.initiator,
          scope: row.accepted_scope,
          manage: false
        }))
      )
        return null;
      return record(row);
    },
    async list(raw) {
      const input = ActorSchema.parse(raw);
      const rows = (
        await db.query<DefinitionRow>(
          `SELECT ${columns} FROM report_definitions WHERE organization_id=$1::uuid ORDER BY created_at,id LIMIT 100`,
          [input.organization_id]
        )
      ).rows;
      const visible: ReportDefinitionRecord[] = [];
      for (const row of rows)
        if (
          await canAccessReportScope(db, {
            organization_id: input.organization_id,
            initiator: input.initiator,
            scope: row.accepted_scope,
            manage: false
          })
        )
          visible.push(record(row));
      return visible;
    },
    async replace(raw) {
      const input = IdentitySchema.parse({
        organization_id: raw.organization_id,
        initiator: raw.initiator,
        id: raw.id
      });
      const definition = ReplaceReportDefinitionSchema.parse(raw.definition);
      checkContext(input, definition);
      return runInTransaction(db, async (tx) => {
        await lockOrganization(tx, input.organization_id);
        const row = await find(tx, input);
        if (!row) throw new SmartReportError("report_not_found");
        await requireManagement(tx, input, row.accepted_scope);
        const previous = record(row);
        if (previous.version !== definition.expected_version)
          throw new SmartReportError("report_version_conflict");
        const caps = await requirePlan(tx, input.organization_id);
        requireSelection(caps, definition);
        if (
          definition.resume_after_review &&
          !(await isCurrentBillingOwner(tx, input.organization_id, input.initiator.user_id))
        )
          throw new SmartReportError("forbidden");
        if (
          definition.enabled &&
          (
            await tx.query<{ count: string }>(
              "SELECT count(*)::text AS count FROM report_definitions WHERE organization_id=$1 AND id<>$2 AND enabled AND paused_at IS NULL AND NOT requires_owner_review",
              [input.organization_id, input.id]
            )
          ).rows.some((item) => Number(item.count) >= caps.max_smart_report_definitions)
        )
          throw new SmartReportError("report_definition_limit_reached");
        // A title, cadence or recipient edit does not expand a frozen merge scope.
        const sameSelection =
          [...definition.project_ids].sort().join() ===
          previous.scope
            .map((project) => project.project_id)
            .sort()
            .join();
        const scope = sameSelection
          ? previous.scope
          : await captureReportScope(tx, {
              organization_id: input.organization_id,
              initiator: input.initiator,
              project_ids: definition.project_ids
            });
        await requireReportRecipients(tx, {
          organization_id: input.organization_id,
          scope,
          user_ids: definition.recipient_user_ids
        });
        await requireOverlap(tx, definition, scope);
        const next = due(definition, previous);
        const updated = (
          await tx.query<DefinitionRow>(
            `UPDATE report_definitions SET name=$3,cadence=$4,
          privacy_mode=$5,source_collection_consent=$6,accepted_scope=$7::jsonb,recipient_user_ids=$8::uuid[],
          report_mode=CASE WHEN $15 AND NOT $17 THEN 'factual' ELSE report_mode END,
          schedule=$9::jsonb,enabled=$10,next_due_at=$11,next_period_ends_at=$12,weekly_overlap=$13,
          initiating_authority=$14::jsonb,version=version+1,updated_at=now(),
          requires_owner_review=CASE WHEN $15 THEN false ELSE requires_owner_review END,
          pause_reason=CASE WHEN $15 OR NOT requires_owner_review THEN NULL ELSE pause_reason END,
          paused_at=CASE WHEN $15 OR NOT requires_owner_review THEN NULL ELSE paused_at END
          WHERE organization_id=$1::uuid AND id=$2::uuid AND version=$16 RETURNING ${columns}`,
            [
              input.organization_id,
              input.id,
              definition.name,
              definition.cadence,
              definition.privacy_mode,
              definition.source_collection_consent,
              JSON.stringify(scope),
              [...definition.recipient_user_ids].sort(),
              definition.schedule === null ? null : JSON.stringify(definition.schedule),
              definition.enabled,
              next.due_at,
              next.period_ends_at,
              definition.weekly_overlap ?? null,
              JSON.stringify(input.initiator),
              definition.resume_after_review,
              definition.expected_version,
              caps.ai
            ]
          )
        ).rows[0];
        if (!updated) throw new SmartReportError("report_version_conflict");
        return record(updated);
      });
    },
    async remove(raw) {
      const input = IdentitySchema.parse({
        organization_id: raw.organization_id,
        initiator: raw.initiator,
        id: raw.id
      });
      const version = z.number().int().positive().parse(raw.expected_version);
      return runInTransaction(db, async (tx) => {
        await lockOrganization(tx, input.organization_id);
        const row = await find(tx, input);
        if (!row) return false;
        await requireManagement(tx, input, row.accepted_scope);
        if (row["version"] !== version) throw new SmartReportError("report_version_conflict");
        await tx.query(
          "DELETE FROM report_definitions WHERE organization_id=$1::uuid AND id=$2::uuid AND version=$3",
          [input.organization_id, input.id, version]
        );
        return true;
      });
    }
  };
}
