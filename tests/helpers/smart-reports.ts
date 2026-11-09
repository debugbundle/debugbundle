import type { ReportAllowance } from "../../packages/smart-reports/src/report-allowance.js";
import type { ReportDefinitionRecord } from "../../packages/smart-reports/src/report-definition.js";
import type { ReportRunRecord } from "../../packages/smart-reports/src/report-run.js";
import type { ReportEmailDelivery } from "../../packages/smart-reports/src/report-email.js";
export function reportEmailDeliveryFixture(): ReportEmailDelivery {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    run_id: reportRequest,
    recipient_user_id: reportProject,
    status: "uncertain",
    reason: "provider_uncertain",
    created_at: "2026-11-07T00:00:00.000Z",
    updated_at: "2026-11-07T00:00:00.000Z",
    accepted_at: null
  };
}
export const reportOrg = "11111111-1111-4111-8111-111111111111";
export const reportProject = "22222222-2222-4222-8222-222222222222";
export const reportId = "33333333-3333-4333-8333-333333333333";
export const reportRequest = "44444444-4444-4444-8444-444444444444";
export function reportRunFixture(): ReportRunRecord {
  return {
    id: reportRequest,
    organization_id: reportOrg,
    definition_id: reportId,
    definition_version: 1,
    name: "Monthly review",
    scope: [{ project_id: reportProject, origin_project_ids: [reportProject] }],
    recipient_user_ids: [],
    privacy_mode: "full",
    period: {
      kind: "monthly",
      starts_at: "2026-10-01T00:00:00.000Z",
      ends_at: "2026-11-01T00:00:00.000Z",
      duration_days: 31
    },
    kind: "manual",
    status: "queued",
    skip_reason: null,
    ai_status: "pending",
    generation_counted: true,
    send_email: false,
    created_at: "2026-11-07T00:00:00.000Z",
    updated_at: "2026-11-07T00:00:00.000Z",
    published_at: null,
    expires_at: null
  };
}
export function reportDefinitionFixture(): ReportDefinitionRecord {
  return {
    id: reportId,
    organization_id: reportOrg,
    created_by_user_id: reportProject,
    name: "Monthly review",
    cadence: "monthly",
    scope: [{ project_id: reportProject, origin_project_ids: [reportProject] }],
    recipient_user_ids: [],
    privacy_mode: "full",
    source_collection_consent: true,
    schedule: null,
    enabled: false,
    version: 1,
    next_due_at: null,
    next_period_ends_at: null,
    requires_owner_review: false,
    pause_reason: null,
    paused_at: null,
    weekly_overlap: null,
    created_at: "2026-11-07T00:00:00.000Z",
    updated_at: "2026-11-07T00:00:00.000Z"
  };
}
export function reportDefinitionInput() {
  return {
    name: "Monthly review",
    cadence: "monthly" as const,
    project_ids: [reportProject],
    source_collection_consent: true
  };
}

export function reportAllowanceFixture(): ReportAllowance {
  return {
    organization_id: reportOrg,
    as_of: "2026-11-07T12:00:00.000Z",
    window: { starts_at: "2026-11-01T00:00:00.000Z", ends_at: "2026-12-01T00:00:00.000Z" },
    limit: 40,
    used: 7,
    remaining: 33,
    scheduled_remaining: 90,
    scope_complete: true,
    schedule_exceeds_remaining: true
  };
}
