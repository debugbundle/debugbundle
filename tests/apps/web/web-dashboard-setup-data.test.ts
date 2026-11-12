import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReviewSettings } from "../../../packages/smart-improvements/src/review-contract.js";
import { loadDashboardSetupFacts } from "../../../apps/web/src/lib/dashboard-setup-data.js";
import {
  createSession,
  createProject,
  createMemberTokenRecord,
  createIncident
} from "./web-test-helpers.js";
import { reportDefinitionFixture, reportOrg, reportProject } from "../../helpers/smart-reports.js";

const calls = vi.hoisted(() => ({
  projects: vi.fn(),
  tokens: vi.fn(),
  incidents: vi.fn(),
  analytics: vi.fn(),
  improvements: vi.fn<() => Promise<ReviewSettings>>(),
  reports: vi.fn()
}));
vi.mock("../../../apps/web/src/lib/api.js", () => ({
  listProjects: calls.projects,
  listMemberTokens: calls.tokens,
  listIncidents: calls.incidents,
  getProjectAnalyticsSettings: calls.analytics
}));
vi.mock("../../../apps/web/src/lib/improvement-review-api.js", () => ({
  improvementReviewApi: { settings: calls.improvements }
}));
vi.mock("../../../apps/web/src/lib/report-api.js", () => ({
  reportApi: { definitions: { list: calls.reports } },
  reportScope: (organizationId: string) => ({ organizationId, bearerToken: "browser-session" })
}));
afterEach(() => vi.resetAllMocks());

function setup(
  plan: "free" | "solo" | "team" | "business" = "free",
  role: "owner" | "admin" | "member" = "owner"
) {
  calls.projects.mockResolvedValue([]);
  calls.tokens.mockResolvedValue([]);
  calls.incidents.mockResolvedValue({ incidents: [], nextCursor: null });
  calls.analytics.mockResolvedValue({
    access_mode: "manage",
    analytics_available: true,
    settings: { enabled: false }
  });
  calls.improvements.mockResolvedValue({
    version: 1,
    enabled: false,
    source_consent: false,
    requires_review: false,
    scope: [],
    privacy_mode: "restricted",
    next_due_at: null
  });
  calls.reports.mockResolvedValue([]);
  return createSession({ organization_id: reportOrg, organization_plan: plan, role });
}

describe("dashboard setup observations", () => {
  it("counts only active tokens and accessible projects in the current account/workspace", async () => {
    const session = setup();
    calls.tokens.mockResolvedValue([
      createMemberTokenRecord({ organization_id: reportOrg, revoked_at: new Date().toISOString() }),
      createMemberTokenRecord({ organization_id: reportOrg, expires_at: "2000-01-01T00:00:00Z" }),
      createMemberTokenRecord({ organization_id: reportProject }),
      createMemberTokenRecord({ organization_id: reportOrg, user_id: reportProject })
    ]);
    calls.projects.mockResolvedValue([
      createProject({ organization_id: reportProject }),
      createProject({ organization_id: reportOrg, shared_access_suspended: true })
    ]);
    expect(await loadDashboardSetupFacts(session, false)).toMatchObject({
      accessToken: false,
      project: false,
      incident: false
    });
    calls.tokens.mockResolvedValue([createMemberTokenRecord({ organization_id: reportOrg })]);
    calls.projects.mockResolvedValue([createProject({ organization_id: reportOrg })]);
    expect(await loadDashboardSetupFacts(session, false)).toMatchObject({
      accessToken: true,
      project: true,
      incident: true
    });
  });

  it("uses a scoped incident read without generating an incident or bundle", async () => {
    const session = setup();
    const project = createProject({ organization_id: reportOrg, project_id: reportProject });
    project.metrics.open_incidents = 0;
    project.metrics.regressed_incidents = 0;
    project.metrics.opened_incidents_month = 0;
    calls.projects.mockResolvedValue([project]);
    calls.incidents.mockResolvedValue({
      incidents: [createIncident({ project_id: reportProject, status: "resolved" })]
    });
    expect((await loadDashboardSetupFacts(session, false)).incident).toBe(true);
    expect(calls.incidents).toHaveBeenCalledWith({ limit: 1, projectId: reportProject });
  });

  it("preserves an observed first incident after retention and keeps failures unknown", async () => {
    const session = setup();
    calls.projects.mockRejectedValue(new Error("offline"));
    calls.tokens.mockRejectedValue(new Error("offline"));
    expect(await loadDashboardSetupFacts(session, true)).toMatchObject({
      accessToken: null,
      project: null,
      incident: true
    });
    expect(calls.incidents).not.toHaveBeenCalled();
  });

  it.each([
    ["free", "owner", false, false],
    ["solo", "owner", false, true],
    ["team", "owner", true, true],
    ["business", "owner", true, true],
    ["business", "admin", false, false],
    ["business", "member", false, false]
  ] as const)(
    "offers only eligible optional steps for %s/%s",
    async (plan, role, improvements, reports) => {
      const session = setup(plan, role);
      const facts = await loadDashboardSetupFacts(session, false, true);
      expect(facts).toMatchObject({ offerImprovements: improvements, offerReports: reports });
      expect(calls.improvements).toHaveBeenCalledTimes(improvements ? 1 : 0);
      expect(calls.reports).toHaveBeenCalledTimes(reports ? 1 : 0);
    }
  );

  it("offers Reports to project administrators using the Reports page access rules", async () => {
    const session = setup("team", "member");
    calls.projects.mockResolvedValue([
      createProject({ organization_id: reportOrg, effective_role: "admin" })
    ]);
    expect((await loadDashboardSetupFacts(session, false, true)).offerReports).toBe(true);
    expect(calls.reports).toHaveBeenCalledOnce();
    calls.reports.mockClear();
    calls.projects.mockResolvedValue([
      createProject({ organization_id: reportOrg, effective_role: "viewer" })
    ]);
    expect((await loadDashboardSetupFacts(session, false, true)).offerReports).toBe(false);
    expect(calls.reports).not.toHaveBeenCalled();
  });

  it("loads optional configuration only when the guide is opened and does not count paused settings", async () => {
    const session = setup("business");
    await loadDashboardSetupFacts(session, false);
    expect(calls.reports).not.toHaveBeenCalled();
    expect(calls.improvements).not.toHaveBeenCalled();
    calls.improvements.mockResolvedValue({
      version: 1,
      enabled: true,
      source_consent: true,
      requires_review: true,
      scope: [{ project_id: reportProject, origin_project_ids: [reportProject] }],
      privacy_mode: "restricted",
      next_due_at: null
    });
    calls.reports.mockResolvedValue([
      { ...reportDefinitionFixture(), enabled: true, schedule: {}, pause_reason: "plan_lost" }
    ]);
    expect(await loadDashboardSetupFacts(session, false, true)).toMatchObject({
      improvements: false,
      reports: false
    });
    calls.improvements.mockResolvedValue({
      version: 1,
      enabled: true,
      source_consent: true,
      requires_review: false,
      scope: [{ project_id: reportProject, origin_project_ids: [reportProject] }],
      privacy_mode: "restricted",
      next_due_at: null
    });
    calls.reports.mockResolvedValue([
      { ...reportDefinitionFixture(), enabled: true, schedule: {}, pause_reason: null }
    ]);
    expect(await loadDashboardSetupFacts(session, false, true)).toMatchObject({
      improvements: true,
      reports: true
    });
  });
  it.each(["free", "solo", "team", "business"] as const)(
    "offers optional analytics on %s and reads it only in the guide",
    async (plan) => {
      const session = setup(plan);
      calls.projects.mockResolvedValue([
        createProject({ organization_id: reportOrg, project_id: reportProject })
      ]);
      expect(await loadDashboardSetupFacts(session, false)).toMatchObject({
        offerAnalytics: true,
        analytics: null,
        analyticsProjectId: reportProject
      });
      expect(calls.analytics).not.toHaveBeenCalled();
      expect(await loadDashboardSetupFacts(session, false, true)).toMatchObject({
        offerAnalytics: true,
        analytics: false
      });
      expect(calls.analytics).toHaveBeenCalledExactlyOnceWith(reportProject);
    }
  );
  it("recognises analytics enabled in any manageable workspace project and ignores other workspaces and viewers", async () => {
    const session = setup("team", "member");
    const second = "33333333-3333-4333-8333-333333333333";
    calls.projects.mockResolvedValue([
      createProject({
        organization_id: reportOrg,
        project_id: reportProject,
        effective_role: "admin"
      }),
      createProject({ organization_id: reportOrg, project_id: second, effective_role: "admin" }),
      createProject({ organization_id: reportOrg, effective_role: "viewer" }),
      createProject({ organization_id: "other-workspace" })
    ]);
    calls.analytics.mockImplementation(async (id: string) => ({
      access_mode: "manage",
      analytics_available: true,
      settings: { enabled: id === second }
    }));
    expect(await loadDashboardSetupFacts(session, false, true)).toMatchObject({
      offerAnalytics: true,
      analytics: true,
      analyticsProjectId: second
    });
    expect(calls.analytics).toHaveBeenCalledTimes(2);
  });
  it("keeps failed analytics reads unknown and does not offer configuration to viewers", async () => {
    const session = setup("free", "member");
    calls.projects.mockResolvedValue([
      createProject({ organization_id: reportOrg, effective_role: "admin" })
    ]);
    calls.analytics.mockRejectedValue(new Error("offline"));
    expect(await loadDashboardSetupFacts(session, false, true)).toMatchObject({
      offerAnalytics: true,
      analytics: null
    });
    calls.analytics.mockClear();
    calls.projects.mockResolvedValue([
      createProject({ organization_id: reportOrg, effective_role: "viewer" })
    ]);
    expect(await loadDashboardSetupFacts(session, false, true)).toMatchObject({
      offerAnalytics: false
    });
    expect(calls.analytics).not.toHaveBeenCalled();
  });
});
