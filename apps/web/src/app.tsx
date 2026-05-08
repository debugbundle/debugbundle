import { CreditCardIcon, GalleryVerticalEndIcon, KeySquareIcon, LoaderCircleIcon, PlusIcon } from "lucide-react";
import React, { useEffect, useState } from "react";
import { BrowserRouter, Link, MemoryRouter, Navigate, Outlet, Route, Routes, useNavigate, useSearchParams } from "react-router-dom";
import { Toaster } from "sonner";

import { AppSidebar } from "./components/system/app-sidebar.js";
import { CalloutCard } from "./components/system/callout-card.js";
import { DialogFormContent } from "./components/system/dialog-form-content.js";
import { PageHeader } from "./components/system/page-header.js";
import { PlaintextTokenReveal } from "./components/system/plaintext-token-reveal.js";
import { RecentProjectsTable } from "./components/system/recent-projects-table.js";
import { ResourceListState } from "./components/system/resource-list-state.js";
import { GitHubMark } from "./components/system/github-mark.js";
import { ProjectRouteProvider } from "./components/system/project-route-context.js";
import { SectionCards } from "./components/system/section-cards.js";
import { SiteHeader } from "./components/system/site-header.js";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "./components/ui/alert-dialog.js";
import { Button } from "./components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card.js";
import { Dialog, DialogTrigger } from "./components/ui/dialog.js";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "./components/ui/empty.js";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "./components/ui/field.js";
import { Input } from "./components/ui/input.js";
import { Separator } from "./components/ui/separator.js";
import { Skeleton } from "./components/ui/skeleton.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table.js";
import {
  buildApiUrl,
  createMemberToken,
  listMemberTokens,
  logout,
  requestEmailCode,
  revokeMemberToken,
  verifyEmailCode,
  type CreatedMemberToken,
  type MemberTokenRecord
} from "./lib/api.js";
import { showErrorToast, showSuccessToast } from "./lib/notify.js";
import { SessionProvider, useSession } from "./lib/session.js";
import { BillingPage } from "./pages/billing-page.js";
import { OrganizationMembersPage, ProjectsPage, ProjectTokensPage } from "./pages/management-pages.js";
import { IncidentsPage } from "./pages/incidents-page.js";
import { IncidentDetailPage } from "./pages/incident-detail-page.js";
import { OrganizationOverviewPage } from "./pages/organization-overview-page.js";
import { ProjectLayout } from "./components/system/project-layout.js";
import { ProjectAlertsPage } from "./pages/project-alerts-page.js";
import { ProjectGitHubPage } from "./pages/project-github-page.js";
import { ProjectBundlesPage, ProjectIncidentsPage, ProjectOverviewPage } from "./pages/project-overview-page.js";
import { ProjectSettingsPage } from "./pages/project-settings-page.js";
import { SettingsPage } from "./pages/settings-page.js";
import { ProjectWebhooksPage } from "./pages/project-webhooks-page.js";
import { SidebarInset, SidebarProvider } from "./components/ui/sidebar.js";
import { ThemeProvider, useTheme } from "./lib/theme.js";
import { TooltipProvider } from "./components/ui/tooltip.js";

const GITHUB_START_HREF = buildApiUrl("/v1/auth/github/start");
const TERMS_OF_SERVICE_URL = "https://debugbundle.com/terms";
const PRIVACY_POLICY_URL = "https://debugbundle.com/privacy";

interface AppProps {
  initialEntries?: string[];
}

export function App({ initialEntries }: AppProps): JSX.Element {
  const router =
    initialEntries === undefined ? (
      <BrowserRouter>
        <Routes>
          <Route element={<RootGate />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/auth/github/callback" element={<GithubAuthCallbackPage />} />
            <Route element={<ProtectedLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/incidents" element={<IncidentsPage />} />
              <Route path="/incidents/:incidentId" element={<IncidentDetailPage />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route
                path="/organization"
                element={
                  <TeamPlanGate
                    title="Shared workspace requires Team"
                    description="Shared workspace views and member management are only available on Team. Free and Solo stay focused on project setup."
                  >
                    <OrganizationOverviewPage />
                  </TeamPlanGate>
                }
              />
              <Route path="/projects/:projectId" element={<ProjectLayout />}>
                <Route index element={<ProjectOverviewPage />} />
                <Route path="incidents" element={<ProjectIncidentsPage />} />
                <Route path="incidents/:incidentId" element={<IncidentDetailPage />} />
                <Route path="bundles" element={<ProjectBundlesPage />} />
                <Route path="bundles/:incidentId" element={<IncidentDetailPage />} />
                <Route path="github" element={<ProjectGitHubPage />} />
                <Route path="settings" element={<ProjectSettingsPage />} />
                <Route path="tokens" element={<ProjectTokensPage />} />
                <Route path="alerts" element={<ProjectAlertsPage />} />
                <Route path="webhooks" element={<ProjectWebhooksPage />} />
              </Route>
              <Route
                path="/organization/members"
                element={
                  <TeamPlanGate
                    title="Member management requires Team"
                    description="Member management is a Team feature. Upgrade to open this page."
                  >
                    <OrganizationMembersPage />
                  </TeamPlanGate>
                }
              />
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
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/auth/github/callback" element={<GithubAuthCallbackPage />} />
            <Route element={<ProtectedLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/incidents" element={<IncidentsPage />} />
              <Route path="/incidents/:incidentId" element={<IncidentDetailPage />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route
                path="/organization"
                element={
                  <TeamPlanGate
                    title="Shared workspace requires Team"
                    description="Shared workspace views and member management are only available on Team. Free and Solo stay focused on project setup."
                  >
                    <OrganizationOverviewPage />
                  </TeamPlanGate>
                }
              />
              <Route path="/projects/:projectId" element={<ProjectLayout />}>
                <Route index element={<ProjectOverviewPage />} />
                <Route path="incidents" element={<ProjectIncidentsPage />} />
                <Route path="incidents/:incidentId" element={<IncidentDetailPage />} />
                <Route path="bundles" element={<ProjectBundlesPage />} />
                <Route path="bundles/:incidentId" element={<IncidentDetailPage />} />
                <Route path="github" element={<ProjectGitHubPage />} />
                <Route path="settings" element={<ProjectSettingsPage />} />
                <Route path="tokens" element={<ProjectTokensPage />} />
                <Route path="alerts" element={<ProjectAlertsPage />} />
                <Route path="webhooks" element={<ProjectWebhooksPage />} />
              </Route>
              <Route
                path="/organization/members"
                element={
                  <TeamPlanGate
                    title="Member management requires Team"
                    description="Member management is a Team feature. Upgrade to open this page."
                  >
                    <OrganizationMembersPage />
                  </TeamPlanGate>
                }
              />
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
  const { isLoading } = useSession();

  if (isLoading) {
    return <LoadingScreen />;
  }

  return <Outlet />;
}

function RootRedirect(): JSX.Element {
  const { session } = useSession();
  return <Navigate replace to={session === null ? "/login" : "/dashboard"} />;
}

function TeamPlanGate({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}): JSX.Element {
  const { session } = useSession();

  if (session === null) {
    return <Navigate replace to="/login" />;
  }

  if (session.organization_plan === "team") {
    return <>{children}</>;
  }

  return (
    <CalloutCard eyebrow="Team plan" title={title} description={description} tone="warning">
      <Button asChild type="button" variant="outline">
        <Link to="/billing">
          <CreditCardIcon data-icon="inline-start" />
          Review plan options
        </Link>
      </Button>
    </CalloutCard>
  );
}

function ProtectedLayout(): JSX.Element {
  const { session, setSession } = useSession();
  const navigate = useNavigate();
  const [activeProject, setActiveProject] = useState<{ projectId: string; projectName: string } | null>(null);

  if (session === null) {
    return <Navigate replace to="/login" />;
  }

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
            <Outlet />
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
          <Link to="/login" className="flex items-center gap-2 self-center font-medium transition-colors hover:text-foreground/80">
            <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <GalleryVerticalEndIcon className="size-4" />
            </div>
            DebugBundle
          </Link>
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
          By clicking continue, you agree to our{" "}
          <a href={TERMS_OF_SERVICE_URL} className="underline underline-offset-4 hover:text-foreground" target="_blank" rel="noreferrer">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href={PRIVACY_POLICY_URL} className="underline underline-offset-4 hover:text-foreground" target="_blank" rel="noreferrer">
            Privacy Policy
          </a>.
        </FieldDescription>
      </div>
    </div>
  );
}

function GithubLink(): JSX.Element {
  return (
    <Button asChild variant="outline" className="w-full justify-center">
      <a href={GITHUB_START_HREF}>
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

function EmailAuthPage({
  title,
  heading,
  description,
  alternateLinkHref,
  alternateLinkLabel,
  alternatePrompt
}: {
  title: string;
  heading: string;
  description: string;
  alternateLinkHref: string;
  alternateLinkLabel: string;
  alternatePrompt: string;
}): JSX.Element {
  const { session, setSession } = useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"request" | "verify">("request");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (session !== null) {
    return <Navigate replace to="/dashboard" />;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (step === "request") {
        await requestEmailCode({ email, accepted_terms: true });
        setStep("verify");
        setCode("");
        showSuccessToast("Sign-in code sent successfully.");
      } else {
        const nextSession = await verifyEmailCode({ email, code });
        setSession(nextSession);
        showSuccessToast("Signed in successfully.");
        void navigate("/dashboard", { replace: true });
      }
    } catch {
      setError(step === "request" ? "We could not send a sign-in code. Try again." : "That code is invalid or expired. Request a new code and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendCode(): Promise<void> {
    setError(null);
    setIsSubmitting(true);

    try {
      await requestEmailCode({ email, accepted_terms: true });
      setCode("");
      showSuccessToast("New sign-in code sent successfully.");
    } catch {
      setError("We could not resend the sign-in code. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleUseDifferentEmail(): void {
    setStep("request");
    setCode("");
    setError(null);
  }

  return (
    <AuthLayout title={title} heading={heading} description={description}>
      <form className="flex flex-col gap-6" onSubmit={(event) => void handleSubmit(event)}>
        <FieldGroup>
          <Field>
            <GithubLink />
          </Field>
          <AuthMethodDivider />
          <Field>
            <FieldLabel htmlFor="email-auth-email">
              Email<span className="sr-only"> address</span>
            </FieldLabel>
            <Input
              id="email-auth-email"
              type="email"
              autoComplete="email"
              value={email}
              disabled={step === "verify"}
              onChange={(event) => setEmail(event.currentTarget.value)}
            />
            {step === "request" ? (
              <FieldDescription>
                We&apos;ll email you a six-digit code.
              </FieldDescription>
            ) : null}
          </Field>
          {step === "verify" ? (
            <CalloutCard
              eyebrow="Code sent"
              title="Check your inbox"
              description={`Enter the six-digit code we sent to ${email}.`}
              tone="neutral"
            />
          ) : null}
          {step === "verify" ? (
            <Field>
              <FieldLabel htmlFor="email-auth-code">Six-digit code</FieldLabel>
              <Input
                id="email-auth-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.currentTarget.value.replace(/\D+/g, "").slice(0, 6))}
              />
              <FieldDescription>Codes expire quickly. Request a new one if you switch emails or wait too long.</FieldDescription>
            </Field>
          ) : null}
          {error === null ? null : <FieldError>{error}</FieldError>}
          <Field>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <LoaderCircleIcon className="animate-spin" /> : null}
              {step === "request" ? "Email me a code" : "Continue with code"}
            </Button>
            {step === "verify" ? (
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <Button type="button" variant="outline" className="sm:flex-1" disabled={isSubmitting} onClick={() => void handleResendCode()}>
                  Resend code
                </Button>
                <Button type="button" variant="ghost" className="sm:flex-1" disabled={isSubmitting} onClick={handleUseDifferentEmail}>
                  Use a different email
                </Button>
              </div>
            ) : null}
            <FieldDescription className="text-center">
              {alternatePrompt} <Link className="underline underline-offset-4 hover:text-foreground" to={alternateLinkHref}>{alternateLinkLabel}</Link>
            </FieldDescription>
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
      heading="Continue with email"
      description="Use a one-time email code for browser access."
      alternatePrompt="Need the signup route instead?"
      alternateLinkHref="/signup"
      alternateLinkLabel="Open sign up"
    />
  );
}

function SignupPage(): JSX.Element {
  return (
    <EmailAuthPage
      title="Create your DebugBundle account"
      heading="Continue with email"
      description="Use a one-time email code to join the private launch and start a browser session."
      alternatePrompt="Already have an account route handy?"
      alternateLinkHref="/login"
      alternateLinkLabel="Open login"
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
    invalid_oauth_state: "The GitHub sign-in state expired or did not match this browser session. Start the sign-in flow again.",
    oauth_exchange_failed: "GitHub sign-in could not be completed. Check the local OAuth app configuration and try again."
  };

  return (
    <AuthLayout title="Continue with GitHub" description="Complete GitHub sign-in to start a browser session.">
      <div className="space-y-5">
        {isRefreshing ? (
          <CalloutCard eyebrow="GitHub sign-in" title="Completing sign-in" description="We are finalizing your GitHub session now.">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <LoaderCircleIcon className="animate-spin" />
              Finalizing browser session
            </div>
          </CalloutCard>
        ) : (
          <CalloutCard
            eyebrow="GitHub sign-in"
            title="Sign-in was not completed"
            description={error === null ? "No active browser session was created. Start GitHub sign-in again." : (descriptionByError[error] ?? "GitHub sign-in could not be completed. Start the flow again.")}
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
      <RecentProjectsTable />
    </div>
  );
}

function MemberTokensPage(): JSX.Element {
  const { session } = useSession();
  const [tokens, setTokens] = useState<MemberTokenRecord[] | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [createdToken, setCreatedToken] = useState<CreatedMemberToken | null>(null);

  useEffect(() => {
    if (session === null) {
      return;
    }

    void (async () => {
      const nextTokens = await listMemberTokens();
      setTokens(nextTokens);
    })();
  }, [session]);

  if (session === null) {
    return <Navigate replace to="/login" />;
  }

  const isVerified = session.email_verified_at !== null;
  const canCreate = isVerified || (tokens !== null && tokens.length > 0);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    try {
      const created = await createMemberToken({ label });
      setCreatedToken(created);
      setTokens((current) => {
        const next = current ?? [];
        return [...next, { ...created, plaintext: undefined }];
      });
      setLabel("");
      setIsCreateOpen(false);
      showSuccessToast("Member token created successfully.");
    } catch {
      showErrorToast("Could not create member token.");
    }
  }

  async function handleRevoke(tokenId: string): Promise<void> {
    try {
      await revokeMemberToken(tokenId);
      setTokens((current) => (current ?? []).filter((token) => token.token_id !== tokenId));
      showSuccessToast("Member token revoked successfully.");
    } catch {
      showErrorToast("Could not revoke member token.");
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        description="Issue member-scoped credentials for CLI and MCP access. Plaintext token material is shown once and should move straight into a secret manager."
        actions={
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button type="button" disabled={!canCreate}>
                <PlusIcon data-icon="inline-start" />
                Create member token
              </Button>
            </DialogTrigger>
            <DialogFormContent
              title="Create token"
              description="Create a member token for CLI or MCP automation."
              footer={<Button type="submit">Create token</Button>}
              onSubmit={(event) => void handleCreate(event)}
            >
                <Field>
                  <FieldLabel htmlFor="member-token-label">Token label</FieldLabel>
                  <Input id="member-token-label" value={label} onChange={(event) => setLabel(event.currentTarget.value)} />
                  <FieldDescription>Use a label that identifies the automation client or environment.</FieldDescription>
                </Field>
            </DialogFormContent>
          </Dialog>
        }
      />

      {!canCreate ? (
        <CalloutCard
          eyebrow="Verification required"
          title="Token issuance paused"
          description="Complete email sign-in again to verify this address before creating your first member token."
          tone="warning"
        />
      ) : null}

      {createdToken?.plaintext === undefined ? null : <PlaintextTokenReveal value={createdToken.plaintext} />}

      <Card>
        <CardHeader>
          <CardTitle>Issued tokens</CardTitle>
        </CardHeader>
        <CardContent>
          <ResourceListState
            items={tokens}
            loading={
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            }
            empty={
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <KeySquareIcon />
                  </EmptyMedia>
                  <EmptyTitle>No member tokens yet</EmptyTitle>
                  <EmptyDescription>Issue a member token when you need CLI or MCP access outside the signed-in browser workspace.</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button type="button" onClick={() => setIsCreateOpen(true)} disabled={!canCreate}>
                    <PlusIcon data-icon="inline-start" />
                    Create member token
                  </Button>
                </EmptyContent>
              </Empty>
            }
          >
            {(resolvedTokens) => (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Last used</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resolvedTokens.map((token) => (
                    <TableRow key={token.token_id}>
                      <TableCell className="font-medium">{token.label}</TableCell>
                      <TableCell>{formatDate(token.created_at)}</TableCell>
                      <TableCell>{token.last_used_at === null ? "Never" : formatDate(token.last_used_at)}</TableCell>
                      <TableCell className="text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button type="button" variant="ghost" size="sm">Revoke</Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Revoke member token</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will immediately invalidate the token for CLI and MCP authentication.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => void handleRevoke(token.token_id)}>Revoke token</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ResourceListState>
        </CardContent>
      </Card>
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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}