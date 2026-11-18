import { expect, it, vi } from "vitest";
import { createDefaultPayoutPreferences } from "../../../apps/api/src/default-payout-preferences.js";
import type { ReferralFinance } from "../../../packages/referrals/src/referral-finance.js";
import { mockedObject } from "../../helpers/vitest.js";
const id = "11111111-1111-4111-8111-111111111111";
it("uses the existing separate billing finance authority and optional dedicated encryption configuration", async () => {
  const earnings = vi.fn().mockResolvedValue({ operator_access: false }),
    db = { query: vi.fn().mockResolvedValue({ rows: [] }) },
    finance = mockedObject<ReferralFinance>({ earnings });
  const disabled = createDefaultPayoutPreferences({ db, finance });
  expect(disabled.policy().configured).toBe(false);
  await expect(disabled.balances(id, id)).rejects.toMatchObject({
    code: "payout_operator_required"
  });
  expect(db.query).not.toHaveBeenCalled();
  earnings.mockResolvedValue({ operator_access: true });
  const enabled = createDefaultPayoutPreferences({
    db,
    finance,
    encryptionKey: Buffer.alloc(32, 13).toString("base64url")
  });
  expect(enabled.policy().configured).toBe(true);
  expect(await enabled.balances(id, id)).toEqual([]);
  expect(earnings).toHaveBeenCalledWith(id);
  expect(() => createDefaultPayoutPreferences({ db, finance, encryptionKey: "bad" })).toThrow(
    "integration_secret_encryption_key_invalid"
  );
});
