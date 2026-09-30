import type { AnalyticsMeasurementPlan } from "../../packages/shared-types/src/index.js";
import type {
  AnalyticsProjectMeasurementPlanPreview,
  AnalyticsProjectMeasurementPlanRecord
} from "../../packages/storage/src/analytics-measurement-plan-store.js";

export function analyticsProjectPlanFixture(projectId: string): AnalyticsMeasurementPlan {
  return {
    scope: { kind: "project", project_id: projectId },
    expected_revision: 0,
    idempotency_key: "55555555-5555-4555-8555-555555555555",
    enforcement: "strict",
    catalog: [
      {
        name: "signup.completed",
        revision: 1,
        description: "Confirmed signup",
        producers: ["server"],
        purpose: "business_measurement",
        success_boundary: "committed",
        properties: {},
        measurements: {},
        expected_producers: []
      }
    ],
    reports: [
      {
        kind: "goal",
        key: "signup_goal",
        revision: 1,
        display_name: "Signups",
        scope: { kind: "project", project_id: projectId },
        subject: "user",
        timezone: "UTC",
        predicate: { field: "event_name", operator: "in", values: ["signup.completed"] },
        denominator: null,
        breakdown: null
      }
    ]
  };
}

export function analyticsSpacePlanFixture(spaceId: string): AnalyticsMeasurementPlan {
  const base = analyticsProjectPlanFixture("11111111-1111-4111-8111-111111111111");
  const scope = { kind: "space" as const, space_id: spaceId };
  return {
    ...base,
    scope,
    reports: base.reports.map((report) => ({ ...report, scope }))
  };
}

export function analyticsProjectPlanPreviewFixture(
  projectId: string
): AnalyticsProjectMeasurementPlanPreview {
  return {
    project_id: projectId,
    preview_hash: "a".repeat(64),
    expected_revision: 0,
    resulting_revision: 1,
    catalog_revision: 1,
    business_measurement_enabled_after: false,
    capacity_limit: 10,
    legacy_saved_funnels: 0,
    report_slots_after: 1,
    added_reports: ["signup_goal"],
    removed_reports: [],
    changed_reports: [],
    already_applied: false
  };
}

export function analyticsProjectPlanRecordFixture(
  projectId: string
): AnalyticsProjectMeasurementPlanRecord {
  const plan = analyticsProjectPlanFixture(projectId);
  return {
    project_id: projectId,
    revision: 1,
    catalog_revision: 1,
    business_measurement_enabled: false,
    catalog: plan.catalog,
    reports: [{ definition: plan.reports[0]!, available_from: "2026-09-28T00:00:00.000Z" }]
  };
}
