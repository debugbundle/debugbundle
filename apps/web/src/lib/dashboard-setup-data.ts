import type { DashboardSetupFacts } from "../../../../packages/shared-types/src/dashboard-setup.js";
import { getTierCapabilities } from "../../../../packages/shared-types/src/tier-capabilities.js";
import { reviewPolicy } from "../../../../packages/smart-improvements/src/review-contract.js";
import { reportPolicy } from "../../../../packages/smart-reports/src/report-policy.js";
import {
  listIncidents,
  listMemberTokens,
  listProjects,
  getProjectAnalyticsSettings,
  type SessionRecord,
  type ProjectRecord
} from "./api.js";
import { improvementReviewApi } from "./improvement-review-api.js";
import { reportApi, reportScope } from "./report-api.js";
import { reportManageableProjects } from "./report-access.js";
import { getProjectEffectiveRole } from "./project-access.js";

export function emptyDashboardSetupFacts(session: SessionRecord): DashboardSetupFacts {
  return {
    accessToken: null,
    project: null,
    incident: null,
    analytics: null,
    analyticsProjectId: null,
    offerAnalytics:
      session.role === "owner" && getTierCapabilities(session.organization_plan).analytics_bundle,
    improvements: null,
    reports: null,
    offerImprovements:
      session.role === "owner" &&
      reviewPolicy(session.organization_plan, session.self_hosted).available,
    offerReports:
      session.role === "owner" &&
      reportPolicy(session.organization_plan, session.self_hosted).available
  };
}

/** Bounded read-only observations; opening onboarding must never provision or enable anything. */
export async function loadDashboardSetupFacts(
  session: SessionRecord,
  incidentReceived: boolean,
  includeOptional = false
): Promise<DashboardSetupFacts> {
  const facts = emptyDashboardSetupFacts(session);
  const scope = reportScope(session.organization_id);
  const [projects, tokens, improvements] = await Promise.allSettled([
    listProjects(),
    listMemberTokens(true),
    includeOptional && facts.offerImprovements
      ? improvementReviewApi.settings(scope)
      : Promise.resolve(null)
  ]);
  if (tokens.status === "fulfilled" && Array.isArray(tokens.value)) {
    facts.accessToken = tokens.value.some(
      (token) =>
        token.user_id === session.user_id &&
        token.organization_id === session.organization_id &&
        token.revoked_at === null &&
        (token.expires_at === null || Date.parse(token.expires_at) > Date.now())
    );
  }
  let currentProjects: ProjectRecord[] = [];
  if (projects.status === "fulfilled" && Array.isArray(projects.value)) {
    currentProjects = projects.value.filter(
      (project) =>
        project.organization_id === session.organization_id &&
        project.shared_access_suspended !== true
    );
    facts.project = currentProjects.length > 0;
    const analyticsProjects = currentProjects.filter((project) => {
      const role = getProjectEffectiveRole(project);
      return (
        (role === "owner" || role === "admin") &&
        getTierCapabilities(project.organization_plan).analytics_bundle
      );
    });
    facts.offerAnalytics = facts.offerAnalytics || analyticsProjects.length > 0;
    facts.analyticsProjectId = analyticsProjects[0]?.project_id ?? null;
    if (includeOptional && facts.offerAnalytics) {
      facts.analytics = false;
      // Keep optional reads to four at once and stop once an enabled project is found.
      for (let index = 0; index < analyticsProjects.length; index += 4) {
        const batch = analyticsProjects.slice(index, index + 4);
        const results = await Promise.allSettled(
          batch.map((project) => getProjectAnalyticsSettings(project.project_id))
        );
        const enabled = results.findIndex(
          (result) =>
            result.status === "fulfilled" &&
            result.value.analytics_available &&
            result.value.settings.enabled
        );
        if (enabled !== -1) {
          facts.analytics = true;
          facts.analyticsProjectId = batch[enabled]!.project_id;
          break;
        }
        if (results.some((result) => result.status === "rejected")) facts.analytics = null;
      }
    }
    facts.offerReports =
      reportPolicy(session.organization_plan, session.self_hosted).available &&
      (session.role === "owner" || reportManageableProjects(currentProjects, session).length > 0);
    facts.incident = currentProjects.some(
      (project) =>
        project.metrics.open_incidents > 0 ||
        project.metrics.regressed_incidents > 0 ||
        project.metrics.opened_incidents_month > 0
    );
    // Counts are enough to establish receipt. A single scoped inventory read also
    // recognises retained resolved incidents outside the current usage window.
    if (!incidentReceived && !facts.incident && currentProjects[0]) {
      try {
        const { incidents } = await listIncidents({
          limit: 1,
          projectId: currentProjects[0].project_id
        });
        facts.incident = incidents.some(
          (incident) => incident.project_id === currentProjects[0]?.project_id
        );
      } catch {
        facts.incident = null;
      }
    }
  }
  if (incidentReceived) facts.incident = true;
  if (improvements.status === "fulfilled" && improvements.value !== null) {
    const settings = improvements.value;
    facts.improvements =
      settings.enabled &&
      settings.source_consent &&
      !settings.requires_review &&
      settings.scope.length > 0;
  }
  if (includeOptional && facts.offerReports) {
    try {
      const definitions = await reportApi.definitions.list(scope);
      facts.reports = definitions.some(
        (definition) =>
          definition.organization_id === session.organization_id &&
          definition.enabled &&
          definition.schedule !== null &&
          !definition.requires_owner_review &&
          definition.pause_reason === null
      );
    } catch {
      // A failed optional read leaves the step unknown without hiding core progress.
    }
  }
  return facts;
}
