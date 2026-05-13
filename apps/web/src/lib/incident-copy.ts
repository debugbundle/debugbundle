const MATCHED_FIELD_LABELS: Record<string, string> = {
  error_type: "error type",
  http_method: "HTTP method",
  http_status: "HTTP status",
  normalized_message: "normalized message",
  request_path: "request path",
  route_template: "route template",
  top_3_frames: "top 3 frames"
};

export function formatIncidentMatchedFields(matchedFields: string[]): string {
  const isRequestAnomaly = matchedFields.includes("request_anomaly");
  const displayFields = matchedFields.filter((field) => field !== "request_anomaly");

  if (displayFields.length === 0) {
    return isRequestAnomaly ? "Request anomaly threshold crossed." : "Grouping fields unavailable.";
  }

  const fieldSummary = formatList(displayFields.map((field) => MATCHED_FIELD_LABELS[field] ?? field.replace(/_/g, " ")));
  return isRequestAnomaly
    ? `Request anomaly threshold crossed. Grouped by ${fieldSummary}.`
    : `Grouped by ${fieldSummary}.`;
}

function formatList(values: string[]): string {
  if (values.length === 1) {
    return values[0] ?? "";
  }

  if (values.length === 2) {
    return `${values[0] ?? ""} and ${values[1] ?? ""}`;
  }

  const leadingValues = values.slice(0, -1).join(", ");
  const finalValue = values.at(-1) ?? "";
  return `${leadingValues}, and ${finalValue}`;
}