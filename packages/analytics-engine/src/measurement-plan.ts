import { sanitizeTelemetry } from "../../redaction/src/index.js";
import { stableJson } from "../../event-normalizer/src/canonical-json.js";
import {
  AnalyticsMeasurementPlanSchema,
  type AnalyticsMeasurementPlan,
  type AnalyticsPredicate,
  type AnalyticsCatalogEntry
} from "../../shared-types/src/index.js";
import { SemanticAnalyticsKindSchema } from "../../shared-types/src/analytics-semantic-primitives.js";
import { catalogEntryMeaning } from "./catalog-meaning.js";

export type AnalyticsPlanIssueCode =
  | "invalid_schema"
  | "unsafe_metadata"
  | "unknown_event"
  | "unknown_property"
  | "invalid_property_value"
  | "unavailable_producer"
  | "unknown_breakdown"
  | "impossible_predicate";
export type AnalyticsPlanValidation =
  | { valid: true; plan: AnalyticsMeasurementPlan }
  | { valid: false; issues: { code: AnalyticsPlanIssueCode; report_index: number | null }[] };

function validatePredicate(
  predicate: AnalyticsPredicate,
  catalog: AnalyticsCatalogEntry[],
  issue: (code: AnalyticsPlanIssueCode) => void
): void {
  if ("all" in predicate || "any" in predicate) {
    for (const child of "all" in predicate ? predicate.all : predicate.any)
      validatePredicate(child, catalog, issue);
    return;
  }
  switch (predicate.field) {
    case "event_name":
      if (predicate.values.some((name) => !catalog.some((entry) => entry.name === name)))
        issue("unknown_event");
      return;
    case "producer":
      if (
        predicate.values.some(
          (producer) => !catalog.some((entry) => entry.producers.includes(producer))
        )
      )
        issue("unavailable_producer");
      return;
    case "property": {
      const declarations = catalog.flatMap((entry) =>
        Object.hasOwn(entry.properties, predicate.key) ? [entry.properties[predicate.key]!] : []
      );
      if (declarations.length === 0) {
        issue("unknown_property");
        return;
      }
      if (
        predicate.values.some(
          (value) =>
            !declarations.some((declaration) => {
              if (value === null) return !declaration.required;
              return declaration.type === "boolean"
                ? typeof value === "boolean"
                : typeof value === "string" && declaration.values.includes(value);
            })
        )
      )
        issue("invalid_property_value");
      return;
    }
    case "event_kind":
      return; // Catalog producers do not declare event-kind narrowing.
  }
}

type PredicateClause = Exclude<
  AnalyticsPredicate,
  { all: AnalyticsPredicate[] } | { any: AnalyticsPredicate[] }
>;
type PredicateValue = string | boolean | null;

/** The schema permits at most sixteen leaves; this finite expansion has no unbounded evaluator. */
function predicateTerms(predicate: AnalyticsPredicate): PredicateClause[][] {
  if ("any" in predicate) return predicate.any.flatMap(predicateTerms);
  if ("all" in predicate)
    return predicate.all.reduce<PredicateClause[][]>(
      (terms, child) =>
        terms.flatMap((term) => predicateTerms(child).map((next) => [...term, ...next])),
      [[]]
    );
  return [[predicate]];
}

function termCanMatchEntry(clauses: PredicateClause[], entry: AnalyticsCatalogEntry): boolean {
  const allowedProperties = new Map<string, PredicateValue[]>();
  let allowedProducers = [...entry.producers];
  let allowedKinds = [...SemanticAnalyticsKindSchema.options];
  for (const clause of clauses) {
    switch (clause.field) {
      case "event_name":
        if (!clause.values.includes(entry.name)) return false;
        break;
      case "producer":
        allowedProducers = allowedProducers.filter((value) => clause.values.includes(value));
        if (allowedProducers.length === 0) return false;
        break;
      case "event_kind":
        allowedKinds = allowedKinds.filter((value) => clause.values.includes(value));
        if (allowedKinds.length === 0) return false;
        break;
      case "property": {
        const definition = entry.properties[clause.key];
        if (!definition) return false;
        const initial: PredicateValue[] =
          definition.type === "enum" ? [...definition.values] : [true, false];
        if (!definition.required) initial.push(null);
        const previous = allowedProperties.get(clause.key) ?? initial;
        const next = previous.filter((value) => clause.values.includes(value));
        if (next.length === 0) return false;
        allowedProperties.set(clause.key, next);
        break;
      }
    }
  }
  return allowedProducers.some((producer) =>
    allowedKinds.some(
      (kind) =>
        (producer !== "server" || kind === "semantic") &&
        (producer !== "browser" || kind !== "screen_view")
    )
  );
}

export function predicateCanMatchCatalog(
  predicate: AnalyticsPredicate,
  catalog: AnalyticsCatalogEntry[]
): boolean {
  return predicateTerms(predicate).some((term) =>
    catalog.some((entry) => termCanMatchEntry(term, entry))
  );
}

type ReportDefinition = AnalyticsMeasurementPlan["reports"][number];

function reportPredicates(report: ReportDefinition): AnalyticsPredicate[] {
  return report.kind === "goal"
    ? [report.predicate, ...(report.denominator === null ? [] : [report.denominator])]
    : report.kind === "ordered_funnel"
      ? report.steps.map((step) => step.predicate)
      : [report.entry, report.return];
}

/** Null means a branch can match an event name not explicitly enumerated. */
function potentialEventNames(predicate: AnalyticsPredicate): Set<string> | null {
  if ("all" in predicate) {
    let names: Set<string> | null = null;
    for (const child of predicate.all) {
      const next = potentialEventNames(child);
      if (next === null) continue;
      if (names === null) {
        names = next;
      } else {
        const restrictedNames: Set<string> = names;
        names = new Set([...restrictedNames].filter((name) => next.has(name)));
      }
    }
    return names;
  }
  if ("any" in predicate) {
    const names = new Set<string>();
    for (const child of predicate.any) {
      const next = potentialEventNames(child);
      if (next === null) return null;
      for (const name of next) names.add(name);
    }
    return names;
  }
  return predicate.field === "event_name" ? new Set(predicate.values) : null;
}

/** A reused report revision cannot silently span a changed fact definition. */
export function reportCatalogMeaningChanged(
  report: ReportDefinition,
  previous: AnalyticsCatalogEntry[],
  next: AnalyticsCatalogEntry[]
): boolean {
  const names = new Set<string>();
  let open = false;
  for (const predicate of reportPredicates(report)) {
    const possible = potentialEventNames(predicate);
    if (possible === null) {
      open = true;
      break;
    }
    for (const name of possible) names.add(name);
  }
  const oldByName = new Map(previous.map((entry) => [entry.name, catalogEntryMeaning(entry)]));
  const newByName = new Map(next.map((entry) => [entry.name, catalogEntryMeaning(entry)]));
  if (open) for (const name of [...oldByName.keys(), ...newByName.keys()]) names.add(name);
  return [...names].some((name) => oldByName.get(name) !== newByName.get(name));
}

/** Structural/reference/privacy validation only; activation also requires current authority, tiers and revisions. */
export function validateAnalyticsMeasurementPlan(input: unknown): AnalyticsPlanValidation {
  const invalid = (code: AnalyticsPlanIssueCode): AnalyticsPlanValidation => ({
    valid: false,
    issues: [{ code, report_index: null }]
  });
  try {
    const parsed = AnalyticsMeasurementPlanSchema.safeParse(input);
    if (!parsed.success) return invalid("invalid_schema");
    const plan = parsed.data;
    const protectedValue = sanitizeTelemetry(plan);
    // Definitions are not silently rewritten. Preview/apply must show exactly what can be retained.
    if (!protectedValue.ok || stableJson(protectedValue.value) !== stableJson(plan))
      return invalid("unsafe_metadata");
    const issues: { code: AnalyticsPlanIssueCode; report_index: number }[] = [];
    for (const [report_index, report] of plan.reports.entries()) {
      const codes = new Set<AnalyticsPlanIssueCode>();
      const issue = (code: AnalyticsPlanIssueCode): void => {
        codes.add(code);
      };
      for (const predicate of reportPredicates(report)) {
        const predicateCodes = new Set<AnalyticsPlanIssueCode>();
        validatePredicate(predicate, plan.catalog, (code) => predicateCodes.add(code));
        for (const code of predicateCodes) issue(code);
        if (predicateCodes.size === 0 && !predicateCanMatchCatalog(predicate, plan.catalog))
          issue("impossible_predicate");
      }
      if ("breakdown" in report && report.breakdown?.field === "property") {
        const key = report.breakdown.key;
        if (!plan.catalog.some((entry) => Object.hasOwn(entry.properties, key)))
          issue("unknown_breakdown");
      }
      for (const code of [...codes].sort()) {
        if (issues.length < 100) issues.push({ code, report_index });
      }
    }
    return issues.length === 0 ? { valid: true, plan } : { valid: false, issues };
  } catch {
    return invalid("invalid_schema");
  }
}
