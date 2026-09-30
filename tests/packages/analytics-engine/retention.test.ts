import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
  evaluateRetention,
  type RetentionFact,
  type RetentionQuery
} from "../../../packages/analytics-engine/src/index.js";

const project = "11111111-1111-4111-8111-111111111111";
const scope = { kind: "project" as const, project_id: project };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const day = (value: number) => new Date(Date.UTC(2026, 8, value)).toISOString();
const query: RetentionQuery = {
  definition: {
    key: "returning",
    revision: 1,
    display_name: "Returning users",
    kind: "retention",
    scope,
    subject: "user",
    timezone: "UTC",
    mode: "exact_period",
    period: "day",
    offsets: [1, 7, 30],
    entry: { field: "event_name", operator: "in", values: ["account.created"] },
    return: { field: "event_name", operator: "in", values: ["work.completed"] }
  },
  scope_revision: 1,
  from: day(1),
  to: day(3),
  observation_cutoff: day(10),
  watermark: day(12),
  available_from: day(1),
  definition_effective_from: day(1),
  incomplete: false,
  sample_rate: 1,
  calendar_version: process.versions["tz"]!
};
const fact = (
  id: number,
  subject: string,
  at: string,
  entry: boolean,
  returned: boolean,
  changes: Partial<RetentionFact> = {}
): RetentionFact => ({
  scope,
  scope_revision: 1,
  definition_key: "returning",
  definition_revision: 1,
  subject: "user",
  origin_project_id: project,
  event_id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
  content_hash: hash(String(id)),
  subject_key: hash(subject),
  occurred_at: at,
  received_at: at,
  entry,
  returned,
  ...changes
});
const calculate = (facts: RetentionFact[], changes: Partial<RetentionQuery> = {}) => {
  const result = evaluateRetention({ ...query, ...changes }, facts);
  expect(result.status).toBe("available");
  if (result.status !== "available") throw new Error(result.reason);
  return result;
};

it("uses first observed entry and matched mature denominators for exact D1/D7/D30", () => {
  const result = calculate([
    fact(1, "a", day(1), true, false),
    fact(2, "a", day(2), false, true),
    fact(3, "a", day(8), false, true),
    fact(4, "a", day(8), false, true),
    fact(5, "b", day(1), true, false),
    fact(6, "b", day(2), true, false),
    fact(7, "c", day(2), true, false),
    fact(8, "c", day(9), false, true),
    fact(9, "return-only", day(2), false, true)
  ]);
  expect(result.population).toBe(3);
  expect(result.summary).toEqual([
    {
      offset: 1,
      eligible: 3,
      retained: 1,
      pending: 0,
      unknown: 0,
      rate: { numerator: 1, denominator: 3 }
    },
    {
      offset: 7,
      eligible: 3,
      retained: 2,
      pending: 0,
      unknown: 0,
      rate: { numerator: 2, denominator: 3 }
    },
    { offset: 30, eligible: 0, retained: 0, pending: 3, unknown: 0, rate: null }
  ]);
  expect(result.cohorts.map((row) => [row.period_start, row.entered])).toEqual([
    ["2026-09-01", 2],
    ["2026-09-02", 1]
  ]);
  expect(result.quality_reasons).toContain("immature_periods");
  expect(JSON.stringify(result)).not.toContain(hash("a"));
});

it("does not invent a fresh cohort for repeated entry or infer first ever before tracking", () => {
  const result = calculate(
    [
      fact(1, "old", day(0), true, false),
      fact(2, "old", day(1), true, false),
      fact(3, "new", day(1), true, false),
      fact(4, "new", day(2), false, true),
      fact(5, "outside", day(3), true, false)
    ],
    { available_from: day(0), definition_effective_from: day(0) }
  );
  expect(result.population).toBe(1);
  expect(result.entry_basis).toBe("first_observed_since_tracking_start");
  expect(result.tracking_start).toBe(day(0));
});

it("handles calendar days across spring/fall daylight saving without fixed 24-hour offsets", () => {
  for (const [entry, returned, from, to, cutoff] of [
    [
      "2026-03-08T04:30:00.000Z",
      "2026-03-09T03:30:00.000Z",
      "2026-03-07T05:00:00.000Z",
      "2026-03-08T05:00:00.000Z",
      "2026-03-09T04:00:00.000Z"
    ],
    [
      "2026-11-01T03:30:00.000Z",
      "2026-11-02T04:30:00.000Z",
      "2026-10-31T04:00:00.000Z",
      "2026-11-01T04:00:00.000Z",
      "2026-11-02T05:00:00.000Z"
    ]
  ]) {
    const result = calculate(
      [fact(1, "a", entry!, true, false), fact(2, "a", returned!, false, true)],
      {
        definition: { ...query.definition, timezone: "America/New_York", offsets: [1] },
        from: from!,
        to: to!,
        observation_cutoff: cutoff!,
        watermark: "2026-11-05T00:00:00.000Z",
        available_from: from!,
        definition_effective_from: from!
      }
    );
    expect(result.summary[0]).toMatchObject({ eligible: 1, retained: 1, pending: 0 });
  }
});

it("uses Monday calendar weeks and real month boundaries across leap/year changes", () => {
  const cases = [
    {
      period: "week" as const,
      from: "2026-08-30T00:00:00.000Z",
      to: "2026-08-31T00:00:00.000Z",
      returned: "2026-08-31T00:00:00.000Z",
      cutoff: "2026-09-07T00:00:00.000Z",
      start: "2026-08-24"
    },
    {
      period: "month" as const,
      from: "2028-01-31T00:00:00.000Z",
      to: "2028-02-01T00:00:00.000Z",
      returned: "2028-02-29T12:00:00.000Z",
      cutoff: "2028-03-01T00:00:00.000Z",
      start: "2028-01-01"
    },
    {
      period: "month" as const,
      from: "2026-12-31T00:00:00.000Z",
      to: "2027-01-01T00:00:00.000Z",
      returned: "2027-01-31T12:00:00.000Z",
      cutoff: "2027-02-01T00:00:00.000Z",
      start: "2026-12-01"
    }
  ];
  for (const c of cases) {
    const result = calculate(
      [fact(1, "a", c.from, true, false), fact(2, "a", c.returned, false, true)],
      {
        definition: { ...query.definition, period: c.period, offsets: [1] },
        from: c.from,
        to: c.to,
        observation_cutoff: c.cutoff,
        watermark: c.cutoff,
        available_from: c.from,
        definition_effective_from: c.from
      }
    );
    expect(result.cohorts[0]?.period_start).toBe(c.start);
    expect(result.summary[0]).toMatchObject({ eligible: 1, retained: 1 });
  }
});

it("keeps on-or-after cells pending until the explicit maximum-offset horizon closes", () => {
  const facts = [fact(1, "a", day(1), true, false), fact(2, "a", day(4), false, true)];
  const definition = { ...query.definition, mode: "on_or_after" as const, offsets: [1, 7] };
  expect(calculate(facts, { definition, observation_cutoff: day(5) }).summary).toEqual([
    { offset: 1, eligible: 0, retained: 0, pending: 1, unknown: 0, rate: null },
    { offset: 7, eligible: 0, retained: 0, pending: 1, unknown: 0, rate: null }
  ]);
  expect(calculate(facts, { definition }).summary).toEqual([
    {
      offset: 1,
      eligible: 1,
      retained: 1,
      pending: 0,
      unknown: 0,
      rate: { numerator: 1, denominator: 1 }
    },
    {
      offset: 7,
      eligible: 1,
      retained: 0,
      pending: 0,
      unknown: 0,
      rate: { numerator: 0, denominator: 1 }
    }
  ]);
});

it("excludes late received returns until the watermark and deduplicates repeated evidence", () => {
  const entry = fact(1, "a", day(1), true, false);
  const returned = fact(2, "a", day(2), false, true, { received_at: day(13) });
  expect(calculate([entry, entry, returned]).summary[0]?.retained).toBe(0);
  expect(calculate([entry, returned], { watermark: day(13) }).summary[0]?.retained).toBe(1);
  expect(calculate([entry, returned], { watermark: day(13) })).toEqual(
    calculate([returned, entry], { watermark: day(13) })
  );
});

it("exposes loss, sampling and unavailable history instead of claiming zero retention", () => {
  const facts = [fact(1, "a", day(1), true, false)];
  expect(calculate(facts, { incomplete: true }).summary[0]).toMatchObject({
    eligible: 0,
    retained: 0,
    unknown: 1,
    rate: null
  });
  expect(calculate(facts, { sample_rate: 0.5 }).quality_reasons).toContain("sampled");
  expect(evaluateRetention({ ...query, available_from: day(2) }, facts)).toEqual({
    status: "unavailable",
    reason: "insufficient_history"
  });
  expect(evaluateRetention({ ...query, calendar_version: "unrecognized" }, facts)).toEqual({
    status: "unavailable",
    reason: "calendar_version_unavailable"
  });
  expect(calculate([]).summary.every((cell) => cell.rate === null)).toBe(true);
});

it("bounds work and rejects conflicts, invalid calendars and stale compiled facts", () => {
  const a = fact(1, "a", day(1), true, false);
  expect(evaluateRetention(query, [a, { ...a, entry: false }])).toEqual({
    status: "unavailable",
    reason: "conflicting_evidence"
  });
  for (const bad of [
    { ...a, scope_revision: 2 },
    { ...a, definition_revision: 2 },
    { ...a, subject: "account" }
  ])
    expect(evaluateRetention(query, [bad])).toEqual({
      status: "unavailable",
      reason: "stale_evidence"
    });
  for (const [q, facts] of [
    [query, null],
    [null, []],
    [query, [{}]],
    [{ ...query, definition: { ...query.definition, timezone: "Invalid/Zone" } }, []]
  ])
    expect(evaluateRetention(q, facts)).toEqual({ status: "unavailable", reason: "invalid_input" });
  expect(
    evaluateRetention(
      query,
      Array.from({ length: 10001 }, () => a)
    )
  ).toEqual({ status: "unavailable", reason: "capacity_exceeded" });
});

it("settles empty and nonempty reports only after the target calendar period and correction", () => {
  const definition = { ...query.definition, offsets: [1] };
  const mature = { definition, observation_cutoff: day(4), watermark: day(6) };
  expect(calculate([], mature).quality).toBe("exact");
  expect(calculate([fact(1, "a", day(1), true, false)], mature).summary[0]).toEqual({
    offset: 1,
    eligible: 1,
    retained: 0,
    pending: 0,
    unknown: 0,
    rate: { numerator: 0, denominator: 1 }
  });
  expect(calculate([], { ...mature, watermark: day(5) }).quality_reasons).toContain(
    "correction_window"
  );
});

it("keeps return events outside the requested calendar horizon from raising retention", () => {
  const definition = { ...query.definition, mode: "on_or_after" as const, offsets: [1, 7] };
  const result = calculate(
    [
      fact(1, "a", day(1), true, false),
      fact(2, "a", day(9), false, true),
      fact(3, "a", day(30), false, true)
    ],
    { definition }
  );
  expect(result.summary.map((cell) => cell.retained)).toEqual([0, 0]);
});

it("interprets the proleptic calendar year zero without silently moving its cohort into AD one", () => {
  const from = "0000-01-01T00:00:00.000Z";
  const result = calculate([fact(1, "a", from, true, false)], {
    definition: { ...query.definition, offsets: [1] },
    from,
    to: "0000-01-02T00:00:00.000Z",
    observation_cutoff: "0000-01-04T00:00:00.000Z",
    watermark: "0000-01-06T00:00:00.000Z",
    available_from: from,
    definition_effective_from: from
  });
  expect(result.cohorts[0]?.period_start).toBe("0000-01-01");
});
