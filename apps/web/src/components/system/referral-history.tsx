import { useEffect, useRef, useState } from "react";
import { BanknoteIcon, UsersIcon } from "lucide-react";
import type { ReferralClient } from "../../../../../packages/referrals/src/referral-contracts.js";
import type { ReferralPayout } from "../../../../../packages/referrals/src/referral-ledger-contracts.js";
import { referralApi, formatReferralAmount } from "../../lib/referral-api.js";
import { LoadErrorCallout } from "./load-error-callout.js";
import { Button } from "../ui/button.js";
import { Badge } from "../ui/badge.js";
import { Skeleton } from "../ui/skeleton.js";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "../ui/empty.js";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table.js";

type Props = (
  | { kind: "clients" }
  | { kind: "payouts"; operator?: boolean; onReview?: (payout: ReferralPayout) => void }
) & { refreshVersion?: number };
const statuses: Record<string, string> = {
  awaiting_purchase: "Awaiting Business purchase",
  commission_period_active: "Commission period active",
  commission_period_ended: "Commission period ended",
  ineligible: "Ineligible",
  claimed: "Claimed",
  uncertain: "Uncertain",
  paid: "Paid"
};
export function ReferralHistory(props: Props): JSX.Element {
  const { kind, refreshVersion = 0 } = props,
    operator = kind === "payouts" && props.operator === true;
  const [rows, setRows] = useState<ReferralClient[] | ReferralPayout[] | null>(null),
    [cursors, setCursors] = useState<string[]>([]),
    [error, setError] = useState(false),
    [revision, setRevision] = useState(0);
  const generation = useRef(0),
    before = cursors.at(-1);
  useEffect(() => {
    const current = ++generation.current;
    setRows(null);
    setError(false);
    const page = { limit: 25, ...(before === undefined ? {} : { before }) };
    const read =
      kind === "clients"
        ? referralApi.clients(page)
        : operator
          ? referralApi.operatorPayouts(page)
          : referralApi.payouts(page);
    void read
      .then((result) => {
        if (current === generation.current) setRows(result);
      })
      .catch(() => {
        if (current === generation.current) setError(true);
      });
    return () => {
      generation.current++;
    };
  }, [kind, operator, before, revision, refreshVersion]);
  const title = kind === "clients" ? "Referred clients" : "Payments";
  const next = (): void => {
    const last = rows?.at(-1);
    if (last)
      setCursors((previous) => [...previous, "client_id" in last ? last.client_id : last.batch_id]);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {kind === "clients"
            ? "Private client references and programme status. Referrals grant no access to a client's workspace."
            : "Manual payments and their recorded external references."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? (
          <LoadErrorCallout
            title={`${title} could not be loaded`}
            pending={false}
            onRetry={() => setRevision((value) => value + 1)}
          />
        ) : rows === null ? (
          <Skeleton className="h-24 w-full" />
        ) : rows.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                {kind === "clients" ? <UsersIcon /> : <BanknoteIcon />}
              </EmptyMedia>
              <EmptyTitle>
                {cursors.length
                  ? "No more records"
                  : `No ${kind === "clients" ? "referred clients" : "payments"} yet`}
              </EmptyTitle>
              <EmptyDescription>
                {cursors.length
                  ? "Return to the previous page to review earlier records."
                  : kind === "clients"
                    ? "Clients appear here after an eligible new customer uses your referral link or code."
                    : "Referral payments appear here after an eligible balance is claimed for payment."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{kind === "clients" ? "Client reference" : "Payment"}</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                {kind === "payouts" ? (
                  <>
                    <TableHead>Amount</TableHead>
                    <TableHead>External reference</TableHead>
                    {operator ? <TableHead>Review</TableHead> : null}
                  </>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) =>
                "client_id" in row ? (
                  <TableRow key={row.client_id}>
                    <TableCell className="font-mono text-xs">{row.client_id}</TableCell>
                    <TableCell>{new Date(row.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{statuses[row.status]}</Badge>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={row.batch_id}>
                    <TableCell className="font-mono text-xs">
                      {row.batch_id}
                      {operator ? (
                        <span className="block text-muted-foreground">
                          Partner {row.partner_id}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>{new Date(row.claimed_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{statuses[row.status]}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatReferralAmount(row.amount_minor)}
                    </TableCell>
                    <TableCell>{row.external_reference ?? "Awaiting confirmation"}</TableCell>
                    {kind === "payouts" && operator ? (
                      <TableCell>
                        {row.status !== "paid" ? (
                          <Button size="sm" variant="outline" onClick={() => props.onReview?.(row)}>
                            Review payment
                          </Button>
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                )
              )}
            </TableBody>
          </Table>
        )}
        {rows !== null && (rows.length > 0 || cursors.length > 0) ? (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!cursors.length || rows === null}
              onClick={() => setCursors((previous) => previous.slice(0, -1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={rows === null || rows.length < 25}
              onClick={next}
            >
              Next
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
