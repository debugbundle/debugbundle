import { expect, it, vi } from "vitest";
import { createReferralVisits } from "../../../packages/referrals/src/referral-visit-receipts.js";

it("reuses a receipt for one code for 24 hours and rechecks availability when confirming", async () => {
  let time = Date.parse("2026-11-21T23:00:00.000Z");
  const available = vi.fn().mockResolvedValue(true);
  const record = vi.fn().mockResolvedValue(true);
  const visits = createReferralVisits({
    secret: "visit-test-secret-for-local-signed-receipts",
    available,
    record,
    now: () => time
  });
  const original = (await visits.capture({ code: "review20" }))!;
  expect(record).not.toHaveBeenCalled();
  time += 5 * 60 * 60_000;
  expect(await visits.capture({ code: "REVIEW20", receipt: original.receipt })).toEqual(original);
  expect(await visits.capture({ code: "OTHER20", receipt: original.receipt })).not.toEqual(
    original
  );
  expect(await visits.confirm({ receipt: original.receipt })).toBe(true);
  expect(record).toHaveBeenCalledWith(
    expect.objectContaining({
      code: "REVIEW20",
      startedAt: Date.parse("2026-11-21T23:00:00.000Z")
    })
  );
  available.mockResolvedValueOnce(false);
  expect(await visits.confirm({ receipt: original.receipt })).toBe(false);
  time += 19 * 60 * 60_000;
  expect(await visits.confirm({ receipt: original.receipt })).toBe(false);
  expect(await visits.capture({ code: "REVIEW20", receipt: original.receipt })).not.toEqual(
    original
  );
  expect(record).toHaveBeenCalledOnce();
});
