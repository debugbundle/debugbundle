import { stableJson } from "../../event-normalizer/src/canonical-json.js";
import type { AnalyticsCatalogEntry } from "../../shared-types/src/index.js";

/** Entry-local revision, description and expected SDK coverage do not redefine a fact. */
export function catalogEntryMeaning(entry: AnalyticsCatalogEntry): string {
  return stableJson({
    producers: [...entry.producers].sort(),
    purpose: entry.purpose,
    success_boundary: entry.success_boundary,
    properties: Object.fromEntries(
      Object.entries(entry.properties)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, definition]) => [
          key,
          definition.type === "enum"
            ? {
                type: definition.type,
                required: definition.required,
                values: [...definition.values].sort()
              }
            : definition
        ])
    ),
    measurements: Object.fromEntries(
      Object.entries(entry.measurements).sort(([left], [right]) => left.localeCompare(right))
    )
  });
}
