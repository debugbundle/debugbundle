import type { ReportAllowance } from "../../../../../packages/smart-reports/src/report-allowance.js";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/card.js";
import { Notice } from "../ui/notice.js";
export function ReportAllowanceCard({
  value,
  error = false
}: {
  value: ReportAllowance | null;
  error?: boolean;
}): JSX.Element | null {
  if (!value && !error) return null;
  const time = (at: string): string => `${at.slice(0, 16).replace("T", " ")} UTC`;
  return (
    <Card role="region" aria-label="Shared report allowance">
      <CardHeader>
        <CardTitle>
          {value
            ? `${value.remaining} of ${value.limit} reports remaining`
            : "Shared report allowance"}
        </CardTitle>
        <CardDescription>
          One pool for scheduled and manual reports. Annual billing uses monthly allowances.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {value ? (
          <>
            <p>
              {value.used} used. {value.scope_complete ? "" : "At least "}
              {value.scheduled_remaining} scheduled reports are expected before this window ends.
            </p>
            <p className="text-sm text-muted-foreground">
              {time(value.window.starts_at)} to {time(value.window.ends_at)}.
            </p>
            {!value.scope_complete ? (
              <p className="text-sm text-muted-foreground">
                This forecast covers schedules you can read. Other schedules and manual reports can
                also use the shared pool.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                This is a forecast of current schedules; manual reports and schedule changes can
                alter demand.
              </p>
            )}
            {value.schedule_exceeds_remaining ? (
              <Notice>
                Scheduled demand exceeds the remaining allowance. Runs beyond the allowance will be
                skipped.
              </Notice>
            ) : null}
          </>
        ) : (
          <p>The shared allowance could not be loaded. Refresh to try again.</p>
        )}
      </CardContent>
    </Card>
  );
}
