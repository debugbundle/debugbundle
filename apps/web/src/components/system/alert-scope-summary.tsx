import { formatAlertScope } from "../../lib/alert-scope.js";
import type { AlertRecord } from "../../lib/api-types.js";

export function AlertScopeSummary({
  alert,
  mode = "effective"
}: {
  alert: Pick<AlertRecord, "scope" | "service_id">;
  mode?: "effective" | "allowed";
}): JSX.Element {
  return <span>{formatAlertScope(alert, mode)}</span>;
}
