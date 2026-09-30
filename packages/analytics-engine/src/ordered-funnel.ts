import { stableJson } from "../../event-normalizer/src/canonical-json.js";
import {
  FunnelFactSchema,
  FunnelQuerySchema,
  MAX_FUNNEL_FACTS,
  MAX_FUNNEL_BREAKDOWNS,
  FUNNEL_CORRECTION_MS,
  type FunnelFact,
  type FunnelQuery,
  type FunnelResult,
  type FunnelBreakdown,
  type FunnelQualityReason,
  type FunnelPopulation,
  type FunnelRatio,
  type FunnelUnavailableReason
} from "./funnel-evidence.js";

type TimedFact = FunnelFact & { time: number };
const unavailable = (reason: FunnelUnavailableReason): FunnelResult => ({
  status: "unavailable",
  reason
});
const streamKey = (fact: FunnelFact): string =>
  stableJson([
    fact.origin_project_id,
    fact.producer_kind,
    fact.stream_id === null ? "unsequenced_event" : "producer_stream",
    fact.stream_id ?? fact.event_id
  ]);

function streamGroups(facts: TimedFact[]): TimedFact[][] {
  const groups = new Map<string, TimedFact[]>();
  for (const fact of facts) {
    const key = streamKey(fact),
      group = groups.get(key) ?? [];
    group.push(fact);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) =>
    group.sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
  );
}

function entryBreakdown(groups: TimedFact[][]): FunnelBreakdown {
  const values = new Map<string, FunnelBreakdown>();
  for (const group of groups) {
    const entries = group.filter((fact) => fact.matches[0]);
    const first = entries[0];
    if (!first) continue;
    for (const entry of entries) {
      if (entry.sequence !== first.sequence) break;
      values.set(stableJson(entry.breakdown), entry.breakdown);
    }
  }
  return values.size === 1 ? values.values().next().value! : { kind: "ambiguous" };
}

/** A timestamp tie is only ordered inside one origin/producer/stream with distinct sequences. */
function advance(groups: TimedFact[][], prior: number, stepCount: number): number {
  let result = prior;
  for (const group of groups) {
    let progress = prior;
    for (let index = 0; index < group.length && progress < stepCount; ) {
      const sequence = group[index]!.sequence;
      let matches = false;
      do {
        matches ||= group[index]!.matches[progress]!;
        index++;
      } while (index < group.length && group[index]!.sequence === sequence);
      // Even overlapping step predicates require different events and proven ordering.
      if (matches) progress++;
    }
    result = Math.max(result, progress);
  }
  return result;
}

function ambiguousNext(facts: TimedFact[], progress: number): boolean {
  if (progress === 0) return false;
  const predecessors = new Map<string, TimedFact[]>();
  for (const fact of facts) {
    if (!fact.matches[progress - 1]) continue;
    const key = streamKey(fact),
      values = predecessors.get(key) ?? [];
    values.push(fact);
    predecessors.set(key, values);
  }
  // No all-pairs traversal: at most ten steps, with linear grouping of a bounded time bucket.
  const sequences = new Map<string, Map<number | null, Set<string>>>();
  for (const [key, group] of predecessors) {
    const bySequence = new Map<number | null, Set<string>>();
    for (const fact of group) {
      const ids = bySequence.get(fact.sequence) ?? new Set<string>();
      ids.add(fact.event_id);
      bySequence.set(fact.sequence, ids);
    }
    sequences.set(key, bySequence);
  }
  for (const next of facts) {
    if (!next.matches[progress]) continue;
    const key = streamKey(next);
    if (predecessors.size > (predecessors.has(key) ? 1 : 0)) return true;
    const ids = sequences.get(key)?.get(next.sequence);
    if (ids && (ids.size > 1 || !ids.has(next.event_id))) return true;
  }
  return false;
}

interface SubjectResult {
  progress: number;
  state: "completed" | "unknown" | "expired" | "open";
  mature: boolean;
  ambiguous: boolean;
  breakdown: FunnelBreakdown;
  duration: number | null;
}

function subjectResult(facts: TimedFact[], query: FunnelQuery): SubjectResult | null {
  const to = Date.parse(query.to),
    cutoff = Date.parse(query.observation_cutoff);
  const times = new Map<number, TimedFact[]>();
  for (const fact of facts) {
    const group = times.get(fact.time) ?? [];
    group.push(fact);
    times.set(fact.time, group);
  }
  const ordered = [...times.entries()].sort(([a], [b]) => a - b);
  const entryIndex = ordered.findIndex(
    ([time, group]) => time < to && group.some((fact) => fact.matches[0])
  );
  if (entryIndex === -1) return null;
  const entryAt = ordered[entryIndex]![0];
  const deadline = entryAt + query.conversion_window_seconds * 1000;
  let progress = 0,
    ambiguous = false;
  let completedAt: number | null = null;
  const breakdown = entryBreakdown(streamGroups(ordered[entryIndex]![1]));
  for (let index = entryIndex; index < ordered.length; index++) {
    const [time, group] = ordered[index]!;
    if (time > deadline) break;
    progress = advance(streamGroups(group), progress, query.step_keys.length);
    if (progress === query.step_keys.length) {
      completedAt = time;
      break;
    }
    ambiguous ||= ambiguousNext(group, progress);
  }
  const mature = cutoff >= deadline;
  const state =
    completedAt !== null
      ? "completed"
      : query.incomplete || ambiguous
        ? "unknown"
        : mature
          ? "expired"
          : "open";
  return {
    progress,
    state,
    mature,
    // A later path can prove conversion without proving that it was the earliest conversion.
    ambiguous,
    breakdown,
    duration: completedAt === null ? null : completedAt - entryAt
  } as const;
}

/** Pure aggregate calculation. Callers must authorize the complete snapshot before loading evidence. */
export function evaluateOrderedFunnel(queryInput: unknown, factsInput: unknown): FunnelResult {
  try {
    if (!Array.isArray(factsInput)) return unavailable("invalid_input");
    if (factsInput.length > MAX_FUNNEL_FACTS) return unavailable("capacity_exceeded");
    const parsedQuery = FunnelQuerySchema.safeParse(queryInput);
    if (!parsedQuery.success) return unavailable("invalid_input");
    const query = parsedQuery.data;
    const from = Date.parse(query.from),
      cutoff = Date.parse(query.observation_cutoff),
      watermark = Date.parse(query.watermark);
    if (
      Date.parse(query.available_from) > from ||
      Date.parse(query.definition_effective_from) > from
    )
      return unavailable("insufficient_history");
    const unique = new Map<string, string>(),
      subjects = new Map<string, TimedFact[]>();
    for (const input of factsInput) {
      const parsed = FunnelFactSchema.safeParse(input);
      if (!parsed.success || parsed.data.matches.length !== query.step_keys.length)
        return unavailable("invalid_input");
      const fact = parsed.data;
      if (
        fact.subject !== query.subject ||
        stableJson(fact.scope) !== stableJson(query.scope) ||
        fact.scope_revision !== query.scope_revision ||
        fact.definition_key !== query.definition_key ||
        fact.definition_revision !== query.definition_revision ||
        (query.scope.kind === "project" && fact.origin_project_id !== query.scope.project_id)
      )
        return unavailable("stale_evidence");
      const id = `${fact.origin_project_id}:${fact.event_id}`,
        content = stableJson(fact);
      const existing = unique.get(id);
      if (existing !== undefined) {
        if (existing !== content) return unavailable("conflicting_evidence");
        continue;
      }
      unique.set(id, content);
      const time = Date.parse(fact.occurred_at);
      if (time < from || time > cutoff || Date.parse(fact.received_at) > watermark) continue;
      const group = subjects.get(fact.subject_key) ?? [];
      group.push({ ...fact, time });
      subjects.set(fact.subject_key, group);
    }
    const population: FunnelPopulation = {
      entered: 0,
      completed: 0,
      open: 0,
      expired: 0,
      unknown: 0,
      mature: 0
    };
    const reached = query.step_keys.map(() => 0),
      durations: number[] = [];
    const breakdowns = new Map<
      string,
      { breakdown: FunnelBreakdown; entered: number; completed: number }
    >();
    const reasons = new Set<FunnelQualityReason>();
    if (query.incomplete) reasons.add("incomplete_evidence");
    if (query.sample_rate < 1) reasons.add("sampled");
    for (const facts of subjects.values()) {
      const subject = subjectResult(facts, query);
      if (subject === null) continue;
      population.entered++;
      population[subject.state]++;
      if (subject.mature) population.mature++;
      for (let index = 0; index < subject.progress; index++) reached[index]!++;
      if (subject.duration !== null) durations.push(subject.duration);
      if (subject.ambiguous) reasons.add("ambiguous_order");
      if (subject.breakdown.kind === "ambiguous") reasons.add("ambiguous_entry_breakdown");
      const key = stableJson(subject.breakdown);
      const breakdown = breakdowns.get(key) ?? {
        breakdown: subject.breakdown,
        entered: 0,
        completed: 0
      };
      breakdown.entered++;
      if (subject.state === "completed") breakdown.completed++;
      breakdowns.set(key, breakdown);
      // The two explicit non-value buckets do not consume catalog dimension capacity.
      if (breakdowns.size > MAX_FUNNEL_BREAKDOWNS + 2) return unavailable("capacity_exceeded");
    }
    if (
      [...breakdowns.values()].filter((row) => row.breakdown.kind === "value").length >
      MAX_FUNNEL_BREAKDOWNS
    )
      return unavailable("capacity_exceeded");
    if (population.open > 0) reasons.add("open_entries");
    if (
      watermark <
      Date.parse(query.to) + query.conversion_window_seconds * 1000 + FUNNEL_CORRECTION_MS
    )
      reasons.add("correction_window");
    const partial = [
      "incomplete_evidence",
      "sampled",
      "ambiguous_order",
      "ambiguous_entry_breakdown"
    ].some((reason) => reasons.has(reason as FunnelQualityReason));
    durations.sort((a, b) => a - b);
    const ratio = (numerator: number, denominator: number): FunnelRatio =>
      query.incomplete || denominator === 0 ? null : { numerator, denominator };
    return {
      status: "available",
      calculation_version: "ordered-funnel-1",
      quality: partial ? "partial" : reasons.size > 0 ? "provisional" : "exact",
      quality_reasons: [...reasons].sort(),
      scope: query.scope,
      subject: query.subject,
      scope_revision: query.scope_revision,
      definition_key: query.definition_key,
      definition_revision: query.definition_revision,
      from: query.from,
      to: query.to,
      observation_cutoff: query.observation_cutoff,
      watermark: query.watermark,
      available_from: query.available_from,
      sample_rate: query.sample_rate,
      population,
      steps: query.step_keys.map((key, index) => ({
        key,
        reached: reached[index]!,
        overall: ratio(reached[index]!, population.entered),
        previous: index === 0 ? null : ratio(reached[index]!, reached[index - 1]!)
      })),
      breakdowns: [...breakdowns.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([, value]) => value),
      time_to_convert:
        durations.length === 0
          ? null
          : {
              basis: "first_confirmed_path",
              count: durations.length,
              sum_ms: durations.reduce((sum, value) => sum + BigInt(value), 0n).toString(),
              min_ms: durations[0]!,
              max_ms: durations[durations.length - 1]!,
              p50_ms: durations[Math.ceil(durations.length * 0.5) - 1]!,
              p95_ms: durations[Math.ceil(durations.length * 0.95) - 1]!
            }
    };
  } catch {
    return unavailable("invalid_input");
  }
}
