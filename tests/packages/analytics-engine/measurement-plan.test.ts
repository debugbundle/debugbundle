import { expect, it } from "vitest";
import {
  reportCatalogMeaningChanged,
  validateAnalyticsMeasurementPlan,
  validateSpaceCatalogSnapshot
} from "../../../packages/analytics-engine/src/index.js";
import { AnalyticsMeasurementPlanSchema } from "../../../packages/shared-types/src/index.js";

const scope = { kind: "project", project_id: "11111111-1111-4111-8111-111111111111" };
const plan = {
  scope,
  expected_revision: 0,
  idempotency_key: "22222222-2222-4222-8222-222222222222",
  enforcement: "strict",
  catalog: [
    {
      name: "account.created",
      revision: 1,
      description: "Successful account commit",
      producers: ["server"],
      purpose: "business_measurement",
      success_boundary: "committed",
      properties: {
        method: { type: "enum", values: ["email", "sso"], required: true },
        invited: { type: "boolean", required: false }
      },
      measurements: {},
      expected_producers: []
    }
  ],
  reports: [
    {
      key: "signup",
      revision: 1,
      display_name: "Signup",
      scope,
      subject: "user",
      timezone: "UTC",
      kind: "goal",
      predicate: {
        all: [
          { field: "event_name", operator: "in", values: ["account.created"] },
          { field: "property", key: "method", operator: "in", values: ["email"] }
        ]
      },
      denominator: null,
      breakdown: { field: "property", key: "invited" }
    }
  ]
};

it("validates catalog-backed typed definitions without changing the requested plan", () => {
  const original = structuredClone(plan);
  expect(validateAnalyticsMeasurementPlan(plan)).toEqual({ valid: true, plan });
  expect(plan).toEqual(original);
});

it("fences reused report revisions only when their possible catalog meaning changes", () => {
  const parsed = AnalyticsMeasurementPlanSchema.parse(plan);
  const report = parsed.reports[0]!;
  const previous = parsed.catalog;
  const metadataOnly = structuredClone(previous);
  metadataOnly[0]!.revision = 2;
  metadataOnly[0]!.description = "Updated explanation";
  expect(reportCatalogMeaningChanged(report, previous, metadataOnly)).toBe(false);

  const unrelated = [...previous, { ...previous[0]!, name: "billing.completed" }];
  expect(reportCatalogMeaningChanged(report, previous, unrelated)).toBe(false);

  const changed = structuredClone(previous);
  changed[0]!.properties = { tier: { type: "boolean", required: false } };
  expect(reportCatalogMeaningChanged(report, previous, changed)).toBe(true);

  const broad = {
    ...report,
    predicate: { field: "producer" as const, operator: "in" as const, values: ["server" as const] }
  };
  if (broad.kind !== "goal") throw new Error("expected goal fixture");
  expect(reportCatalogMeaningChanged(broad, previous, unrelated)).toBe(true);
});

it("rejects missing catalog events, properties, and values with bounded non-payload issues", () => {
  for (const [predicate, code] of [
    [{ field: "event_name", operator: "in", values: ["unknown"] }, "unknown_event"],
    [{ field: "property", key: "other", operator: "in", values: ["email"] }, "unknown_property"],
    [
      { field: "property", key: "method", operator: "in", values: ["sms"] },
      "invalid_property_value"
    ],
    [
      { field: "property", key: "method", operator: "in", values: [null] },
      "invalid_property_value"
    ],
    [
      { field: "property", key: "invited", operator: "in", values: ["true"] },
      "invalid_property_value"
    ],
    [{ field: "producer", operator: "in", values: ["browser"] }, "unavailable_producer"]
  ] as const) {
    expect(
      validateAnalyticsMeasurementPlan({ ...plan, reports: [{ ...plan.reports[0], predicate }] })
    ).toEqual({ valid: false, issues: [{ code, report_index: 0 }] });
  }
});

it("checks nested alternatives and denominator predicates, preserving null and boolean semantics", () => {
  const report = {
    ...plan.reports[0],
    predicate: {
      any: [
        { field: "property", key: "invited", operator: "in", values: [true, false, null] },
        { field: "event_kind", operator: "in", values: ["semantic"] }
      ]
    }
  };
  expect(validateAnalyticsMeasurementPlan({ ...plan, reports: [report] }).valid).toBe(true);
  expect(
    validateAnalyticsMeasurementPlan({
      ...plan,
      reports: [
        { ...report, denominator: { field: "event_name", operator: "in", values: ["missing"] } }
      ]
    })
  ).toEqual({ valid: false, issues: [{ code: "unknown_event", report_index: 0 }] });
});

it("validates every funnel step, retention predicate and declared breakdown", () => {
  const base = {
    key: "flow",
    revision: 1,
    display_name: "Flow",
    scope,
    subject: "user",
    timezone: "UTC"
  };
  const known = { field: "event_name", operator: "in", values: ["account.created"] };
  const missing = { field: "event_name", operator: "in", values: ["missing"] };
  const funnel = {
    ...base,
    kind: "ordered_funnel",
    conversion_window_seconds: 60,
    breakdown: null,
    steps: [
      { key: "entry", predicate: known },
      { key: "success", predicate: missing }
    ]
  };
  const retention = {
    ...base,
    kind: "retention",
    entry: known,
    return: missing,
    mode: "exact_period",
    period: "day",
    offsets: [1, 7]
  };
  for (const report of [funnel, retention])
    expect(validateAnalyticsMeasurementPlan({ ...plan, reports: [report] })).toEqual({
      valid: false,
      issues: [{ code: "unknown_event", report_index: 0 }]
    });
  expect(
    validateAnalyticsMeasurementPlan({
      ...plan,
      reports: [{ ...plan.reports[0], breakdown: { field: "property", key: "missing" } }]
    })
  ).toEqual({ valid: false, issues: [{ code: "unknown_breakdown", report_index: 0 }] });
});

it("rejects predicates that no single declared event can satisfy", () => {
  const second = {
    ...structuredClone(plan.catalog[0]!),
    name: "billing.reviewed",
    properties: { channel: { type: "enum", values: ["web"], required: true } }
  };
  const report = plan.reports[0]!;
  const impossible = {
    all: [
      { field: "event_name", operator: "in", values: ["account.created"] },
      { field: "property", key: "channel", operator: "in", values: ["web"] }
    ]
  };
  expect(
    validateAnalyticsMeasurementPlan({
      ...plan,
      catalog: [...plan.catalog, second],
      reports: [{ ...report, predicate: impossible }]
    })
  ).toEqual({ valid: false, issues: [{ code: "impossible_predicate", report_index: 0 }] });
  expect(
    validateAnalyticsMeasurementPlan({
      ...plan,
      catalog: [...plan.catalog, second],
      reports: [
        {
          ...report,
          predicate: {
            any: [impossible, { field: "event_name", operator: "in", values: ["billing.reviewed"] }]
          }
        }
      ]
    }).valid
  ).toBe(true);
});

it("rejects contradictory values of the same property in one conjunction", () => {
  expect(
    validateAnalyticsMeasurementPlan({
      ...plan,
      reports: [
        {
          ...plan.reports[0],
          predicate: {
            all: [
              { field: "property", key: "method", operator: "in", values: ["email"] },
              { field: "property", key: "method", operator: "in", values: ["sso"] }
            ]
          }
        }
      ]
    })
  ).toEqual({ valid: false, issues: [{ code: "impossible_predicate", report_index: 0 }] });
});

it("rejects an event kind that its only producer cannot emit", () => {
  expect(
    validateAnalyticsMeasurementPlan({
      ...plan,
      reports: [
        {
          ...plan.reports[0],
          predicate: { field: "event_kind", operator: "in", values: ["page_view"] }
        }
      ]
    })
  ).toEqual({ valid: false, issues: [{ code: "impossible_predicate", report_index: 0 }] });
});

it("does not add an impossible-predicate issue to a missing reference", () => {
  expect(
    validateAnalyticsMeasurementPlan({
      ...plan,
      reports: [
        {
          ...plan.reports[0],
          predicate: { field: "event_name", operator: "in", values: ["missing"] },
          denominator: { field: "event_name", operator: "in", values: ["also_missing"] }
        }
      ]
    })
  ).toEqual({ valid: false, issues: [{ code: "unknown_event", report_index: 0 }] });
});

it("rejects recognized credentials in definition metadata before retention or diagnostic echo", () => {
  const unsafe = {
    ...plan,
    catalog: [{ ...plan.catalog[0], description: "dbundle_anl_SYNTHETIC_ANALYTICS_CREDENTIAL" }]
  };
  expect(validateAnalyticsMeasurementPlan(unsafe)).toEqual({
    valid: false,
    issues: [{ code: "unsafe_metadata", report_index: null }]
  });
});

it("returns fixed structural failures and keeps issue growth bounded", () => {
  expect(validateAnalyticsMeasurementPlan({ ...plan, scope: {} })).toEqual({
    valid: false,
    issues: [{ code: "invalid_schema", report_index: null }]
  });
  const invalidReport = {
    ...plan.reports[0],
    predicate: { field: "event_name", operator: "in", values: ["missing"] }
  };
  const reports = Array.from({ length: 100 }, (_, index) => ({
    ...invalidReport,
    key: `report_${index}`
  }));
  const result = validateAnalyticsMeasurementPlan({ ...plan, reports });
  expect(result.valid).toBe(false);
  if (!result.valid) expect(result.issues).toHaveLength(100);
});

it("merges a connected-space catalog only from complete source revisions with matching semantics", () => {
  const sourceA = "33333333-3333-4333-8333-333333333333";
  const sourceB = "44444444-4444-4444-8444-444444444444";
  const spaceScope = { kind: "space", space_id: "55555555-5555-4555-8555-555555555555" };
  const catalog = plan.catalog[0]!;
  const spacePlan = {
    ...plan,
    scope: spaceScope,
    catalog: [{ ...catalog, revision: 3, description: "Shared account commit" }],
    reports: [{ ...plan.reports[0], scope: spaceScope }]
  };
  const sources = [
    { project_id: sourceA, catalog_revision: 5, entries: [catalog] },
    {
      project_id: sourceB,
      catalog_revision: 8,
      entries: [
        {
          ...structuredClone(catalog),
          revision: 2,
          description: "Second source",
          producers: ["server"]
        }
      ]
    }
  ];
  const snapshot = {
    plan: spacePlan,
    expected_project_ids: [sourceA, sourceB],
    sources
  };
  expect(validateSpaceCatalogSnapshot(snapshot)).toEqual({
    valid: true,
    source_catalog_revisions: [
      { project_id: sourceA, catalog_revision: 5 },
      { project_id: sourceB, catalog_revision: 8 }
    ],
    coverage: [
      {
        name: "account.created",
        project_ids: [sourceA, sourceB],
        source_entry_revisions: [
          { project_id: sourceA, entry_revision: 1 },
          { project_id: sourceB, entry_revision: 2 }
        ]
      }
    ]
  });
  expect(snapshot.sources[1]?.entries[0]?.description).toBe("Second source");

  const changed = structuredClone(snapshot);
  changed.sources[1]!.entries[0]!.properties.method.values = ["oauth"];
  expect(validateSpaceCatalogSnapshot(changed)).toEqual({
    valid: false,
    reason: "catalog_semantic_conflict"
  });
});

it("rejects omitted, duplicate or extra space sources and records only declared coverage", () => {
  const sourceA = "33333333-3333-4333-8333-333333333333";
  const sourceB = "44444444-4444-4444-8444-444444444444";
  const spaceScope = { kind: "space", space_id: "55555555-5555-4555-8555-555555555555" };
  const spacePlan = {
    ...plan,
    scope: spaceScope,
    reports: [{ ...plan.reports[0], scope: spaceScope, subject: "user" }]
  };
  const source = { project_id: sourceA, catalog_revision: 2, entries: plan.catalog };
  const input = { plan: spacePlan, expected_project_ids: [sourceA, sourceB], sources: [source] };
  expect(validateSpaceCatalogSnapshot(input)).toEqual({
    valid: false,
    reason: "incomplete_sources"
  });
  expect(validateSpaceCatalogSnapshot({ ...input, sources: [source, source] })).toEqual({
    valid: false,
    reason: "invalid_snapshot"
  });
  expect(
    validateSpaceCatalogSnapshot({
      ...input,
      sources: [source, { project_id: sourceB, catalog_revision: 7, entries: [] }]
    })
  ).toEqual({
    valid: true,
    source_catalog_revisions: [
      { project_id: sourceA, catalog_revision: 2 },
      { project_id: sourceB, catalog_revision: 7 }
    ],
    coverage: [
      {
        name: "account.created",
        project_ids: [sourceA],
        source_entry_revisions: [{ project_id: sourceA, entry_revision: 1 }]
      }
    ]
  });
  expect(
    validateSpaceCatalogSnapshot({
      ...input,
      sources: [
        { ...source, entries: [] },
        { project_id: sourceB, catalog_revision: 7, entries: [] }
      ]
    })
  ).toEqual({ valid: false, reason: "catalog_entry_unavailable" });
});
