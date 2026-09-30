import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
  evaluateOrderedFunnel,
  type FunnelFact,
  type FunnelQuery
} from "../../../packages/analytics-engine/src/index.js";

const project = "11111111-1111-4111-8111-111111111111";
const otherProject = "22222222-2222-4222-8222-222222222222";
const scope = { kind: "project" as const, project_id: project };
const at = (seconds: number): string =>
  new Date(Date.UTC(2026, 8, 1) + seconds * 1000).toISOString();
const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
const query: FunnelQuery = {
  subject: "user",
  scope,
  scope_revision: 1,
  definition_key: "activation",
  definition_revision: 1,
  step_keys: ["entry", "success"],
  conversion_window_seconds: 60,
  from: at(0),
  to: at(10),
  observation_cutoff: at(100),
  watermark: at(200000),
  available_from: at(0),
  definition_effective_from: at(0),
  sample_rate: 1,
  incomplete: false
};
const fact = (
  id: number,
  subject: string,
  seconds: number,
  steps: number[],
  changes: Partial<FunnelFact> = {}
): FunnelFact => ({
  subject: "user",
  scope,
  scope_revision: 1,
  definition_key: "activation",
  definition_revision: 1,
  event_id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
  origin_project_id: project,
  content_hash: hash(String(id)),
  subject_key: hash(subject),
  occurred_at: at(seconds),
  received_at: at(seconds + 1),
  producer_kind: "server",
  stream_id: null,
  sequence: null,
  matches: query.step_keys.map((_, index) => steps.includes(index)),
  breakdown: { kind: "missing" },
  ...changes
});
const counts = (facts: FunnelFact[], changes: Partial<FunnelQuery> = {}) => {
  const result = evaluateOrderedFunnel({ ...query, ...changes }, facts);
  expect(result.status).toBe("available");
  if (result.status !== "available") throw new Error(result.reason);
  return result;
};

it("uses the same ordered subject cohort instead of adding independent step counts", () => {
  const result = counts([
    fact(1, "a-only", 1, [0]),
    fact(2, "b-only", 2, [1]),
    fact(3, "reverse", 0, [1]),
    fact(4, "reverse", 1, [0]),
    fact(5, "success", 2, [0]),
    fact(6, "success", 3, []),
    fact(7, "success", 12, [1])
  ]);
  expect(result.population).toEqual({
    entered: 3,
    completed: 1,
    open: 0,
    expired: 2,
    unknown: 0,
    mature: 3
  });
  expect(result.steps.map((step) => step.reached)).toEqual([3, 1]);
  expect(result.steps[1]).toMatchObject({
    overall: { numerator: 1, denominator: 3 },
    previous: { numerator: 1, denominator: 3 }
  });
  expect(result.time_to_convert).toEqual({
    basis: "first_confirmed_path",
    count: 1,
    sum_ms: "10000",
    min_ms: 10000,
    max_ms: 10000,
    p50_ms: 10000,
    p95_ms: 10000
  });
  expect(result.quality).toBe("exact");
});

it("uses first entry, a half-open entry cohort and an inclusive conversion deadline", () => {
  const result = counts([
    fact(1, "repeat", 0, [0]),
    fact(2, "repeat", 9, [0]),
    fact(3, "repeat", 61, [1]),
    fact(4, "boundary", 0, [0]),
    fact(5, "boundary", 60, [1]),
    fact(6, "outside", 10, [0]),
    fact(7, "outside", 11, [1]),
    fact(8, "early", -1, [0]),
    fact(9, "early", 1, [1])
  ]);
  expect(result.population).toEqual({
    entered: 2,
    completed: 1,
    open: 0,
    expired: 1,
    unknown: 0,
    mature: 2
  });
  expect(result.time_to_convert?.max_ms).toBe(60000);
});

it("does not infer chronological order from a UUID or reuse one event for two steps", () => {
  const first = fact(1, "tie", 1, [0]);
  const second = fact(2, "tie", 1, [1]);
  const result = counts([first, second, fact(3, "one-event", 1, [0, 1])]);
  expect(result.population).toEqual({
    entered: 2,
    completed: 0,
    open: 0,
    expired: 1,
    unknown: 1,
    mature: 2
  });
  expect(result.quality_reasons).toContain("ambiguous_order");
  expect(counts([second, first, fact(3, "one-event", 1, [0, 1])])).toEqual(result);
  expect(JSON.stringify(result)).not.toContain(first.subject_key);
});

it("uses producer sequence only within the same origin, producer and stream", () => {
  const stream = "33333333-3333-4333-8333-333333333333";
  const sequenced = (sequence: number): Partial<FunnelFact> => ({ stream_id: stream, sequence });
  const result = counts([
    fact(1, "ordered", 1, [0], sequenced(1)),
    fact(2, "ordered", 1, [1], sequenced(2)),
    fact(3, "reverse", 1, [0], sequenced(2)),
    fact(4, "reverse", 1, [1], sequenced(1)),
    fact(5, "same-sequence", 1, [0], sequenced(2)),
    fact(6, "same-sequence", 1, [1], sequenced(2)),
    fact(7, "other-producer", 1, [0], sequenced(1)),
    fact(8, "other-producer", 1, [1], { ...sequenced(2), producer_kind: "browser" })
  ]);
  expect(result.population).toEqual({
    entered: 4,
    completed: 1,
    open: 0,
    expired: 1,
    unknown: 2,
    mature: 4
  });
  const space = { kind: "space" as const, space_id: stream };
  const across = counts(
    [
      fact(9, "cross-project", 1, [0], { ...sequenced(1), scope: space }),
      fact(10, "cross-project", 1, [1], {
        ...sequenced(2),
        scope: space,
        origin_project_id: otherProject
      })
    ],
    { scope: space }
  );
  expect(across.population.unknown).toBe(1);
});

it("can prove a later completion after an ambiguous intermediate observation", () => {
  const result = counts([fact(1, "a", 1, [0]), fact(2, "a", 1, [1]), fact(3, "a", 5, [1])]);
  expect(result.population.completed).toBe(1);
  expect(result.population.unknown).toBe(0);
  expect(result.time_to_convert?.min_ms).toBe(4000);
  expect(result.quality).toBe("partial");
  expect(result.quality_reasons).toContain("ambiguous_order");
  expect(result.time_to_convert?.basis).toBe("first_confirmed_path");
});

it("lets different members complete an explicit account cohort through its resolved subject", () => {
  const result = counts(
    [
      fact(1, "account-a", 1, [0], { subject: "account" }),
      fact(2, "account-a", 5, [1], { subject: "account" }),
      fact(3, "account-b", 5, [1], { subject: "account" })
    ],
    { subject: "account" }
  );
  expect(result.population.completed).toBe(1);
  expect(result.population.entered).toBe(1);
});

it("keeps immature entries and correction-window evidence provisional", () => {
  const result = counts([fact(1, "a", 1, [0])], { observation_cutoff: at(20), watermark: at(20) });
  expect(result.population).toEqual({
    entered: 1,
    completed: 0,
    open: 1,
    expired: 0,
    unknown: 0,
    mature: 0
  });
  expect(result.quality).toBe("provisional");
  expect(result.quality_reasons).toContain("open_entries");
  const correcting = counts([fact(1, "a", 1, [0])], { watermark: at(100) });
  expect(correcting.population.expired).toBe(1);
  expect(correcting.quality_reasons).toContain("correction_window");
});

it("uses an explicit received watermark and occurrence cutoff for late arrivals", () => {
  const facts = [fact(1, "a", 1, [0]), fact(2, "a", 5, [1], { received_at: at(200) })];
  expect(counts(facts, { watermark: at(100) }).population.completed).toBe(0);
  expect(counts(facts, { watermark: at(200) }).population.completed).toBe(1);
  expect(
    counts([fact(1, "a", 1, [0]), fact(2, "a", 30, [1])], { observation_cutoff: at(20) }).population
      .completed
  ).toBe(0);
});

it("deduplicates exact retries and fails closed on conflicting or stale evidence", () => {
  const entry = fact(1, "a", 1, [0]);
  expect(counts([entry, entry, fact(2, "a", 5, [1])]).population.completed).toBe(1);
  for (const changes of [{ content_hash: hash("other") }, { matches: [false, true] }])
    expect(evaluateOrderedFunnel(query, [entry, { ...entry, ...changes }])).toEqual({
      status: "unavailable",
      reason: "conflicting_evidence"
    });
  for (const changes of [
    { definition_revision: 2 },
    { scope_revision: 2 },
    { origin_project_id: otherProject },
    { definition_key: "other" }
  ])
    expect(evaluateOrderedFunnel(query, [{ ...entry, ...changes }])).toEqual({
      status: "unavailable",
      reason: "stale_evidence"
    });
});

it("does not turn missing history, state capacity or malformed inputs into an exact zero", () => {
  expect(evaluateOrderedFunnel({ ...query, available_from: at(1) }, [])).toEqual({
    status: "unavailable",
    reason: "insufficient_history"
  });
  expect(evaluateOrderedFunnel({ ...query, definition_effective_from: at(1) }, [])).toEqual({
    status: "unavailable",
    reason: "insufficient_history"
  });
  expect(
    evaluateOrderedFunnel(
      query,
      Array.from({ length: 10001 }, (_, i) => fact(i, "a", 1, [0]))
    )
  ).toEqual({ status: "unavailable", reason: "capacity_exceeded" });
  expect(evaluateOrderedFunnel({ ...query, from: "invalid" }, [])).toEqual({
    status: "unavailable",
    reason: "invalid_input"
  });
  expect(evaluateOrderedFunnel(query, [fact(1, "a", 1, [0], { sequence: 1 })])).toEqual({
    status: "unavailable",
    reason: "invalid_input"
  });
  const empty = counts([]);
  expect(empty.steps.every((step) => step.overall === null && step.previous === null)).toBe(true);
  expect(empty.time_to_convert).toBeNull();
});

it("labels sampled or incomplete evidence and suppresses rates with an unknown denominator", () => {
  const facts = [fact(1, "a", 1, [0]), fact(2, "b", 1, [0]), fact(3, "b", 5, [1])];
  const result = counts(facts, { incomplete: true });
  expect(result.population).toMatchObject({ entered: 2, completed: 1, expired: 0, unknown: 1 });
  expect(result.quality).toBe("partial");
  expect(result.steps.every((step) => step.overall === null && step.previous === null)).toBe(true);
  const sampled = counts(facts, { sample_rate: 0.5 });
  expect(sampled.population.entered).toBe(2);
  expect(sampled.quality_reasons).toContain("sampled");
});

it("attributes breakdowns to entry, separates null from missing, and exposes tied ambiguity", () => {
  const result = counts([
    fact(1, "a", 1, [0], { breakdown: { kind: "value", value: "free" } }),
    fact(2, "a", 5, [1], { breakdown: { kind: "value", value: "paid" } }),
    fact(3, "b", 1, [0], { breakdown: { kind: "value", value: null } }),
    fact(4, "c", 1, [0]),
    fact(5, "tie", 1, [0], { breakdown: { kind: "value", value: "free" } }),
    fact(6, "tie", 1, [0], { breakdown: { kind: "value", value: "paid" } }),
    fact(7, "tie", 5, [1])
  ]);
  expect(result.breakdowns).toEqual([
    { breakdown: { kind: "ambiguous" }, entered: 1, completed: 1 },
    { breakdown: { kind: "missing" }, entered: 1, completed: 0 },
    { breakdown: { kind: "value", value: "free" }, entered: 1, completed: 1 },
    { breakdown: { kind: "value", value: null }, entered: 1, completed: 0 }
  ]);
  expect(result.quality_reasons).toContain("ambiguous_entry_breakdown");
});

it("requires separate events for overlapping predicates in each of three steps", () => {
  const change = { step_keys: ["one", "two", "three"] };
  const facts = [
    fact(1, "a", 1, [], { matches: [true, true, true] }),
    fact(2, "a", 2, [], { matches: [true, true, true] }),
    fact(3, "a", 3, [], { matches: [true, true, true] })
  ];
  expect(counts(facts, change).steps.map((s) => s.reached)).toEqual([1, 1, 1]);
  expect(counts(facts.slice(0, 2), change).steps.map((s) => s.reached)).toEqual([1, 1, 0]);
});

it("names the subject unit and rejects evidence from a different unit", () => {
  expect(counts([fact(1, "a", 1, [0])]).subject).toBe("user");
  expect(evaluateOrderedFunnel(query, [fact(1, "a", 1, [0], { subject: "account" })])).toEqual({
    status: "unavailable",
    reason: "stale_evidence"
  });
});

it("cannot manufacture sequence order when an event UUID equals another producer stream UUID", () => {
  const entry = fact(1, "a", 1, [0]);
  const result = counts([entry, fact(2, "a", 1, [1], { stream_id: entry.event_id, sequence: 1 })]);
  expect(result.population.completed).toBe(0);
  expect(result.population.unknown).toBe(1);
});

it("withholds cardinality overflow instead of silently trimming a report", () => {
  const facts = Array.from({ length: 35 }, (_, index) =>
    fact(index + 1, String(index), 1, [0], {
      breakdown: { kind: "value", value: `value_${index}` }
    })
  );
  expect(evaluateOrderedFunnel(query, facts)).toEqual({
    status: "unavailable",
    reason: "capacity_exceeded"
  });
});
