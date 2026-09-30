import { createHash } from "node:crypto";
import { z } from "zod";
import { compileOrderedFunnelFact } from "../../analytics-engine/src/funnel-compilation.js";
import { stableJson } from "../../event-normalizer/src/canonical-json.js";
import type { SemanticAnalyticsAdmissionResult } from "../../event-normalizer/src/semantic-analytics-admission.js";
import { AnalyticsProjectPlanReportStateSchema } from "../../shared-types/src/index.js";
import type { VerifiedSemanticAnalyticsWorkerInput } from "./semantic-analytics-worker-input.js";
import type { Queryable } from "./types.js";

const ReportStates = z.array(AnalyticsProjectPlanReportStateSchema).max(100);
type Accepted = Extract<SemanticAnalyticsAdmissionResult, { accepted: true }>;

/** Reconstitute only the verified receipt provenance used by protected compilers. */
export function acceptedSemanticFunnelWorkerEvent(
  projectId: string,
  verified: VerifiedSemanticAnalyticsWorkerInput
): Accepted {
  const { event, provenance } = verified;
  return {
    accepted: true,
    event,
    origin_project_id: projectId,
    scope: provenance.scope,
    scope_revision: provenance.scope_revision,
    catalog_revision: provenance.catalog_revision,
    identity_scope: provenance.identity_scope,
    identity_verification: provenance.identity_verification,
    authority: provenance.authority,
    received_at: provenance.accepted_at,
    content_hash: `sha256:${createHash("sha256").update(stableJson(event)).digest("hex")}`,
    withheld_fields: 0
  };
}

/** Compile only immutable project definitions effective when this accepted event occurred. */
export async function recordProjectSemanticFunnelFactsInTransaction(
  tx: Queryable,
  projectId: string,
  verified: VerifiedSemanticAnalyticsWorkerInput
): Promise<void> {
  const { event, provenance } = verified;
  const identity = provenance.identity_scope;
  if (
    provenance.scope.kind !== "project" ||
    provenance.scope.project_id !== projectId ||
    (identity !== null &&
      (identity.kind !== "project" ||
        identity.project_id !== projectId ||
        provenance.identity_writer_id === null ||
        (provenance.identity_verification !== "server_namespace" &&
          provenance.identity_context_id === null)))
  )
    throw new Error("semantic_funnel_scope_unavailable");

  const plan = (
    await tx.query<{ catalog_revision: string; reports: unknown }>(
      `SELECT catalog_revision,reports FROM analytics_project_plan_revisions
       WHERE project_id=$1::uuid AND applied_at<=$2::timestamptz
       ORDER BY applied_at DESC,revision DESC LIMIT 1 FOR SHARE`,
      [projectId, provenance.accepted_at]
    )
  ).rows[0];
  if (plan === undefined) return;
  if (Number(plan.catalog_revision) !== provenance.catalog_revision)
    throw new Error("semantic_funnel_plan_snapshot_mismatch");
  const reports = ReportStates.parse(plan.reports);
  const eligible = reports.filter(
    (report) =>
      report.definition.kind === "ordered_funnel" &&
      event.occurred_at >= report.available_from &&
      provenance.accepted_at >= report.available_from
  );
  if (eligible.length === 0) return;
  const revisions = (
    await tx.query<{
      report_key: string;
      revision: string;
      content_hash: string;
      available_from: Date;
    }>(
      `SELECT saved.report_key,saved.revision,saved.content_hash,saved.available_from
       FROM unnest($2::text[],$3::bigint[]) wanted(report_key,revision)
       JOIN analytics_project_report_revisions saved
         ON saved.project_id=$1::uuid AND saved.report_key=wanted.report_key
          AND saved.revision=wanted.revision FOR SHARE OF saved`,
      [
        projectId,
        eligible.map((report) => report.definition.key),
        eligible.map((report) => report.definition.revision)
      ]
    )
  ).rows;
  const byKey = new Map(revisions.map((row) => [`${row.report_key}:${row.revision}`, row]));
  const admitted = acceptedSemanticFunnelWorkerEvent(projectId, verified);
  for (const report of eligible) {
    const definition = report.definition;
    if (definition.kind !== "ordered_funnel") continue;
    const saved = byKey.get(`${definition.key}:${definition.revision}`);
    if (
      saved === undefined ||
      saved.available_from.toISOString() !== report.available_from ||
      saved.content_hash !== createHash("sha256").update(stableJson(definition)).digest("hex")
    )
      throw new Error("semantic_funnel_definition_unavailable");
    const compiled = compileOrderedFunnelFact(definition, provenance.scope_revision, admitted);
    if (compiled.status === "excluded") {
      if (compiled.reason === "no_match" || compiled.reason === "unlinked_subject") continue;
      throw new Error("semantic_funnel_definition_unavailable");
    }
    await tx.query(
      `INSERT INTO semantic_analytics_funnel_facts(
         project_id,report_key,report_revision,event_id,occurred_at,fact)
       VALUES($1::uuid,$2,$3,$4::uuid,$5::timestamptz,$6::jsonb)`,
      [
        projectId,
        definition.key,
        definition.revision,
        event.event_id,
        event.occurred_at,
        JSON.stringify(compiled.fact)
      ]
    );
  }
}
