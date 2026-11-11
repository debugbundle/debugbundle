import { z } from "zod";
import { CapturePolicySchema, resolvePolicy } from "../../shared-types/src/capture-policy.js";
import {
  ReviewContextSchema,
  ReviewMeasurementSchema,
  type ReviewContext
} from "../../smart-improvements/src/review-planning-contract.js";
import type { ReviewFacts } from "../../smart-improvements/src/review-contract.js";
import type { Queryable } from "./types.js";

const number = (value: unknown): number | null => {
  const parsed = z.coerce.number().finite().nonnegative().safeParse(value);
  return value === null || value === undefined || !parsed.success ? null : parsed.data;
};
const at = (value: unknown): string | null =>
  value === null || value === undefined ? null : new Date(value as string).toISOString();
const keys = ReviewMeasurementSchema.shape.key.options;
// Numeric-only extraction in SQL prevents arbitrary evidence strings/objects
// from crossing into this configuration collector or provider projection.
const numericEvidence = `jsonb_build_object(${keys.map((key) => `'${key}',CASE WHEN jsonb_typeof(evidence->'${key}')='number' THEN evidence->'${key}' ELSE NULL END`).join(",")})`;

/** Read within the same authorised repeatable-read snapshot as base facts.
 * Current canonical aliases never expand frozen origins. No rule matcher,
 * recipient, destination, secret, log body or workspace-wide counter is read. */
export async function collectImprovementReviewContext(
  db: Queryable,
  facts: ReviewFacts,
  origins: string[]
): Promise<ReviewContext> {
  const ids = facts.sources.flatMap((source) => (source.source_id ? [source.source_id] : []));
  const rows = (
    await db.query<Record<string, unknown>>(
      `
    SELECT id,project_id,'incident'::text AS detector,first_seen_at AS first_at,last_seen_at AS last_at,NULL::numeric AS confidence,'{}'::jsonb AS measurements,ARRAY[]::uuid[] AS related,NULL::text AS window_from,NULL::text AS window_to,NULL::text AS response_status
      FROM incidents WHERE project_id=ANY($1::uuid[]) AND id=ANY($2::uuid[]) AND last_seen_at<=$3
    UNION ALL
    SELECT id,project_id,kind,first_detected_at,last_detected_at,confidence,'{}'::jsonb,related_incident_ids[1:8],NULL::text,NULL::text,left(evidence->>'response_status',3)
      FROM improvement_opportunities WHERE project_id=ANY($1::uuid[]) AND id=ANY($2::uuid[]) AND updated_at<=$3
    UNION ALL
    SELECT id,project_id,kind,first_detected_at,last_detected_at,confidence,${numericEvidence},related_incident_ids[1:8],left(evidence#>>'{analysis_window,from}',40),left(evidence#>>'{analysis_window,to}',40),NULL::text
      FROM analytics_opportunities WHERE project_id=ANY($1::uuid[]) AND id=ANY($2::uuid[]) AND updated_at<=$3
    ORDER BY id LIMIT 25`,
      [origins, ids, facts.cutoff_at]
    )
  ).rows;
  const signals = facts.sources.map((source) => {
    const row = rows.find(
      (r) => r["id"] === source.source_id && r["project_id"] === source.origin_project_id
    );
    const rawDetector = row?.["detector"];
    const detector =
      rawDetector === "route_health"
        ? "route_exit"
        : rawDetector === "deploy_comparison"
          ? "deploy_conversion"
          : rawDetector;
    const parsedDetector =
      ReviewContextSchema.shape.signals.element.shape.detector.safeParse(detector);
    const related = z.array(z.uuid()).parse(row?.["related"] ?? []);
    const from = z.string().datetime().safeParse(row?.["window_from"]),
      to = z.string().datetime().safeParse(row?.["window_to"]);
    const window =
      from.success &&
      to.success &&
      Date.parse(from.data) < Date.parse(to.data) &&
      Date.parse(to.data) <= Date.parse(facts.cutoff_at)
        ? { starts_at: from.data, ends_at: to.data }
        : null;
    const measurements: z.infer<typeof ReviewMeasurementSchema>[] = [];
    const values = z.record(z.string(), z.unknown()).parse(row?.["measurements"] ?? {});
    for (const key of keys) {
      const value = number(values[key]);
      if (
        value !== null &&
        (key.endsWith("rate") ? value <= 1 : key === "duration_ms" || Number.isSafeInteger(value))
      )
        measurements.push({
          key,
          value,
          unit: key.endsWith("rate") ? "ratio" : key === "duration_ms" ? "milliseconds" : "count",
          // Baselines may use a different comparison window, which is not
          // available here. Never label them as counts for the current window.
          basis: window && !key.startsWith("baseline_") ? "period" : "snapshot"
        });
    }
    return {
      source_ref: source.ref,
      window,
      protected_failure:
        source.kind === "incident" ||
        (number(row?.["response_status"]) ?? 0) >= 500 ||
        [401, 403].includes(number(row?.["response_status"]) ?? 0)
          ? true
          : null,
      detector: parsedDetector.success
        ? parsedDetector.data
        : source.kind === "health"
          ? ("health" as const)
          : ("unknown" as const),
      first_observed_at: at(row?.["first_at"]),
      last_observed_at: at(row?.["last_at"]),
      confidence: number(row?.["confidence"]),
      measurements,
      related_refs: [
        ...new Set([
          ...(source.related_refs ?? []),
          ...facts.sources
            .filter((s) => s.kind === "incident" && s.source_id && related.includes(s.source_id))
            .map((s) => s.ref)
        ])
      ].sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    };
  });
  const policies = (
    await db.query<Record<string, unknown>>(
      `SELECT p.id AS origin_project_id,debugbundle_canonical_project(p.id) AS canonical_id,
    CASE WHEN p.updated_at<=$2 THEN p.improvement_bundle_sensitivity ELSE NULL END AS sensitivity,
    c.project_id,c.preset,c.capture_logs,c.capture_request_events,c.capture_breadcrumbs,c.capture_probe_events,
    c.capture_diagnostic_context,c.immediate_client_error_statuses,c.immediate_client_error_path_rules,c.updated_at
    FROM projects p LEFT JOIN capture_policies c ON c.project_id=p.id AND c.updated_at<=$2
    WHERE p.id=ANY($1::uuid[]) ORDER BY p.id LIMIT 26`,
      [origins, facts.cutoff_at]
    )
  ).rows;
  let partial = origins.length > 25 || policies.length !== origins.length;
  const policyOrigins = policies.slice(0, 25).map((row) => {
    if (row["canonical_id"] !== row["origin_project_id"]) partial = true;
    // Select only known policy columns for strict schema parsing.
    const policy =
      row["project_id"] === null
        ? null
        : CapturePolicySchema.safeParse(
            Object.fromEntries(
              Object.keys(CapturePolicySchema.shape).map((key) => [
                key,
                key === "updated_at" ? at(row[key]) : row[key]
              ])
            )
          );
    const resolved =
      policy?.success && row["canonical_id"] === row["origin_project_id"]
        ? resolvePolicy(policy.data)
        : null;
    if (!resolved) partial = true;
    return {
      origin_project_id: row["origin_project_id"],
      policy_at: resolved ? at(row["updated_at"]) : null,
      preset: resolved?.preset ?? null,
      logs: resolved?.capture_logs ?? null,
      requests: resolved?.capture_request_events ?? null,
      breadcrumbs: resolved?.capture_breadcrumbs ?? null,
      diagnostic_capture: resolved?.capture_diagnostic_context ?? null,
      promoted_client_error_rules: resolved
        ? resolved.immediate_client_error_statuses.length +
          resolved.immediate_client_error_path_rules.length
        : null,
      sensitivity: row["canonical_id"] === row["origin_project_id"] ? row["sensitivity"] : null
    };
  });
  const ruleRows = (
    await db.query<Record<string, unknown>>(
      `SELECT id,project_id,action,enabled,expires_at,sample_rate,hit_count,last_matched_at,created_from_incident_id,
    COALESCE(scope_origin_ids,ARRAY[project_id]) AS origins
    FROM capture_rules WHERE project_id=ANY($1::uuid[]) AND updated_at<=$2 ORDER BY id LIMIT 51`,
      [origins, facts.cutoff_at]
    )
  ).rows;
  if (ruleRows.length > 50) partial = true;
  const rules = ruleRows.slice(0, 50).map((row, index) => ({
    ref: `r${index + 1}`,
    origin_project_id: row["project_id"],
    action: row["action"],
    enabled: row["enabled"],
    expires_at: at(row["expires_at"]),
    sample_rate: number(row["sample_rate"]),
    lifetime_hits:
      z
        .array(z.uuid())
        .parse(row["origins"])
        .every((id) => origins.includes(id)) &&
      (row["last_matched_at"] === null ||
        Date.parse(at(row["last_matched_at"])!) <= Date.parse(facts.cutoff_at))
        ? number(row["hit_count"])
        : null,
    source_refs: facts.sources
      .filter(
        (s) =>
          s.kind === "incident" &&
          s.source_id === row["created_from_incident_id"] &&
          s.origin_project_id === row["project_id"]
      )
      .map((s) => s.ref)
  }));
  const alertRows = (
    await db.query<Record<string, unknown>>(
      `SELECT a.id,a.project_id,a.cooldown_seconds,
      CASE WHEN a.config->>'cooldown_scope'='project' THEN 'project' ELSE 'incident' END AS cooldown_scope,
      CASE WHEN a.channel='email' THEN a.config->'aggregation_window_seconds' ELSE NULL END AS aggregation,
      COALESCE(a.scope_origin_ids,ARRAY[a.project_id]) AS origins
    FROM alert_rules a WHERE a.project_id=ANY($1::uuid[]) AND a.is_enabled AND a.updated_at<=$2 ORDER BY a.id LIMIT 26`,
      [origins, facts.cutoff_at]
    )
  ).rows;
  if (alertRows.length > 25) partial = true;
  const incidentIds = facts.sources
    .filter((s) => s.kind === "incident")
    .flatMap((s) => (s.source_id ? [s.source_id] : []));
  const deliveries =
    alertRows.length > 0 && incidentIds.length > 0
      ? (
          await db.query<Record<string, unknown>>(
            `SELECT id,alert_id,incident_id,project_id FROM alert_deliveries
    WHERE project_id=ANY($1::uuid[]) AND incident_id=ANY($2::uuid[]) AND status='delivered'
      AND created_at>=$3 AND created_at<$4 AND delivered_at>=$3 AND delivered_at<$4
      AND updated_at<=$5 AND alert_id=ANY($6::uuid[])
    ORDER BY created_at DESC,id LIMIT 101`,
            [
              origins,
              incidentIds,
              facts.period.starts_at,
              facts.period.ends_at,
              facts.cutoff_at,
              alertRows.slice(0, 25).map((row) => row["id"])
            ]
          )
        ).rows
      : [];
  if (deliveries.length > 100) partial = true;
  const scopedAlerts = new Set(
    alertRows
      .slice(0, 25)
      .filter((row) =>
        z
          .array(z.uuid())
          .parse(row["origins"])
          .every((id) => origins.includes(id))
      )
      .map((row) => row["id"])
  );
  const scopedDeliveries = deliveries.slice(0, 100).filter((d) => scopedAlerts.has(d["alert_id"]));
  const alerts = alertRows.slice(0, 25).map((row, index) => {
    const selected = deliveries.slice(0, 100).filter((d) => d["alert_id"] === row["id"]);
    const whollyScoped = scopedAlerts.has(row["id"]);
    if (!whollyScoped) partial = true;
    return {
      ref: `a${index + 1}`,
      origin_project_id: row["project_id"],
      cooldown_seconds: row["cooldown_seconds"],
      cooldown_scope: row["cooldown_scope"],
      aggregation_window_seconds: number(row["aggregation"]),
      delivered_rows: whollyScoped && deliveries.length <= 100 ? selected.length : null,
      // A bounded sample can establish repetition even when the total is
      // unknown, including delivery by different rules for the same incident.
      // Only participating, wholly accepted rules may establish repetition;
      // this does not establish redundant recipients or a complete count.
      repeated_source_refs: whollyScoped
        ? facts.sources
            .filter(
              (s) =>
                s.kind === "incident" &&
                selected.some(
                  (d) => d["incident_id"] === s.source_id && d["project_id"] === s.origin_project_id
                ) &&
                scopedDeliveries.filter(
                  (d) => d["incident_id"] === s.source_id && d["project_id"] === s.origin_project_id
                ).length > 1
            )
            .map((s) => s.ref)
        : [],
      source_refs: facts.sources
        .filter(
          (s) =>
            s.kind === "incident" &&
            selected.some(
              (d) => d["incident_id"] === s.source_id && d["project_id"] === s.origin_project_id
            )
        )
        .map((s) => s.ref)
    };
  });
  const probes = (
    await db.query<Record<string, unknown>>(
      `SELECT id,COALESCE(scope_origin_ids,ARRAY[project_id]) AS origins FROM probe_activations
    WHERE project_id=ANY($1::uuid[]) AND created_at<=$2 AND expires_at>$2 AND trigger_expires_at>$2
      AND (deactivated_at IS NULL OR deactivated_at>$2) ORDER BY id LIMIT 101`,
      [origins, facts.cutoff_at]
    )
  ).rows;
  const probesScoped =
    probes.length <= 100 &&
    probes.every((p) =>
      z
        .array(z.uuid())
        .parse(p["origins"])
        .every((id) => origins.includes(id))
    );
  if (!probesScoped) partial = true;
  return ReviewContextSchema.parse({
    version: 1,
    signals,
    configuration: {
      coverage: policyOrigins.every((p) => p.preset === null)
        ? "unavailable"
        : partial
          ? "partial"
          : "complete",
      origins: policyOrigins,
      rules,
      alerts,
      active_probes: probesScoped ? probes.length : null,
      sdk_local: "not_observed"
    }
  });
}
