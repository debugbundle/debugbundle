import type { IncidentRecord } from "./api.js";

export const severityVariantMap: Record<
  IncidentRecord["severity"],
  "secondary" | "warning" | "destructive"
> = {
  low: "secondary",
  medium: "secondary",
  high: "warning",
  critical: "destructive"
};

export const statusVariantMap: Record<
  IncidentRecord["status"],
  "destructive" | "warning" | "success"
> = {
  open: "warning",
  resolved: "success",
  regressed: "destructive"
};

export function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

export function formatServiceName(value: string | null): string {
  return value ?? "Unknown service";
}

export type ProjectIncidentSortField =
  | "title"
  | "service_name"
  | "environment"
  | "severity"
  | "status"
  | "occurrence_count"
  | "last_seen_at";
