import { beforeEach, expect, it, vi } from "vitest";
import type { Queryable } from "../../../packages/storage/src/types.js";

const ports = vi.hoisted(() => ({
  pdf: vi.fn(),
  generate: vi.fn(),
  review: vi.fn(),
  collect: vi.fn(),
  schedule: vi.fn(),
  reviewSchedule: vi.fn(),
  maintain: vi.fn(),
  reviewMaintenance: vi.fn(),
  cleanup: vi.fn(),
  prune: vi.fn(),
  scheduleEmail: vi.fn()
}));
vi.mock("../../../packages/storage/src/report-collector-store.js", () => ({
  createReportCollectorStore: () => ({ processNext: ports.collect })
}));
vi.mock("../../../packages/storage/src/improvement-review-scheduler.js", () => ({
  createImprovementReviewScheduler: () => ({ scheduleNext: ports.reviewSchedule })
}));
vi.mock("../../../packages/storage/src/improvement-review-retention.js", () => ({
  maintainImprovementReviews: ports.reviewMaintenance
}));
vi.mock("../../../packages/storage/src/report-scheduler-store.js", () => ({
  createReportSchedulerStore: () => ({ scheduleNext: ports.schedule })
}));
vi.mock("../../../packages/storage/src/report-artifact-store.js", () => ({
  createReportArtifactStore: () => ({ cleanupNext: ports.cleanup })
}));
vi.mock("../../../packages/storage/src/report-run-retention.js", () => ({
  maintainNextReportRun: ports.maintain
}));
vi.mock("../../../packages/storage/src/report-email-store.js", () => ({
  createReportEmailStore: () => ({ prune: ports.prune, scheduleNext: ports.scheduleEmail })
}));
vi.mock("../../../apps/worker/src/smart-report-pdf-processor.js", () => ({
  processNextSmartReportPdfJob: ports.pdf
}));
vi.mock("../../../apps/worker/src/smart-report-processor.js", () => ({
  processNextSmartReportJob: ports.generate
}));
vi.mock("../../../apps/worker/src/improvement-review-processor.js", () => ({
  processNextImprovementReview: ports.review
}));

import { createSmartReportProcessor } from "../../../apps/worker/src/smart-report-runtime.js";

beforeEach(() => {
  vi.resetAllMocks();
  for (const fn of [
    ports.pdf,
    ports.generate,
    ports.review,
    ports.collect,
    ports.schedule,
    ports.reviewSchedule,
    ports.scheduleEmail
  ])
    fn.mockResolvedValue({ processed: false });
  for (const fn of [ports.maintain, ports.reviewMaintenance, ports.cleanup])
    fn.mockResolvedValue(false);
  ports.prune.mockResolvedValue(0);
});

it("returns to pending PDFs after a review failure instead of starving the released report tasks", async () => {
  const pass = createSmartReportProcessor({
    db: {} as Queryable,
    objects: { putObject: vi.fn(), getObject: vi.fn(), deleteObject: vi.fn() },
    env: { SMART_REPORTS_ENABLED: "true", SMART_IMPROVEMENTS_ENABLED: "true" },
    emailSend: null
  });
  ports.pdf.mockResolvedValueOnce({ processed: true });
  ports.generate.mockResolvedValueOnce({ processed: true });
  await expect(pass()).resolves.toEqual({ processed: true });
  await expect(pass()).resolves.toEqual({ processed: true });
  ports.review.mockRejectedValue(new Error("review_fixture_unavailable"));
  await expect(pass()).rejects.toThrow("smart_report_lane_unavailable");
  ports.pdf.mockResolvedValueOnce({ processed: true });
  await expect(pass()).resolves.toEqual({ processed: true });
  expect(ports.pdf).toHaveBeenCalledTimes(2);
  expect(ports.review).toHaveBeenCalledOnce();
});

it("backs off failed review housekeeping so existing PDF work continues even with generation disabled", async () => {
  const clock = vi.spyOn(Date, "now");
  const now = Date.now();
  clock.mockReturnValue(now);
  try {
    const pass = createSmartReportProcessor({
      db: {} as Queryable,
      objects: { putObject: vi.fn(), getObject: vi.fn(), deleteObject: vi.fn() },
      env: {},
      emailSend: null
    });
    ports.reviewMaintenance.mockRejectedValue(new Error("review_cleanup_unavailable"));
    ports.pdf.mockResolvedValue({ processed: true });
    await expect(pass()).rejects.toThrow("smart_report_lane_unavailable");
    await expect(pass()).resolves.toEqual({ processed: true });
    expect(ports.reviewMaintenance).toHaveBeenCalledOnce();
    clock.mockReturnValue(now + 60001);
    await expect(pass()).rejects.toThrow("smart_report_lane_unavailable");
    expect(ports.reviewMaintenance).toHaveBeenCalledTimes(2);
  } finally {
    clock.mockRestore();
  }
});
