import { z } from "zod";
import { ReviewArtifactSchema, ReviewSourceSchema } from "./review-contract.js";

const ref = ReviewSourceSchema.shape.ref;
const count = z.number().int().safe().nonnegative();
const prose = z.string().min(1).max(400);
export const ReviewActionSchema = z.enum([
  "investigate_failure",
  "review_noise",
  "improve_flow",
  "collect_evidence"
]);
export const ReviewControlSchema = z.enum([
  "capture_policy",
  "capture_rules",
  "alert_delivery",
  "improvement_detection",
  "temporary_diagnostics",
  "sdk_local"
]);
export const ReviewMeasurementSchema = z
  .object({
    key: z.enum([
      "sessions_entered",
      "sessions_completed",
      "dropoffs",
      "dropoff_rate",
      "unique_sessions",
      "event_count",
      "current_sessions",
      "baseline_sessions",
      "current_exits",
      "baseline_exits",
      "current_conversions",
      "baseline_conversions",
      "affected_sessions",
      "total_sessions",
      "total_loop_transitions",
      "duration_ms"
    ]),
    value: z.number().finite().nonnegative(),
    unit: z.enum(["count", "ratio", "milliseconds"]),
    basis: z.enum(["period", "lifetime", "snapshot"])
  })
  .strict();
export const ReviewContextSchema = z
  .object({
    version: z.literal(1),
    signals: z
      .array(
        z
          .object({
            source_ref: ref,
            protected_failure: z.boolean().nullable().default(null),
            window: z
              .object({ starts_at: z.string().datetime(), ends_at: z.string().datetime() })
              .strict()
              .nullable()
              .default(null),
            detector: z.enum([
              "incident",
              "health",
              "unknown",
              "warning_hotspot",
              "slow_request",
              "request_failure_pattern",
              "recurring_incident",
              "post_deploy_regression",
              "funnel_dropoff",
              "journey_friction",
              "route_exit",
              "incident_impact",
              "deploy_conversion",
              "marker_friction"
            ]),
            first_observed_at: z.string().datetime().nullable(),
            last_observed_at: z.string().datetime().nullable(),
            confidence: z.number().min(0).max(1).nullable(),
            measurements: z.array(ReviewMeasurementSchema).max(16),
            related_refs: z.array(ref).max(8)
          })
          .strict()
      )
      .max(25),
    configuration: z
      .object({
        coverage: z.enum(["complete", "partial", "unavailable"]),
        origins: z
          .array(
            z
              .object({
                origin_project_id: z.uuid(),
                policy_at: z.string().datetime().nullable(),
                preset: z.enum(["minimal", "balanced", "investigative"]).nullable(),
                logs: z.enum(["off", "error", "warning", "info"]).nullable(),
                requests: z.enum(["off", "failures_only", "filtered", "all"]).nullable(),
                breadcrumbs: z.enum(["local_only", "exception_only", "standalone"]).nullable(),
                diagnostic_capture: z.boolean().nullable(),
                promoted_client_error_rules: count.nullable(),
                sensitivity: z.enum(["high_confidence", "balanced", "verbose"]).nullable()
              })
              .strict()
          )
          .max(25),
        rules: z
          .array(
            z
              .object({
                ref: z.string().regex(/^r[1-9][0-9]?$/),
                origin_project_id: z.uuid(),
                action: z.enum(["demote", "sample", "drop"]),
                enabled: z.boolean(),
                expires_at: z.string().datetime().nullable(),
                sample_rate: z.number().min(0).max(1).nullable(),
                lifetime_hits: count.nullable(),
                source_refs: z.array(ref).max(25)
              })
              .strict()
          )
          .max(50),
        alerts: z
          .array(
            z
              .object({
                ref: z.string().regex(/^a[1-9][0-9]?$/),
                origin_project_id: z.uuid(),
                cooldown_seconds: count.max(604800),
                cooldown_scope: z.enum(["incident", "project"]),
                aggregation_window_seconds: count.max(300).nullable(),
                delivered_rows: count.nullable(),
                repeated_source_refs: z.array(ref).max(25).default([]),
                source_refs: z.array(ref).max(25)
              })
              .strict()
          )
          .max(25),
        active_probes: count.nullable(),
        sdk_local: z.literal("not_observed")
      })
      .strict()
  })
  .strict();
export type ReviewContext = z.infer<typeof ReviewContextSchema>;
export const ReviewPlanSchema = z
  .object({
    ref: z.string().regex(/^p[1-5]$/),
    action: ReviewActionSchema,
    source_refs: z.array(ref).min(1).max(5),
    reason: prose,
    inspection: prose,
    verification: prose,
    controls: z
      .array(
        z
          .object({
            control: ReviewControlSchema,
            effects: z
              .array(
                z.enum([
                  "accepted_events",
                  "incident_creation",
                  "notifications",
                  "opportunities",
                  "evidence"
                ])
              )
              .min(1)
              .max(5),
            check: prose,
            verification: prose
          })
          .strict()
      )
      .max(6)
  })
  .strict();
export type ReviewPlan = z.infer<typeof ReviewPlanSchema>;
/** The plan read enriches the existing saved bundle; storage and exports retain
 * their released shape. Older reviews have no configuration snapshot. */
export const ReviewPlanDocumentSchema = ReviewArtifactSchema.safeExtend({
  context: ReviewContextSchema.nullable(),
  plans: z.array(ReviewPlanSchema).max(5)
}).superRefine((value, ctx) => {
  if (value.context === null) {
    if (value.plans.length)
      ctx.addIssue({ code: "custom", message: "review_planning_context_missing" });
    return;
  }
  const refs = new Set(value.facts.sources.map((s) => s.ref));
  const unique = (items: string[]): boolean => new Set(items).size === items.length;
  const linked = (items: string[]): boolean => unique(items) && items.every((r) => refs.has(r));
  if (
    !unique(value.context.signals.map((s) => s.source_ref)) ||
    value.context.signals.some(
      (s) =>
        !refs.has(s.source_ref) || !linked(s.related_refs) || s.related_refs.includes(s.source_ref)
    ) ||
    !unique(value.plans.map((p) => p.ref)) ||
    value.plans.some((p) => !linked(p.source_refs)) ||
    value.context.configuration.rules.some((r) => !linked(r.source_refs)) ||
    value.context.configuration.alerts.some(
      (a) =>
        !linked(a.source_refs) ||
        !linked(a.repeated_source_refs) ||
        a.repeated_source_refs.some((r) => !a.source_refs.includes(r))
    ) ||
    value.priorities.some((p) => !refs.has(p.source_ref)) ||
    (value.analysis === "available") !== (value.guidance !== null) ||
    value.guidance?.investigations.some((i) => !linked(i.evidence_refs))
  )
    ctx.addIssue({ code: "custom", message: "review_planning_reference_invalid" });
});
export type ReviewPlanDocument = z.infer<typeof ReviewPlanDocumentSchema>;
