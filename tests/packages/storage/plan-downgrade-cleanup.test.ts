import { describe, expect, it, vi } from "vitest";

import { createOrganizationPlanCleanupService } from "../../../packages/storage/src/index.js";

describe("organization plan cleanup service", () => {
  it("counts team-only slack and collaboration setup as suspended when enforcing solo capabilities", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const service = createOrganizationPlanCleanupService({ query });

    await service.cleanupOrganizationForPlan({
      organization_id: "00000000-0000-4000-8000-000000000001",
      plan: "solo",
      now: "2026-06-04T12:00:00.000Z"
    });

    expect(query).toHaveBeenCalledTimes(7);
    expect(query.mock.calls[0]?.[0]).toContain("FROM projects p");
    expect(query.mock.calls[0]?.[0]).toContain("JOIN project_invites invites");
    expect(query.mock.calls[0]?.[1]).toEqual(["00000000-0000-4000-8000-000000000001"]);
    expect(query.mock.calls[1]?.[0]).toContain("JOIN project_members members");
    expect(query.mock.calls[2]?.[0]).toContain("JOIN alert_rules alerts");
    expect(query.mock.calls[3]?.[0]).toContain("UPDATE alert_deliveries deliveries");
    expect(query.mock.calls[3]?.[0]).toContain("deliveries.status IN ('pending', 'retrying')");
    expect(query.mock.calls[4]?.[0]).toContain("UPDATE weekly_report_deliveries deliveries");
    expect(query.mock.calls[5]?.[0]).toContain("JOIN weekly_report_channels channels");
    expect(query.mock.calls[6]?.[0]).toContain("FROM slack_destinations");
  });

  it("counts solo and team paid setup as suspended when enforcing free capabilities", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const service = createOrganizationPlanCleanupService({ query });

    await service.cleanupOrganizationForPlan({
      organization_id: "00000000-0000-4000-8000-000000000001",
      plan: "free",
      now: "2026-06-04T12:00:00.000Z"
    });

    expect(query).toHaveBeenCalledTimes(13);
    expect(query.mock.calls[7]?.[0]).toContain("JOIN probe_activations activations");
    expect(query.mock.calls[7]?.[1]).toEqual(["00000000-0000-4000-8000-000000000001"]);
    expect(query.mock.calls[8]?.[0]).toContain("UPDATE github_dispatch_deliveries deliveries");
    expect(query.mock.calls[9]?.[0]).toContain("JOIN github_dispatch_rules rules");
    expect(query.mock.calls[10]?.[0]).toContain("FROM github_installations");
    expect(query.mock.calls[11]?.[0]).toContain("FROM projects");
    expect(query.mock.calls[11]?.[0]).toContain("automated_improvement_bundles_enabled = true");
    expect(query.mock.calls[12]?.[0]).toContain("JOIN improvement_opportunities opportunities");
  });

  it("returns suspended and terminalized feature counts by category", async (): Promise<void> => {
    const rowCounts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
    const query = vi.fn().mockImplementation(() => {
      const rowCount = rowCounts.shift() ?? 0;
      return {
        rows: [],
        rowCount
      };
    });
    const service = createOrganizationPlanCleanupService({ query });

    await expect(
      service.cleanupOrganizationForPlan({
        organization_id: "00000000-0000-4000-8000-000000000001",
        plan: "free",
        now: "2026-06-04T12:00:00.000Z"
      })
    ).resolves.toEqual({
      suspended_project_invites: 1,
      suspended_project_members: 2,
      suspended_slack_alert_rules: 3,
      terminalized_slack_alert_deliveries: 4,
      terminalized_slack_weekly_report_deliveries: 5,
      suspended_slack_weekly_report_channels: 6,
      suspended_slack_destinations: 7,
      suspended_probe_activations: 8,
      terminalized_github_dispatch_deliveries: 9,
      suspended_github_dispatch_rules: 10,
      suspended_github_installations: 11,
      suspended_improvement_settings_projects: 12,
      suspended_improvement_opportunities: 13
    });
  });

  it("is a no-op for team capabilities", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const service = createOrganizationPlanCleanupService({ query });

    await expect(
      service.cleanupOrganizationForPlan({
      organization_id: "00000000-0000-4000-8000-000000000001",
      plan: "team",
      now: "2026-06-04T12:00:00.000Z"
      })
    ).resolves.toMatchObject({
      suspended_project_invites: 0,
      suspended_project_members: 0
    });

    expect(query).not.toHaveBeenCalled();
  });
});
