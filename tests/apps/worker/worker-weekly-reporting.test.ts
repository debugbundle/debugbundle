import { describe, expect, it, vi } from "vitest";

import { processNextGenerateWeeklyReportJob } from "../../../apps/worker/src/processor.js";
import { scheduleWeeklyReports } from "../../../apps/worker/src/runtime.js";

type WeeklyReportJob = {
  delivery_id: string;
  weekly_report_channel_id: string;
  project_id: string;
  window_start: string;
  window_end: string;
};

type WeeklyProjectReport = {
  project_id: string;
  window_start: string;
  window_end: string;
  bundle_counts: {
    failure: number;
    improvement: number;
  };
  new_incidents: number;
  regressions: number;
  top_spiking_incidents: Array<{
    incident_id: string;
    title: string;
    occurrence_count: number;
    spike_detected_at: string;
  }>;
};

type WeeklyReportDelivery = {
  delivery_id: string;
  created: boolean;
};

type WeeklyReportChannelRecord = {
  channel_id: string;
  project_id: string;
  channel: "email" | "slack";
  config: Record<string, unknown>;
  schedule: {
    day_of_week: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
    hour_of_day: number;
    timezone: string;
  };
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};

describe("worker weekly reporting", () => {
  it("should return no_jobs when generate-weekly-report queue is empty", async (): Promise<void> => {
    const dequeue = vi.fn<(jobName: "generate-weekly-report") => Promise<WeeklyReportJob | null>>().mockResolvedValue(null);
    const getWeeklyProjectReport = vi
      .fn<(input: { project_id: string; window_start: string; window_end: string }) => Promise<WeeklyProjectReport | null>>()
      .mockResolvedValue(null);

    const result = await processNextGenerateWeeklyReportJob({
      queue: {
        dequeue
      },
      weeklyReportingStore: {
        getWeeklyProjectReport
      },
      weeklyReportChannelStore: {
        getWeeklyReportChannelById: vi.fn()
      },
      weeklyReportDeliveryStore: {
        claimWeeklyReportDelivery: vi.fn(),
        markWeeklyReportDeliveryResult: vi.fn()
      },
      weeklyReportTransport: {
        deliver: vi.fn()
      }
    });

    expect(result).toEqual({ processed: false, reason: "no_jobs" });
  });

  it("should suppress generate-weekly-report processing when the project has no activity", async (): Promise<void> => {
    const dequeue = vi.fn<(jobName: "generate-weekly-report") => Promise<WeeklyReportJob | null>>().mockResolvedValue({
      delivery_id: "wrd_123",
      weekly_report_channel_id: "wr_123",
      project_id: "proj_123",
      window_start: "2026-03-09T00:00:00.000Z",
      window_end: "2026-03-16T00:00:00.000Z"
    });
    const getWeeklyProjectReport = vi
      .fn<(input: { project_id: string; window_start: string; window_end: string }) => Promise<WeeklyProjectReport | null>>()
      .mockResolvedValue(null);

    const result = await processNextGenerateWeeklyReportJob({
      queue: {
        dequeue
      },
      weeklyReportingStore: {
        getWeeklyProjectReport
      },
      weeklyReportChannelStore: {
        getWeeklyReportChannelById: vi.fn().mockResolvedValue({
          channel_id: "wr_123",
          project_id: "proj_123",
          channel: "email",
          config: { to: ["owner@example.com"] },
          schedule: { day_of_week: "monday", hour_of_day: 9, timezone: "UTC" },
          is_enabled: true,
          created_at: "2026-03-15T00:00:00.000Z",
          updated_at: "2026-03-15T00:00:00.000Z"
        } satisfies WeeklyReportChannelRecord)
      },
      weeklyReportDeliveryStore: {
        claimWeeklyReportDelivery: vi.fn(),
        markWeeklyReportDeliveryResult: vi.fn()
      },
      weeklyReportTransport: {
        deliver: vi.fn()
      }
    });

    expect(result).toEqual({ processed: false, reason: "no_activity" });
    expect(getWeeklyProjectReport).toHaveBeenCalledWith({
      project_id: "proj_123",
      window_start: "2026-03-09T00:00:00.000Z",
      window_end: "2026-03-16T00:00:00.000Z"
    });
  });

  it("should process generate-weekly-report jobs when weekly activity exists", async (): Promise<void> => {
    const dequeue = vi.fn<(jobName: "generate-weekly-report") => Promise<WeeklyReportJob | null>>().mockResolvedValue({
      delivery_id: "wrd_123",
      weekly_report_channel_id: "wr_123",
      project_id: "proj_123",
      window_start: "2026-03-09T00:00:00.000Z",
      window_end: "2026-03-16T00:00:00.000Z"
    });
    const getWeeklyProjectReport = vi
      .fn<(input: { project_id: string; window_start: string; window_end: string }) => Promise<WeeklyProjectReport | null>>()
      .mockResolvedValue({
        project_id: "proj_123",
        window_start: "2026-03-09T00:00:00.000Z",
        window_end: "2026-03-16T00:00:00.000Z",
        bundle_counts: {
          failure: 3,
          improvement: 0
        },
        new_incidents: 2,
        regressions: 1,
        top_spiking_incidents: []
      });
    const markWeeklyReportDeliveryResult = vi
      .fn<(input: { delivery_id: string; delivered: boolean; error_message: string | null }) => Promise<{ status: "delivered" | "failed" }>>()
      .mockResolvedValue({ status: "delivered" });
    const deliver = vi.fn().mockResolvedValue(undefined);

    const result = await processNextGenerateWeeklyReportJob({
      queue: {
        dequeue
      },
      weeklyReportingStore: {
        getWeeklyProjectReport
      },
      weeklyReportChannelStore: {
        getWeeklyReportChannelById: vi.fn().mockResolvedValue({
          channel_id: "wr_123",
          project_id: "proj_123",
          channel: "email",
          config: { to: ["team@example.com"] },
          schedule: { day_of_week: "monday", hour_of_day: 9, timezone: "UTC" },
          is_enabled: true,
          created_at: "2026-03-15T00:00:00.000Z",
          updated_at: "2026-03-15T00:00:00.000Z"
        } satisfies WeeklyReportChannelRecord)
      },
      weeklyReportDeliveryStore: {
        claimWeeklyReportDelivery: vi.fn(),
        markWeeklyReportDeliveryResult
      },
      weeklyReportTransport: {
        deliver
      }
    });

    expect(result).toEqual({ processed: true });
    expect(deliver).toHaveBeenCalledWith({
      delivery_id: "wrd_123",
      channel: {
        channel_id: "wr_123",
        project_id: "proj_123",
        channel: "email",
        config: { to: ["team@example.com"] },
        schedule: { day_of_week: "monday", hour_of_day: 9, timezone: "UTC" },
        is_enabled: true,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z"
      },
      report: {
        project_id: "proj_123",
        window_start: "2026-03-09T00:00:00.000Z",
        window_end: "2026-03-16T00:00:00.000Z",
        bundle_counts: {
          failure: 3,
          improvement: 0
        },
        new_incidents: 2,
        regressions: 1,
        top_spiking_incidents: []
      }
    });
    expect(markWeeklyReportDeliveryResult).toHaveBeenCalledWith({
      delivery_id: "wrd_123",
      delivered: true,
      error_message: null
    });
  });

  it("should mark weekly delivery failed when the weekly report channel no longer exists", async (): Promise<void> => {
    const dequeue = vi.fn<(jobName: "generate-weekly-report") => Promise<WeeklyReportJob | null>>().mockResolvedValue({
      delivery_id: "wrd_123",
      weekly_report_channel_id: "wr_missing",
      project_id: "proj_123",
      window_start: "2026-03-09T00:00:00.000Z",
      window_end: "2026-03-16T00:00:00.000Z"
    });
    const getWeeklyProjectReport = vi
      .fn<(input: { project_id: string; window_start: string; window_end: string }) => Promise<WeeklyProjectReport | null>>()
      .mockResolvedValue({
        project_id: "proj_123",
        window_start: "2026-03-09T00:00:00.000Z",
        window_end: "2026-03-16T00:00:00.000Z",
        bundle_counts: {
          failure: 1,
          improvement: 0
        },
        new_incidents: 1,
        regressions: 0,
        top_spiking_incidents: []
      });
    const markWeeklyReportDeliveryResult = vi.fn().mockResolvedValue({ status: "failed" });
    const deliver = vi.fn();

    const result = await processNextGenerateWeeklyReportJob({
      queue: {
        dequeue
      },
      weeklyReportingStore: {
        getWeeklyProjectReport
      },
      weeklyReportChannelStore: {
        getWeeklyReportChannelById: vi.fn().mockResolvedValue(null)
      },
      weeklyReportDeliveryStore: {
        claimWeeklyReportDelivery: vi.fn(),
        markWeeklyReportDeliveryResult
      },
      weeklyReportTransport: {
        deliver
      }
    });

    expect(result).toEqual({ processed: true });
    expect(markWeeklyReportDeliveryResult).toHaveBeenCalledWith({
      delivery_id: "wrd_123",
      delivered: false,
      error_message: "weekly_report_channel_not_found"
    });
    expect(deliver).not.toHaveBeenCalled();
  });

  it("should process slack weekly delivery jobs when weekly activity exists", async (): Promise<void> => {
    const dequeue = vi.fn<(jobName: "generate-weekly-report") => Promise<WeeklyReportJob | null>>().mockResolvedValue({
      delivery_id: "wrd_124",
      weekly_report_channel_id: "wr_slack",
      project_id: "proj_123",
      window_start: "2026-03-09T00:00:00.000Z",
      window_end: "2026-03-16T00:00:00.000Z"
    });
    const getWeeklyProjectReport = vi
      .fn<(input: { project_id: string; window_start: string; window_end: string }) => Promise<WeeklyProjectReport | null>>()
      .mockResolvedValue({
        project_id: "proj_123",
        window_start: "2026-03-09T00:00:00.000Z",
        window_end: "2026-03-16T00:00:00.000Z",
        bundle_counts: {
          failure: 1,
          improvement: 1
        },
        new_incidents: 1,
        regressions: 1,
        top_spiking_incidents: []
      });
    const deliver = vi.fn();
    const markWeeklyReportDeliveryResult = vi.fn().mockResolvedValue({ status: "delivered" });

    await expect(
      processNextGenerateWeeklyReportJob({
        queue: {
          dequeue
        },
        weeklyReportingStore: {
          getWeeklyProjectReport
        },
        weeklyReportChannelStore: {
          getWeeklyReportChannelById: vi.fn().mockResolvedValue({
            channel_id: "wr_slack",
            project_id: "proj_123",
            channel: "slack",
            config: { webhook_url: "https://hooks.slack.com/services/T/B/x" },
            schedule: { day_of_week: "monday", hour_of_day: 9, timezone: "UTC" },
            is_enabled: true,
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:00:00.000Z"
          } satisfies WeeklyReportChannelRecord)
        },
        weeklyReportDeliveryStore: {
          claimWeeklyReportDelivery: vi.fn(),
          markWeeklyReportDeliveryResult
        },
        weeklyReportTransport: {
          deliver
        }
      })
    ).resolves.toEqual({ processed: true });
    const deliveredReport = deliver.mock.calls[0]?.[0] as { delivery_id?: string; channel?: { channel?: string } } | undefined;
    expect(deliveredReport?.delivery_id).toBe("wrd_124");
    expect(deliveredReport?.channel?.channel).toBe("slack");
  });

  it("should mark weekly delivery failed when transport delivery raises an error", async (): Promise<void> => {
    const dequeue = vi.fn<(jobName: "generate-weekly-report") => Promise<WeeklyReportJob | null>>().mockResolvedValue({
      delivery_id: "wrd_123",
      weekly_report_channel_id: "wr_123",
      project_id: "proj_123",
      window_start: "2026-03-09T00:00:00.000Z",
      window_end: "2026-03-16T00:00:00.000Z"
    });
    const getWeeklyProjectReport = vi
      .fn<(input: { project_id: string; window_start: string; window_end: string }) => Promise<WeeklyProjectReport | null>>()
      .mockResolvedValue({
        project_id: "proj_123",
        window_start: "2026-03-09T00:00:00.000Z",
        window_end: "2026-03-16T00:00:00.000Z",
        bundle_counts: {
          failure: 2,
          improvement: 0
        },
        new_incidents: 1,
        regressions: 0,
        top_spiking_incidents: []
      });
    const markWeeklyReportDeliveryResult = vi
      .fn<(input: { delivery_id: string; delivered: boolean; error_message: string | null }) => Promise<{ status: "delivered" | "failed" }>>()
      .mockResolvedValue({ status: "failed" });

    const result = await processNextGenerateWeeklyReportJob({
      queue: {
        dequeue
      },
      weeklyReportingStore: {
        getWeeklyProjectReport
      },
      weeklyReportChannelStore: {
        getWeeklyReportChannelById: vi.fn().mockResolvedValue({
          channel_id: "wr_123",
          project_id: "proj_123",
          channel: "email",
          config: { to: ["owner@example.com"] },
          schedule: { day_of_week: "monday", hour_of_day: 9, timezone: "UTC" },
          is_enabled: true,
          created_at: "2026-03-15T00:00:00.000Z",
          updated_at: "2026-03-15T00:00:00.000Z"
        } satisfies WeeklyReportChannelRecord)
      },
      weeklyReportDeliveryStore: {
        claimWeeklyReportDelivery: vi.fn(),
        markWeeklyReportDeliveryResult
      },
      weeklyReportTransport: {
        deliver: vi.fn().mockRejectedValue(new Error("weekly_report_email_not_configured"))
      }
    });

    expect(result).toEqual({ processed: true });
    expect(markWeeklyReportDeliveryResult).toHaveBeenCalledWith({
      delivery_id: "wrd_123",
      delivered: false,
      error_message: "weekly_report_email_not_configured"
    });
  });

  it("should enqueue one weekly report job per due active configured channel", async (): Promise<void> => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-16T10:30:00.000Z"));
    const enqueue = vi
      .fn<(jobName: "generate-weekly-report", payload: WeeklyReportJob) => Promise<void>>()
      .mockResolvedValue(undefined);
    const listProjectsWithWeeklyActivity = vi
      .fn<(input: { window_start: string; window_end: string; limit: number }) => Promise<string[]>>()
      .mockResolvedValue(["proj_123", "proj_456"]);
    const claimWeeklyReportDelivery = vi
      .fn<(input: {
        weekly_report_channel_id: string;
        project_id: string;
        window_start: string;
        window_end: string;
        channel: "email" | "slack";
      }) => Promise<WeeklyReportDelivery>>()
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
          },
          {
            channel_id: "wr_999",
            project_id: "proj_999",
            channel: "email",
            config: { to: ["skip@example.com"] },
            schedule: { day_of_week: "tuesday", hour_of_day: 9, timezone: "UTC" },
            is_enabled: true,
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:00:00.000Z"
          }
        ])
      },
      weeklyReportDeliveryStore: { claimWeeklyReportDelivery },
      batchSize: 25,
      now: new Date("2026-03-16T10:30:00.000Z")
    });

    expect(count).toBe(1);
    expect(listProjectsWithWeeklyActivity).toHaveBeenCalledWith({
      window_start: "2026-03-09T00:00:00.000Z",
      window_end: "2026-03-16T00:00:00.000Z",
      limit: 25
    });
    expect(enqueue).toHaveBeenNthCalledWith(1, "generate-weekly-report", {
      delivery_id: "wrd_123",
      weekly_report_channel_id: "wr_123",
      project_id: "proj_123",
      window_start: "2026-03-09T00:00:00.000Z",
      window_end: "2026-03-16T00:00:00.000Z"
    });
    vi.useRealTimers();
  });

  it("should skip weekly report enqueue when the delivery window was already claimed", async (): Promise<void> => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-16T10:30:00.000Z"));
    const enqueue = vi
      .fn<(jobName: "generate-weekly-report", payload: WeeklyReportJob) => Promise<void>>()
      .mockResolvedValue(undefined);
    const listProjectsWithWeeklyActivity = vi
      .fn<(input: { window_start: string; window_end: string; limit: number }) => Promise<string[]>>()
      .mockResolvedValue(["proj_123"]);
    const claimWeeklyReportDelivery = vi
      .fn<(input: {
        weekly_report_channel_id: string;
        project_id: string;
        window_start: string;
        window_end: string;
        channel: "email" | "slack";
      }) => Promise<WeeklyReportDelivery>>()
      .mockResolvedValue({ delivery_id: "wrd_existing", created: false });

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
      batchSize: 25,
      now: new Date("2026-03-16T10:30:00.000Z")
    });

    expect(count).toBe(0);
    expect(claimWeeklyReportDelivery).toHaveBeenCalledWith({
      weekly_report_channel_id: "wr_123",
      project_id: "proj_123",
      window_start: "2026-03-09T00:00:00.000Z",
      window_end: "2026-03-16T00:00:00.000Z",
      channel: "email"
    });
    expect(enqueue).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
