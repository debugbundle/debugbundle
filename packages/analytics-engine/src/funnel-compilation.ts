import { createHash } from "node:crypto";
import {
  AnalyticsOrderedFunnelDefinitionSchema,
  type AnalyticsOrderedFunnelDefinition,
  type AnalyticsPredicate,
  type SemanticAnalyticsEvent
} from "../../shared-types/src/index.js";
import type { SemanticAnalyticsAdmissionResult } from "../../event-normalizer/src/semantic-analytics-admission.js";
import { stableJson } from "../../event-normalizer/src/canonical-json.js";
import { FunnelFactSchema, type FunnelFact } from "./funnel-evidence.js";

type AcceptedEvent = Extract<SemanticAnalyticsAdmissionResult, { accepted: true }>;
type Exclusion =
  | "invalid_definition"
  | "scope_mismatch"
  | "stale_scope"
  | "unlinked_subject"
  | "no_match"
  | "invalid_evidence";
export type FunnelCompilationResult =
  | { status: "included"; fact: FunnelFact }
  | { status: "excluded"; reason: Exclusion };

/** Predicates have already passed the finite definition schema and catalog activation checks. */
export function matchesAnalyticsPredicate(
  predicate: AnalyticsPredicate,
  event: SemanticAnalyticsEvent
): boolean {
  if ("all" in predicate)
    return predicate.all.every((child) => matchesAnalyticsPredicate(child, event));
  if ("any" in predicate)
    return predicate.any.some((child) => matchesAnalyticsPredicate(child, event));
  switch (predicate.field) {
    case "event_name":
      return predicate.values.includes(event.payload.name);
    case "event_kind":
      return predicate.values.includes(event.payload.kind);
    case "producer":
      return predicate.values.includes(event.producer.kind);
    case "property":
      return (
        Object.hasOwn(event.payload.properties, predicate.key) &&
        predicate.values.some((value) => value === event.payload.properties[predicate.key])
      );
  }
}

function subjectKey(
  definition: AnalyticsOrderedFunnelDefinition,
  accepted: AcceptedEvent,
  portfolio: boolean
): string | null {
  const correlation = accepted.event.correlation;
  let components: unknown[];
  if (definition.subject === "session") {
    if (correlation.session_id === null) return null;
    components = ["session", accepted.origin_project_id, correlation.session_id];
  } else {
    const identityScope = accepted.identity_scope;
    if (
      identityScope === null ||
      accepted.identity_verification === null ||
      correlation.namespace_revision === null
    )
      return null;
    if (
      !portfolio &&
      definition.scope.kind === "space" &&
      stableJson(identityScope) !== stableJson(definition.scope)
    )
      return null;
    const reference =
      correlation[
        `${definition.subject === "anonymous" ? "anonymous" : definition.subject}_id_hash`
      ];
    if (reference === null) return null;
    components = [definition.subject, identityScope, correlation.namespace_revision, reference];
  }
  // Scope/type/revision framing prevents coincident opaque values from becoming an identity join.
  return createHash("sha256").update(stableJson(components)).digest("hex");
}

function breakdownFor(
  definition: AnalyticsOrderedFunnelDefinition,
  event: SemanticAnalyticsEvent
): FunnelFact["breakdown"] {
  const breakdown = definition.breakdown;
  if (breakdown === null) return { kind: "missing" };
  let value: string | boolean | null | undefined;
  switch (breakdown.field) {
    case "property":
      value = Object.hasOwn(event.payload.properties, breakdown.key)
        ? event.payload.properties[breakdown.key]
        : undefined;
      break;
    case "device_type":
      value = event.payload.client?.device_type;
      break;
    case "auth_state":
      value = event.payload.client?.auth_state;
      break;
    default:
      value = event.payload.acquisition?.[breakdown.field];
  }
  return value === undefined ? { kind: "missing" } : { kind: "value", value };
}

/** The caller supplies an admitted event and a currently authorized, activated definition snapshot. */
export function compileOrderedFunnelFact(
  definitionInput: unknown,
  scopeRevision: number,
  accepted: AcceptedEvent
): FunnelCompilationResult {
  return compileFunnelFact(definitionInput, scopeRevision, accepted, false);
}

/** A portfolio fact is evaluated only within its authenticated origin project. */
export function compileOrderedPortfolioFunnelFact(
  definitionInput: unknown,
  scopeRevision: number,
  accepted: AcceptedEvent
): FunnelCompilationResult {
  return compileFunnelFact(definitionInput, scopeRevision, accepted, true);
}

function compileFunnelFact(
  definitionInput: unknown,
  scopeRevision: number,
  accepted: AcceptedEvent,
  portfolio: boolean
): FunnelCompilationResult {
  const exclude = (reason: Exclusion): FunnelCompilationResult => ({ status: "excluded", reason });
  try {
    const parsed = AnalyticsOrderedFunnelDefinitionSchema.safeParse(definitionInput);
    if (!parsed.success || !Number.isSafeInteger(scopeRevision) || scopeRevision < 1)
      return exclude("invalid_definition");
    const definition = parsed.data;
    if (portfolio) {
      if (
        definition.scope.kind !== "space" ||
        accepted.scope.kind !== "project" ||
        accepted.scope.project_id !== accepted.origin_project_id ||
        (accepted.identity_scope !== null &&
          (accepted.identity_scope.kind !== "project" ||
            accepted.identity_scope.project_id !== accepted.origin_project_id))
      )
        return exclude("scope_mismatch");
    } else if (definition.scope.kind === "project") {
      if (definition.scope.project_id !== accepted.origin_project_id)
        return exclude("scope_mismatch");
    } else {
      if (stableJson(definition.scope) !== stableJson(accepted.scope))
        return exclude("scope_mismatch");
      if (accepted.scope_revision !== scopeRevision) return exclude("stale_scope");
    }
    const matches = definition.steps.map((step) =>
      matchesAnalyticsPredicate(step.predicate, accepted.event)
    );
    if (!matches.some(Boolean)) return exclude("no_match");
    const subject = subjectKey(definition, accepted, portfolio);
    if (subject === null) return exclude("unlinked_subject");
    const fact = FunnelFactSchema.safeParse({
      subject: definition.subject,
      scope: definition.scope,
      scope_revision: scopeRevision,
      definition_key: definition.key,
      definition_revision: definition.revision,
      event_id: accepted.event.event_id,
      origin_project_id: accepted.origin_project_id,
      content_hash: accepted.content_hash.slice(7),
      subject_key: subject,
      occurred_at: accepted.event.occurred_at,
      received_at: accepted.received_at,
      producer_kind: accepted.event.producer.kind,
      stream_id: accepted.event.producer.stream_id,
      sequence: accepted.event.producer.sequence,
      matches,
      breakdown: breakdownFor(definition, accepted.event)
    });
    return fact.success ? { status: "included", fact: fact.data } : exclude("invalid_evidence");
  } catch {
    return exclude("invalid_evidence");
  }
}
