import { expect, it } from "vitest";
import {
  reportPolicy,
  requireReportPolicy
} from "../../../packages/smart-reports/src/report-policy.js";
import { AcceptedReportScopeSchema } from "../../../packages/smart-reports/src/report-definition.js";
import {
  CreateReportDefinitionSchema,
  ReplaceReportDefinitionSchema
} from "../../../packages/smart-reports/src/report-definition.js";
const id = "11111111-1111-4111-8111-111111111111";
it("keeps factual report cadences, selections and allowances bounded by the approved plan", () => {
  expect(reportPolicy("free").available).toBe(false);
  expect(reportPolicy("solo")).toMatchObject({
    ai: false,
    cadences: ["monthly"],
    monthly_smart_report_generations: 2,
    max_smart_report_definitions: 1,
    max_smart_report_projects: 3,
    max_smart_report_recipients: 1
  });
  expect(reportPolicy("team")).toMatchObject({
    ai: false,
    cadences: ["weekly", "monthly"],
    monthly_smart_report_generations: 8,
    max_smart_report_definitions: 2,
    max_smart_report_projects: 5,
    max_smart_report_recipients: 5
  });
  expect(reportPolicy("business")).toMatchObject({
    ai: true,
    cadences: ["daily", "weekly", "monthly"],
    monthly_smart_report_generations: 40
  });
  expect(() =>
    requireReportPolicy("solo", { cadence: "weekly", projects: 1, recipients: 0 })
  ).toThrow("upgrade_required");
  expect(() =>
    requireReportPolicy("team", { cadence: "monthly", projects: 6, recipients: 0 })
  ).toThrow("upgrade_required");
  expect(() =>
    requireReportPolicy("team", { cadence: "weekly", projects: 1, recipients: 1, mode: "ai" })
  ).toThrow("upgrade_required");
  expect(() =>
    requireReportPolicy("team", { cadence: "weekly", projects: 5, recipients: 5, mode: "factual" })
  ).not.toThrow();
});
const request = {
  name: "Monthly engineering review",
  cadence: "monthly",
  project_ids: [id],
  recipient_user_ids: [],
  schedule: { time: "09:00", timezone: "Europe/Ljubljana" },
  enabled: true,
  source_collection_consent: true
};
it("defaults to full redacted evidence only with explicit source collection consent", () => {
  expect(CreateReportDefinitionSchema.parse(request)).toMatchObject({
    privacy_mode: "full",
    source_collection_consent: true
  });
  expect(() =>
    CreateReportDefinitionSchema.parse({ ...request, source_collection_consent: false })
  ).toThrow();
  expect(
    CreateReportDefinitionSchema.parse({
      ...request,
      privacy_mode: "restricted",
      source_collection_consent: false
    })
  ).toMatchObject({ privacy_mode: "restricted" });
});
it("bounds explicitly selected projects and verified-user recipient identities without accepting actor or origin claims", () => {
  expect(() => CreateReportDefinitionSchema.parse({ ...request, project_ids: [] })).toThrow();
  expect(() => CreateReportDefinitionSchema.parse({ ...request, project_ids: [id, id] })).toThrow();
  expect(() =>
    CreateReportDefinitionSchema.parse({ ...request, recipient_user_ids: [id, id] })
  ).toThrow();
  expect(() =>
    CreateReportDefinitionSchema.parse({ ...request, recipient_emails: ["external@example.test"] })
  ).toThrow();
  expect(() =>
    CreateReportDefinitionSchema.parse({ ...request, created_by_user_id: id })
  ).toThrow();
  expect(() =>
    CreateReportDefinitionSchema.parse({ ...request, scope_origin_ids: [id] })
  ).toThrow();
  expect(() =>
    CreateReportDefinitionSchema.parse({
      ...request,
      project_ids: Array.from(
        { length: 11 },
        (_, i) => `${String(i + 1).padStart(8, "0")}-1111-4111-8111-111111111111`
      )
    })
  ).toThrow();
});
it("uses the existing IANA schedule contract and permits a disabled manual definition", () => {
  expect(() =>
    CreateReportDefinitionSchema.parse({ ...request, schedule: { time: "25:00", timezone: "UTC" } })
  ).toThrow();
  expect(() =>
    CreateReportDefinitionSchema.parse({
      ...request,
      schedule: { time: "09:00", timezone: "invented/timezone" }
    })
  ).toThrow();
  expect(() => CreateReportDefinitionSchema.parse({ ...request, schedule: null })).toThrow();
  expect(
    CreateReportDefinitionSchema.parse({ ...request, schedule: null, enabled: false })
  ).toMatchObject({ enabled: false });
});
it("requires a saved version for replacement and never interprets an overlap choice as consent to disable legacy digests", () => {
  expect(() => ReplaceReportDefinitionSchema.parse(request)).toThrow();
  expect(
    ReplaceReportDefinitionSchema.parse({
      ...request,
      expected_version: 1,
      weekly_overlap: "keep_existing"
    })
  ).toMatchObject({ expected_version: 1 });
  expect(() =>
    CreateReportDefinitionSchema.parse({ ...request, weekly_overlap: "disable_legacy" })
  ).toThrow();
});

it("rejects overlapping accepted project views instead of counting the same origin twice", () => {
  expect(() =>
    AcceptedReportScopeSchema.parse([
      { project_id: id, origin_project_ids: [id] },
      { project_id: "22222222-2222-4222-8222-222222222222", origin_project_ids: [id] }
    ])
  ).toThrow();
});
