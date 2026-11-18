import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import {
  OfferPerformanceQuerySchema,
  type OfferPerformanceReportSchema
} from "../../../../../packages/referrals/src/offer-performance.js";
import { offerApi, offerErrorMessage } from "../../lib/offer-api.js";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/card.js";
import { Field, FieldLabel, FieldGroup, FieldError } from "../ui/field.js";
import { Input } from "../ui/input.js";
import { Button } from "../ui/button.js";
import { Notice } from "../ui/notice.js";
import { Skeleton } from "../ui/skeleton.js";
type Report = z.infer<typeof OfferPerformanceReportSchema>;
type Query = z.infer<typeof OfferPerformanceQuerySchema>;
const money = (minor: number): string =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(minor / 100);
const day = (value: Date): string => value.toISOString().slice(0, 10);
export function OfferPerformanceReport(): JSX.Element {
  const today = new Date(),
    initialFrom = day(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))),
    initialTo = day(new Date(Date.now() + 86400000));
  const [from, setFrom] = useState(initialFrom),
    [to, setTo] = useState(initialTo),
    [version, setVersion] = useState(""),
    [query, setQuery] = useState<Query>({
      from: initialFrom + "T00:00:00.000Z",
      to: initialTo + "T00:00:00.000Z"
    }),
    [report, setReport] = useState<Report | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    setLoading(true);
    setReport(null);
    setError(null);
    void offerApi
      .execute("operator_performance", query)
      .then((value) => {
        if (current === generation.current) setReport(value.performance);
      })
      .catch((reason) => {
        if (current === generation.current) setError(offerErrorMessage(reason));
      })
      .finally(() => {
        if (current === generation.current) setLoading(false);
      });
    return () => {
      generation.current++;
    };
  }, [query]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Programme performance</CardTitle>
        <CardDescription>
          Claims in the selected UTC window, with their current lifetime financial totals. Money
          comes from verified receipts and the commission ledger. Visits are not counted as people.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const parsed = OfferPerformanceQuerySchema.safeParse({
              from: from + "T00:00:00.000Z",
              to: to + "T00:00:00.000Z",
              ...(version.trim() ? { version_id: version.trim() } : {})
            });
            if (!parsed.success) {
              setError(
                "Choose an increasing UTC date window of at most 366 days and a valid version ID, or leave the version blank."
              );
              return;
            }
            setQuery(parsed.data);
          }}
        >
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="offer-report-from">Claimed from (UTC)</FieldLabel>
                <Input
                  id="offer-report-from"
                  type="date"
                  value={from}
                  disabled={loading}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="offer-report-to">Claimed before (UTC, exclusive)</FieldLabel>
                <Input
                  id="offer-report-to"
                  type="date"
                  value={to}
                  disabled={loading}
                  onChange={(e) => setTo(e.target.value)}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="offer-report-version">Offer version ID (optional)</FieldLabel>
              <Input
                id="offer-report-version"
                value={version}
                disabled={loading}
                onChange={(e) => setVersion(e.target.value)}
              />
            </Field>
            <div>
              <Button type="submit" variant="outline" disabled={loading}>
                Update report
              </Button>
            </div>
          </FieldGroup>
        </form>
        {error ? (
          <Notice tone="warning">
            <FieldError>{error}</FieldError>
            <Button variant="outline" onClick={() => setQuery({ ...query })}>
              Retry report
            </Button>
          </Notice>
        ) : null}
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : report ? (
          <>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["Claims", String(report.claims)],
                ["Active trials", String(report.active_trials)],
                ["First paid conversions", String(report.paid_conversions)],
                ["Base cash collected", money(report.base_cash_collected_minor)],
                ["Base cash retained after refunds", money(report.base_cash_retained_minor)],
                ["Base cash reversed", money(report.base_cash_reversed_minor)],
                ["Invoice base discounts", money(report.base_discount_minor)],
                ["Commission earned, net of reversals", money(report.commission_net_minor)],
                ["Commission recorded as paid", money(report.commission_paid_minor)],
                ["Commission reversals", money(report.commission_reversed_minor)],
                ["Disputed invoices", String(report.disputed_invoices)],
                ["Invoices with allocation holds", String(report.held_invoices)]
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd className="text-xl font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            <Notice title="Reconciliation coverage">
              {report.reconciled_claims} of {report.claims} claims have a receipt projection;{" "}
              {report.unreconciled_claims} have none yet.{" "}
              {report.oldest_observation ? (
                <>
                  Observations range from {new Date(report.oldest_observation).toUTCString()} to{" "}
                  {new Date(report.latest_observation!).toUTCString()}.{" "}
                </>
              ) : null}
              {!report.discount_coverage_complete
                ? "Some invoice discount facts are unavailable; the displayed discount total is incomplete. "
                : null}
              Base cash excludes tax, capacity and noncash credit. Invoice discounts are granted
              amounts before refunds. Disputes and allocation holds require review; this report does
              not establish payout availability. Recorded paid commission can exceed net earnings
              after a later reversal. The existing payout workflow retains its separate authority.
            </Notice>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
