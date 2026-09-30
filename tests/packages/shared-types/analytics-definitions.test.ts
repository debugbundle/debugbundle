import { describe, expect, it } from "vitest";
import {
  AnalyticsCatalogEntrySchema,
  AnalyticsMeasurementPlanSchema,
  AnalyticsOrderedFunnelDefinitionSchema,
  AnalyticsPredicateSchema,
  AnalyticsProjectPlanProducerObservationSchema,
  AnalyticsRetentionDefinitionSchema,
  AnalyticsSpaceMutationSchema
} from "../../../packages/shared-types/src/index.js";

const scope = { kind: "project", project_id: "11111111-1111-4111-8111-111111111111" };
const predicate = { field: "event_name", operator: "in", values: ["account.created"] };
const entry = {
  name: "account.created",
  revision: 1,
  description: "Account committed successfully",
  producers: ["server"],
  purpose: "business_measurement",
  success_boundary: "committed",
  properties: { plan: { type: "enum", values: ["free", "pro"], required: true } },
  measurements: { duration: { unit: "ms", required: false } },
  expected_producers: [{ sdk_name: "sdk-node", minimum_version: "3.1.0" }]
};
const funnel = {
  kind: "ordered_funnel",
  key: "activation",
  display_name: "Activation",
  revision: 1,
  scope,
  subject: "user",
  timezone: "Europe/Ljubljana",
  conversion_window_seconds: 604800,
  breakdown: null,
  steps: [
    { key: "created", predicate },
    { key: "activated", predicate: { ...predicate, values: ["project.activated"] } }
  ]
};
const retention = {
  kind: "retention",
  key: "product_retention",
  display_name: "Product retention",
  revision: 1,
  scope,
  subject: "user",
  timezone: "UTC",
  entry: predicate,
  return: predicate,
  mode: "exact_period",
  period: "day",
  offsets: [1, 7, 30]
};

describe("semantic measurement definitions", () => {
  it("round trips bounded submitted SDK version observations without raw evidence", () => {
    const observed = {
      event_name: "account.created",
      event_revision: 1,
      producer_kind: "server",
      sdk_name: "@debugbundle/sdk-node",
      sdk_version: "3.1.0",
      observed_count: "2",
      first_observed_on: "2026-09-29",
      last_observed_on: "2026-09-30"
    };
    const parsed = AnalyticsProjectPlanProducerObservationSchema.parse(observed);
    expect(
      AnalyticsProjectPlanProducerObservationSchema.parse(JSON.parse(JSON.stringify(parsed)))
    ).toEqual(observed);
    expect(
      AnalyticsProjectPlanProducerObservationSchema.safeParse({ ...observed, sdk_name: undefined })
        .success
    ).toBe(false);
    expect(
      AnalyticsProjectPlanProducerObservationSchema.safeParse({ ...observed, sdk_version: 31 })
        .success
    ).toBe(false);
    expect(
      AnalyticsProjectPlanProducerObservationSchema.safeParse({ ...observed, raw_example: "x" })
        .success
    ).toBe(false);
  });
  it("round trips closed catalog definitions with required field policies", () => {
    expect(AnalyticsCatalogEntrySchema.parse(entry)).toEqual(entry);
    expect(
      AnalyticsCatalogEntrySchema.safeParse({ ...entry, observed_values: ["raw"] }).success
    ).toBe(false);
    expect(
      AnalyticsCatalogEntrySchema.safeParse({
        ...entry,
        expected_producers: [{ sdk_name: "@debugbundle/sdk-node", minimum_version: "3.1.0" }]
      }).success
    ).toBe(true);
  });
  it.each([
    { producers: ["browser"], purpose: "business_measurement" },
    { producers: ["server", "server"] },
    { properties: { email: { type: "enum", values: ["private"], required: true } } },
    { properties: { plan: { type: "enum", values: ["free", "free"], required: true } } },
    { measurements: { duration: { unit: "", required: true } } },
    { expected_producers: [{ sdk_name: "sdk-node", minimum_version: "latest" }] },
    {
      properties: Object.fromEntries(
        Array.from({ length: 21 }, (_, i) => [`key${i}`, { type: "boolean", required: false }])
      )
    }
  ])("rejects invalid catalog policy %j", (changes) => {
    expect(AnalyticsCatalogEntrySchema.safeParse({ ...entry, ...changes }).success).toBe(false);
  });
  it("bounds group depth, total clauses and enum members without executable predicates", () => {
    const group = (child: unknown) => ({ all: [child] });
    expect(AnalyticsPredicateSchema.safeParse(group(group(group(predicate)))).success).toBe(true);
    expect(AnalyticsPredicateSchema.safeParse(group(group(group(group(predicate))))).success).toBe(
      false
    );
    expect(AnalyticsPredicateSchema.safeParse({ any: Array(16).fill(predicate) }).success).toBe(
      true
    );
    expect(
      AnalyticsPredicateSchema.safeParse({
        any: [{ all: Array(9).fill(predicate) }, { all: Array(8).fill(predicate) }]
      }).success
    ).toBe(false);
    expect(
      AnalyticsPredicateSchema.safeParse({
        ...predicate,
        values: Array.from({ length: 33 }, (_, i) => `event${i}`)
      }).success
    ).toBe(false);
    expect(
      AnalyticsPredicateSchema.safeParse({
        field: "property",
        key: "plan",
        operator: "in",
        values: ["free", true, null]
      }).success
    ).toBe(true);
    expect(
      AnalyticsPredicateSchema.safeParse({
        field: "property",
        key: "email",
        operator: "in",
        values: ["test"]
      }).success
    ).toBe(false);
    expect(
      AnalyticsPredicateSchema.safeParse({ ...predicate, operator: "regex", expression: ".*" })
        .success
    ).toBe(false);
  });
  it("requires a bounded cohort definition and valid timezone", () => {
    expect(AnalyticsOrderedFunnelDefinitionSchema.parse(funnel)).toEqual(funnel);
    for (const changes of [
      { conversion_window_seconds: 2592001 },
      { conversion_window_seconds: 0 },
      { steps: [funnel.steps[0]] },
      { steps: [funnel.steps[0], funnel.steps[0]] },
      { timezone: "not/a_timezone" },
      { scope: { kind: "space", space_id: scope.project_id }, subject: "session" },
      { breakdown: { field: "property", key: "user_id" } },
      { sample_rate: 0.5 }
    ])
      expect(
        AnalyticsOrderedFunnelDefinitionSchema.safeParse({ ...funnel, ...changes }).success
      ).toBe(false);
  });
  it("requires ordered retention offsets within the detailed horizon", () => {
    expect(AnalyticsRetentionDefinitionSchema.parse(retention)).toEqual(retention);
    for (const changes of [
      { offsets: [7, 1] },
      { offsets: [1, 1] },
      { offsets: [91] },
      { offsets: [0] },
      { period: "week", offsets: [13] },
      { period: "month", offsets: [3] },
      { mode: "ever" }
    ])
      expect(
        AnalyticsRetentionDefinitionSchema.safeParse({ ...retention, ...changes }).success
      ).toBe(false);
    expect(
      AnalyticsRetentionDefinitionSchema.safeParse({
        ...retention,
        period: "month",
        offsets: [1, 2]
      }).success
    ).toBe(true);
  });
  it("requires one canonical producer and unique named definitions in a plan", () => {
    const plan = {
      scope,
      expected_revision: 0,
      idempotency_key: scope.project_id,
      catalog: [entry],
      reports: [funnel, retention],
      enforcement: "strict"
    };
    expect(AnalyticsMeasurementPlanSchema.parse(plan)).toEqual(plan);
    expect(
      AnalyticsMeasurementPlanSchema.safeParse({
        ...plan,
        business_measurement_enabled: true
      }).success
    ).toBe(true);
    expect(
      AnalyticsMeasurementPlanSchema.safeParse({
        ...plan,
        scope: { kind: "space", space_id: scope.project_id },
        reports: [],
        business_measurement_enabled: true
      }).success
    ).toBe(false);
    expect(
      AnalyticsMeasurementPlanSchema.safeParse({ ...plan, catalog: [entry, entry] }).success
    ).toBe(false);
    expect(
      AnalyticsMeasurementPlanSchema.safeParse({ ...plan, reports: [funnel, funnel] }).success
    ).toBe(false);
    expect(
      AnalyticsMeasurementPlanSchema.safeParse({
        ...plan,
        reports: [{ ...funnel, scope: { kind: "space", space_id: scope.project_id } }]
      }).success
    ).toBe(false);
  });
  it("requires revision-aware explicit same-org membership sets", () => {
    const mutation = {
      organization_id: scope.project_id,
      display_name: "Product growth",
      expected_revision: 0,
      idempotency_key: scope.project_id,
      project_ids: [scope.project_id],
      mode: "portfolio"
    };
    expect(AnalyticsSpaceMutationSchema.parse(mutation)).toEqual(mutation);
    expect(AnalyticsSpaceMutationSchema.safeParse({ ...mutation, project_ids: [] }).success).toBe(
      false
    );
    expect(
      AnalyticsSpaceMutationSchema.safeParse({
        ...mutation,
        project_ids: [scope.project_id, scope.project_id]
      }).success
    ).toBe(false);
    expect(
      AnalyticsSpaceMutationSchema.safeParse({ ...mutation, expected_revision: -1 }).success
    ).toBe(false);
    expect(AnalyticsSpaceMutationSchema.safeParse({ ...mutation, trusted: true }).success).toBe(
      false
    );
  });
});
