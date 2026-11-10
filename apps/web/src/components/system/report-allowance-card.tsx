import type { ReportAllowance } from "../../../../../packages/smart-reports/src/report-allowance.js";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/card.js";
import { Notice } from "../ui/notice.js";
import { reportTimeLabel } from "../../../../../packages/smart-reports/src/report-presentation.js";
export function ReportAllowanceCard({
  value,
  error = false
}: {
  value: ReportAllowance | null;
  error?: boolean;
}): JSX.Element | null {
  if (!value && !error) return null;
  return (
    <Card role="region" aria-label="Shared report allowance">
      <CardHeader>
        <CardTitle>
          {value
            ? `${value.remaining} of ${value.limit} reports remaining`
            : "Shared report allowance"}
        </CardTitle>
        <CardDescription>
          {value
            ? `${value.used} used · ${value.scope_complete ? "" : "At least "}${value.scheduled_remaining} scheduled before the reset · Resets ${reportTimeLabel(value.window.ends_at)}`
            : "Scheduled and manual reports share this allowance."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {value ? (
          <>
            {!value.scope_complete ? (
              <p className="text-sm text-muted-foreground">
                This forecast covers schedules you can read. Other schedules and manual reports can
                also use the shared pool.
              </p>
            ) : null}
            <details className="text-sm text-muted-foreground">
              <summary className="cursor-pointer focus-visible:outline-ring">
                How the allowance works
              </summary>
              <p className="mt-2">
                Scheduled and manual reports share this pool. Annual billing uses monthly
                allowances. This window runs from {reportTimeLabel(value.window.starts_at)} to{" "}
                {reportTimeLabel(value.window.ends_at)}. Scheduled demand is a forecast; manual
                reports and schedule changes can alter it.
              </p>
            </details>
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
