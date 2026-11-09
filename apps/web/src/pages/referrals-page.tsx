import { ReferralApiError } from "../../../../packages/referral-client/src/index.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { ReferralPartnerResponse } from "../../../../packages/referrals/src/referral-contracts.js";
import type { ReferralEarningsResponse } from "../../../../packages/referrals/src/referral-ledger-contracts.js";
import { referralApi, referralErrorMessage } from "../lib/referral-api.js";
import { useSession } from "../lib/session.js";
import { usePendingAction } from "../lib/use-pending-action.js";
import { PageHeader } from "../components/system/page-header.js";
import { ReferralEnrollmentCard } from "../components/system/referral-enrollment-card.js";
import { ReferralBalanceSummary } from "../components/system/referral-balance-summary.js";
import { ReferralHistory } from "../components/system/referral-history.js";
import { ReadOnlyCopyInput } from "../components/system/read-only-copy-input.js";
import { LoadErrorCallout } from "../components/system/load-error-callout.js";
import { CalloutCard } from "../components/system/callout-card.js";
import { Button } from "../components/ui/button.js";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from "../components/ui/card.js";
import { Skeleton } from "../components/ui/skeleton.js";

export function ReferralsPage(): JSX.Element {
  const { session } = useSession(),
    identity = session?.user_id;
  const [status, setStatus] = useState<ReferralPartnerResponse | null>(null),
    [earnings, setEarnings] = useState<ReferralEarningsResponse | null>(null),
    [loadError, setLoadError] = useState<unknown>(null),
    [earningsError, setEarningsError] = useState(false),
    [joinError, setJoinError] = useState<string | null>(null),
    [loading, setLoading] = useState(false);
  const generation = useRef(0),
    { pending, run } = usePendingAction();
  const load = useCallback(() => {
    const current = ++generation.current;
    setLoading(true);
    setLoadError(null);
    setEarningsError(false);
    void Promise.allSettled([
      referralApi
        .partner()
        .then((result) => {
          if (current === generation.current) setStatus(result);
        })
        .catch((reason: unknown) => {
          if (current === generation.current)
            setLoadError(reason ?? new Error("referral_load_failed"));
        }),
      referralApi
        .earnings()
        .then((result) => {
          if (current === generation.current) setEarnings(result);
        })
        .catch(() => {
          if (current === generation.current) {
            setEarnings(null);
            setEarningsError(true);
          }
        })
    ]).finally(() => {
      if (current === generation.current) setLoading(false);
    });
  }, []);
  useEffect(() => {
    setStatus(null);
    setEarnings(null);
    setJoinError(null);
    load();
    return () => {
      generation.current++;
    };
  }, [identity, load]);
  const join = (version: string): void => {
    void run(async () => {
      const current = ++generation.current;
      setJoinError(null);
      try {
        const result = await referralApi.join(version);
        if (current !== generation.current) return;
        setStatus(result);
        setLoading(false);
        try {
          const next = await referralApi.earnings();
          if (current === generation.current) setEarnings(next);
        } catch {
          if (current === generation.current) setEarningsError(true);
        }
      } catch (reason) {
        if (current === generation.current) {
          setJoinError(referralErrorMessage(reason));
          setLoading(false);
        }
      }
    });
  };
  const programUnavailable =
    loadError instanceof ReferralApiError && loadError.code === "program_unavailable";
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Share DebugBundle with new Business customers and follow your referral earnings."
        actions={
          earnings?.operator_access ? (
            <Button variant="outline" asChild>
              <Link to="/settings/referrals/payouts">Review payouts</Link>
            </Button>
          ) : undefined
        }
      />
      {loadError ? (
        <CalloutCard
          eyebrow="Referrals"
          title={
            programUnavailable
              ? "Referrals are unavailable"
              : "Referral details could not be loaded"
          }
          description={referralErrorMessage(loadError)}
          tone={programUnavailable ? "neutral" : "warning"}
          role={programUnavailable ? "status" : "alert"}
        >
          <div>
            <Button variant="outline" disabled={loading} onClick={load}>
              {loading ? "Retrying" : "Retry"}
            </Button>
          </div>
        </CalloutCard>
      ) : status === null ? (
        <Skeleton className="h-40 w-full" />
      ) : status.partner === null ? (
        status.enrollment_enabled ? (
          <ReferralEnrollmentCard
            termsVersion={status.terms_version}
            pending={pending}
            error={joinError}
            onJoin={join}
          />
        ) : (
          <CalloutCard
            eyebrow="Referrals"
            title="New enrolment is paused"
            description="The referral programme is not accepting new partners right now."
            tone="neutral"
          />
        )
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Your referral link</CardTitle>
              <CardDescription>
                New eligible Business customers receive 10% off their first eligible Business base
                invoice. Your link grants no access to their workspace.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ReadOnlyCopyInput
                id="referral-share-link"
                label="Referral link"
                value={status.share_url ?? ""}
              />
              <ReadOnlyCopyInput
                id="referral-public-code"
                label="Referral code"
                value={status.partner.code}
              />
              {status.partner.status === "paused" || !status.enrollment_enabled ? (
                <p role="status" className="text-sm text-muted-foreground">
                  New referrals are paused. Your existing earnings and payment history remain
                  available.
                </p>
              ) : null}
            </CardContent>
          </Card>
          {earningsError ? (
            <LoadErrorCallout
              title="Referral earnings could not be loaded"
              pending={loading}
              onRetry={load}
            />
          ) : earnings?.balance ? (
            <ReferralBalanceSummary balance={earnings.balance} />
          ) : null}
          <p className="text-sm text-muted-foreground">
            Earnings cover eligible collected Business base cash for the first 12 calendar months.
            Pending earnings include the 30-day hold, unavailable funds and disputes. Refund
            adjustments can create a negative available balance.
          </p>
          <ReferralHistory key={`${identity}:clients`} kind="clients" />
          <ReferralHistory key={`${identity}:payouts`} kind="payouts" />
        </>
      )}
    </div>
  );
}
