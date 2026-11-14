import type { EventEnvelope } from "../../shared-types/src/index.js";
import type { BundleProbeDataItem } from "./index.js";

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
export function toProbeDedupKey(item: BundleProbeDataItem): string {
  return `${item.label}|${item.timestamp}|${item.activation_id ?? "null"}|${stableStringify(item.data)}`;
}
export function collectInlineProbeItems(envelope: EventEnvelope): BundleProbeDataItem[] {
  if (envelope.event_type !== "backend_exception" && envelope.event_type !== "frontend_exception")
    return [];
  return (envelope.payload.probe_data?.items ?? []).map((item) => ({
    label: item.label,
    data: item.data,
    timestamp: new Date(item.timestamp).toISOString(),
    activation_id: item.activation_id
  }));
}

/** Identical local/worker projection of already validated protected probe data. */
export function mergeProbeDataItems(items: readonly BundleProbeDataItem[]): BundleProbeDataItem[] {
  const deduped = new Map<string, BundleProbeDataItem>();
  for (const item of items) {
    const key = toProbeDedupKey(item);
    if (!deduped.has(key)) deduped.set(key, item);
  }
  return [...deduped.values()].sort((a, b) =>
    a.timestamp === b.timestamp
      ? a.label.localeCompare(b.label)
      : a.timestamp.localeCompare(b.timestamp)
  );
}
