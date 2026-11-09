import { z } from "zod";
import { ReportRunRecordSchema, type ReportRunRecord } from "../../smart-reports/src/report-run.js";
export function reportRunRecord(row: Record<string, unknown>): ReportRunRecord {
  const iso = (value: unknown): string | null =>
    value === null
      ? null
      : (value instanceof Date ? value : new Date(z.string().parse(value))).toISOString();
  return ReportRunRecordSchema.parse({
    id: row["id"],
    organization_id: row["organization_id"],
    definition_id: row["definition_id"],
    definition_version: row["definition_version"],
    name: row["name"],
    scope: row["accepted_scope"],
    recipient_user_ids: row["recipient_user_ids"],
    privacy_mode: row["privacy_mode"],
    period: {
      kind: row["period_kind"],
      starts_at: iso(row["period_starts_at"]),
      ends_at: iso(row["period_ends_at"]),
      duration_days: row["period_duration_days"]
    },
    kind: row["generation_kind"],
    status: row["status"],
    skip_reason: row["skip_reason"],
    ai_status: row["ai_status"],
    generation_counted: row["generation_counted"],
    send_email: row["send_email"],
    created_at: iso(row["created_at"]),
    updated_at: iso(row["updated_at"]),
    published_at: iso(row["published_at"]),
    expires_at: iso(row["expires_at"])
  });
}
