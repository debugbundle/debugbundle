import { useEffect, useState } from "react";
import { ChartNoAxesColumnIcon } from "lucide-react";
import type {
  ReferralAnalytics,
  ReferralAnalyticsDays
} from "../../../../../packages/referrals/src/referral-analytics-contract.js";
import { OfferApiError } from "../../../../../packages/referral-client/src/offer-api.js";
import { offerApi } from "../../lib/offer-api.js";
import { formatReferralAmount } from "../../lib/referral-api.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.js";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../ui/select.js";
import { Skeleton } from "../ui/skeleton.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table.js";
import { LoadErrorCallout } from "./load-error-callout.js";
import { OfferProgrammeDetails } from "./offer-programme-details.js";
import { ResourceEmptyState } from "./resource-empty-state.js";
import { CountLineChart } from "./count-line-chart.js";

const ranges = ["7", "30", "90"] as const;
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" });
const chartDateFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  timeZone: "UTC"
});
const numberFormat = new Intl.NumberFormat();
const metrics = [
  {
    key: "visits",
    label: "Link visits",
    format: (value: number) => numberFormat.format(value)
  },
  {
    key: "referred_accounts",
    label: "Referred accounts",
    format: (value: number) => numberFormat.format(value)
  },
  {
    key: "first_paid_referrals",
    label: "First paid referrals",
    format: (value: number) => numberFormat.format(value)
  },
  {
    key: "net_commission_minor",
    label: "Net commission",
    format: (value: number) => `${formatReferralAmount(value)} USD`
  }
] as const;

function formatMetric(value: number | null | undefined, format: (value: number) => string): string {
  return value == null ? "—" : format(value);
}

export function CreatorReferralAnalytics({ active }: { active: boolean }): JSX.Element {
  const [range, setRange] = useState<ReferralAnalyticsDays>("30");
  const [attempt, setAttempt] = useState(0);
  const [report, setReport] = useState<ReferralAnalytics | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "enrolment" | "error">("loading");
  useEffect(() => {
    if (!active) return;
    let current = true;
    setStatus("loading");
    void offerApi.execute("creator_analytics", { days: range }).then(
      (result) => {
        if (!current) return;
        setReport(result);
        setStatus("ready");
      },
      (error: unknown) => {
        if (!current) return;
        setStatus(
          error instanceof OfferApiError && error.code === "creator_membership_required"
            ? "enrolment"
            : "error"
        );
      }
    );
    return () => {
      current = false;
    };
  }, [active, range, attempt]);
  const hasActivity = report?.daily.some((day) => metrics.some(({ key }) => Boolean(day[key])));

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <CardTitle>Referral activity</CardTitle>
          <CardDescription>Daily totals use UTC, including today so far.</CardDescription>
        </div>
        <Select
          value={range}
          onValueChange={(value) => {
            const next = ranges.find((days) => days === value);
            if (next && next !== range) {
              setStatus("loading");
              setRange(next);
            }
          }}
        >
          <SelectTrigger aria-label="Date range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {ranges.map((days) => (
                <SelectItem key={days} value={days}>
                  Last {days} days
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {status === "loading" ? (
          <Skeleton className="h-24 w-full" aria-label="Loading referral activity" />
        ) : status === "error" ? (
          <LoadErrorCallout
            title="Referral activity could not be loaded"
            pending={false}
            onRetry={() => {
              setStatus("loading");
              setAttempt((count) => count + 1);
            }}
          />
        ) : status === "enrolment" ? (
          <ResourceEmptyState
            icon={ChartNoAxesColumnIcon}
            title="Join a referral programme"
            description="Your referral activity will appear here once you join."
          />
        ) : report ? (
          <>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {metrics.map(({ key, label, format }) => (
                <div key={key} className="flex flex-col gap-1">
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd className="text-xl font-semibold tabular-nums">
                    {formatMetric(report.totals[key], format)}
                  </dd>
                </div>
              ))}
            </dl>
            {active && hasActivity ? (
              <CountLineChart
                className="[--chart-2:var(--referral-accent)]"
                label="Daily link visits and first paid referrals in UTC. Exact values are in Daily figures."
                dates={report.daily.map(({ date }) => chartDateFormat.format(new Date(date)))}
                series={[
                  {
                    label: "Link visits",
                    values: report.daily.map(({ visits }) => visits ?? null)
                  },
                  {
                    label: "First paid referrals",
                    values: report.daily.map(({ first_paid_referrals }) => first_paid_referrals)
                  }
                ]}
              />
            ) : null}
            {hasActivity ? (
              <OfferProgrammeDetails label="Daily figures">
                <Table aria-label="Daily referral figures">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date (UTC)</TableHead>
                      {metrics.map(({ key, label }) => (
                        <TableHead key={key} className="text-right">
                          {label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...report.daily].reverse().map((day) => (
                      <TableRow key={day.date}>
                        <TableCell>{dateFormat.format(new Date(day.date))}</TableCell>
                        {metrics.map(({ key, format }) => (
                          <TableCell key={key} className="text-right tabular-nums">
                            {formatMetric(day[key], format)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </OfferProgrammeDetails>
            ) : (
              <p className="text-sm text-muted-foreground">No activity in this period.</p>
            )}
            <p className="text-sm text-muted-foreground">
              {report.visit_tracking_started_at
                ? `Link visits are counted once per link and browser every 24 hours. Tracking began ${dateFormat.format(new Date(report.visit_tracking_started_at))}. `
                : ""}
              First paid referrals are dated by the start of the first qualifying paid service. Net
              commission includes refunds and other adjustments recorded in the period.
            </p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
