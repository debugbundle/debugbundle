import { describe, expect, it } from "vitest";
import {
  dashboardSetupProgress,
  parseDashboardSetupPreferences,
  type DashboardSetupFacts
} from "../../../packages/shared-types/src/dashboard-setup.js";

const empty: DashboardSetupFacts = {
  accessToken: false,
  project: false,
  incident: false,
  analytics: null,
  analyticsProjectId: null,
  offerAnalytics: false,
  improvements: null,
  reports: null,
  offerImprovements: false,
  offerReports: false
};

describe("dashboard setup progress", () => {
  it("counts three essential milestones and keeps analytics and paid suggestions optional", () => {
    const progress = dashboardSetupProgress({
      ...empty,
      accessToken: true,
      project: true,
      incident: true,
      offerAnalytics: true,
      analyticsProjectId: "project-123",
      offerImprovements: true,
      offerReports: true
    });
    expect(progress.completed).toBe(3);
    expect(progress.total).toBe(3);
    expect(progress.ready).toBe(true);
    expect(progress.steps).toHaveLength(6);
    expect(progress.steps.filter((step) => step.optional).map((step) => step.id)).toEqual([
      "analytics",
      "improvements",
      "reports"
    ]);
    expect(progress.steps.find((step) => step.id === "analytics")).toMatchObject({
      status: "unavailable",
      href: "/projects/project-123/settings#analytics-settings"
    });
  });

  it("keeps failed reads unknown instead of treating them as unfinished setup", () => {
    const progress = dashboardSetupProgress({ ...empty, accessToken: null, project: true });
    expect(progress.steps[0]?.status).toBe("unavailable");
    expect(progress.completed).toBe(1);
    expect(progress.ready).toBe(false);
  });

  it("does not offer unavailable paid features", () => {
    expect(dashboardSetupProgress(empty).steps.map((step) => step.id)).toEqual([
      "access-token",
      "project",
      "incident"
    ]);
    expect(dashboardSetupProgress({ ...empty, offerReports: true }).steps).toHaveLength(4);
  });

  it("accepts only versioned non-secret display preferences", () => {
    expect(parseDashboardSetupPreferences("invalid")).toEqual({
      version: 1,
      welcomeSeen: false,
      sidebarHidden: false,
      incidentReceived: false
    });
    expect(
      parseDashboardSetupPreferences(
        JSON.stringify({
          version: 1,
          welcomeSeen: true,
          sidebarHidden: true,
          incidentReceived: true
        })
      )
    ).toEqual({ version: 1, welcomeSeen: true, sidebarHidden: true, incidentReceived: true });
    expect(
      parseDashboardSetupPreferences(
        JSON.stringify({
          version: 2,
          welcomeSeen: true,
          token: "secret"
        })
      ).welcomeSeen
    ).toBe(false);
  });
});
