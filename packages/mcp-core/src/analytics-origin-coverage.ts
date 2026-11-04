import type { OpenAiToolName } from "./openai-contract.js";
const tools = new Set<OpenAiToolName>([
  "get_usage_summary",
  "get_route_metrics",
  "get_journey_patterns",
  "get_device_breakdown",
  "get_referrer_metrics",
  "get_action_metrics",
  "list_funnel_metrics",
  "get_funnel_analysis",
  "get_incident_impact"
]);
const guid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Keep the frozen structured contract; convey aggregation semantics in ordinary MCP text. */
export function analyticsOriginCoverageNote(
  name: OpenAiToolName,
  output: unknown
): string | undefined {
  if (!tools.has(name) || !record(output)) return undefined;
  const window = output["summary"] ?? output["window"];
  if (!record(window) || !record(window["origin_scope"])) return undefined;
  const scope = window["origin_scope"],
    origins = scope["origin_project_ids"];
  if (
    scope["unique_count_semantics"] !== "sum_of_origin_scoped_counts" ||
    !Array.isArray(origins) ||
    origins.length < 1 ||
    origins.length > 1000 ||
    !origins.every((id) => typeof id === "string" && guid.test(id)) ||
    new Set(origins).size !== origins.length
  )
    return undefined;
  return `Query coverage includes ${origins.length} original project namespace${origins.length === 1 ? "" : "s"}. Visitor and session identities remain scoped to their origin, and unique counts sum each origin's counts.`;
}
