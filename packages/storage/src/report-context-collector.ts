import { z } from "zod";
import { getTierCapabilities } from "../../shared-types/src/index.js";
import { AcceptedReportScopeSchema } from "../../smart-reports/src/report-definition.js";
import {
  CanonicalReportFactsSchema,
  type CanonicalReportFacts,
  type ReportFactSource
} from "../../smart-reports/src/report-facts.js";
import { prepareReportModelInput } from "../../smart-reports/src/model-evidence.js";
import {
  projectReportBundleContext,
  MAX_REPORT_BUNDLE_BYTES
} from "../../smart-reports/src/bundle-context.js";
import { SmartReportError } from "../../smart-reports/src/report-errors.js";
import { canAccessReportScope } from "./report-authorization.js";
import { buildBundleObjectKey, buildImprovementBundleObjectKey } from "./helpers.js";
import { runInTransaction } from "./transaction.js";
import type { ObjectStoreReader, Queryable } from "./types.js";
import type { WorkerJobClaim } from "./worker-job-store.js";
import { lockReportRunClaim, readReportRunClaim } from "./report-run-execution.js";
import { reportRunRecord } from "./report-run-record.js";
const InputSchema = z
  .object({
    organization_id: z.uuid(),
    definition_id: z.uuid(),
    expected_version: z.number().int().positive(),
    report: CanonicalReportFactsSchema
  })
  .strict();
type Input = z.infer<typeof InputSchema>;
interface Candidate {
  source: ReportFactSource;
  generation: number;
  content_at: string;
}
interface Context extends Candidate {
  projection: NonNullable<ReturnType<typeof projectReportBundleContext>>;
}
export interface ReportContextCollector {
  collect(raw: Input): Promise<CanonicalReportFacts>;
  collectRun(raw: {
    claim: WorkerJobClaim;
    report: CanonicalReportFacts;
  }): Promise<CanonicalReportFacts>;
}
function scopeIdentity(raw: unknown): string {
  return JSON.stringify(
    AcceptedReportScopeSchema.parse(raw)
      .map((view) => ({
        project_id: view.project_id,
        origin_project_ids: [...view.origin_project_ids].sort()
      }))
      .sort((a, b) => a.project_id.localeCompare(b.project_id))
  );
}
async function authorize(
  tx: Queryable,
  input: Input,
  lock: boolean,
  claim?: WorkerJobClaim
): Promise<void> {
  if (claim) {
    const run = lock ? await lockReportRunClaim(tx, claim) : await readReportRunClaim(tx, claim);
    if (
      run["organization_id"] !== input.organization_id ||
      run["definition_id"] !== input.definition_id ||
      run["privacy_mode"] !== "full" ||
      scopeIdentity(run["accepted_scope"]) !== scopeIdentity(input.report.scope)
    )
      throw new SmartReportError("forbidden");
    return;
  }
  await tx.query("SET LOCAL statement_timeout='5s'", []);
  await tx.query("SET LOCAL lock_timeout='5s'", []);
  if (lock)
    await tx.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [input.organization_id]);
  const row = (
    await tx.query<Record<string, unknown>>(
      `SELECT d.version,d.accepted_scope,d.initiating_authority,d.privacy_mode,d.source_collection_consent,d.paused_at,d.requires_owner_review,o.plan,o.suspended_at
 FROM report_definitions d JOIN organizations o ON o.id=d.organization_id WHERE d.id=$1 AND d.organization_id=$2 ${lock ? "FOR UPDATE OF d" : ""}`,
      [input.definition_id, input.organization_id]
    )
  ).rows[0];
  if (!row) throw new SmartReportError("report_not_found");
  if (!getTierCapabilities(z.string().parse(row["plan"])).smart_reports)
    throw new SmartReportError("upgrade_required");
  if (row["version"] !== input.expected_version)
    throw new SmartReportError("report_version_conflict");
  if (
    row["suspended_at"] !== null ||
    row["paused_at"] !== null ||
    row["requires_owner_review"] === true ||
    row["privacy_mode"] !== "full" ||
    row["source_collection_consent"] !== true ||
    scopeIdentity(row["accepted_scope"]) !== scopeIdentity(input.report.scope) ||
    !(await canAccessReportScope(tx, {
      organization_id: input.organization_id,
      scope: row["accepted_scope"],
      initiator: row["initiating_authority"],
      manage: true
    }))
  )
    throw new SmartReportError("forbidden");
}
async function sourceMetadata(
  tx: Queryable,
  source: ReportFactSource,
  lock = false
): Promise<{ generation: number; content_at: string } | null> {
  if (source.source_type === "health") return null;
  const table = source.source_type === "incident" ? "incidents" : "improvement_opportunities";
  const row = (
    await tx.query<{ generation: number; content_at: string | null }>(
      `SELECT bundle_generation_number AS generation,COALESCE(bundle_updated_at,bundle_created_at)::text AS content_at
 FROM ${table} WHERE id=$1 AND project_id=$2 ${lock ? "FOR SHARE" : ""}`,
      [source.source_id, source.origin_project_id]
    )
  ).rows[0];
  return row && row.generation > 0 && row.content_at !== null
    ? { generation: row.generation, content_at: new Date(row.content_at).toISOString() }
    : null;
}
/** Used only inside an admitted report run. Context reads are at most one per
 * urgent/resolved/recent group per project, thirty overall and twenty seconds.
 * No database locks are held across object reads. Current authority and the
 * exact source generation are checked again before accepting any excerpt. */
export function createReportContextCollector(
  db: Queryable,
  objectStore: Pick<ObjectStoreReader, "getObject">
): ReportContextCollector {
  async function collect(raw: Input, claim?: WorkerJobClaim): Promise<CanonicalReportFacts> {
    const input = InputSchema.parse(raw);
    if (
      input.report.organization_id !== input.organization_id ||
      input.report.definition_id !== input.definition_id
    )
      throw new SmartReportError("forbidden");
    if (input.report.facts.privacy_mode === "restricted") return input.report;
    if (Date.parse(input.report.expires_at) <= Date.now()) throw new SmartReportError("forbidden");
    const candidates = await runInTransaction(db, async (tx) => {
      await authorize(tx, input, false, claim);
      const selected: Candidate[] = [],
        groups = new Set<string>(),
        cutoff = Date.parse(input.report.facts.cutoff_at);
      for (const source of input.report.sources) {
        if (source.source_type === "health") continue;
        const evidence = input.report.facts.evidence.find((item) => item.ref === source.ref)!;
        const group =
          ["open", "regressed"].includes(evidence.status) &&
          ["critical", "high"].includes(evidence.severity)
            ? "urgent"
            : evidence.status === "resolved"
              ? "resolved"
              : "recent";
        const key = `${source.project_id}:${group}`;
        if (groups.has(key)) continue;
        const metadata = await sourceMetadata(tx, source);
        if (!metadata) continue;
        const contentAt = Date.parse(metadata.content_at);
        if (contentAt > cutoff || contentAt + 90 * 86400000 <= Math.max(cutoff, Date.now()))
          continue;
        const cached = (
          await tx.query<{ generation: unknown; expires_at: Date }>(
            `SELECT summary->'context_bundle_generation' AS generation,text_expires_at AS expires_at FROM report_source_text
 WHERE definition_id=$1 AND selected_project_id=$2 AND origin_project_id=$3 AND source_type=$4 AND source_id=$5`,
            [
              input.definition_id,
              source.project_id,
              source.origin_project_id,
              source.source_type,
              source.source_id
            ]
          )
        ).rows[0];
        groups.add(key);
        if (
          cached?.generation === metadata.generation &&
          cached.expires_at.getTime() > cutoff &&
          evidence.context !== null
        )
          continue;
        selected.push({
          source,
          generation: metadata.generation,
          content_at: metadata.content_at
        });
        if (selected.length === 30) break;
      }
      return selected;
    });
    const contexts: Context[] = [],
      deadline = Date.now() + 20_000;
    for (const candidate of candidates) {
      if (candidate.source.source_type === "health") continue;
      const remaining = deadline - Date.now();
      if (remaining < 100) break;
      try {
        const source = candidate.source;
        if (source.source_type === "health") continue;
        const key =
          source.source_type === "incident"
            ? buildBundleObjectKey(source.origin_project_id, source.source_id)
            : buildImprovementBundleObjectKey(source.origin_project_id, source.source_id);
        const compressed = await objectStore.getObject({
          key,
          maxBytes: MAX_REPORT_BUNDLE_BYTES,
          timeoutMs: Math.min(1000, remaining)
        });
        const projection = projectReportBundleContext(compressed, {
          origin_project_id: source.origin_project_id,
          source_id: source.source_id,
          source_type: source.source_type,
          generation_number: candidate.generation,
          source_content_at: candidate.content_at,
          cutoff_at: input.report.facts.cutoff_at
        });
        if (projection) contexts.push({ ...candidate, projection });
      } catch {
        /* Missing, oversized or unavailable context remains an explicit bounded fallback. */
      }
    }
    return runInTransaction(db, async (tx) => {
      await authorize(tx, input, true, claim);
      const report = structuredClone(input.report),
        enrichedProjects = new Set<string>();
      for (const context of contexts) {
        if (context.source.source_type === "health") continue;
        const source = context.source,
          current = await sourceMetadata(tx, source, true);
        if (
          !current ||
          current.generation !== context.generation ||
          current.content_at !== context.content_at
        )
          continue;
        if (Date.parse(current.content_at) + 90 * 86400000 <= Date.now()) continue;
        const expires = new Date(Date.parse(context.content_at) + 90 * 86400000).toISOString();
        await tx.query(
          `UPDATE report_source_text SET summary=summary || jsonb_build_object('title',$6::text,'context',$7::text,'context_origin','bundle','context_bundle_generation',$8::int)
 WHERE definition_id=$1 AND selected_project_id=$2 AND origin_project_id=$3 AND source_type=$4 AND source_id=$5
 AND (summary->>'source_content_at')::timestamptz=$9::timestamptz`,
          [
            input.definition_id,
            source.project_id,
            source.origin_project_id,
            source.source_type,
            source.source_id,
            context.projection.title,
            context.projection.context,
            context.generation,
            context.content_at
          ]
        );
        const evidence = report.facts.evidence.find((item) => item.ref === source.ref)!,
          reference = report.sources.find((item) => item.ref === source.ref)!;
        evidence.title = context.projection.title;
        evidence.context = context.projection.context;
        reference.text_available = true;
        reference.text_expires_at = expires;
        enrichedProjects.add(evidence.project_ref);
      }
      for (const project of enrichedProjects) {
        const note = report.facts.selection_notes.findIndex((note) =>
          note.startsWith(`${project}:`)
        );
        const explanation =
          "Bundle context is a bounded retained excerpt; cause/action text remains inference or a suggestion.";
        if (note < 0) report.facts.selection_notes.push(`${project}: ${explanation}`);
        else
          report.facts.selection_notes[note] =
            `${report.facts.selection_notes[note]} ${explanation}`;
      }
      report.facts = prepareReportModelInput(report.facts);
      return CanonicalReportFactsSchema.parse(report);
    });
  }
  return {
    collect,
    async collectRun(raw) {
      const run = reportRunRecord(await readReportRunClaim(db, raw.claim)),
        report = CanonicalReportFactsSchema.parse(raw.report);
      if (
        report.organization_id !== run.organization_id ||
        report.definition_id !== run.definition_id ||
        report.facts.privacy_mode !== run.privacy_mode ||
        scopeIdentity(report.scope) !== scopeIdentity(run.scope) ||
        JSON.stringify(report.facts.period) !== JSON.stringify(run.period)
      )
        throw new SmartReportError("forbidden");
      return collect(
        {
          organization_id: run.organization_id,
          definition_id: run.definition_id,
          expected_version: run.definition_version,
          report
        },
        raw.claim
      );
    }
  };
}
