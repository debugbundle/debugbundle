import type { SemanticAnalyticsEvent } from "../../shared-types/src/analytics-semantic.js";

export type SemanticAnalyticsSubjectKind = "anonymous" | "user" | "account";

/** A protected identity event has at most one reference of each kind. */
export function semanticAnalyticsSubjectRefs(
  event: SemanticAnalyticsEvent
): Array<{ kind: SemanticAnalyticsSubjectKind; ref: string }> {
  return (
    [
      ["anonymous", event.correlation.anonymous_id_hash],
      ["user", event.correlation.user_id_hash],
      ["account", event.correlation.account_id_hash]
    ] as const
  )
    .filter((entry): entry is [SemanticAnalyticsSubjectKind, string] => entry[1] !== null)
    .map(([kind, ref]) => ({ kind, ref }));
}
