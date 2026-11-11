import { z } from "zod";
import { getTierCapabilities } from "../../shared-types/src/tier-capabilities.js";
import {
  ReviewFactsSchema,
  ReviewSourceSchema,
  type ReviewFacts
} from "../../smart-improvements/src/review.js";
import { redactReportData } from "../../smart-reports/src/report-redaction.js";
import { ReportPeriodSchema } from "../../smart-reports/src/report-period.js";
import { readReportAnalyticsPeriod } from "./report-analytics-facts.js";
import { createPostgresImprovementOpportunityStore } from "./improvement-opportunity-store.js";
import type { Queryable } from "./types.js";

/** Called within an authorised repeatable-read snapshot. Uses existing retained
 * ledgers/metadata only, never raw logs, bodies, headers or journey identities. */
export async function collectImprovementReviewFacts(
  db: Queryable,
  input: {
    organization_id: string;
    project_id: string;
    origins: string[];
    plan: string;
    period: z.infer<typeof ReportPeriodSchema>;
    cutoff_at: string;
    privacy_mode: "full" | "restricted";
  }
): Promise<ReviewFacts> {
  const retention = getTierCapabilities(input.plan).bundle_retention_days;
  const retainedFrom = new Date(Date.parse(input.cutoff_at) - retention * 86400000).toISOString();
  const sources: z.infer<typeof ReviewSourceSchema>[] = [];
  const incidentLinks = new Map<string, string[]>();
  const add = (value: Omit<z.infer<typeof ReviewSourceSchema>, "ref">): void => {
    const safe = {
      ...value,
      title:
        input.privacy_mode === "restricted"
          ? `${value.severity} ${value.status} ${value.kind}`
          : value.title,
      context: input.privacy_mode === "restricted" ? null : value.context
    };
    const cleaned = z
      .object({ title: z.string(), context: z.string().nullable(), observation: z.string() })
      .passthrough()
      .parse(redactReportData({ ref: `e${sources.length + 1}`, ...safe }));
    // Sanitisation can expand a short address into a longer withheld marker.
    // Apply the wire's character budgets afterwards without splitting Unicode.
    const bounded = (text: string, limit: number): string => [...text].slice(0, limit).join("");
    sources.push(
      ReviewSourceSchema.parse({
        ...cleaned,
        title: bounded(cleaned.title, 160),
        context: cleaned.context === null ? null : bounded(cleaned.context, 600),
        observation: bounded(cleaned.observation, 500)
      })
    );
  };
  const incidents = await db.query<{
    id: string;
    project_id: string;
    title: string;
    status: string;
    severity: string;
    occurrence_count: string;
  }>(
    `SELECT id,project_id,left(title,160) AS title,status,severity,occurrence_count::text FROM incidents
     WHERE project_id=ANY($1::uuid[]) AND status IN ('open','regressed') AND last_seen_at>=$2 AND last_seen_at<=$3
     ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,last_seen_at DESC,id LIMIT 8`,
    [input.origins, retainedFrom, input.cutoff_at]
  );
  for (const row of incidents.rows)
    add({
      kind: "incident",
      origin_project_id: row.project_id,
      source_id: row.id,
      title: row.title || "Retained incident",
      context: null,
      status: row.status,
      severity: ReviewSourceSchema.shape.severity.parse(row.severity),
      count: z.coerce.number().int().safe().nonnegative().parse(row.occurrence_count),
      observation:
        "Retained incident is currently active; the count is lifetime occurrences, not a period count."
    });
  const improvements = await createPostgresImprovementOpportunityStore(
    db
  ).listImprovementsForOrganization({
    organization_id: input.organization_id,
    project_id: input.project_id,
    origin_project_ids: input.origins,
    status: "open",
    limit: 7
  });
  for (const row of improvements) {
    if (
      Date.parse(row.last_detected_at) < Date.parse(retainedFrom) ||
      Date.parse(row.last_detected_at) > Date.parse(input.cutoff_at)
    )
      continue;
    incidentLinks.set(row.improvement_id, row.related_incident_ids);
    add({
      kind: "improvement",
      origin_project_id: row.project_id,
      source_id: row.improvement_id,
      title: [...row.title].slice(0, 160).join("") || "Retained improvement",
      context: [...row.summary].slice(0, 600).join(""),
      status: row.status,
      severity: row.severity,
      count: row.occurrence_count,
      observation:
        "A deterministic improvement opportunity is open; the count is lifetime observations. Related incidents establish linkage, not a cause."
    });
  }
  const analytics = await readReportAnalyticsPeriod(db, {
    origin_ids: input.origins,
    period: input.period,
    now: input.cutoff_at
  });
  if (analytics.coverage !== "unavailable") {
    const candidates = await db.query<{
      id: string;
      project_id: string;
      title: string;
      summary: string;
      severity: "high" | "medium" | "low";
    }>(
      `SELECT a.id,a.project_id,left(a.title,160) AS title,left(a.summary,600) AS summary,a.severity FROM analytics_opportunities a
       JOIN project_analytics_settings s ON s.project_id=debugbundle_canonical_project(a.project_id)
       WHERE a.project_id=ANY($1::uuid[]) AND s.enabled AND a.status='open' AND a.first_detected_at>=s.updated_at AND a.last_detected_at>=$2 AND a.last_detected_at<=$3
       AND a.last_detected_at>=((($3::timestamptz AT TIME ZONE 'UTC')-make_interval(months=>LEAST(s.aggregate_retention_months,12))) AT TIME ZONE 'UTC')
       ORDER BY CASE a.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,a.last_detected_at DESC,a.id LIMIT 5`,
      [input.origins, input.period.starts_at, input.cutoff_at]
    );
    for (const row of candidates.rows)
      add({
        kind: "analytics",
        origin_project_id: row.project_id,
        source_id: row.id,
        title: row.title || "Measured analytics opportunity",
        context: row.summary,
        status: "open",
        severity: row.severity,
        count: null,
        observation:
          "An existing aggregate analytics rule detected a possible flow improvement. Coverage and sampling limit interpretation; correlation is not causation."
      });
  }
  const health = (
    await db.query<{ total: string; successful: string; downtime: string }>(
      `SELECT COALESCE(sum(total_checks),0)::text AS total,COALESCE(sum(successful_checks),0)::text AS successful,
       COALESCE(sum(downtime_seconds),0)::text AS downtime FROM availability_check_daily_rollups
       WHERE project_id=ANY($1::uuid[]) AND day>=($2::timestamptz AT TIME ZONE 'UTC')::date
       AND day<($3::timestamptz AT TIME ZONE 'UTC')::date AND day>=($4::timestamptz AT TIME ZONE 'UTC')::date-30
       AND updated_at<=$4::timestamptz`,
      [input.origins, input.period.starts_at, input.period.ends_at, input.cutoff_at]
    )
  ).rows[0]!;
  const checks = await db.query<{ id: string; project_id: string; name: string }>(
    `SELECT id,project_id,left(name,160) AS name FROM availability_checks WHERE project_id=ANY($1::uuid[]) AND deleted_at IS NULL
      AND enabled AND status='failing' AND last_checked_at<=$2 AND last_checked_at>=$2::timestamptz-interval '30 days'
      ORDER BY last_checked_at DESC,id LIMIT 5`,
    [input.origins, input.cutoff_at]
  );
  for (const row of checks.rows)
    add({
      kind: "health",
      origin_project_id: row.project_id,
      source_id: row.id,
      title: row.name || "Failing monitored check",
      context: null,
      status: "failing",
      severity: "high",
      count: null,
      observation:
        "The retained monitored check is failing at this snapshot. This observation does not establish an account-wide outage or its cause."
    });
  sources.sort(
    (a, b) =>
      a.kind.localeCompare(b.kind) ||
      a.origin_project_id.localeCompare(b.origin_project_id) ||
      (a.source_id ?? "").localeCompare(b.source_id ?? "")
  );
  sources.forEach((source, index) => {
    source.ref = `e${index + 1}`;
  });
  // Only carry relationships already recorded on an opportunity, and only to
  // incident evidence actually selected from this consented snapshot. Provider
  // input receives opaque refs, never private incident/project identifiers.
  for (const source of sources) {
    if (source.kind !== "improvement" || source.source_id === null) continue;
    const linked = new Set(incidentLinks.get(source.source_id) ?? []);
    source.related_refs = sources
      .filter(
        (item) => item.kind === "incident" && item.source_id !== null && linked.has(item.source_id)
      )
      .map((item) => item.ref);
  }
  const count = (value: string): number =>
    z.coerce.number().int().safe().nonnegative().parse(value);
  return ReviewFactsSchema.parse({
    version: 1,
    project_id: input.project_id,
    period: input.period,
    cutoff_at: input.cutoff_at,
    privacy_mode: input.privacy_mode,
    sources,
    analytics: {
      coverage: analytics.coverage,
      sessions: analytics.sessions,
      page_views: analytics.page_views
    },
    health: {
      coverage: count(health.total) > 0 ? "partial" : "unavailable",
      total_checks: count(health.total),
      successful_checks: count(health.successful),
      estimated_check_downtime_seconds: z.coerce.number().nonnegative().parse(health.downtime)
    },
    limitations: [
      "Selection is bounded to retained incident, improvement, aggregate analytics and monitored health evidence.",
      "Analytics opportunity summaries predating the current analytics policy are withheld.",
      "Current source states and lifetime counts cannot reconstruct every historical transition. Missing observations are unknown.",
      "Estimated check downtime is not account outage time; overlapping checks cannot be added into an account outage.",
      "Suggestions guide investigation; no repository, rendered UI or external content was inspected.",
      "Correlation is not causation. No actions have been performed.",
      ...analytics.notes.slice(0, 3),
      ...(input.privacy_mode === "restricted"
        ? ["Project identity and captured source narratives are withheld from model input."]
        : [])
    ]
  });
}

/** Numeric policy snapshot, not captured analytics data or provider input. */
export async function reviewPrivacySnapshot(db: Queryable, origins: string[]): Promise<unknown> {
  return (
    await db.query(
      `SELECT p.id,COALESCE(s.enabled,false) AS enabled,COALESCE(s.privacy_mode,'strict') AS privacy_mode,
    COALESCE(s.consent_required,false) AS consent_required,COALESCE(s.aggregate_retention_months,12) AS aggregate_retention_months,
    COALESCE(s.approved_custom_dimensions,'[]'::jsonb) AS approved_custom_dimensions
    FROM projects p LEFT JOIN project_analytics_settings s ON s.project_id=debugbundle_canonical_project(p.id)
    WHERE p.id=ANY($1::uuid[]) ORDER BY p.id`,
      [origins]
    )
  ).rows;
}
export function reviewPrivacyNarrowed(previous: unknown, current: unknown): boolean {
  const schema = z.array(
    z.object({
      id: z.uuid(),
      enabled: z.boolean(),
      privacy_mode: z.string(),
      consent_required: z.boolean(),
      aggregate_retention_months: z.number(),
      approved_custom_dimensions: z.array(z.unknown())
    })
  );
  const now = new Map(schema.parse(current).map((row) => [row.id, row]));
  return schema.parse(previous).some((row) => {
    const next = now.get(row.id);
    return (
      !next ||
      (row.enabled && !next.enabled) ||
      (row.privacy_mode !== "strict" && next.privacy_mode === "strict") ||
      (row.privacy_mode === "custom" && next.privacy_mode !== "custom") ||
      (!row.consent_required && next.consent_required) ||
      next.aggregate_retention_months < row.aggregate_retention_months ||
      row.approved_custom_dimensions.some(
        (key) =>
          !next.approved_custom_dimensions.some(
            (item) => JSON.stringify(item) === JSON.stringify(key)
          )
      )
    );
  });
}
