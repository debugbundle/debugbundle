import type { ReportEmailDelivery } from "../../../../../packages/smart-reports/src/report-email.js";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/card.js";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "../ui/table.js";
import { Badge } from "../ui/badge.js";
import { Notice } from "../ui/notice.js";
const labels: Record<ReportEmailDelivery["status"], string> = {
  queued: "Queued",
  sending: "Sending",
  accepted: "Accepted by provider",
  failed: "Failed",
  uncertain: "Uncertain",
  suppressed: "Withheld",
  cancelled: "Cancelled"
};
const reasons: Record<string, string> = {
  provider_uncertain:
    "The provider may have accepted this email. It will not be sent again automatically.",
  worker_recovered:
    "Delivery was interrupted after sending may have begun. It will not be sent again automatically.",
  provider_rejected:
    "The provider rejected this send. Safe retries reuse the saved report and do not call AI.",
  notification_suppressed: "Current email preferences or a pause withheld this entire report.",
  notification_allowance_exhausted: "The notification allowance was exhausted.",
  recipient_unavailable: "The saved recipient is unavailable or their email is no longer verified.",
  recipient_access_lost: "The recipient can no longer read every project in this report.",
  creator_access_lost: "The saved creator can no longer manage the entire report scope.",
  plan_lost: "Email delivery requires current report entitlement.",
  report_unavailable: "The report was removed or its privacy/access requirements changed.",
  delivery_expired:
    "The delivery window expired. The report may still be readable until its separate expiry."
};
function recipientLabel(
  delivery: ReportEmailDelivery,
  index: number,
  recipientIds: string[],
  currentUserId: string | undefined
): string {
  if (delivery.recipient_user_id === null) return "Recipient no longer available";
  if (delivery.recipient_user_id === currentUserId) return "You";
  const position = recipientIds.indexOf(delivery.recipient_user_id);
  return `Saved recipient ${(position < 0 ? index : position) + 1}`;
}
export function ReportDeliveryStates({
  deliveries,
  recipientIds,
  currentUserId
}: {
  deliveries: ReportEmailDelivery[] | null;
  recipientIds: string[];
  currentUserId?: string;
}): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Email delivery</CardTitle>
        <CardDescription>
          Each saved recipient is checked again before sending. Provider acceptance is distinct from
          inbox delivery.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {deliveries === null ? (
          <Notice tone="warning">
            Delivery states could not be loaded. Refresh this report to try again; the canonical
            report remains available.
          </Notice>
        ) : !deliveries.length ? (
          <p className="text-sm text-muted-foreground">
            Recipient delivery is being prepared. Refresh for current states.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recipient</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.map((delivery, index) => (
                <TableRow key={delivery.id}>
                  <TableCell>
                    {recipientLabel(delivery, index, recipientIds, currentUserId)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{labels[delivery.status]}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {delivery.reason
                      ? (reasons[delivery.reason] ??
                        "Delivery could not be completed. Review the current report settings.")
                      : delivery.accepted_at
                        ? `Accepted ${delivery.accepted_at}`
                        : "Waiting for the worker."}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
