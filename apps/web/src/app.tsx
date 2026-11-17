import { LoginPage, SignupPage, GithubAuthCallbackPage } from "./pages/email-auth-page.js";
import { OfferProgrammesPage } from "./pages/offer-programmes-page.js";
import { resolvePublicStatusRoute } from "./lib/public-status-routing.js";
import { PublicStatusPage } from "./pages/public-status-page.js";
import { LoaderCircleIcon } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import {
  BrowserRouter,
  MemoryRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate
} from "react-router-dom";
import { Toaster } from "sonner";

import { AppSidebar } from "./components/system/app-sidebar.js";
import { DashboardSetupProvider } from "./components/system/dashboard-setup-context.js";
import { WorkspaceHealthAlertProvider } from "./components/system/workspace-health-alert-context.js";
import { OrganizationPeoplePage } from "./pages/organization-people-page.js";
import { ReferralsPage } from "./pages/referrals-page.js";
import { ReportsPage } from "./pages/reports-page.js";
import { ReportPage } from "./pages/report-page.js";
import { ReportEditorPage } from "./pages/report-editor-page.js";
import { ReferralPayoutsPage } from "./pages/referral-payouts-page.js";
import { OrganizationAcceptPage } from "./pages/organization-accept-page.js";
import { createProjectRoutes } from "./app-project-routes.js";
import { AppUpdateNotifier } from "./components/system/app-update-notifier.js";
import { LoadErrorCallout } from "./components/system/load-error-callout.js";
import { DashboardIncidentsToday } from "./components/system/dashboard-incidents-today.js";
import { RecentProjectsTable } from "./components/system/recent-projects-table.js";
import {
  ProjectRouteProvider,
  type ActiveProjectRoute
} from "./components/system/project-route-context.js";
import { SectionCards } from "./components/system/section-cards.js";
import { SiteHeader } from "./components/system/site-header.js";
import { logout, type SessionRecord } from "./lib/api.js";
import { showErrorToast, showInfoToast, showSuccessToast } from "./lib/notify.js";
import {
  setWebDogfoodingAnalyticsAuthState,
  trackWebDogfoodingPageView
} from "./lib/dogfooding.js";
import { SessionProvider, useSession } from "./lib/session.js";
import { BillingPage } from "./pages/billing-page.js";
import { AdminAnalyticsPage } from "./pages/admin-analytics-page.js";
import { ImprovementsPage } from "./pages/improvements-page.js";
import { MemberTokensPage } from "./pages/member-tokens-page.js";
import { ProjectsPage } from "./pages/management-pages.js";
import { IncidentsPage } from "./pages/incidents-page.js";
import { IncidentDetailPage } from "./pages/incident-detail-page.js";
import { HealthStatusPage } from "./pages/health-status-page.js";
import { ProjectInvitePage } from "./pages/project-invite-page.js";
import { SettingsPage } from "./pages/settings-page.js";
import { OpenAiConsentPage } from "./pages/openai-consent-page.js";
import { OpenAiReviewerPage } from "./pages/openai-reviewer-page.js";
import { WorkspaceAnalyticsPage } from "./pages/workspace-analytics-page.js";
import { SidebarInset, SidebarProvider } from "./components/ui/sidebar.js";
import { isSystemEmailReviewEnabled } from "./lib/system-email-previews.js";
import {
  OPENAI_PLUGIN_PREVIEW_ROUTE,
  isOpenAiPluginPreviewEnabled
} from "./lib/openai-plugin-preview-gate.js";
import { createOpenAiPluginPreviewRoute } from "./openai-plugin-preview-route.js";
import { ThemeProvider, useTheme } from "./lib/theme.js";
import { TooltipProvider } from "./components/ui/tooltip.js";
import { SystemEmailReviewPage } from "./pages/system-email-review-page.js";

interface AppProps {
  initialEntries?: string[];
}

export function App({ initialEntries }: AppProps): JSX.Element {
  const publicRoute = resolvePublicStatusRoute(
    import.meta.env.VITE_PUBLIC_STATUS_PAGE_BASE_URL,
    window.location.origin
  );
  const router =
    initialEntries === undefined ? (
      <BrowserRouter>
        <Routes>
          <Route path={publicRoute.path} element={<PublicStatusPage />} />
          <Route element={<PrivateAppRoot />}>
            <Route index element={<RootRedirect />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/invite" element={<ProjectInvitePage />} />
            <Route path="/organizations/accept" element={<OrganizationAcceptPage />} />
            <Route path="/auth/github/callback" element={<GithubAuthCallbackPage />} />
            <Route path="/oauth/consent" element={<OpenAiConsentPage />} />
            <Route path="/oauth/reviewer" element={<OpenAiReviewerPage />} />
            {createOpenAiPluginPreviewRoute(<LoadingScreen />)}
            <Route path="/analytics" element={<AdminAnalyticsRoute />} />
            <Route path="/programmes" element={<AdminAnalyticsRoute programmes />} />
            <Route element={<ProtectedLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/incidents" element={<IncidentsPage />} />
              <Route path="/incidents/:incidentId" element={<IncidentDetailPage />} />
              <Route path="/health-status" element={<HealthStatusPage />} />
              <Route path="/improvements" element={<ImprovementsPage />} />
              <Route path="/improvements/reviews" element={<ImprovementsPage />} />
              <Route path="/analytics/workspace" element={<WorkspaceAnalyticsPage />} />
              <Route path="/analytics/workspace/bundles" element={<WorkspaceAnalyticsPage />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              {isSystemEmailReviewEnabled() ? (
                <Route path="/__dev/system-emails" element={<SystemEmailReviewPage />} />
              ) : null}
              <Route path="/organization" element={<Navigate replace to="/projects" />} />
              {createProjectRoutes()}
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/settings/people" element={<OrganizationPeoplePage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/reports/definitions/new" element={<ReportEditorPage />} />
              <Route
                path="/reports/definitions/:definitionId/edit"
                element={<ReportEditorPage />}
              />
              <Route path="/reports/:organizationId/:runId" element={<ReportPage />} />
              <Route path="/settings/referrals" element={<ReferralsPage />} />
              <Route path="/settings/referrals/payouts" element={<ReferralPayoutsPage />} />
              <Route path="/access-tokens" element={<MemberTokensPage />} />
            </Route>
            <Route path="*" element={<RootRedirect />} />
          </Route>
        </Routes>
      </BrowserRouter>
    ) : (
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path={publicRoute.path} element={<PublicStatusPage />} />
          <Route element={<PrivateAppRoot />}>
            <Route index element={<RootRedirect />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/invite" element={<ProjectInvitePage />} />
            <Route path="/organizations/accept" element={<OrganizationAcceptPage />} />
            <Route path="/auth/github/callback" element={<GithubAuthCallbackPage />} />
            <Route path="/oauth/consent" element={<OpenAiConsentPage />} />
            <Route path="/oauth/reviewer" element={<OpenAiReviewerPage />} />
            {createOpenAiPluginPreviewRoute(<LoadingScreen />)}
            <Route path="/analytics" element={<AdminAnalyticsRoute />} />
            <Route path="/programmes" element={<AdminAnalyticsRoute programmes />} />
            <Route element={<ProtectedLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/incidents" element={<IncidentsPage />} />
              <Route path="/incidents/:incidentId" element={<IncidentDetailPage />} />
              <Route path="/health-status" element={<HealthStatusPage />} />
              <Route path="/improvements" element={<ImprovementsPage />} />
              <Route path="/improvements/reviews" element={<ImprovementsPage />} />
              <Route path="/analytics/workspace" element={<WorkspaceAnalyticsPage />} />
              <Route path="/analytics/workspace/bundles" element={<WorkspaceAnalyticsPage />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              {isSystemEmailReviewEnabled() ? (
                <Route path="/__dev/system-emails" element={<SystemEmailReviewPage />} />
              ) : null}
              <Route path="/organization" element={<Navigate replace to="/projects" />} />
              {createProjectRoutes()}
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/settings/people" element={<OrganizationPeoplePage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/reports/definitions/new" element={<ReportEditorPage />} />
              <Route
                path="/reports/definitions/:definitionId/edit"
                element={<ReportEditorPage />}
              />
              <Route path="/reports/:organizationId/:runId" element={<ReportPage />} />
              <Route path="/settings/referrals" element={<ReferralsPage />} />
              <Route path="/settings/referrals/payouts" element={<ReferralPayoutsPage />} />
              <Route path="/access-tokens" element={<MemberTokensPage />} />
            </Route>
            <Route path="*" element={<RootRedirect />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

  return <TooltipProvider>{router}</TooltipProvider>;
}

function PrivateAppRoot(): JSX.Element {
  if (
    resolvePublicStatusRoute(
      import.meta.env.VITE_PUBLIC_STATUS_PAGE_BASE_URL,
      window.location.origin
    ).dedicated
  )
    return <PublicStatusPage />;
  return (
    <ThemeProvider>
      <SessionProvider>
        <RootGate />
        <AppUpdateNotifier />
        <AppToaster />
      </SessionProvider>
    </ThemeProvider>
  );
}

function AppToaster(): JSX.Element {
  const { resolvedTheme } = useTheme();

  return <Toaster theme={resolvedTheme} position="bottom-right" richColors closeButton={false} />;
}

function RootGate(): JSX.Element {
  const { isLoading, session, sessionInvalidationCount, sessionLoadError, retrySession } =
    useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const lastHandledInvalidationCount = useRef(0);

  useEffect(() => {
    setWebDogfoodingAnalyticsAuthState(
      isLoading || sessionLoadError ? "unknown" : session === null ? "anonymous" : "authenticated"
    );
  }, [isLoading, session, sessionLoadError]);

  useEffect(() => {
    trackWebDogfoodingPageView(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    if (
      sessionInvalidationCount === 0 ||
      sessionInvalidationCount === lastHandledInvalidationCount.current
    ) {
      return;
    }

    lastHandledInvalidationCount.current = sessionInvalidationCount;
    if (session !== null || isPublicAuthPath(location.pathname)) return;
    showInfoToast("Your session expired. Please sign in again.");
    void navigate("/login", { replace: true });
  }, [location.pathname, navigate, sessionInvalidationCount, session]);

  if (sessionLoadError && session === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md">
          <LoadErrorCallout
            title="Your session could not be loaded"
            pending={isLoading}
            onRetry={() => void retrySession()}
          />
        </div>
      </div>
    );
  }

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
    pathname.startsWith("/auth/github/callback") ||
    pathname === "/oauth/consent" ||
    pathname === "/oauth/reviewer" ||
    (isOpenAiPluginPreviewEnabled() && pathname === OPENAI_PLUGIN_PREVIEW_ROUTE)
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
    <ProtectedShell
      key={`${session.user_id}:${session.organization_id}`}
      session={session}
      setSession={setSession}
    >
      <Outlet />
    </ProtectedShell>
  );
}

function AdminAnalyticsRoute({ programmes = false }: { programmes?: boolean }): JSX.Element {
  const { session, setSession } = useSession();

  if (session === null) {
    return <Navigate replace to="/" />;
  }

  return (
    <ProtectedShell session={session} setSession={setSession}>
      {programmes ? <OfferProgrammesPage /> : <AdminAnalyticsPage />}
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
    <DashboardSetupProvider session={session}>
      <WorkspaceHealthAlertProvider session={session}>
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
      </WorkspaceHealthAlertProvider>
    </DashboardSetupProvider>
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
