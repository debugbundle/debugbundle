import { z } from "zod";
import {
  ReportDocumentSchema,
  MAX_REPORT_JSON_BYTES,
  type ReportDocument
} from "../../smart-reports/src/report-document.js";
import { redactReportData } from "../../smart-reports/src/report-redaction.js";
import { SmartReportError } from "../../smart-reports/src/report-errors.js";
import { getTierCapabilities } from "../../shared-types/src/index.js";
import {
  ReportContentViewSchema,
  type ReportContentView
} from "../../smart-reports/src/report-content.js";
import { ReportReferenceSchema } from "../../smart-reports/src/model-evidence.js";
import { reportRunRecord } from "./report-run-record.js";
import { reportArtifactDigest } from "./report-artifact-key.js";
import type { ObjectStoreReader, Queryable } from "./types.js";
import {
  readPublishedReportRun,
  ReportContentInputSchema as InputSchema,
  type ReportContentInput
} from "./report-published-run.js";
export type { ReportContentInput } from "./report-published-run.js";
export interface ReportContentStore {
  read(input: ReportContentInput): Promise<ReportDocument>;
  view(input: ReportContentInput): Promise<ReportContentView>;
  source(input: ReportContentInput & { reference: string }): Promise<string | null>;
}
/** Published archives belong to their current authorised readers. Unlike new
 * generation/delivery, reading does not require the creator to remain a member
 * or the organisation to retain Business. Whole-scope privacy/access is checked
 * before and after bounded private IO, without holding a transaction over it. */
export function createReportContentStore(
  db: Queryable,
  objects: Pick<ObjectStoreReader, "getObject">
): ReportContentStore {
  async function available(
    input: ReportContentInput,
    document: ReportDocument
  ): Promise<Map<string, string>> {
    const row = await readPublishedReportRun(db, input);
    const byType = (type: "incident" | "improvement" | "health"): string[] =>
      document.report.sources
        .filter((source) => source.source_type === type)
        .map((source) => source.source_id);
    const origins = [...new Set(document.report.sources.map((source) => source.origin_project_id))];
    const retained = (
      await db.query<{
        source_type: string;
        source_id: string;
        project_id: string;
        canonical_project_id: string;
      }>(
        `WITH retained AS (
        SELECT 'incident'::text AS source_type,id AS source_id,project_id,COALESCE(bundle_updated_at,bundle_created_at,created_at) AS content_at FROM incidents WHERE id=ANY($1::uuid[]) AND project_id=ANY($3::uuid[])
        UNION ALL SELECT 'improvement',id,project_id,COALESCE(bundle_updated_at,bundle_created_at,created_at) FROM improvement_opportunities WHERE id=ANY($2::uuid[]) AND project_id=ANY($3::uuid[])
      ) SELECT source_type,source_id,project_id,debugbundle_canonical_project(project_id) AS canonical_project_id FROM retained
        WHERE content_at+make_interval(days=>$4::int)>clock_timestamp()
        UNION ALL SELECT 'health',r.id,r.project_id,debugbundle_canonical_project(r.project_id) FROM availability_check_results r
        JOIN availability_checks c ON c.id=r.check_id WHERE r.id=ANY($5::uuid[]) AND r.project_id=ANY($3::uuid[])
          AND r.status='success' AND c.deleted_at IS NULL AND r.completed_at+interval '30 days'>clock_timestamp() LIMIT 100`,
        [
          byType("incident"),
          byType("improvement"),
          origins,
          getTierCapabilities(z.string().parse(row["current_plan"])).bundle_retention_days,
          byType("health")
        ]
      )
    ).rows;
    const links = new Map<string, string>();
    for (const source of document.report.sources) {
      const current = retained.find(
        (item) =>
          item.source_type === source.source_type &&
          item.source_id === source.source_id &&
          item.project_id === source.origin_project_id
      );
      if (current)
        links.set(
          source.ref,
          source.source_type === "health"
            ? `/projects/${z.uuid().parse(current.canonical_project_id)}/health`
            : `/projects/${z.uuid().parse(current.canonical_project_id)}/${source.source_type === "incident" ? "incidents" : "improvements"}/${source.source_id}`
        );
    }
    await readPublishedReportRun(db, input);
    return links;
  }
  const store: ReportContentStore = {
    async read(raw) {
      const input = InputSchema.parse(raw),
        row = await readPublishedReportRun(db, input),
        run = reportRunRecord(row);
      const body = await objects.getObject({
        key: String(row["ready_object_key"]),
        maxBytes: MAX_REPORT_JSON_BYTES,
        timeoutMs: 15000
      });
      if (
        !Buffer.isBuffer(body) ||
        body.length > MAX_REPORT_JSON_BYTES ||
        reportArtifactDigest(body) !== row["ready_sha256"]
      )
        throw new Error("report_artifact_integrity_failed");
      const document = ReportDocumentSchema.parse(JSON.parse(body.toString("utf8")));
      if (
        document.run_id !== run.id ||
        document.name !== run.name ||
        document.report.organization_id !== run.organization_id ||
        document.report.definition_id !== run.definition_id ||
        JSON.stringify(document.report.scope) !== JSON.stringify(run.scope) ||
        JSON.stringify(document.report.facts.period) !== JSON.stringify(run.period) ||
        document.report.facts.privacy_mode !== run.privacy_mode ||
        document.report.expires_at !== run.expires_at
      )
        throw new Error("report_artifact_scope_invalid");
      const safe = { facts: document.report.facts, narrative: document.narrative };
      // A strengthened mandatory sanitizer withholds the complete older report.
      // Never silently post-filter prose generated from a wider evidence set.
      if (JSON.stringify(redactReportData(safe, 512 * 1024)) !== JSON.stringify(safe))
        throw new SmartReportError("report_not_found");
      const current = await readPublishedReportRun(db, input);
      if (
        current["ready_object_key"] !== row["ready_object_key"] ||
        current["ready_sha256"] !== row["ready_sha256"]
      )
        throw new SmartReportError("report_not_found");
      return document;
    },
    async view(raw) {
      const input = InputSchema.parse(raw),
        document = await store.read(input),
        links = await available(input, document);
      return ReportContentViewSchema.parse({ document, available_source_refs: [...links.keys()] });
    },
    async source(raw) {
      const parsed = InputSchema.extend({ reference: ReportReferenceSchema }).parse(raw);
      const input = {
        organization_id: parsed.organization_id,
        id: parsed.id,
        initiator: parsed.initiator
      };
      const document = await store.read(input);
      return (await available(input, document)).get(parsed.reference) ?? null;
    }
  };
  return store;
}
