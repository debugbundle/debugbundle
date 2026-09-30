import { createHash } from "node:crypto";
import { z } from "zod";
import { compileOrderedPortfolioFunnelFact } from "../../analytics-engine/src/funnel-compilation.js";
import { stableJson } from "../../event-normalizer/src/canonical-json.js";
import { AnalyticsSpacePlanReportStateSchema } from "../../shared-types/src/index.js";
import {
  AnalyticsSpacePlanCoverageSchema,
  AnalyticsSpacePlanSourceRevisionsSchema
} from "./analytics-space-plan-store.js";
import { acceptedSemanticFunnelWorkerEvent } from "./semantic-analytics-funnel-projection.js";
import type { VerifiedSemanticAnalyticsWorkerInput } from "./semantic-analytics-worker-input.js";
import type { Queryable } from "./types.js";

const ReportStates = z.array(AnalyticsSpacePlanReportStateSchema).max(100);

/** Project events may feed a portfolio comparison only from its accepted source snapshot. */
export async function recordPortfolioSemanticFunnelFactsInTransaction(
  tx: Queryable,
  projectId: string,
  verified: VerifiedSemanticAnalyticsWorkerInput
): Promise<void> {
  const { event, provenance } = verified;
  if (
    provenance.scope.kind !== "project" ||
    provenance.scope.project_id !== projectId ||
    (provenance.identity_scope !== null &&
      (provenance.identity_scope.kind !== "project" ||
        provenance.identity_scope.project_id !== projectId ||
        provenance.identity_writer_id === null ||
        (provenance.identity_verification !== "server_namespace" &&
          provenance.identity_context_id === null)))
  )
    throw new Error("semantic_portfolio_source_scope_unavailable");

  const snapshots = (
    await tx.query<{
      space_id: string;
      space_revision: string;
      reports: unknown;
      source_catalog_revisions: unknown;
      coverage: unknown;
    }>(
      `SELECT DISTINCT ON (history.space_id)
         history.space_id,history.space_revision,history.reports,
         history.source_catalog_revisions,history.coverage
       FROM analytics_space_plan_revisions history
       JOIN analytics_spaces space ON space.id=history.space_id
         AND space.archived_at IS NULL AND space.mode='portfolio'
       JOIN analytics_space_projects source
         ON source.space_id=space.id AND source.project_id=$1::uuid
       WHERE history.applied_at<=$2::timestamptz
       ORDER BY history.space_id,history.applied_at DESC,history.revision DESC`,
      [projectId, provenance.accepted_at]
    )
  ).rows;
  if (snapshots.length === 0) return;
  const admitted = acceptedSemanticFunnelWorkerEvent(projectId, verified);
  for (const snapshot of snapshots) {
    const sources = AnalyticsSpacePlanSourceRevisionsSchema.parse(
      snapshot.source_catalog_revisions
    );
    if (
      !sources.some(
        (source) =>
          source.project_id === projectId && source.catalog_revision === provenance.catalog_revision
      )
    )
      continue;
    const coverage = AnalyticsSpacePlanCoverageSchema.parse(snapshot.coverage).find(
      (item) => item.name === event.payload.name
    );
    const covered = coverage?.source_entry_revisions.find(
      (source) => source.project_id === projectId
    );
    if (covered === undefined) continue;
    if (covered.entry_revision !== event.payload.event_revision)
      throw new Error("semantic_portfolio_source_entry_mismatch");
    const eligible = ReportStates.parse(snapshot.reports).filter(
      (report) =>
        report.definition.kind === "ordered_funnel" &&
        report.definition.scope.kind === "space" &&
        report.definition.scope.space_id === snapshot.space_id &&
        event.occurred_at >= report.available_from &&
        provenance.accepted_at >= report.available_from
    );
    if (eligible.length === 0) continue;
    const revisions = (
      await tx.query<{
        report_key: string;
        revision: string;
        content_hash: string;
        available_from: Date;
      }>(
        `SELECT saved.report_key,saved.revision,saved.content_hash,saved.available_from
         FROM unnest($2::text[],$3::bigint[]) wanted(report_key,revision)
         JOIN analytics_space_report_revisions saved
           ON saved.space_id=$1::uuid AND saved.report_key=wanted.report_key
             AND saved.revision=wanted.revision FOR SHARE OF saved`,
        [
          snapshot.space_id,
          eligible.map((report) => report.definition.key),
          eligible.map((report) => report.definition.revision)
        ]
      )
    ).rows;
    const byKey = new Map(revisions.map((row) => [`${row.report_key}:${row.revision}`, row]));
    for (const report of eligible) {
      const definition = report.definition;
      if (definition.kind !== "ordered_funnel") continue;
      const saved = byKey.get(`${definition.key}:${definition.revision}`);
      if (
        saved === undefined ||
        saved.available_from.toISOString() !== report.available_from ||
        saved.content_hash !== createHash("sha256").update(stableJson(definition)).digest("hex")
      )
        throw new Error("semantic_portfolio_definition_unavailable");
      const compiled = compileOrderedPortfolioFunnelFact(
        definition,
        Number(snapshot.space_revision),
        admitted
      );
      if (compiled.status === "excluded") {
        if (compiled.reason === "no_match" || compiled.reason === "unlinked_subject") continue;
        throw new Error("semantic_portfolio_definition_unavailable");
      }
      await tx.query(
        `INSERT INTO semantic_analytics_portfolio_funnel_facts(
           space_id,project_id,report_key,report_revision,event_id,occurred_at,
           source_catalog_revision,source_entry_revision,fact)
         VALUES($1::uuid,$2::uuid,$3,$4,$5::uuid,$6::timestamptz,$7,$8,$9::jsonb)`,
        [
          snapshot.space_id,
          projectId,
          definition.key,
          definition.revision,
          event.event_id,
          event.occurred_at,
          provenance.catalog_revision,
          event.payload.event_revision,
          JSON.stringify(compiled.fact)
        ]
      );
    }
  }
}
