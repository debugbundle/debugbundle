import { z } from "zod";
import { stableJson } from "../../event-normalizer/src/canonical-json.js";
import {
  RetentionFactSchema,
  RetentionQuerySchema,
  MAX_RETENTION_FACTS,
  type RetentionFact,
  type RetentionQuery,
  type RetentionCell,
  type RetentionResult,
  type RetentionQualityReason
} from "./retention-evidence.js";

const DAY_MS = 86400000;

function calendar(query: RetentionQuery): (timestamp: string) => { index: number; start: string } {
  const formatter = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
    timeZone: query.definition.timezone,
    year: "numeric",
    era: "short",
    month: "2-digit",
    day: "2-digit"
  });
  return (timestamp) => {
    const parts = formatter.formatToParts(new Date(timestamp));
    const eraYear = Number(parts.find((p) => p.type === "year")!.value);
    const year = parts.find((p) => p.type === "era")!.value === "BC" ? 1 - eraYear : eraYear;
    const month = Number(parts.find((p) => p.type === "month")!.value);
    const day = Number(parts.find((p) => p.type === "day")!.value);
    // Calendar dates are numbered independently of the timezone's 23/24/25-hour days.
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, query.definition.period === "month" ? 1 : day);
    const ordinal = Math.floor(date.getTime() / DAY_MS);
    if (query.definition.period === "month")
      return { index: year * 12 + month - 1, start: date.toISOString().split("T")[0]! };
    if (query.definition.period === "week") {
      const index = Math.floor((ordinal + 3) / 7);
      return { index, start: new Date((index * 7 - 3) * DAY_MS).toISOString().split("T")[0]! };
    }
    return { index: ordinal, start: date.toISOString().split("T")[0]! };
  };
}

function cells(query: RetentionQuery): RetentionCell[] {
  return query.definition.offsets.map((offset) => ({
    offset,
    eligible: 0,
    retained: 0,
    pending: 0,
    unknown: 0,
    rate: null
  }));
}
function rates(values: RetentionCell[]): RetentionCell[] {
  return values.map((cell) => ({
    ...cell,
    rate: cell.eligible === 0 ? null : { numerator: cell.retained, denominator: cell.eligible }
  }));
}
function sameSnapshot(fact: RetentionFact, query: RetentionQuery): boolean {
  const definition = query.definition;
  return (
    fact.scope_revision === query.scope_revision &&
    fact.definition_key === definition.key &&
    fact.definition_revision === definition.revision &&
    fact.subject === definition.subject &&
    stableJson(fact.scope) === stableJson(definition.scope) &&
    (definition.scope.kind !== "project" || fact.origin_project_id === definition.scope.project_id)
  );
}

/** Finite calendar cohorts from a complete authorized detail load, never summed bucket uniques. */
export function evaluateRetention(queryInput: unknown, factsInput: unknown): RetentionResult {
  const queryResult = RetentionQuerySchema.safeParse(queryInput);
  if (!queryResult.success || !Array.isArray(factsInput))
    return { status: "unavailable", reason: "invalid_input" };
  if (factsInput.length > MAX_RETENTION_FACTS)
    return { status: "unavailable", reason: "capacity_exceeded" };
  const parsed = z.array(RetentionFactSchema).safeParse(factsInput);
  if (!parsed.success) return { status: "unavailable", reason: "invalid_input" };
  const query = queryResult.data;
  if (query.calendar_version !== process.versions["tz"])
    return { status: "unavailable", reason: "calendar_version_unavailable" };
  const trackingStart =
    query.available_from > query.definition_effective_from
      ? query.available_from
      : query.definition_effective_from;
  if (trackingStart > query.from) return { status: "unavailable", reason: "insufficient_history" };
  const seen = new Map<string, string>(),
    subjects = new Map<string, RetentionFact[]>();
  for (const fact of parsed.data) {
    if (!sameSnapshot(fact, query)) return { status: "unavailable", reason: "stale_evidence" };
    if (
      fact.occurred_at < trackingStart ||
      fact.occurred_at > query.observation_cutoff ||
      fact.received_at > query.watermark
    )
      continue;
    const key = JSON.stringify([fact.origin_project_id, fact.event_id]),
      encoded = stableJson(fact),
      previous = seen.get(key);
    if (previous !== undefined) {
      if (previous !== encoded) return { status: "unavailable", reason: "conflicting_evidence" };
      continue;
    }
    seen.set(key, encoded);
    const events = subjects.get(fact.subject_key) ?? [];
    events.push(fact);
    subjects.set(fact.subject_key, events);
  }
  const period = calendar(query),
    cutoffPeriod = period(query.observation_cutoff).index;
  const horizon = query.definition.offsets.at(-1)!;
  const cohorts = new Map<string, { entered: number; cells: RetentionCell[] }>();
  let population = 0;
  for (const events of subjects.values()) {
    let entry: RetentionFact | undefined;
    for (const event of events)
      if (event.entry && (entry === undefined || event.occurred_at < entry.occurred_at))
        entry = event;
    if (entry === undefined || entry.occurred_at < query.from || entry.occurred_at >= query.to)
      continue;
    const entryPeriod = period(entry.occurred_at);
    const row = cohorts.get(entryPeriod.start) ?? { entered: 0, cells: cells(query) };
    const returns = new Set(
      events
        .filter((event) => event.returned && event.occurred_at > entry.occurred_at)
        .map((event) => period(event.occurred_at).index - entryPeriod.index)
    );
    row.entered++;
    population++;
    for (const cell of row.cells) {
      const endOffset = query.definition.mode === "exact_period" ? cell.offset : horizon;
      if (cutoffPeriod <= entryPeriod.index + endOffset) {
        cell.pending++;
        continue;
      }
      if (query.incomplete) {
        cell.unknown++;
        continue;
      }
      cell.eligible++;
      if (
        query.definition.mode === "exact_period"
          ? returns.has(cell.offset)
          : [...returns].some((offset) => offset >= cell.offset && offset <= horizon)
      )
        cell.retained++;
    }
    cohorts.set(entryPeriod.start, row);
  }
  const summary = cells(query);
  for (const row of cohorts.values())
    row.cells.forEach((cell, index) => {
      const total = summary[index]!;
      total.eligible += cell.eligible;
      total.retained += cell.retained;
      total.pending += cell.pending;
      total.unknown += cell.unknown;
    });
  const reasons: RetentionQualityReason[] = [];
  if (query.incomplete) reasons.push("incomplete_evidence");
  if (query.sample_rate !== 1) reasons.push("sampled");
  if (summary.some((cell) => cell.pending > 0)) reasons.push("immature_periods");
  // Observe the full calendar target period plus late-arrival correction, even for empty cohorts.
  if (
    cutoffPeriod <= period(new Date(Date.parse(query.to) - 1).toISOString()).index + horizon ||
    Date.parse(query.watermark) < Date.parse(query.observation_cutoff) + 48 * 3600000
  )
    reasons.push("correction_window");
  return {
    status: "available",
    calculation_version: "calendar-retention-1",
    quality:
      query.incomplete || query.sample_rate !== 1
        ? "partial"
        : reasons.length > 0
          ? "provisional"
          : "exact",
    quality_reasons: reasons,
    scope: query.definition.scope,
    scope_revision: query.scope_revision,
    definition_key: query.definition.key,
    definition_revision: query.definition.revision,
    subject: query.definition.subject,
    from: query.from,
    to: query.to,
    observation_cutoff: query.observation_cutoff,
    watermark: query.watermark,
    calendar_version: query.calendar_version,
    timezone: query.definition.timezone,
    period: query.definition.period,
    mode: query.definition.mode,
    horizon,
    entry_basis: "first_observed_since_tracking_start",
    tracking_start: trackingStart,
    sample_rate: query.sample_rate,
    population,
    summary: rates(summary),
    cohorts: [...cohorts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period_start, row]) => ({
        period_start,
        entered: row.entered,
        cells: rates(row.cells)
      }))
  };
}
