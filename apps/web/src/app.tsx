import { LoaderCircleIcon } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import {
  BrowserRouter,
  Link,
  MemoryRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams
} from "react-router-dom";
import { Toaster } from "sonner";

import { AppSidebar } from "./components/system/app-sidebar.js";
import { AppUpdateNotifier } from "./components/system/app-update-notifier.js";
import { BrandLockup } from "./components/system/brand-lockup.js";
import { CalloutCard } from "./components/system/callout-card.js";
import { DashboardIncidentsToday } from "./components/system/dashboard-incidents-today.js";
import { RecentProjectsTable } from "./components/system/recent-projects-table.js";
import { GitHubMark } from "./components/system/github-mark.js";
import { ProjectRouteProvider, type ActiveProjectRoute } from "./components/system/project-route-context.js";
import { SectionCards } from "./components/system/section-cards.js";
import { SiteHeader } from "./components/system/site-header.js";
import { Button } from "./components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card.js";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "./components/ui/field.js";
import { Input } from "./components/ui/input.js";
import { Notice } from "./components/ui/notice.js";
import { Separator } from "./components/ui/separator.js";
import {
  buildApiUrl,
  logout,
  requestEmailCode,
  type SessionRecord,
  verifyEmailCode
} from "./lib/api.js";
import { showErrorToast, showInfoToast, showSuccessToast } from "./lib/notify.js";
import { SessionProvider, useSession } from "./lib/session.js";
import { BillingPage } from "./pages/billing-page.js";
import { AdminAnalyticsPage } from "./pages/admin-analytics-page.js";
import { ImprovementDetailPage } from "./pages/improvement-detail-page.js";
import { ImprovementsPage } from "./pages/improvements-page.js";
import { MemberTokensPage } from "./pages/member-tokens-page.js";
import { ProjectsPage, ProjectTokensPage } from "./pages/management-pages.js";
import { IncidentsPage } from "./pages/incidents-page.js";
import { IncidentDetailPage } from "./pages/incident-detail-page.js";
import { ProjectLayout } from "./components/system/project-layout.js";
import { ProjectAlertsPage } from "./pages/project-alerts-page.js";
import { ProjectInvitePage } from "./pages/project-invite-page.js";
import { ProjectMembersPage } from "./pages/project-members-page.js";
import { ProjectGitHubPage } from "./pages/project-github-page.js";
import {
  ProjectBundlesPage,
  ProjectIncidentsPage,
  ProjectOverviewPage
} from "./pages/project-overview-page.js";
import { ProjectImprovementsPage } from "./pages/project-improvements-page.js";
import { ProjectProbesPage } from "./pages/project-probes-page.js";
import { ProjectSettingsPage } from "./pages/project-settings-page.js";
import { SettingsPage } from "./pages/settings-page.js";
import { ProjectWebhooksPage } from "./pages/project-webhooks-page.js";
import { SidebarInset, SidebarProvider } from "./components/ui/sidebar.js";
import { isSystemEmailReviewEnabled } from "./lib/system-email-previews.js";
import { ThemeProvider, useTheme } from "./lib/theme.js";
import { TooltipProvider } from "./components/ui/tooltip.js";
import { SystemEmailReviewPage } from "./pages/system-email-review-page.js";

const GITHUB_START_HREF = buildApiUrl("/v1/auth/github/start");
const SIGNUP_TRIAL_STORAGE_KEY = "debugbundle.auth.signup_trial";
const TERMS_OF_SERVICE_URL = "https://debugbundle.com/terms";
const PRIVACY_POLICY_URL = "https://debugbundle.com/privacy";

interface AppProps {
  initialEntries?: string[];
}

type AuthStep = "request" | "verify";
type RequestedTrialPlan = "solo" | "team";

interface AuthFieldErrors {
  email?: string;
  code?: string;
}

interface AuthRequestError {
  title: string;
  description: string;
}

function parseRequestedTrialPlan(value: string | null): RequestedTrialPlan | null {
  return value === "solo" || value === "team" ? value : null;
}

function readStoredSignupTrialPlan(): RequestedTrialPlan | null {
  if (typeof window === "undefined") {
    return null;
  }

  return parseRequestedTrialPlan(window.sessionStorage.getItem(SIGNUP_TRIAL_STORAGE_KEY));
}

function writeStoredSignupTrialPlan(plan: RequestedTrialPlan | null): void {
  if (typeof window === "undefined") {
    return;
  }

  if (plan === null) {
    window.sessionStorage.removeItem(SIGNUP_TRIAL_STORAGE_KEY);
    return;
  }

  window.sessionStorage.setItem(SIGNUP_TRIAL_STORAGE_KEY, plan);
}

function formatRequestedTrialPlanName(plan: RequestedTrialPlan): string {
  return plan === "solo" ? "Solo" : "Team";
}

function validateEmailAddress(value: string): string | undefined {
  if (value.length === 0) {
    return "Enter your email address to receive a sign-in code.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return "Enter a valid email address so we can send your code.";
  }

  return undefined;
}

function validateVerificationCode(value: string): string | undefined {
  if (value.length === 0) {
    return "Enter the six-digit code from your email.";
  }

  if (!/^\d{6}$/.test(value)) {
    return "Enter all six digits from the code we sent you.";
  }

  return undefined;
}

function getAuthFieldErrors(step: AuthStep, email: string, code: string): AuthFieldErrors {
  const emailError = validateEmailAddress(email);
  const codeError = step === "verify" ? validateVerificationCode(code) : undefined;

  return {
    ...(emailError === undefined ? {} : { email: emailError }),
    ...(codeError === undefined ? {} : { code: codeError })
  };
}

function omitAuthFieldError(
  errors: AuthFieldErrors,
  field: keyof AuthFieldErrors
): AuthFieldErrors {
  const remaining = { ...errors };
  delete remaining[field];
  return remaining;
}

export function App({ initialEntries }: AppProps): JSX.Element {
  const router =
    initialEntries === undefined ? (
      <BrowserRouter>
        <Routes>
          <Route element={<RootGate />}>
            <Route index element={<RootRedirect />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/invite" element={<ProjectInvitePage />} />
            <Route path="/auth/github/callback" element={<GithubAuthCallbackPage />} />
            <Route path="/analytics" element={<AdminAnalyticsRoute />} />
            <Route element={<ProtectedLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/incidents" element={<IncidentsPage />} />
              <Route path="/incidents/:incidentId" element={<IncidentDetailPage />} />
              <Route path="/improvements" element={<ImprovementsPage />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              {isSystemEmailReviewEnabled() ? (
                <Route path="/__dev/system-emails" element={<SystemEmailReviewPage />} />
              ) : null}
              <Route path="/organization" element={<Navigate replace to="/projects" />} />
              <Route path="/projects/:projectId" element={<ProjectLayout />}>
                <Route index element={<ProjectOverviewPage />} />
                <Route path="incidents" element={<ProjectIncidentsPage />} />
                <Route path="incidents/:incidentId" element={<IncidentDetailPage />} />
                <Route path="improvements" element={<ProjectImprovementsPage />} />
                <Route path="improvements/:improvementId" element={<ImprovementDetailPage />} />
                <Route path="bundles" element={<ProjectBundlesPage />} />
                <Route path="bundles/:incidentId" element={<IncidentDetailPage />} />
                <Route path="probes" element={<ProjectProbesPage />} />
                <Route path="github" element={<ProjectGitHubPage />} />
                <Route path="members" element={<ProjectMembersPage />} />
                <Route path="settings" element={<ProjectSettingsPage />} />
                <Route path="tokens" element={<ProjectTokensPage />} />
                <Route path="alerts" element={<ProjectAlertsPage />} />
                <Route path="webhooks" element={<ProjectWebhooksPage />} />
              </Route>
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/member-tokens" element={<MemberTokensPage />} />
            </Route>
            <Route path="*" element={<RootRedirect />} />
          </Route>
        </Routes>
      </BrowserRouter>
    ) : (
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route element={<RootGate />}>
            <Route index element={<RootRedirect />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/invite" element={<ProjectInvitePage />} />
            <Route path="/auth/github/callback" element={<GithubAuthCallbackPage />} />
            <Route path="/analytics" element={<AdminAnalyticsRoute />} />
            <Route element={<ProtectedLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/incidents" element={<IncidentsPage />} />
              <Route path="/incidents/:incidentId" element={<IncidentDetailPage />} />
              <Route path="/improvements" element={<ImprovementsPage />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              {isSystemEmailReviewEnabled() ? (
                <Route path="/__dev/system-emails" element={<SystemEmailReviewPage />} />
              ) : null}
              <Route path="/organization" element={<Navigate replace to="/projects" />} />
              <Route path="/projects/:projectId" element={<ProjectLayout />}>
                <Route index element={<ProjectOverviewPage />} />
                <Route path="incidents" element={<ProjectIncidentsPage />} />
                <Route path="incidents/:incidentId" element={<IncidentDetailPage />} />
                <Route path="improvements" element={<ProjectImprovementsPage />} />
                <Route path="improvements/:improvementId" element={<ImprovementDetailPage />} />
                <Route path="bundles" element={<ProjectBundlesPage />} />
                <Route path="bundles/:incidentId" element={<IncidentDetailPage />} />
                <Route path="probes" element={<ProjectProbesPage />} />
                <Route path="github" element={<ProjectGitHubPage />} />
                <Route path="members" element={<ProjectMembersPage />} />
                <Route path="settings" element={<ProjectSettingsPage />} />
                <Route path="tokens" element={<ProjectTokensPage />} />
                <Route path="alerts" element={<ProjectAlertsPage />} />
                <Route path="webhooks" element={<ProjectWebhooksPage />} />
              </Route>
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/member-tokens" element={<MemberTokensPage />} />
            </Route>
            <Route path="*" element={<RootRedirect />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

  return (
    <ThemeProvider>
      <TooltipProvider>
        <SessionProvider>
          {router}
          <AppUpdateNotifier />
          <AppToaster />
        </SessionProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}

function AppToaster(): JSX.Element {
  const { resolvedTheme } = useTheme();

  return <Toaster theme={resolvedTheme} position="bottom-right" richColors closeButton={false} />;
}

function RootGate(): JSX.Element {
  const { isLoading, sessionInvalidationCount } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const lastHandledInvalidationCount = useRef(0);

  useEffect(() => {
    if (
      sessionInvalidationCount === 0 ||
      sessionInvalidationCount === lastHandledInvalidationCount.current ||
      isPublicAuthPath(location.pathname)
    ) {
      return;
    }

    lastHandledInvalidationCount.current = sessionInvalidationCount;
    showInfoToast("Your session expired. Please sign in again.");
    void navigate("/login", { replace: true });
  }, [location.pathname, navigate, sessionInvalidationCount]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  return <Outlet />;
}

function isPublicAuthPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/invite" ||
    pathname.startsWith("/auth/github/callback")
  );
}

function RootRedirect(): JSX.Element {
  const { session } = useSession();
  return <Navigate replace to={session === null ? "/login" : "/dashboard"} />;
}

function ProtectedLayout(): JSX.Element {
  const { session, setSession } = useSession();

  if (session === null) {
    return <Navigate replace to="/login" />;
  }

  return (
    <ProtectedShell session={session} setSession={setSession}>
      <Outlet />
    </ProtectedShell>
  );
}

function AdminAnalyticsRoute(): JSX.Element {
  const { session, setSession } = useSession();

  if (session === null) {
    return <Navigate replace to="/" />;
  }

  return (
    <ProtectedShell session={session} setSession={setSession}>
      <AdminAnalyticsPage />
    </ProtectedShell>
  );
}

function ProtectedShell({
  session,
  setSession,
  children
}: {
  session: SessionRecord;
  setSession: (session: SessionRecord | null) => void;
  children: React.ReactNode;
}): JSX.Element {
  const navigate = useNavigate();
  const [activeProject, setActiveProject] = useState<ActiveProjectRoute | null>(null);

  async function handleSignOut(): Promise<void> {
    try {
      await logout();
      setSession(null);
      showSuccessToast("Signed out successfully.");
      void navigate("/login", { replace: true });
    } catch {
      showErrorToast("Could not sign out.");
    }
  }

  return (
    <ProjectRouteProvider value={{ activeProject, setActiveProject }}>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 72)",
            "--header-height": "calc(var(--spacing) * 12)"
          } as React.CSSProperties
        }
      >
        <AppSidebar variant="inset" session={session} onSignOut={handleSignOut} />
        <SidebarInset>
          <SiteHeader />
          <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden p-6">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </ProjectRouteProvider>
  );
}

function AuthLayout({
  title,
  heading = title,
  description,
  children
}: {
  title: string;
  heading?: string;
  description: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted p-6 text-foreground md:p-10">
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex justify-center">
          <BrandLockup href="/login" />
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="sr-only">{title}</CardTitle>
            <p className="text-xl font-semibold">{heading}</p>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>

        <FieldDescription className="px-6 text-center text-balance">
          By continuing, you agree to our{" "}
          <a
            href={TERMS_OF_SERVICE_URL}
            className="underline underline-offset-4 hover:text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            Terms of Service
          </a>{" "}
          and{" "}
          <a
            href={PRIVACY_POLICY_URL}
            className="underline underline-offset-4 hover:text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            Privacy Policy
          </a>
          .
        </FieldDescription>
      </div>
    </div>
  );
}

function GithubLink({ trialPlan }: { trialPlan?: RequestedTrialPlan | null } = {}): JSX.Element {
  const href = trialPlan === undefined || trialPlan === null ? GITHUB_START_HREF : `${GITHUB_START_HREF}?trial=${trialPlan}`;

  return (
    <Button asChild variant="outline" className="w-full justify-center">
      <a href={href}>
        <GitHubMark data-icon="inline-start" />
        Continue with GitHub
      </a>
    </Button>
  );
}

function AuthMethodDivider(): JSX.Element {
  return (
    <div className="relative text-center text-sm">
      <Separator className="absolute inset-x-0 top-1/2 -translate-y-1/2" />
      <span className="bg-card text-muted-foreground relative z-10 px-2">or</span>
    </div>
  );
}

function resolvePostAuthPath(nextPath: string | null): string {
  if (nextPath === null || nextPath.length === 0) {
    return "/dashboard";
  }

  if (!nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return "/dashboard";
  }

  return nextPath;
}

function appendAuthPath(
  pathname: string,
  options: {
    nextPath: string;
    trialPlan?: RequestedTrialPlan | null;
  }
): string {
  const searchParams = new URLSearchParams();

  if (options.nextPath !== "/dashboard") {
    searchParams.set("next", options.nextPath);
  }
  if (options.trialPlan === "solo" || options.trialPlan === "team") {
    searchParams.set("trial", options.trialPlan);
  }

  const queryString = searchParams.toString();
  return queryString.length === 0 ? pathname : `${pathname}?${queryString}`;
}

function EmailAuthPage({
  title,
  heading,
  description,
  alternateLinkHref,
  alternateLinkLabel,
  alternatePrompt,
  showTrialIntentPanel = false
}: {
  title: string;
  heading: string;
  description: string;
  alternateLinkHref: string;
  alternateLinkLabel: string;
  alternatePrompt: string;
  showTrialIntentPanel?: boolean;
}): JSX.Element {
  const { session, setSession } = useSession();
  const [searchParams] = useSearchParams();
  const emailInputRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<AuthStep>("request");
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [requestError, setRequestError] = useState<AuthRequestError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [postVerifyRedirectPath, setPostVerifyRedirectPath] = useState<string | null>(null);
  const postAuthPath = resolvePostAuthPath(searchParams.get("next"));
  const hasTrialQuery = searchParams.has("trial");
  const requestedTrialPlan =
    parseRequestedTrialPlan(searchParams.get("trial")) ??
    (hasTrialQuery ? null : readStoredSignupTrialPlan());
  const alternateHref = appendAuthPath(alternateLinkHref, {
    nextPath: postAuthPath,
    trialPlan: requestedTrialPlan
  });
  const trialIntentRedirectPath =
    requestedTrialPlan === null
      ? postAuthPath
      : appendAuthPath("/billing", {
          nextPath: postAuthPath,
          trialPlan: requestedTrialPlan
        });
  const isVerifyStep = step === "verify";

  useEffect(() => {
    if (document.body.style.pointerEvents === "none") {
      document.body.style.pointerEvents = "";
    }

    document.body.removeAttribute("data-scroll-locked");
  }, []);

  useEffect(() => {
    if (isVerifyStep) {
      codeInputRef.current?.focus();
      return;
    }

    emailInputRef.current?.focus();
  }, [isVerifyStep]);

  useEffect(() => {
    writeStoredSignupTrialPlan(requestedTrialPlan);
  }, [requestedTrialPlan]);

  if (session !== null) {
    return <Navigate replace to={postVerifyRedirectPath ?? trialIntentRedirectPath} />;
  }

  function focusFirstInvalidField(errors: AuthFieldErrors): void {
    if (errors.email !== undefined) {
      emailInputRef.current?.focus();
      return;
    }

    if (errors.code !== undefined) {
      codeInputRef.current?.focus();
    }
  }

  function clearFieldError(field: keyof AuthFieldErrors): void {
    setFieldErrors((current) =>
      current[field] === undefined ? current : omitAuthFieldError(current, field)
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const normalizedEmail = email.trim();
    const normalizedCode = code.trim();
    const nextFieldErrors = getAuthFieldErrors(step, normalizedEmail, normalizedCode);

    setFieldErrors(nextFieldErrors);
    setRequestError(null);
    setEmail(normalizedEmail);
    setCode(normalizedCode);

    if (nextFieldErrors.email !== undefined || nextFieldErrors.code !== undefined) {
      focusFirstInvalidField(nextFieldErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      if (step === "request") {
        await requestEmailCode({
          email: normalizedEmail,
          accepted_terms: true,
          ...(requestedTrialPlan === null ? {} : { requested_trial_plan: requestedTrialPlan })
        });
        setStep("verify");
        setCode("");
        showSuccessToast("Sign-in code sent successfully.");
      } else {
        const nextPath = trialIntentRedirectPath;
        const nextSession = await verifyEmailCode({
          email: normalizedEmail,
          code: normalizedCode,
          ...(requestedTrialPlan === null ? {} : { requested_trial_plan: requestedTrialPlan })
        });
        setPostVerifyRedirectPath(nextPath);
        setSession(nextSession);
        writeStoredSignupTrialPlan(null);
        showSuccessToast("Signed in successfully.");
      }
    } catch {
      setRequestError(
        step === "request"
          ? {
              title: "Code could not be sent",
              description:
                "We could not send a sign-in code right now. Check the address and try again."
            }
          : {
              title: "Code was not accepted",
              description: "That code is invalid or expired. Request a new code and try again."
            }
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendCode(): Promise<void> {
    const normalizedEmail = email.trim();
    const nextFieldErrors = getAuthFieldErrors("request", normalizedEmail, code);

    setFieldErrors(nextFieldErrors);
    setRequestError(null);
    setEmail(normalizedEmail);

    if (nextFieldErrors.email !== undefined) {
      focusFirstInvalidField(nextFieldErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      await requestEmailCode({
        email: normalizedEmail,
        accepted_terms: true,
        ...(requestedTrialPlan === null ? {} : { requested_trial_plan: requestedTrialPlan })
      });
      setCode("");
      showSuccessToast("New sign-in code sent successfully.");
    } catch {
      setRequestError({
        title: "Code could not be resent",
        description: "We could not resend the sign-in code right now. Try again in a moment."
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleUseDifferentEmail(): void {
    setStep("request");
    setCode("");
    setFieldErrors({});
    setRequestError(null);
  }

  const emailErrorId = fieldErrors.email === undefined ? undefined : "email-auth-email-error";
  const codeErrorId = fieldErrors.code === undefined ? undefined : "email-auth-code-error";
  const requestErrorId = requestError === null ? undefined : "email-auth-request-error";

  const layoutTitle = isVerifyStep ? "Check your inbox" : title;
  const layoutHeading = isVerifyStep ? "Check your inbox" : heading;
  const layoutDescription = isVerifyStep
    ? `Enter the six-digit code we sent to ${email}.`
    : description;

  return (
    <AuthLayout title={layoutTitle} heading={layoutHeading} description={layoutDescription}>
      <form className="flex flex-col gap-6" onSubmit={(event) => void handleSubmit(event)}>
        <FieldGroup>
          {!showTrialIntentPanel || requestedTrialPlan === null ? null : (
            <Notice
              title={`${formatRequestedTrialPlanName(requestedTrialPlan)} trial selected`}
              tone="info"
            >
              You&apos;re starting with a 30-day no-card trial.
            </Notice>
          )}
          {isVerifyStep ? (
            <Field data-invalid={fieldErrors.code !== undefined || undefined}>
              <FieldLabel htmlFor="email-auth-code">Six-digit code</FieldLabel>
              <Input
                ref={codeInputRef}
                id="email-auth-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                aria-invalid={fieldErrors.code !== undefined || undefined}
                aria-describedby={codeErrorId}
                onChange={(event) => {
                  setCode(event.currentTarget.value.replace(/\D+/g, "").slice(0, 6));
                  clearFieldError("code");
                  setRequestError(null);
                }}
              />
              <FieldDescription>
                Codes expire quickly. Request a new one if you switch emails or wait too long.
              </FieldDescription>
              {fieldErrors.code === undefined ? null : (
                <Notice id={codeErrorId} tone="destructive">
                  {fieldErrors.code}
                </Notice>
              )}
            </Field>
          ) : (
            <>
              <Field>
                <GithubLink trialPlan={requestedTrialPlan} />
              </Field>
              <AuthMethodDivider />
              <div className="space-y-1">
                <p className="text-sm font-medium">Continue with email</p>
                <FieldDescription>
                  We&apos;ll send a six-digit code so you can sign in without a password.
                </FieldDescription>
              </div>
              <Field data-invalid={fieldErrors.email !== undefined || undefined}>
                <FieldLabel htmlFor="email-auth-email">
                  Email<span className="sr-only"> address</span>
                </FieldLabel>
                <Input
                  ref={emailInputRef}
                  id="email-auth-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  aria-invalid={fieldErrors.email !== undefined || undefined}
                  aria-describedby={emailErrorId}
                  onChange={(event) => {
                    setEmail(event.currentTarget.value);
                    clearFieldError("email");
                    setRequestError(null);
                  }}
                />
                {fieldErrors.email === undefined ? null : (
                  <Notice id={emailErrorId} tone="destructive">
                    {fieldErrors.email}
                  </Notice>
                )}
              </Field>
            </>
          )}
          {requestError === null ? null : (
            <Notice id={requestErrorId} tone="destructive" title={requestError.title}>
              {requestError.description}
            </Notice>
          )}
          <Field>
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting}
              aria-describedby={requestErrorId}
            >
              {isSubmitting ? <LoaderCircleIcon className="animate-spin" /> : null}
              {isVerifyStep ? "Verify code" : "Send code"}
            </Button>
            {isVerifyStep ? (
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  className="sm:flex-1"
                  disabled={isSubmitting}
                  onClick={() => void handleResendCode()}
                >
                  Resend code
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="sm:flex-1"
                  disabled={isSubmitting}
                  onClick={handleUseDifferentEmail}
                >
                  Use a different email
                </Button>
              </div>
            ) : (
              <FieldDescription className="text-center">
                {alternatePrompt}{" "}
                <Link
                  className="underline underline-offset-4 hover:text-foreground"
                  to={alternateHref}
                >
                  {alternateLinkLabel}
                </Link>
              </FieldDescription>
            )}
          </Field>
        </FieldGroup>
      </form>
    </AuthLayout>
  );
}

function LoginPage(): JSX.Element {
  return (
    <EmailAuthPage
      title="Continue to DebugBundle"
      heading="Continue to DebugBundle"
      description="Choose a login option below to access your account."
      alternatePrompt="Don't have an account?"
      alternateLinkHref="/signup"
      alternateLinkLabel="Sign up here"
    />
  );
}

function SignupPage(): JSX.Element {
  return (
    <EmailAuthPage
      title="Create your DebugBundle account"
      heading="Create your DebugBundle account"
      description="Choose a sign up option below to create your account."
      alternatePrompt="Already have an account?"
      alternateLinkHref="/login"
      alternateLinkLabel="Login here"
      showTrialIntentPanel
    />
  );
}

function GithubAuthCallbackPage(): JSX.Element {
  const { session, refreshSession } = useSession();
  const [searchParams] = useSearchParams();
  const error = searchParams.get("error");
  const [isRefreshing, setIsRefreshing] = useState(error === null);

  useEffect(() => {
    if (error !== null) {
      setIsRefreshing(false);
      return;
    }

    void (async () => {
      try {
        await refreshSession();
      } finally {
        setIsRefreshing(false);
      }
    })();
  }, [error, refreshSession]);

  if (session !== null) {
    return <Navigate replace to="/dashboard" />;
  }

  const descriptionByError: Record<string, string> = {
    invalid_oauth_state:
      "The GitHub sign-in state expired or did not match this browser session. Start the sign-in flow again.",
    oauth_exchange_failed:
      "GitHub sign-in could not be completed. Check the local OAuth app configuration and try again."
  };

  return (
    <AuthLayout
      title="Continue with GitHub"
      description="Complete GitHub sign-in to start a browser session."
    >
      <div className="space-y-5">
        {isRefreshing ? (
          <CalloutCard
            eyebrow="GitHub sign-in"
            title="Completing sign-in"
            description="We are finalizing your GitHub session now."
          >
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <LoaderCircleIcon className="animate-spin" />
              Finalizing browser session
            </div>
          </CalloutCard>
        ) : (
          <CalloutCard
            eyebrow="GitHub sign-in"
            title="Sign-in was not completed"
            description={
              error === null
                ? "No active browser session was created. Start GitHub sign-in again."
                : (descriptionByError[error] ??
                  "GitHub sign-in could not be completed. Start the flow again.")
            }
            tone="warning"
          />
        )}

        {!isRefreshing ? (
          <div className="flex flex-col gap-3">
            <GithubLink />
            <Button asChild variant="ghost" className="w-full justify-center">
              <Link to="/login">Back to login</Link>
            </Button>
          </div>
        ) : null}
      </div>
    </AuthLayout>
  );
}

function DashboardPage(): JSX.Element {
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <SectionCards />
      <DashboardIncidentsToday />
      <RecentProjectsTable />
    </div>
  );
}

function LoadingScreen(): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <LoaderCircleIcon className="animate-spin" />
        Loading workspace
      </div>
    </div>
  );
}
