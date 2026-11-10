export function formatAnalyticsLabel(value: string): string {
  return value
    .split("_")
    .map((part) => (part.length === 0 ? part : `${part[0]!.toUpperCase()}${part.slice(1)}`))
    .join(" ");
}

const categoryDimensions = new Set([
  "device_type",
  "auth_state",
  "browser",
  "browser_family",
  "os",
  "os_family",
  "viewport_bucket"
]);
const platformLabels = new Map([
  ["ios", "iOS"],
  ["ipados", "iPadOS"],
  ["macos", "macOS"],
  ["mac_os", "macOS"]
]);

export function formatAnalyticsDimensionValue(dimension: string, value: string): string {
  if (!categoryDimensions.has(dimension)) return value;
  return platformLabels.get(value.toLowerCase()) ?? formatAnalyticsLabel(value);
}
