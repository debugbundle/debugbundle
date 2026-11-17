import { expect, it } from "vitest";
import { sanitizeTelemetry } from "../../../packages/redaction/src/index.js";
import { REFERRAL_PAYOUT_REDACT_FIELDS } from "../../../packages/referrals/src/payout-privacy.js";
it("conceals payment details in structured telemetry and captured body text without losing standard secret protection", () => {
  const details = {
    holder: "Private Recipient",
    destination: "@private",
    iban: "DE89370400440532013000",
    wisetag: "@wisesecret",
    revtag: "@revsecret",
    encrypted_details: "encv1.private",
    password: "password-secret",
    authorization: "Bearer private-secret"
  };
  const output = sanitizeTelemetry(
    {
      request_body: { details },
      breadcrumbs: [{ data: { request_body: JSON.stringify({ details }) } }]
    },
    { additionalKeys: REFERRAL_PAYOUT_REDACT_FIELDS }
  );
  expect(output.ok).toBe(true);
  expect(JSON.stringify(output)).not.toMatch(
    /Private Recipient|@private|DE893704|@wisesecret|@revsecret|encv1.private|password-secret|private-secret/
  );
});
import {
  PayoutDetailsSchema,
  maskPayoutDestination,
  PAYOUT_CURRENCIES,
  PAYOUT_MINIMUM_USD_MINOR
} from "../../../packages/referrals/src/payout-preferences.js";
const details = {
  method: "iban",
  holder: "Owen Far",
  country: "MT",
  currency: "usd",
  destination: "DE89 3704 0044 0532 0130 00"
};
it("normalises valid payment instructions and provides all approved currencies", () => {
  expect(PayoutDetailsSchema.parse(details).destination).toBe("DE89370400440532013000");
  expect(PAYOUT_CURRENCIES).toEqual(["usd", "eur", "gbp", "cad", "aud"]);
  expect(PAYOUT_MINIMUM_USD_MINOR).toBe(5000);
  for (const method of ["wise", "revolut"])
    expect(
      PayoutDetailsSchema.parse({ ...details, method, destination: " @owen.far " }).destination
    ).toBe("@owen.far");
});
it("rejects bad checksums, tags, unsupported destinations and control characters", () => {
  for (const change of [
    { destination: "DE00370400440532013000" },
    { method: "wise", destination: "https://wise.com/owen" },
    { method: "revolut", destination: "ab" },
    { country: "RU" },
    { country: "UA" },
    { currency: "jpy" },
    { holder: "Owen\nFar" },
    { password: "never accept credentials" }
  ])
    expect(PayoutDetailsSchema.safeParse({ ...details, ...change }).success).toBe(false);
});
it("always conceals part of a destination, including very short payment tags", () => {
  expect(maskPayoutDestination("DE89370400440532013000")).toBe("••••3000");
  expect(maskPayoutDestination("@abc")).toBe("••••c");
});
