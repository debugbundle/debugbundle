import { Route } from "react-router-dom";

import { ProjectLayout } from "./components/system/project-layout.js";
import { ImprovementDetailPage } from "./pages/improvement-detail-page.js";
import { IncidentDetailPage } from "./pages/incident-detail-page.js";
import { ProjectTokensPage } from "./pages/management-pages.js";
import { ProjectAlertsPage } from "./pages/project-alerts-page.js";
import { ProjectAnalyticsAudiencesPage } from "./pages/project-analytics-audiences-page.js";
import { ProjectAnalyticsBundleDetailPage } from "./pages/project-analytics-bundle-detail-page.js";
import { ProjectAnalyticsBundlesPage } from "./pages/project-analytics-bundles-page.js";
import { ProjectAnalyticsBundleCreatePage } from "./pages/project-analytics-bundle-create-page.js";
import { ProjectAnalyticsFunnelsPage } from "./pages/project-analytics-funnels-page.js";
import { ProjectAnalyticsJourneySamplePage } from "./pages/project-analytics-journey-sample-page.js";
import { ProjectAnalyticsJourneysPage } from "./pages/project-analytics-journeys-page.js";
import { ProjectAnalyticsLayout } from "./pages/project-analytics-layout.js";
import { ProjectAnalyticsOpportunitiesPage } from "./pages/project-analytics-opportunities-page.js";
import { ProjectAnalyticsOpportunityDetailPage } from "./pages/project-analytics-opportunity-detail-page.js";
import { ProjectAnalyticsPage } from "./pages/project-analytics-page.js";
import { ProjectAnalyticsRoutesPage } from "./pages/project-analytics-routes-page.js";
import { ProjectGitHubPage } from "./pages/project-github-page.js";
import { ProjectHealthPage } from "./pages/project-health-page.js";
import { ProjectImprovementsPage } from "./pages/project-improvements-page.js";
import { ProjectMembersPage } from "./pages/project-members-page.js";
import {
  ProjectBundlesPage,
  ProjectIncidentsPage,
  ProjectOverviewPage
} from "./pages/project-overview-page.js";
import { ProjectProbesPage } from "./pages/project-probes-page.js";
import { ProjectSettingsPage } from "./pages/project-settings-page.js";
import { ProjectWebhooksPage } from "./pages/project-webhooks-page.js";

export function createProjectRoutes(): JSX.Element {
  return (
    <Route path="/projects/:projectId" element={<ProjectLayout />}>
      <Route index element={<ProjectOverviewPage />} />
      <Route path="incidents" element={<ProjectIncidentsPage />} />
      <Route path="incidents/:incidentId" element={<IncidentDetailPage />} />
      <Route path="improvements" element={<ProjectImprovementsPage />} />
      <Route path="improvements/:improvementId" element={<ImprovementDetailPage />} />
      <Route path="analytics/journeys/:sampleId" element={<ProjectAnalyticsJourneySamplePage />} />
      <Route
        path="analytics/opportunities/:opportunityId"
        element={<ProjectAnalyticsOpportunityDetailPage />}
      />
      <Route
        path="analytics/bundles/:generationId"
        element={<ProjectAnalyticsBundleDetailPage />}
      />
      <Route path="analytics" element={<ProjectAnalyticsLayout />}>
        <Route index element={<ProjectAnalyticsPage />} />
        <Route path="routes" element={<ProjectAnalyticsRoutesPage />} />
        <Route path="funnels" element={<ProjectAnalyticsFunnelsPage />} />
        <Route path="audiences" element={<ProjectAnalyticsAudiencesPage />} />
        <Route path="journeys" element={<ProjectAnalyticsJourneysPage />} />
        <Route path="opportunities" element={<ProjectAnalyticsOpportunitiesPage />} />
        <Route path="bundles/new" element={<ProjectAnalyticsBundleCreatePage />} />
        <Route path="bundles" element={<ProjectAnalyticsBundlesPage />} />
      </Route>
      <Route path="bundles" element={<ProjectBundlesPage />} />
      <Route path="bundles/:incidentId" element={<IncidentDetailPage />} />
      <Route path="health" element={<ProjectHealthPage />} />
      <Route path="probes" element={<ProjectProbesPage />} />
      <Route path="github" element={<ProjectGitHubPage />} />
      <Route path="members" element={<ProjectMembersPage />} />
      <Route path="settings" element={<ProjectSettingsPage />} />
      <Route path="tokens" element={<ProjectTokensPage />} />
      <Route path="alerts" element={<ProjectAlertsPage />} />
      <Route path="webhooks" element={<ProjectWebhooksPage />} />
    </Route>
  );
}
