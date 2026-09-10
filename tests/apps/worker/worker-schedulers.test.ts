import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetWorkerRuntimeMocks } from "../../helpers/worker-runtime-mocks.js";
import {
  scheduleDueGitHubDispatches,
  scheduleDueAlertEmailDigests,
  scheduleDueWebhookDeliveries,
  scheduleRetentionCleanup,
  scheduleWeeklyReports
} from "../../../apps/worker/src/runtime.js";

describe("worker schedulers", () => {
  beforeEach(resetWorkerRuntimeMocks);

  it("should enqueue only due webhook deliveries during scheduler pass", async (): Promise<void> => {
    const claimDueDeliveries = vi.fn().mockResolvedValue([
      { delivery_id: "del_1", attempt: 2 },
      { delivery_id: "del_2", attempt: 1 }
    ]);
    const enqueue = vi.fn().mockResolvedValue(undefined);

    const count = await scheduleDueWebhookDeliveries({
      queue: { enqueue },
      webhookDeliveryStore: { claimDueDeliveries },
      batchSize: 50
    });

    expect(count).toBe(2);
    expect(enqueue).toHaveBeenCalledTimes(2);
  });

  it("should enqueue only due alert email digest deliveries during scheduler pass", async (): Promise<void> => {
    const claimDueAlertEmailDigests = vi
      .fn()
      .mockResolvedValue([{ digest_id: "dig_1" }, { digest_id: "dig_2" }]);
    const enqueue = vi.fn().mockResolvedValue(undefined);

    const count = await scheduleDueAlertEmailDigests({
      queue: { enqueue },
      alertStore: { claimDueAlertEmailDigests },
      batchSize: 50
    });

    expect(count).toBe(2);
    expect(enqueue).toHaveBeenCalledWith("deliver-alert-email-digest", { digest_id: "dig_1" });
    expect(enqueue).toHaveBeenCalledWith("deliver-alert-email-digest", { digest_id: "dig_2" });
  });

  it("should enqueue only due github dispatch deliveries during scheduler pass", async (): Promise<void> => {
    const claimDueGitHubDispatchDeliveries = vi.fn().mockResolvedValue([
      { delivery_id: "gdd_1", attempt: 2 },
      { delivery_id: "gdd_2", attempt: 1 }
    ]);
    const enqueue = vi.fn().mockResolvedValue(undefined);

    const count = await scheduleDueGitHubDispatches({
      queue: { enqueue },
      githubStore: { claimDueGitHubDispatchDeliveries },
      batchSize: 50
    });

    expect(count).toBe(2);
    expect(enqueue).toHaveBeenCalledWith("deliver-github-dispatch", {
      delivery_id: "gdd_1",
      attempt: 2
    });
    expect(enqueue).toHaveBeenCalledWith("deliver-github-dispatch", {
      delivery_id: "gdd_2",
      attempt: 1
    });
  });

  it("should enqueue cleanup-retention work when the scheduler lease is acquired", async (): Promise<void> => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const acquireLease = vi.fn().mockResolvedValue(true);

    const scheduled = await scheduleRetentionCleanup({
      queue: { enqueue, acquireLease },
      intervalMs: 60 * 60 * 1000,
      now: new Date("2026-04-04T12:00:00.000Z")
    });

    expect(scheduled).toBe(true);
    expect(acquireLease).toHaveBeenCalledWith("leases:cleanup-retention:schedule", 3600);
    expect(enqueue).toHaveBeenCalledWith("cleanup-retention", {
      scheduled_at: "2026-04-04T12:00:00.000Z"
    });
  });

  it("should skip cleanup-retention enqueue when the scheduler lease is already held", async (): Promise<void> => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const acquireLease = vi.fn().mockResolvedValue(false);

    const scheduled = await scheduleRetentionCleanup({
      queue: { enqueue, acquireLease },
      intervalMs: 60 * 60 * 1000,
      now: new Date("2026-04-04T12:00:00.000Z")
    });

    expect(scheduled).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("should enqueue cleanup-retention work when no lease helper is provided", async (): Promise<void> => {
    const enqueue = vi.fn().mockResolvedValue(undefined);

    const scheduled = await scheduleRetentionCleanup({
      queue: { enqueue },
      intervalMs: 60 * 60 * 1000,
      now: new Date("2026-04-04T12:00:00.000Z")
    });

    expect(scheduled).toBe(true);
    expect(enqueue).toHaveBeenCalledWith("cleanup-retention", {
      scheduled_at: "2026-04-04T12:00:00.000Z"
    });
  });

  it("should enqueue one generate-weekly-report job per active project during scheduler pass", async (): Promise<void> => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const listProjectsWithWeeklyActivity = vi.fn().mockResolvedValue(["proj_123", "proj_456"]);
    const claimWeeklyReportDelivery = vi
      .fn()
      .mockResolvedValue({ delivery_id: "wrd_123", created: true });

    const count = await scheduleWeeklyReports({
      queue: { enqueue },
      weeklyReportingStore: { listProjectsWithWeeklyActivity },
      weeklyReportChannelStore: {
        listEnabledWeeklyReportChannels: vi.fn().mockResolvedValue([
          {
            channel_id: "wr_123",
            project_id: "proj_123",
            channel: "email",
            config: { to: ["team@example.com"] },
            schedule: { day_of_week: "monday", hour_of_day: 9, timezone: "UTC" },
            is_enabled: true,
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:00:00.000Z"
          }
        ])
      },
      weeklyReportDeliveryStore: { claimWeeklyReportDelivery },
      batchSize: 50,
      now: new Date("2026-03-16T10:00:00.000Z")
    });

    expect(count).toBe(1);
    expect(enqueue).toHaveBeenCalledWith("generate-weekly-report", {
      delivery_id: "wrd_123",
      weekly_report_channel_id: "wr_123",
      project_id: "proj_123",
      window_start: "2026-03-09T00:00:00.000Z",
      window_end: "2026-03-16T00:00:00.000Z"
    });
  });
});
