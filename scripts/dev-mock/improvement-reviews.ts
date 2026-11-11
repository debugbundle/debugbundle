import { z } from "zod";
import {
  ReviewContextSchema,
  ReviewPlanDocumentSchema
} from "../../packages/smart-improvements/src/review-planning-contract.js";
import { planReview } from "../../packages/smart-improvements/src/review-planning.js";
import type { createDevMockFixtures } from "./fixtures.js";
import type { MockResponse } from "./api.js";
import {
  ReviewSettingsSchema,
  ReviewSettingsCommandSchema,
  ReviewRecordSchema,
  ReviewFactsSchema,
  ReviewArtifactSchema,
  reviewPolicy
} from "../../packages/smart-improvements/src/review-contract.js";
import { reviewPriorities } from "../../packages/smart-improvements/src/review.js";
import { lastCompletedReportPeriod } from "../../packages/smart-reports/src/report-period.js";
import { nextReportSchedule } from "../../packages/smart-reports/src/report-schedule.js";
const id = (n: number) => `93000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const reply = (body: unknown, status = 200): MockResponse => ({
  status,
  body: structuredClone(body)
});
/** Synthetic read/review states only: no DB, provider, email or production pool. */
export function createImprovementReviewMocks(
  data: ReturnType<typeof createDevMockFixtures>,
  signedIn: () => boolean
) {
  let settings = ReviewSettingsSchema.parse({
    version: 0,
    enabled: false,
    scope: [],
    privacy_mode: "restricted",
    source_consent: false,
    next_due_at: null,
    requires_review: false
  });
  const statuses = [
    "ready",
    "factual_only",
    "no_data",
    "no_change",
    "queued",
    "skipped_quota",
    "paused_access",
    "failed"
  ] as const;
  let rows = statuses.map((status, index) => {
    const at = new Date(Date.now() - index * 7 * 86400000).toISOString();
    const period = lastCompletedReportPeriod("weekly", at),
      project = data.projects[index % data.projects.length]!;
    const record = ReviewRecordSchema.parse({
      id: id(index + 1),
      project_id: project["project_id"],
      project_name: project["name"],
      period,
      status,
      reason:
        status === "factual_only"
          ? "model_unavailable"
          : status === "skipped_quota"
            ? "quota"
            : status === "paused_access"
              ? "access_changed"
              : status === "failed"
                ? "processing_failed"
                : null,
      created_at: at,
      expires_at: new Date(Date.now() + 90 * 86400000).toISOString()
    });
    const facts = ReviewFactsSchema.parse({
      version: 1,
      project_id: record.project_id,
      period,
      cutoff_at: at,
      privacy_mode: "restricted",
      sources:
        status === "no_data"
          ? []
          : [
              {
                ref: "e1",
                kind: "improvement",
                origin_project_id: record.project_id,
                source_id: id(100),
                title: "High open improvement",
                context: null,
                status: "open",
                severity: "high",
                count: 12,
                observation:
                  "A synthetic deterministic warning opportunity is open. This count is lifetime observations."
              }
            ],
      analytics: {
        coverage: "partial",
        sessions: status === "no_data" ? null : 120,
        page_views: status === "no_data" ? null : 180
      },
      health: {
        coverage: "unavailable",
        total_checks: 0,
        successful_checks: 0,
        estimated_check_downtime_seconds: 0
      },
      limitations: [
        "Fictional local preview; no provider or production data was used.",
        "Coverage is partial; missing observations are unknown and correlation is not causation.",
        "No repository or UI was inspected and no action was performed."
      ]
    });
    const bundle = ["queued", "paused_access", "failed"].includes(status)
      ? null
      : ReviewArtifactSchema.parse({
          schema_version: "improvement_review.v1",
          facts,
          priorities: reviewPriorities(facts),
          guidance:
            status === "ready"
              ? {
                  version: 1,
                  investigations: [
                    {
                      title: "Sample investigation",
                      hypothesis:
                        "The observed retries may indicate a recoverable boundary failure.",
                      checks: ["Inspect the captured warning and verify the affected workflow."],
                      evidence_refs: ["e1"]
                    }
                  ]
                }
              : null,
          analysis:
            status === "ready"
              ? "available"
              : status === "no_data"
                ? "no_data"
                : status === "no_change"
                  ? "no_change"
                  : "unavailable"
        });
    return { record, bundle };
  });
  return {
    handle(
      method: string,
      path: string,
      query: URLSearchParams,
      payload: unknown
    ): MockResponse | null {
      const match =
        /^\/v1\/organizations\/([^/]+)\/improvements\/reviews(?:\/([^/]+))?(?:\/(bundle|plan))?$/.exec(
          path
        );
      if (!match) return null;
      if (!signedIn()) return reply({ error: "unauthorized" }, 401);
      if (match[1] !== data.session.organization_id)
        return reply({ error: "improvement_review_not_found" }, 404);
      const resource = match[2],
        policy = reviewPolicy(data.session.organization_plan);
      if (resource === "settings") {
        if (method === "GET") return reply({ settings });
        if (method !== "PATCH") return reply({ error: "method_not_allowed" }, 405);
        const parsed = ReviewSettingsCommandSchema.safeParse(payload);
        if (!parsed.success) return reply({ error: "invalid_improvement_review_input" }, 400);
        const command = parsed.data;
        if (
          command.expected_organization_id &&
          command.expected_organization_id !== data.session.organization_id
        )
          return reply({ error: "organization_context_changed" }, 409);
        if (data.session.role !== "owner") return reply({ error: "forbidden" }, 403);
        if (command.expected_version !== settings.version)
          return reply({ error: "report_version_conflict" }, 409);
        if (command.enabled && (!policy.available || command.project_ids.length > policy.projects))
          return reply({ error: "upgrade_required" }, 403);
        if (
          command.project_ids.some(
            (value) => !data.projects.some((project) => project["project_id"] === value)
          )
        )
          return reply({ error: "forbidden" }, 403);
        const removed = settings.scope
          .filter((view) => !command.project_ids.includes(view.project_id))
          .map((view) => view.project_id);
        rows = rows.filter(
          (row) =>
            command.source_consent &&
            !removed.includes(row.record.project_id) &&
            !(command.privacy_mode === "restricted" && row.bundle?.facts.privacy_mode === "full")
        );
        settings = ReviewSettingsSchema.parse({
          version: settings.version + 1,
          enabled: command.enabled,
          scope: command.project_ids.map((project_id) => ({
            project_id,
            origin_project_ids: [project_id]
          })),
          privacy_mode: command.privacy_mode,
          source_consent: command.source_consent,
          requires_review: false,
          next_due_at: command.enabled
            ? nextReportSchedule({
                cadence: "weekly",
                schedule: { time: "09:00", timezone: "UTC" },
                after: new Date().toISOString()
              }).due_at
            : null
        });
        return reply({ settings });
      }
      if (resource === "allowance") {
        const now = new Date(),
          start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
          end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
        return reply({
          allowance: {
            limit: policy.generations,
            used: 0,
            remaining: policy.generations,
            starts_at: start.toISOString(),
            ends_at: end.toISOString()
          }
        });
      }
      if (method !== "GET") return reply({ error: "method_not_allowed" }, 405);
      if (!resource) {
        const limit = z.coerce
          .number()
          .int()
          .min(1)
          .max(50)
          .safeParse(query.get("limit") ?? 20);
        if (!limit.success) return reply({ error: "invalid_improvement_review_input" }, 400);
        const selected = rows.filter(
          (row) => !query.get("project_id") || row.record.project_id === query.get("project_id")
        );
        const offset = Number(query.get("cursor") ?? 0);
        if (!Number.isSafeInteger(offset) || offset < 0)
          return reply({ error: "invalid_improvement_review_input" }, 400);
        return reply({
          reviews: selected.slice(offset, offset + limit.data).map((row) => row.record),
          next_cursor: offset + limit.data < selected.length ? String(offset + limit.data) : null
        });
      }
      const row = rows.find((item) => item.record.id === resource);
      if (!row) return reply({ error: "improvement_review_not_found" }, 404);
      if (match[3]) {
        if (match[3] === "plan" && row.bundle && row.record.status === "ready") {
          const facts = structuredClone(row.bundle.facts);
          if (facts.sources[0]) {
            facts.sources[0].severity = "low";
            facts.sources[0].title = "Repeated warning needs review";
          }
          const context = ReviewContextSchema.parse({
            version: 1,
            signals: facts.sources.map((s) => ({
              source_ref: s.ref,
              detector: "warning_hotspot",
              first_observed_at: null,
              last_observed_at: facts.cutoff_at,
              confidence: 0.8,
              measurements: [],
              related_refs: []
            })),
            configuration: {
              coverage: "partial",
              origins: [],
              rules: [],
              alerts: [],
              active_probes: null,
              sdk_local: "not_observed"
            }
          });
          return reply({
            bundle: ReviewPlanDocumentSchema.parse({
              schema_version: "improvement_review.v1",
              facts,
              context,
              plans: planReview(facts, context),
              priorities: [],
              guidance: null,
              analysis: "unavailable"
            }),
            status: "factual_only"
          });
        }
      }
      return reply(
        match[3]
          ? {
              bundle:
                row.bundle && match[3] === "plan"
                  ? ReviewPlanDocumentSchema.parse({ ...row.bundle, context: null, plans: [] })
                  : row.bundle,
              status: row.record.status
            }
          : { review: row.record }
      );
    }
  };
}
