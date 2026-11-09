import {
  prepareReportModelInput,
  ReportModelFactsSchema,
  type ReportModelEvidence,
  type ReportModelFacts
} from "./model-evidence.js";

const rank = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4 } as const;
const encoder = new TextEncoder();
function prefix(value: string, bytes: number): string {
  let result = "",
    length = 0;
  for (const character of value) {
    const size = encoder.encode(character).length;
    if (length + size > bytes) break;
    result += character;
    length += size;
  }
  return result;
}
const active = (item: ReportModelEvidence): boolean => ["open", "regressed"].includes(item.status);

/** Only the narrative input is compacted. The canonical report retains every
 * numeric fact and selected source for HTML/PDF. Reserve useful detail per view
 * before sharing the context budget, so noisy views cannot crowd out others. */
export function projectReportNarrativeFacts(raw: unknown): ReportModelFacts {
  const facts = prepareReportModelInput(raw),
    selected: ReportModelEvidence[] = [];
  const notes = new Map(facts.projects.map((project) => [project.ref, [] as string[]]));
  for (const project of facts.projects) {
    const all = facts.evidence.filter((item) => item.project_ref === project.ref),
      chosen: ReportModelEvidence[] = [];
    const take = (items: ReportModelEvidence[]): void => {
      const next = items.find((item) => !chosen.some((value) => value.ref === item.ref));
      if (next && chosen.length < 3) chosen.push(next);
    };
    const urgent = all.filter((item) => active(item) && rank[item.severity] <= 1);
    take(
      [...urgent].sort(
        (a, b) =>
          rank[a.severity] - rank[b.severity] ||
          (a.first_seen_at ?? facts.cutoff_at).localeCompare(b.first_seen_at ?? facts.cutoff_at) ||
          a.ref.localeCompare(b.ref)
      )
    );
    take(
      [...urgent].sort(
        (a, b) =>
          rank[a.severity] - rank[b.severity] ||
          (b.last_seen_at ?? "").localeCompare(a.last_seen_at ?? "") ||
          a.ref.localeCompare(b.ref)
      )
    );
    take(
      all.filter((item) => item.status === "resolved" && item.period_events.includes("resolved"))
    );
    take(all.filter((item) => item.type === "improvement" && item.period_events.length > 0));
    take(all.filter((item) => item.period_events.length > 0));
    for (const item of all) take([item]);
    selected.push(...chosen);
    if (chosen.length < all.length)
      notes
        .get(project.ref)!
        .push(
          `${project.ref}: AI narrative uses ${chosen.length} of ${all.length} selected sources; full source and numeric tables remain in the report.`
        );
  }
  // Equal byte allowances preserve Unicode boundaries and fair context across
  // views. The provider counts the complete prompt/schema before any paid call.
  const withContext = selected.filter((item) => item.context !== null).length;
  const allowance = withContext === 0 ? 0 : Math.min(1600, Math.floor(4500 / withContext));
  facts.evidence = selected.map((item) => {
    const title = prefix(item.title, 120),
      context = item.context === null ? null : prefix(item.context, allowance);
    if (title !== item.title || context !== item.context)
      notes
        .get(item.project_ref)!
        .push(
          `${item.project_ref}: AI source titles or context are bounded excerpts; the report retains the available canonical detail.`
        );
    return { ...item, title, context };
  });
  facts.projects = facts.projects.map((project) => ({
    ...project,
    name: prefix(project.name, 120)
  }));
  facts.selection_notes = [
    ...facts.selection_notes,
    ...facts.projects.flatMap((project) => {
      const unique = [...new Set(notes.get(project.ref))];
      return unique.length === 0 ? [] : [prefix(unique.join(" "), 300)];
    })
  ];
  return ReportModelFactsSchema.parse(facts);
}

/** Repeated metric semantics and notes are dictionaries, not repeated prose.
 * Tuples preserve all numbers and explicit comparison direction. The model is
 * asked for qualitative prose; canonical tables own arithmetic and precision. */
export function compactReportModelPayload(facts: ReportModelFacts): Record<string, unknown> {
  const metricKeys = [...new Set(facts.metrics.map((item) => item.key))];
  const selectionNotes = facts.selection_notes.map((note) => {
    const project = facts.projects.find((project) => note.startsWith(`${project.ref}: `));
    return {
      project_ref: project?.ref ?? null,
      text: project ? note.slice(project.ref.length + 2) : note
    };
  });
  const noteDictionary = [
    ...new Set([
      ...facts.projects.flatMap((project) => project.notes),
      ...facts.metrics.flatMap((item) => item.notes),
      ...selectionNotes.map((note) => note.text)
    ])
  ];
  const noteIds = (notes: string[]): number[] => notes.map((note) => noteDictionary.indexOf(note));
  return {
    version: 1,
    period: facts.period,
    previous_period: facts.previous_period,
    cutoff_at: facts.cutoff_at,
    privacy_mode: facts.privacy_mode,
    metric_keys: metricKeys.map((key) => ({
      key,
      unit: facts.metrics.find((item) => item.key === key)!.unit,
      semantics: ["open_high_incidents", "open_critical_incidents"].includes(key)
        ? "snapshot"
        : "period_total"
    })),
    note_dictionary: noteDictionary,
    projects: facts.projects.map((project) => ({ ...project, notes: noteIds(project.notes) })),
    metric_columns: [
      "ref",
      "project_ref",
      "metric_key_index",
      "current",
      "previous",
      "current_complete",
      "previous_complete",
      "comparison_available",
      "direction",
      "note_indices"
    ],
    metrics: facts.metrics.map((item) => [
      item.ref,
      item.project_ref,
      metricKeys.indexOf(item.key),
      item.current,
      item.previous,
      item.current_complete,
      item.previous_complete,
      item.comparison?.comparison_available ?? false,
      item.comparison?.metric_semantics === "snapshot"
        ? item.comparison.value_direction
        : item.comparison?.rate_direction,
      noteIds(item.notes)
    ]),
    evidence_columns: [
      "ref",
      "project_ref",
      "type",
      "status",
      "severity",
      "period_events",
      "first_seen_at",
      "last_seen_at",
      "title",
      "context"
    ],
    evidence: facts.evidence.map((item) => [
      item.ref,
      item.project_ref,
      item.type,
      item.status,
      item.severity,
      item.period_events,
      item.first_seen_at,
      item.last_seen_at,
      item.title,
      item.context
    ]),
    selection_note_columns: ["project_ref_or_null", "note_dictionary_index"],
    selection_notes: selectionNotes.map((note) => [
      note.project_ref,
      noteDictionary.indexOf(note.text)
    ])
  };
}
