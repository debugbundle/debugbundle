import { beforeEach, expect, it, vi } from "vitest";
import type { Queryable } from "../../../packages/storage/src/types.js";
import { createCreatorEmailProcessor } from "../../../apps/worker/src/creator-email-processor.js";
const f = vi.hoisted(() => ({ transport: vi.fn(), schedule: vi.fn(), deliver: vi.fn() }));
vi.mock("../../../packages/email/src/ses-transport.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../packages/email/src/ses-transport.js")>()),
  createSesReportEmailTransport: f.transport
}));
vi.mock("../../../packages/storage/src/creator-email-store.js", () => ({
  createCreatorEmailStore: () => ({ schedule: f.schedule })
}));
vi.mock("../../../packages/referrals/src/creator-email-delivery.js", () => ({
  deliverCreatorEmail: f.deliver
}));
const db: Queryable = { query: async () => ({ rows: [] }) };
const env = {
  SES_FROM_EMAIL: "noreply@example.test",
  S3_REGION: "us-east-1",
  APP_BASE_URL: "https://app.example.test"
};
beforeEach(() => {
  vi.clearAllMocks();
  f.transport.mockReturnValue({ send: vi.fn() });
  f.schedule.mockResolvedValue(0);
  f.deliver.mockResolvedValue({ processed: true });
});
it.each([
  {},
  { ...env, SES_FROM_EMAIL: "" },
  { ...env, S3_REGION: undefined },
  { ...env, APP_BASE_URL: undefined }
])("stays disabled without complete existing mail configuration", (selected) => {
  expect(createCreatorEmailProcessor({ db, env: selected })).toBeNull();
  expect(f.transport).not.toHaveBeenCalled();
});
it("uses the existing acknowledged SES transport and processes one delivery", async () => {
  const process = createCreatorEmailProcessor({
    db,
    env: {
      ...env,
      REFERRAL_LANDING_URL: "https://public.example.test",
      WEEKLY_REPORT_EMAIL_TIMEOUT_MS: "bad",
      AWS_ACCESS_KEY_ID: "fixture-only",
      AWS_SECRET_ACCESS_KEY: "fixture-only",
      AWS_SESSION_TOKEN: "fixture-only"
    }
  })!;
  await expect(process()).resolves.toEqual({ processed: true });
  expect(f.transport).toHaveBeenCalledWith(
    expect.objectContaining({ region: "us-east-1", timeoutMs: 10000 })
  );
  expect(f.deliver).toHaveBeenCalledWith(
    expect.objectContaining({
      appBaseUrl: env.APP_BASE_URL,
      publicBaseUrl: "https://public.example.test"
    })
  );
});
it("does not let a scheduling error starve already queued creator mail", async () => {
  f.schedule.mockRejectedValue(new Error("private details"));
  const process = createCreatorEmailProcessor({ db, env })!;
  await expect(process()).rejects.toThrow("creator_email_schedule_failed");
  expect(f.deliver).toHaveBeenCalledOnce();
});
it("passes a bounded timeout and preserves mailer failures without replaying a send", async () => {
  f.deliver.mockRejectedValue(new Error("delivery_failed"));
  const process = createCreatorEmailProcessor({
    db,
    env: { ...env, SES_REGION: "eu-west-1", WEEKLY_REPORT_EMAIL_TIMEOUT_MS: "5000" }
  })!;
  await expect(process()).rejects.toThrow("delivery_failed");
  expect(f.deliver).toHaveBeenCalledOnce();
  expect(f.transport).toHaveBeenCalledWith(
    expect.objectContaining({ region: "eu-west-1", timeoutMs: 5000 })
  );
});
it("logs only opaque receipt metadata when delivery needs attention", async () => {
  const attention = { delivery_id: "11111111-1111-4111-8111-111111111111", state: "uncertain" };
  f.deliver.mockResolvedValue({ processed: true, attention });
  const logger = { warn: vi.fn() };
  await createCreatorEmailProcessor({ db, env, logger })!();
  expect(logger.warn).toHaveBeenCalledWith(attention, "creator_email_delivery_attention");
});
