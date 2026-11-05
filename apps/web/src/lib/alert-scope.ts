import {
  AlertScopeSchema,
  type AlertScope
} from "../../../../packages/shared-types/src/alert-scope.js";
import type { AlertRecord } from "./api-types.js";

/** Complete a pending inventory without undoing accepted writes. Metadata can
 * attach only to the same revision/filter; deleted rules must not reappear. */
export function reconcileAlertScopeRead(
  current: AlertRecord[] | null,
  records: AlertRecord[],
  includeMissing: boolean,
  deletedIds: ReadonlySet<string>
): AlertRecord[] {
  const known = current ?? [];
  const knownIds = new Set(known.map((alert) => alert.alert_id));
  const rows = includeMissing
    ? [...records.filter((alert) => !knownIds.has(alert.alert_id)), ...known]
    : known;
  const byId = new Map(records.map((record) => [record.alert_id, record]));
  return rows
    .filter((alert) => !deletedIds.has(alert.alert_id))
    .map((alert) => {
      const record = byId.get(alert.alert_id);
      return record?.updated_at === alert.updated_at && record.service_id === alert.service_id
        ? { ...alert, scope: record.scope ?? null }
        : alert;
    });
}

export function getAlertScope(alert: Pick<AlertRecord, "scope" | "service_id">): AlertScope | null {
  const parsed = AlertScopeSchema.safeParse(alert.scope);
  if (!parsed.success || (parsed.data.service_filter?.service_id ?? null) !== alert.service_id) {
    return null;
  }
  return parsed.data;
}

export function formatAlertScope(
  alert: Pick<AlertRecord, "scope" | "service_id">,
  mode: "effective" | "allowed" = "effective"
): string {
  const scope = getAlertScope(alert);
  if (scope === null) return "Scope unavailable";
  if (mode === "effective" && scope.service_filter !== null) {
    return `${scope.service_filter.name} (${scope.service_filter.environment})`;
  }
  if (scope.covers_current_project) return "All services";
  if (scope.service_count === 0) return "No services currently observed in this scope";
  const names = scope.services.slice(0, 3).map((service) => service.name);
  const remaining = scope.service_count - names.length;
  if (names.length === 0) return `${remaining} services in this scope`;
  return `${names.join(", ")}${remaining > 0 ? ` and ${remaining} more` : ""}`;
}
