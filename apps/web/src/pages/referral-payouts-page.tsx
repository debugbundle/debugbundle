import { MetadataSeparator } from "../components/system/metadata-separator.js";
import { useEffect, useRef, useState } from "react";
import { WalletIcon } from "lucide-react";
import type {
  ReferralPartnerEarnings,
  ReferralPayout
} from "../../../../packages/referrals/src/referral-ledger-contracts.js";
import { referralApi, referralErrorMessage, formatReferralAmount } from "../lib/referral-api.js";
import { useSession } from "../lib/session.js";
import { usePendingAction } from "../lib/use-pending-action.js";
import { PageHeader } from "../components/system/page-header.js";
import { LoadErrorCallout } from "../components/system/load-error-callout.js";
import { CalloutCard } from "../components/system/callout-card.js";
import { PendingButton } from "../components/system/pending-button.js";
import { ReferralHistory } from "../components/system/referral-history.js";
import { Button } from "../components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "../components/ui/card.js";
import { Field, FieldLabel, FieldError } from "../components/ui/field.js";
import { Input } from "../components/ui/input.js";
import { Checkbox } from "../components/ui/checkbox.js";
import { Skeleton } from "../components/ui/skeleton.js";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription
} from "../components/ui/empty.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "../components/ui/table.js";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel
} from "../components/ui/alert-dialog.js";

export function ReferralPayoutsPage(): JSX.Element {
  const { session } = useSession(),
    identity = session?.user_id;
  const [allowed, setAllowed] = useState<boolean | null>(null),
    [partners, setPartners] = useState<ReferralPartnerEarnings[] | null>(null),
    [cursors, setCursors] = useState<string[]>([]),
    [revision, setRevision] = useState(0),
    [loadError, setLoadError] = useState(false),
    [error, setError] = useState<string | null>(null),
    [claim, setClaim] = useState<{ partner: ReferralPartnerEarnings; id: string } | null>(null),
    [selected, setSelected] = useState<ReferralPayout | null>(null),
    [reference, setReference] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [notice, setNotice] = useState<string | null>(null);
  const generation = useRef(0),
    claims = useRef(new Map<string, string>()),
    { pending, run } = usePendingAction(),
    before = cursors.at(-1);
  useEffect(() => {
    const current = ++generation.current;
    setLoadError(false);
    setPartners(null);
    void referralApi
      .earnings()
      .then(async (access) => {
        if (current !== generation.current) return;
        setAllowed(access.operator_access);
        if (!access.operator_access) {
          setSelected(null);
          setClaim(null);
          return;
        }
        const rows = await referralApi.operatorBalances({
          limit: 25,
          ...(before === undefined ? {} : { before })
        });
        if (current === generation.current) setPartners(rows);
      })
      .catch(() => {
        if (current === generation.current) setLoadError(true);
      });
    return () => {
      generation.current++;
    };
  }, [identity, before, revision]);
  const review = (payout: ReferralPayout): void => {
    setSelected(payout);
    setReference("");
    setConfirmed(false);
    setError(null);
    setNotice(null);
  };
  const openClaim = (partner: ReferralPartnerEarnings): void => {
    let id = claims.current.get(partner.partner_id);
    if (!id) {
      id = crypto.randomUUID();
      claims.current.set(partner.partner_id, id);
    }
    setClaim({ partner, id });
    setError(null);
    setNotice(null);
  };
  const confirmClaim = (): void => {
    if (!claim) return;
    const requested = claim;
    void run(async () => {
      const current = ++generation.current;
      setError(null);
      try {
        const result = await referralApi.claim(requested.partner.partner_id, requested.id);
        if (current !== generation.current) return;
        claims.current.delete(requested.partner.partner_id);
        setClaim(null);
        review(result);
        setRevision((value) => value + 1);
      } catch (reason) {
        if (current === generation.current) setError(referralErrorMessage(reason));
      }
    });
  };
  const record = (): void => {
    if (!selected || !confirmed) return;
    const requested = selected;
    void run(async () => {
      const current = ++generation.current;
      setError(null);
      try {
        await referralApi.record(requested.batch_id, reference, true);
        if (current !== generation.current) return;
        setSelected(null);
        setNotice("External payment recorded.");
        setRevision((value) => value + 1);
      } catch (reason) {
        if (current === generation.current) setError(referralErrorMessage(reason));
      }
    });
  };
  const uncertain = (): void => {
    if (!selected) return;
    const requested = selected;
    void run(async () => {
      const current = ++generation.current;
      setError(null);
      try {
        const result = await referralApi.uncertain(requested.batch_id);
        if (current !== generation.current) return;
        setSelected(result);
        setConfirmed(false);
        setNotice("Payment remains claimed for reconciliation.");
        setRevision((value) => value + 1);
      } catch (reason) {
        if (current === generation.current) setError(referralErrorMessage(reason));
      }
    });
  };
  if (loadError)
    return (
      <LoadErrorCallout
        title="Payout details could not be loaded"
        pending={false}
        onRetry={() => setRevision((value) => value + 1)}
      />
    );
  if (allowed === null) return <Skeleton className="h-32 w-full" />;
  if (!allowed)
    return (
      <CalloutCard
        eyebrow="Payouts"
        title="Operator access required"
        description="Only configured DebugBundle operators can review and record referral payments. Workspace ownership does not grant this access."
        tone="neutral"
      />
    );
  return (
    <div className="flex flex-col gap-6">
      <PageHeader description="Claim eligible balances, pay through your agreed external method, then record the verified reference. An uncertain payment stays claimed until reconciled." />
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Partner balances</CardTitle>
          <CardDescription>
            USD balances after refunds and holds. Review the frozen batch before arranging an
            external payment.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {partners === null ? (
            <Skeleton className="h-24 w-full" />
          ) : partners.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <WalletIcon />
                </EmptyMedia>
                <EmptyTitle>
                  {cursors.length ? "No more partner balances" : "No earned commissions yet"}
                </EmptyTitle>
                <EmptyDescription>
                  {cursors.length
                    ? "Return to the previous page to review earlier balances."
                    : "Partner balances appear when eligible Business payments earn commission."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner code</TableHead>
                  <TableHead>Available</TableHead>
                  <TableHead>Pending</TableHead>
                  <TableHead>Claimed</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partners.map((partner) => (
                  <TableRow key={partner.partner_id}>
                    <TableCell className="font-mono">{partner.code}</TableCell>
                    <TableCell>{formatReferralAmount(partner.balance.available_minor)}</TableCell>
                    <TableCell>{formatReferralAmount(partner.balance.pending_minor)}</TableCell>
                    <TableCell>{formatReferralAmount(partner.balance.claimed_minor)}</TableCell>
                    <TableCell>{formatReferralAmount(partner.balance.paid_minor)}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          pending ||
                          partner.balance.available_minor <= 0 ||
                          partner.balance.claimed_minor > 0
                        }
                        onClick={() => openClaim(partner)}
                      >
                        Claim balance
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {partners !== null && (partners.length > 0 || cursors.length > 0) ? (
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!cursors.length || partners === null}
                onClick={() => setCursors((previous) => previous.slice(0, -1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={partners === null || partners.length < 25}
                onClick={() => {
                  const last = partners?.at(-1);
                  if (last) setCursors((previous) => [...previous, last.partner_id]);
                }}
              >
                Next
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
      {selected ? (
        <Card>
          <CardHeader>
            <CardTitle>Review manual payment</CardTitle>
            <CardDescription>
              {formatReferralAmount(selected.amount_minor)} USD
              <MetadataSeparator />
              {selected.batch_id}
              <MetadataSeparator />
              {selected.status}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                record();
              }}
            >
              <p className="text-sm text-muted-foreground">
                Verify the beneficiary and external payment for this exact batch. Recording a
                reference finalises this payment record.
              </p>
              <Field>
                <FieldLabel htmlFor="referral-payment-reference">
                  External payment reference
                </FieldLabel>
                <Input
                  id="referral-payment-reference"
                  value={reference}
                  maxLength={200}
                  disabled={pending}
                  onChange={(event) => setReference(event.target.value)}
                />
              </Field>
              <Field orientation="horizontal">
                <Checkbox
                  id="referral-payment-confirmed"
                  checked={confirmed}
                  disabled={pending}
                  onCheckedChange={(value) => setConfirmed(value === true)}
                />
                <FieldLabel htmlFor="referral-payment-confirmed">
                  I have verified that this exact external payment completed.
                </FieldLabel>
              </Field>
              {error && claim === null ? <FieldError role="alert">{error}</FieldError> : null}
              <div className="flex flex-wrap gap-2">
                <PendingButton
                  type="submit"
                  pending={pending}
                  pendingLabel="Recording"
                  disabled={!confirmed || !reference.trim()}
                >
                  Record external payment
                </PendingButton>
                <Button variant="outline" disabled={pending} onClick={uncertain}>
                  Mark payment uncertain
                </Button>
                <Button variant="ghost" disabled={pending} onClick={() => setSelected(null)}>
                  Close
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}
      <ReferralHistory kind="payouts" operator refreshVersion={revision} onReview={review} />
      <AlertDialog
        open={claim !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setClaim(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Claim partner balance?</AlertDialogTitle>
            <AlertDialogDescription>
              Reserve the available balance for {claim?.partner.code}, currently{" "}
              {formatReferralAmount(claim?.partner.balance.available_minor ?? 0)} USD. The server
              returns the frozen batch amount. Review that amount before any external payment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? <FieldError role="alert">{error}</FieldError> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction asChild>
              <PendingButton
                pending={pending}
                pendingLabel="Claiming"
                onClick={(event) => {
                  event.preventDefault();
                  confirmClaim();
                }}
              >
                Claim balance
              </PendingButton>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
