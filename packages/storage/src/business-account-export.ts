import { z } from "zod";
import { isCurrentBillingOwner } from "./billing-owner.js";
import { createReportDefinitionStore } from "./report-definition-store.js";
import { createReportRunManagementStore } from "./report-run-management.js";
import { readPublishedReportRun } from "./report-published-run.js";
import { reportPdfAvailable } from "./report-pdf-store.js";
import { canAccessReportScope } from "./report-authorization.js";
import { isProjectJobInitiatorAuthorized } from "./project-job-authorization.js";
import { createReferralLedgerStore } from "./referral-ledger-store.js";
import { SmartReportError } from "../../smart-reports/src/report-errors.js";
import { ReportRunCursorSchema } from "../../smart-reports/src/report-run-api-contract.js";
import type { Queryable } from "./types.js";
export const BusinessAccountExportSectionSchema = z.enum([
  "report_definitions",
  "report_runs",
  "report_deliveries",
  "report_lifecycle",
  "report_availability",
  "report_health",
  "report_coverage",
  "referral_partner",
  "referral_commissions",
  "referral_payouts",
  "customer_referral"
]);
export const BusinessAccountExportQuerySchema = z
  .object({
    section: BusinessAccountExportSectionSchema,
    limit: z.coerce.number().int().min(1).max(100).default(100),
    cursor: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,4096}$/)
      .optional()
  })
  .strict();
export interface BusinessAccountExportInput {
  organization_id: string;
  user_id: string;
  query: z.input<typeof BusinessAccountExportQuerySchema>;
}
export interface BusinessAccountExportPage {
  section: z.infer<typeof BusinessAccountExportSectionSchema>;
  as_of: string;
  items: Record<string, unknown>[];
  next_cursor: string | null;
}
const CursorSchema = z
  .object({
    section: BusinessAccountExportSectionSchema,
    as_of: z.string().datetime(),
    after: z.string().max(2048)
  })
  .strict();
export function businessAccountExportManifest(): Array<{ section: string; url: string }> {
  return BusinessAccountExportSectionSchema.options.map((section) => ({
    section,
    url: `/v1/account/export?section=${section}`
  }));
}
const numeric = {
  report_lifecycle: {
    table: "report_lifecycle_facts",
    columns:
      "f.id::text AS id,f.project_id,f.source_type,f.source_id,f.service_id,f.transition,f.from_status,f.to_status,f.severity,f.occurred_at,f.recorded_at,f.backfilled",
    order: "f.id",
    after: "f.id>($2->>0)::bigint",
    key: z.tuple([
      z
        .string()
        .regex(/^[0-9]{1,20}$/)
        .refine((value) => BigInt(value) <= 9223372036854775807n)
    ]),
    keys: ["id"],
    retained:
      "f.occurred_at>=((clock_timestamp() AT TIME ZONE 'UTC')-interval '12 months') AT TIME ZONE 'UTC' AND f.recorded_at<=$4::timestamptz"
  },
  report_availability: {
    table: "report_availability_days",
    columns:
      "f.project_id,f.check_id,f.day::text,f.total_checks,f.successful_checks,f.failed_checks,f.degraded_checks,f.downtime_seconds,f.first_checked_at,f.last_checked_at,f.source_updated_at",
    order: "f.day,f.project_id,f.check_id",
    after: "(f.day,f.project_id,f.check_id)>(($2->>0)::date,($2->>1)::uuid,($2->>2)::uuid)",
    key: z.tuple([z.iso.date(), z.uuid(), z.uuid()]),
    keys: ["day", "project_id", "check_id"],
    retained:
      "f.day>=((clock_timestamp() AT TIME ZONE 'UTC')-interval '12 months')::date AND f.source_updated_at<=$4::timestamptz"
  },
  report_health: {
    table: "report_health_recoveries",
    columns:
      "f.project_id,f.result_id,f.check_id,to_char(f.occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS occurred_at,f.recorded_at",
    order: "f.occurred_at,f.project_id,f.result_id",
    after:
      "(f.occurred_at,f.project_id,f.result_id)>(($2->>0)::timestamptz,($2->>1)::uuid,($2->>2)::uuid)",
    key: z.tuple([z.string().datetime(), z.uuid(), z.uuid()]),
    keys: ["occurred_at", "project_id", "result_id"],
    retained:
      "f.occurred_at>=((clock_timestamp() AT TIME ZONE 'UTC')-interval '12 months') AT TIME ZONE 'UTC' AND f.recorded_at<=$4::timestamptz"
  },
  report_coverage: {
    table: "report_source_coverage",
    columns: "f.project_id,f.lifecycle_started_at",
    order: "f.project_id",
    after: "f.project_id>($2->>0)::uuid",
    key: z.tuple([z.uuid()]),
    keys: ["project_id"],
    retained: "f.lifecycle_started_at<=$4::timestamptz"
  }
} as const;
const wire = (row: Record<string, unknown>): Record<string, unknown> =>
  z.record(z.string(), z.unknown()).parse(JSON.parse(JSON.stringify(row)));
/** Bounded additions to the existing browser-Owner account export. Exact static
 * projections exclude provider evidence, credentials, private object keys and
 * model receipts. Canonical documents keep their existing authenticated reader.
 * Numeric pages contain individual origin facts, never filtered AI narratives. */
export function createBusinessAccountExportStore(db: Queryable): {
  read(input: BusinessAccountExportInput): Promise<BusinessAccountExportPage | null>;
} {
  return {
    async read(raw) {
      const input = z
          .object({
            organization_id: z.uuid(),
            user_id: z.uuid(),
            query: BusinessAccountExportQuerySchema
          })
          .strict()
          .parse(raw),
        query = input.query;
      if (!(await isCurrentBillingOwner(db, input.organization_id, input.user_id))) return null;
      let cursor: z.infer<typeof CursorSchema> | null = null;
      if (query.cursor) {
        try {
          cursor = CursorSchema.parse(
            JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8"))
          );
          if (cursor.section !== query.section || Date.parse(cursor.as_of) > Date.now() + 60000)
            throw new Error();
        } catch {
          throw new Error("invalid_account_export_cursor");
        }
      }
      if (cursor) {
        if (["referral_partner", "customer_referral"].includes(query.section))
          throw new Error("invalid_account_export_cursor");
        if (
          ["report_definitions", "referral_commissions", "referral_payouts"].includes(
            query.section
          ) &&
          !z.uuid().safeParse(cursor.after).success
        )
          throw new Error("invalid_account_export_cursor");
        if (
          query.section === "report_runs" &&
          !ReportRunCursorSchema.safeParse(cursor.after).success
        )
          throw new Error("invalid_account_export_cursor");
      }
      // Use the database clock with full precision: a just-inserted row can
      // otherwise fall after a millisecond-truncated application timestamp.
      const asOf =
          cursor?.as_of ??
          z
            .string()
            .datetime()
            .parse(
              (
                await db.query<{ as_of: string }>(
                  `SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS as_of`,
                  []
                )
              ).rows[0]?.as_of
            ),
        actor = { version: 1 as const, kind: "browser_session" as const, user_id: input.user_id },
        scope = { organization_id: input.organization_id, initiator: actor };
      const egressChecks: Array<() => Promise<boolean>> = [];
      let items: Record<string, unknown>[] = [],
        next: string | null = null;
      if (query.section === "report_definitions") {
        const definitions = (await createReportDefinitionStore(db).list(scope))
          .sort((a, b) => a.id.localeCompare(b.id))
          .filter((d) => !cursor || d.id > z.uuid().parse(cursor.after));
        items = definitions.slice(0, query.limit).map((d) => ({ ...d }));
        for (const definition of definitions.slice(0, query.limit))
          egressChecks.push(() =>
            canAccessReportScope(db, { ...scope, scope: definition.scope, manage: false })
          );
        if (definitions.length > query.limit) next = String(items.at(-1)!["id"]);
      } else if (query.section === "report_runs") {
        const page = await createReportRunManagementStore(db).list({
          ...scope,
          limit: query.limit,
          ...(cursor ? { cursor: cursor.after } : {})
        });
        next = page.next_cursor;
        for (const run of page.items) {
          egressChecks.push(() =>
            canAccessReportScope(db, { ...scope, scope: run.scope, manage: false })
          );
          let downloads: Record<string, string | null> | null = null;
          try {
            const published = await readPublishedReportRun(db, { ...scope, id: run.id });
            const base = `/v1/organizations/${input.organization_id}/reports/${run.id}`;
            downloads = {
              document: `${base}/document`,
              html: `${base}/html`,
              pdf_status: `${base}/pdf`,
              pdf: (await reportPdfAvailable(db, published)) ? `${base}/pdf/file` : null
            };
          } catch (error) {
            if (!(error instanceof SmartReportError && error.code === "report_not_found"))
              throw error;
          }
          items.push({ ...run, downloads });
        }
      } else if (query.section in numeric) {
        const config = numeric[query.section as keyof typeof numeric];
        let after: unknown = null;
        if (cursor) {
          try {
            after = config.key.parse(JSON.parse(cursor.after));
          } catch {
            throw new Error("invalid_account_export_cursor");
          }
        }
        // All interpolated identifiers/expressions belong to the closed static map.
        const rows = (
          await db.query<Record<string, unknown>>(
            `WITH origins AS MATERIALIZED (SELECT p.id AS canonical_project_id,unnest(debugbundle_project_origins(p.id)) AS project_id FROM projects p WHERE p.organization_id=$1 AND p.id=debugbundle_canonical_project(p.id))
    SELECT ${config.columns},o.canonical_project_id FROM ${config.table} f JOIN origins o ON o.project_id=f.project_id
    WHERE ($2::jsonb IS NULL OR ${config.after}) AND ${config.retained} ORDER BY ${config.order} LIMIT $3`,
            [
              input.organization_id,
              after === null ? null : JSON.stringify(after),
              query.limit + 1,
              asOf
            ]
          )
        ).rows;
        const page = rows.slice(0, query.limit),
          cache = new Map<string, boolean>();
        for (const row of page) {
          const key = `${String(row["canonical_project_id"])}:${String(row["project_id"])}`;
          let allowed = cache.get(key);
          if (allowed === undefined) {
            allowed = await isProjectJobInitiatorAuthorized(db, {
              project_id: String(row["canonical_project_id"]),
              origin_project_ids: [String(row["project_id"])],
              initiator: actor,
              action: "read"
            });
            cache.set(key, allowed);
          }
          if (allowed) items.push(wire(row));
          if (allowed)
            egressChecks.push(() =>
              isProjectJobInitiatorAuthorized(db, {
                project_id: String(row["canonical_project_id"]),
                origin_project_ids: [String(row["project_id"])],
                initiator: actor,
                action: "read"
              })
            );
        }
        if (rows.length > query.limit) {
          const last = wire(page.at(-1)!);
          next = JSON.stringify(config.keys.map((key) => String(last[key])));
        }
      } else if (query.section === "report_deliveries") {
        let after: { at: string; id: string } | null = null;
        if (cursor) {
          try {
            after = z
              .object({ at: z.string().datetime(), id: z.uuid() })
              .strict()
              .parse(JSON.parse(cursor.after));
          } catch {
            throw new Error("invalid_account_export_cursor");
          }
        }
        const rows = (
          await db.query<Record<string, unknown>>(
            `SELECT e.id,e.run_id,e.recipient_user_id,e.status,e.reason,to_char(e.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,e.updated_at,e.accepted_at,r.accepted_scope FROM report_email_deliveries e LEFT JOIN report_runs r ON r.id=e.run_id
    WHERE e.organization_id=$1 AND e.created_at<=$4::timestamptz AND e.expires_at>clock_timestamp() AND ($2::timestamptz IS NULL OR(e.created_at,e.id)<($2,$3::uuid)) ORDER BY e.created_at DESC,e.id DESC LIMIT $5`,
            [input.organization_id, after?.at ?? null, after?.id ?? null, asOf, query.limit + 1]
          )
        ).rows;
        for (const row of rows.slice(0, query.limit)) {
          const allowed =
            row["run_id"] === null
              ? row["recipient_user_id"] === input.user_id
              : await canAccessReportScope(db, {
                  ...scope,
                  scope: row["accepted_scope"],
                  manage: false
                });
          if (allowed) {
            if (row["run_id"] !== null)
              egressChecks.push(() =>
                canAccessReportScope(db, { ...scope, scope: row["accepted_scope"], manage: false })
              );
            const value = wire(row);
            delete value["accepted_scope"];
            items.push(value);
          }
        }
        if (rows.length > query.limit) {
          const last = wire(rows[query.limit - 1]!);
          next = JSON.stringify({ at: last["created_at"], id: last["id"] });
        }
      } else if (query.section === "customer_referral") {
        items = (
          await db.query<Record<string, unknown>>(
            `SELECT a.id AS referral_id,p.code AS partner_code,a.source,(a.reserved_checkout_attempt_id IS NOT NULL) AS checkout_reserved FROM referral_attributions a JOIN referral_partners p ON p.id=a.partner_id WHERE a.organization_id=$1`,
            [input.organization_id]
          )
        ).rows;
      } else {
        const partner = (
          await db.query<Record<string, unknown>>(
            `SELECT p.id AS partner_id,p.code,p.status,p.terms_version,p.commission_basis_points,p.accepted_at FROM referral_partners p JOIN users u ON u.id=p.user_id WHERE p.user_id=$1 AND u.email_verified_at IS NOT NULL`,
            [input.user_id]
          )
        ).rows[0];
        if (partner) {
          const partnerId = z.uuid().parse(partner["partner_id"]);
          if (query.section === "referral_partner")
            items = [
              {
                ...wire(partner),
                balance: await createReferralLedgerStore(db).balance(
                  partnerId,
                  new Date().toISOString()
                )
              }
            ];
          else if (query.section === "referral_payouts") {
            const before = cursor ? z.uuid().parse(cursor.after) : undefined,
              payouts = await createReferralLedgerStore(db).listPayouts({
                partner_id: partnerId,
                limit: query.limit,
                ...(before ? { before } : {})
              });
            items = payouts.map((p) => ({ ...p }));
            if (payouts.length === query.limit) next = payouts.at(-1)!.batch_id;
          } else {
            const before = cursor ? z.uuid().parse(cursor.after) : null,
              rows = (
                await db.query<Record<string, unknown>>(
                  `SELECT l.id,l.attribution_id AS client_id,l.currency,l.amount_minor::text,l.available_at,l.recorded_at,b.status AS payout_status FROM referral_commission_ledger l LEFT JOIN referral_payout_entries e ON e.ledger_entry_id=l.id LEFT JOIN referral_payout_batches b ON b.id=e.batch_id
      WHERE l.partner_id=$1 AND l.recorded_at<=$3::timestamptz AND ($2::uuid IS NULL OR(l.recorded_at,l.id)<(SELECT recorded_at,id FROM referral_commission_ledger WHERE id=$2 AND partner_id=$1)) ORDER BY l.recorded_at DESC,l.id DESC LIMIT $4`,
                  [partnerId, before, asOf, query.limit + 1]
                )
              ).rows;
            items = rows.slice(0, query.limit).map(wire);
            if (rows.length > query.limit) next = String(items.at(-1)!["id"]);
          }
        }
      }
      for (const check of egressChecks) if (!(await check())) return null;
      if (!(await isCurrentBillingOwner(db, input.organization_id, input.user_id))) return null;
      return {
        section: query.section,
        as_of: asOf,
        items,
        next_cursor:
          next === null
            ? null
            : Buffer.from(
                JSON.stringify({ section: query.section, as_of: asOf, after: next })
              ).toString("base64url")
      };
    }
  };
}
