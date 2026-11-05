import { PencilIcon, Trash2Icon } from "lucide-react";
import type { AlertRecord } from "../../lib/api.js";
import type { SlackDestinationRecord } from "../../lib/slack-api.js";
import {
  formatAlertChannelWithDestination,
  canManageAlertRule,
  formatAlertCondition,
  formatSeverityLifecycleScopeForAlert,
  formatSeverity,
  formatAlertCooldown
} from "../../lib/alert-form.js";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "../ui/alert-dialog.js";
import { Badge } from "../ui/badge.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table.js";
import { TableActionButton } from "./table-action-button.js";
import { AlertScopeSummary } from "./alert-scope-summary.js";

export function AlertRulesTable({
  alerts,
  slackDestinations,
  userId,
  effectiveRole,
  onEdit,
  onDelete
}: {
  alerts: AlertRecord[];
  slackDestinations: SlackDestinationRecord[];
  userId: string | undefined;
  effectiveRole: Parameters<typeof canManageAlertRule>[2];
  onEdit: (alert: AlertRecord) => void;
  onDelete: (alertId: string) => Promise<void>;
}): JSX.Element {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Channel</TableHead>
          <TableHead>Condition</TableHead>
          <TableHead>Scope</TableHead>
          <TableHead>Notify on</TableHead>
          <TableHead>Minimum severity</TableHead>
          <TableHead>Cooldown</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {alerts.map((alert) => (
          <TableRow key={alert.alert_id}>
            <TableCell className="font-medium">
              {formatAlertChannelWithDestination(alert, slackDestinations)}
            </TableCell>
            <TableCell>{formatAlertCondition(alert.condition_type)}</TableCell>
            <TableCell className="max-w-xs whitespace-normal break-words">
              <AlertScopeSummary alert={alert} />
            </TableCell>
            <TableCell>{formatSeverityLifecycleScopeForAlert(alert)}</TableCell>
            <TableCell>
              {alert.severity_min === null ? "Any" : formatSeverity(alert.severity_min)}
            </TableCell>
            <TableCell>{formatAlertCooldown(alert.cooldown_seconds)}</TableCell>
            <TableCell>
              <Badge variant={alert.is_enabled ? "success" : "secondary"}>
                {alert.is_enabled ? "enabled" : "disabled"}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              {canManageAlertRule(alert, userId, effectiveRole) ? (
                <div className="flex items-center justify-end gap-1">
                  <TableActionButton label="Edit" icon={PencilIcon} onClick={() => onEdit(alert)} />
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <TableActionButton label="Delete" icon={Trash2Icon} />
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete alert rule</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently remove this alert rule. Incident lifecycle events
                          will no longer be delivered through this channel.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => void onDelete(alert.alert_id)}>
                          Delete alert
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">-</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
