import type {
  PublicStatusPage,
  PublicStatusSettings
} from "../../packages/shared-types/src/public-status.js";
export const statusProjectId = "00000000-0000-4000-8000-000000000001";
export const statusCheckId = "11111111-1111-4111-8111-111111111111";
export const statusPublicId = "abcdef012345abcdef012345";
export const statusSettings: PublicStatusSettings = {
  title: "Product status",
  enabled: true,
  projects: [{ project_id: statusProjectId, check_ids: [statusCheckId] }]
};
export function statusPageFixture(): PublicStatusPage {
  const days = Array.from({ length: 30 }, (_, i) => ({
    day: new Date(Date.UTC(2026, 8, 9 + i)).toISOString().slice(0, 10),
    state: "operational" as const,
    impact: "none" as const,
    total_checks: 10,
    successful_checks: 10,
    failed_checks: 0,
    degraded_checks: 0,
    downtime_seconds: 0
  }));
  return {
    title: "Product status",
    projects: [
      {
        key: "project-0",
        name: "Frontend",
        current_state: "paused",
        uptime_percentage: 100,
        last_verified_at: "2026-10-08T10:00:00Z",
        days,
        checks: [
          {
            key: "check-0",
            name: "Website",
            current_state: "operational",
            uptime_percentage: 100,
            last_verified_at: "2026-10-08T10:00:00Z",
            days
          },
          {
            key: "check-1",
            name: "Checkout",
            current_state: "paused",
            uptime_percentage: null,
            last_verified_at: null,
            days
          }
        ]
      }
    ]
  };
}
