import { ActivityIcon, GaugeIcon, HeartPulseIcon, LoaderCircleIcon, PackageIcon, UsersIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { PageHeader } from "../components/system/page-header.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { Field, FieldDescription, FieldLabel } from "../components/ui/field.js";
import { Input } from "../components/ui/input.js";
import { Notice } from "../components/ui/notice.js";
import { Skeleton } from "../components/ui/skeleton.js";
import {
  ApiRequestError,
  getAdminAnalyticsAccessStatus,
  getAdminAnalyticsSummary,
  requestEmailCode,
  type AdminAnalyticsSummary,
  verifyEmailCode
} from "../lib/api.js";
import { showSuccessToast } from "../lib/notify.js";
import { useSession } from "../lib/session.js";

type AdminAnalyticsState =
  | { status: "loading" }
  | { status: "ready"; summary: AdminAnalyticsSummary }
  | { status: "email_auth_required" }
  | { status: "redirecting" }
  | { status: "error" };

const INTEGER_FORMAT = new Intl.NumberFormat();
const PERCENT_FORMAT = new Intl.NumberFormat(undefined, {
  style: "percent",
  maximumFractionDigits: 0
});
const DATE_TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC"
});
const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeZone: "UTC"
});

interface StatCardEntry {
  label: string;
  value: number;
  tone?: "number" | "percent";
  description: string;
}

export function AdminAnalyticsPage(): JSX.Element {
  const navigate = useNavigate();
  const { session, setSession } = useSession();
  const [state, setState] = useState<AdminAnalyticsState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const summary = await getAdminAnalyticsSummary();
        if (!cancelled) {
          setState({ status: "ready", summary });
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (error instanceof ApiRequestError && error.status === 404) {
          try {
            const accessStatus = await getAdminAnalyticsAccessStatus();
            if (cancelled) {
              return;
            }

            setState(
              accessStatus.status === "email_auth_required"
                ? { status: "email_auth_required" }
                : { status: "error" }
            );
          } catch (accessError) {
            if (cancelled) {
              return;
            }

            if (accessError instanceof ApiRequestError && accessError.status === 404) {
              setState({ status: "redirecting" });
              void navigate("/", { replace: true });
              return;
            }

            setState({ status: "error" });
          }

          return;
        }

        setState({ status: "error" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, reloadToken]);

  if (state.status === "redirecting") {
    return <AdminAnalyticsSkeleton />;
  }

  if (state.status === "email_auth_required") {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
            <PageHeader description="Aggregate internal analytics for product health, adoption, and operator-facing trends." />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Email auth required</Badge>
          </div>
        </div>

        <AdminAnalyticsEmailGate
          email={session?.email ?? ""}
          onVerified={(nextSession) => {
            setSession(nextSession);
            setState({ status: "loading" });
            setReloadToken((current) => current + 1);
          }}
        />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="space-y-6">
        <PageHeader description="Aggregate internal analytics for product health, adoption, and operator-facing trends." />
        <Notice tone="warning" title="Analytics unavailable">
          The admin analytics summary could not be loaded right now.
        </Notice>
      </div>
    );
  }

  if (state.status === "loading") {
    return <AdminAnalyticsSkeleton />;
  }

  const { summary } = state;

  const activityCards: StatCardEntry[] = [
    {
      label: "Active today",
      value: summary.kpis.active_accounts_today,
      description: "Distinct accounts with qualifying activity today."
    },
    {
      label: "Active this week",
      value: summary.kpis.active_accounts_this_week,
      description: "Distinct active accounts since the UTC week started."
    },
    {
      label: "Active this month",
      value: summary.kpis.active_accounts_this_month,
      description: "Distinct active accounts since the UTC month started."
    },
    {
      label: "New accounts today",
      value: summary.kpis.new_accounts_today,
      description: "Accounts created since the UTC day started."
    },
    {
      label: "New accounts this week",
      value: summary.kpis.new_accounts_this_week,
      description: "Accounts created since the UTC week started."
    },
    {
      label: "New accounts this month",
      value: summary.kpis.new_accounts_this_month,
      description: "Accounts created since the UTC month started."
    },
    {
      label: "Deleted this month",
      value: summary.kpis.deleted_accounts_this_month,
      description: "Accounts deleted since the UTC month started."
    },
    {
      label: "Live accounts total",
      value: summary.kpis.active_accounts_total,
      description: "Current non-deleted analytics accounts."
    }
  ];
  const usageCards: StatCardEntry[] = [
    {
      label: "Raw events this month",
      value: summary.usage.raw_events_accepted_this_month,
      description: "Accepted raw events across all interfaces this month."
    },
    {
      label: "Billable events this month",
      value: summary.usage.billable_events_counted_this_month,
      description: "Billable accepted events counted this month."
    },
    {
      label: "Incidents opened",
      value: summary.incidents.opened_this_month,
      description: "New incidents opened this month."
    },
    {
      label: "Incident resolution rate",
      value: summary.incidents.resolution_rate_this_month,
      tone: "percent",
      description: "Resolved divided by opened incidents this month."
    },
    {
      label: "Cloud verifications",
      value: summary.usage.cloud_verification_events_this_month,
      description: "Cloud verification events accepted this month."
    },
    {
      label: "Local verifications",
      value: summary.usage.local_verification_events_this_month,
      description: "Local verification events accepted this month."
    }
  ];
  const improvementCards: StatCardEntry[] = [
    {
      label: "Improvements opened",
      value: summary.improvements.opened_this_month,
      description: "Improvement opportunities opened this month."
    },
    {
      label: "Improvement resolution rate",
      value: summary.improvements.resolution_rate_this_month,
      tone: "percent",
      description: "Resolved divided by opened improvements this month."
    },
    {
      label: "Failure bundles created",
      value: summary.bundles.failure_created_this_month,
      description: "Failure bundles generated this month."
    },
    {
      label: "Improvement bundles created",
      value: summary.bundles.improvement_created_this_month,
      description: "Improvement bundles generated this month."
    },
    {
      label: "Reproductions created",
      value: summary.bundles.reproductions_created_this_month,
      description: "Reproduction artifacts created this month."
    },
    {
      label: "Reproductions failed",
      value: summary.bundles.reproductions_failed_this_month,
      description: "Reproduction builds that failed this month."
    }
  ];
  const billingHealthCards: StatCardEntry[] = [
    {
      label: "Trials started",
      value: summary.billing.trials_started_this_month,
      description: "Trials started this month."
    },
    {
      label: "Trials converted",
      value: summary.billing.trials_converted_this_month,
      description: "Trials converted this month."
    },
    {
      label: "Plan upgrades",
      value: summary.billing.plan_upgrades_this_month,
      description: "Plan upgrades recorded this month."
    },
    {
      label: "Raw events rejected",
      value: summary.health.raw_events_rejected_this_month,
      description: "Rejected raw events this month."
    },
    {
      label: "Webhook failures",
      value: summary.health.webhook_deliveries_failed_this_month,
      description: "Webhook delivery failures this month."
    },
    {
      label: "Alert failures",
      value: summary.health.alert_deliveries_failed_this_month,
      description: "Alert delivery failures this month."
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <PageHeader description="Aggregate internal analytics for product health, adoption, and operator-facing trends." />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">UTC windows</Badge>
          <Badge variant="secondary">Generated {DATE_TIME_FORMAT.format(new Date(summary.generated_at))}</Badge>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Window scope</CardTitle>
            <CardDescription>
              Collection starts at {DATE_FORMAT.format(new Date(summary.collection_started_at))}. All numbers on this
              page are aggregate-only and use UTC boundaries.
            </CardDescription>
          </div>
          <div className="grid gap-2 text-sm text-muted-foreground sm:text-right">
            <span>Today: {formatRange(summary.windows.today)}</span>
            <span>This week: {formatRange(summary.windows.this_week)}</span>
            <span>This month: {formatRange(summary.windows.this_month)}</span>
          </div>
        </CardHeader>
      </Card>

      <AnalyticsSection
        title="Product activity"
        description="Topline account activity and creation KPIs."
        icon={<UsersIcon className="size-4 text-muted-foreground" />}
        cards={activityCards}
      />

      <AnalyticsSection
        title="Usage and incidents"
        description="Product throughput, incident volume, and verification traffic."
        icon={<ActivityIcon className="size-4 text-muted-foreground" />}
        cards={usageCards}
      />

      <AnalyticsSection
        title="Improvements and bundles"
        description="Hosted improvement generation and bundle output."
        icon={<PackageIcon className="size-4 text-muted-foreground" />}
        cards={improvementCards}
      />

      <AnalyticsSection
        title="Billing and health"
        description="Commercial movement plus operational failure counters."
        icon={<HeartPulseIcon className="size-4 text-muted-foreground" />}
        cards={billingHealthCards}
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle>Health detail</CardTitle>
            <CardDescription>Lower-level rejection and delivery counters for the current month.</CardDescription>
          </div>
          <GaugeIcon className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <DetailRow label="Malformed rejections" value={summary.health.malformed_rejections_this_month} />
          <DetailRow label="Rate limited rejections" value={summary.health.rate_limited_rejections_this_month} />
          <DetailRow label="Quota rejections" value={summary.health.quota_rejections_this_month} />
          <DetailRow label="Capture policy rejections" value={summary.health.capture_policy_rejections_this_month} />
          <DetailRow label="Capture rule rejections" value={summary.health.capture_rule_rejections_this_month} />
          <DetailRow label="Weekly report failures" value={summary.health.weekly_reports_failed_this_month} />
          <DetailRow label="GitHub dispatch failures" value={summary.health.github_dispatches_failed_this_month} />
          <DetailRow label="Auto-disabled webhooks" value={summary.health.webhooks_auto_disabled_this_month} />
          <DetailRow label="Operational emails sent" value={summary.health.operational_emails_sent_this_month} />
          <DetailRow
            label="Allowance warning emails"
            value={summary.health.allowance_warning_emails_sent_this_month}
          />
          <DetailRow
            label="Allowance limit emails"
            value={summary.health.allowance_limit_emails_sent_this_month}
          />
          <DetailRow label="Deleted accounts total" value={summary.kpis.deleted_accounts_total} />
        </CardContent>
      </Card>
    </div>
  );
}

function AnalyticsSection({
  title,
  description,
  icon,
  cards
}: {
  title: string;
  description: string;
  icon: ReactNode;
  cards: StatCardEntry[];
}): JSX.Element {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {icon}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <StatCard key={card.label} entry={card} />
        ))}
      </div>
    </section>
  );
}

function StatCard({ entry }: { entry: StatCardEntry }): JSX.Element {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{entry.label}</CardDescription>
      </CardHeader>
      <CardContent>
        <CardTitle className="text-2xl tabular-nums">{formatValue(entry.value, entry.tone)}</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">{entry.description}</p>
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{INTEGER_FORMAT.format(value)}</span>
    </div>
  );
}

function AdminAnalyticsEmailGate(input: {
  email: string;
  onVerified: (session: Awaited<ReturnType<typeof verifyEmailCode>>) => void;
}): JSX.Element {
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"request" | "verify">("request");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSendCode(): Promise<void> {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await requestEmailCode({
        email: input.email,
        accepted_terms: true
      });
      setStep("verify");
      setCode("");
      showSuccessToast("Sign-in code sent successfully.");
    } catch {
      setErrorMessage("We could not send a sign-in code right now. Try again in a moment.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyCode(): Promise<void> {
    if (!/^\d{6}$/.test(code)) {
      setErrorMessage("Enter the six-digit code from your email.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const nextSession = await verifyEmailCode({
        email: input.email,
        code
      });
      input.onVerified(nextSession);
      showSuccessToast("Signed in successfully.");
    } catch {
      setErrorMessage("That code is invalid or expired. Request a new code and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Continue with email</CardTitle>
        <CardDescription>
          Analytics access requires an email-authenticated session, even when you already signed in with GitHub.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Notice tone="info">
          We&apos;ll send a six-digit sign-in code to <span className="font-medium">{input.email}</span>.
        </Notice>

        {step === "verify" ? (
          <Field data-invalid={errorMessage !== null || undefined}>
            <FieldLabel htmlFor="admin-analytics-email-code">Six-digit code</FieldLabel>
            <Input
              id="admin-analytics-email-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              aria-invalid={errorMessage !== null || undefined}
              onChange={(event) => {
                setCode(event.currentTarget.value.replace(/\D+/g, "").slice(0, 6));
                setErrorMessage(null);
              }}
            />
            <FieldDescription>
              Enter the latest code we sent to your email to reopen this page.
            </FieldDescription>
          </Field>
        ) : null}

        {errorMessage === null ? null : <Notice tone="destructive">{errorMessage}</Notice>}

        <div className="flex flex-col gap-3 sm:flex-row">
          {step === "request" ? (
            <Button className="sm:w-auto" disabled={isSubmitting} onClick={() => void handleSendCode()}>
              {isSubmitting ? <LoaderCircleIcon className="animate-spin" /> : null}
              Send code
            </Button>
          ) : (
            <>
              <Button className="sm:w-auto" disabled={isSubmitting} onClick={() => void handleVerifyCode()}>
                {isSubmitting ? <LoaderCircleIcon className="animate-spin" /> : null}
                Verify code
              </Button>
              <Button
                variant="outline"
                className="sm:w-auto"
                disabled={isSubmitting}
                onClick={() => void handleSendCode()}
              >
                Resend code
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AdminAnalyticsSkeleton(): JSX.Element {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <Skeleton className="h-28 w-full" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full" />
        ))}
      </div>
    </div>
  );
}

function formatValue(value: number, tone: "number" | "percent" = "number"): string {
  return tone === "percent" ? PERCENT_FORMAT.format(value) : INTEGER_FORMAT.format(value);
}

function formatRange(window: AdminAnalyticsSummary["windows"][keyof AdminAnalyticsSummary["windows"]]): string {
  return `${DATE_FORMAT.format(new Date(window.starts_at))} to ${DATE_FORMAT.format(new Date(window.ends_at))}`;
}
