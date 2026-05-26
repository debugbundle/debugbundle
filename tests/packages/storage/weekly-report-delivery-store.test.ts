import { describe, expect, it, vi } from "vitest";

import { createPostgresWeeklyReportDeliveryStore } from "../../../packages/storage/src/index.js";

describe("weekly report delivery store", () => {
  it("claims weekly email delivery for a fresh or retryable window", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ delivery_id: "weekly_123", status: "pending", claimed: true }]
      })
      .mockResolvedValueOnce({
        rows: [{ delivery_id: "weekly_123", status: "delivered", claimed: false }]
      });

    const store = createPostgresWeeklyReportDeliveryStore({ query });

    const created = await store.claimWeeklyReportDelivery({
      weekly_report_channel_id: "wrc_123",
      project_id: "proj_123",
      window_start: "2026-03-09T00:00:00.000Z",
      window_end: "2026-03-16T00:00:00.000Z",
      channel: "email"
    });
    const alreadyDelivered = await store.claimWeeklyReportDelivery({
      weekly_report_channel_id: "wrc_123",
      project_id: "proj_123",
      window_start: "2026-03-09T00:00:00.000Z",
      window_end: "2026-03-16T00:00:00.000Z",
      channel: "email"
    });

    expect(created).toEqual({ delivery_id: "weekly_123", created: true });
    expect(alreadyDelivered).toEqual({ delivery_id: "weekly_123", created: false });
    expect(String(query.mock.calls[0]?.[0] ?? "")).toMatch(
      /ON CONFLICT \(weekly_report_channel_id, window_start, window_end\)\s+WHERE weekly_report_channel_id IS NOT NULL/
    );
  });

  it("marks weekly report deliveries delivered or failed", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ status: "delivered" }] })
      .mockResolvedValueOnce({ rows: [{ status: "failed" }] });

    const store = createPostgresWeeklyReportDeliveryStore({ query });

    const delivered = await store.markWeeklyReportDeliveryResult({
      delivery_id: "weekly_123",
      delivered: true,
      error_message: null
    });
    const failed = await store.markWeeklyReportDeliveryResult({
      delivery_id: "weekly_124",
      delivered: false,
      error_message: "weekly_report_email_not_configured"
    });

    expect(delivered).toEqual({ status: "delivered" });
    expect(failed).toEqual({ status: "failed" });
  });

  it("throws when a weekly delivery claim does not return a row and falls back when mark returns nothing", async (): Promise<void> => {
    const failingStore = createPostgresWeeklyReportDeliveryStore({
      query: vi.fn().mockResolvedValue({ rows: [] })
    });

    await expect(
      failingStore.claimWeeklyReportDelivery({
        weekly_report_channel_id: "wrc_123",
        project_id: "proj_123",
        window_start: "2026-03-09T00:00:00.000Z",
        window_end: "2026-03-16T00:00:00.000Z",
        channel: "email"
      })
    ).rejects.toThrow("weekly_report_delivery_claim_failed");

    const fallbackStore = createPostgresWeeklyReportDeliveryStore({
      query: vi.fn().mockResolvedValue({ rows: [] })
    });
    await expect(
      fallbackStore.markWeeklyReportDeliveryResult({
        delivery_id: "weekly_999",
        delivered: false,
        error_message: "send_failed"
      })
    ).resolves.toEqual({ status: "failed" });
  });
});
