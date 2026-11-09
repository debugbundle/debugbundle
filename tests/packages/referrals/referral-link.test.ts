import { expect, it } from "vitest";
import {
  createReferralLinkCodec,
  REFERRAL_COOKIE_NAME
} from "../../../packages/referrals/src/referral-link.js";
const secret = "referral-link-test-secret-with-at-least-thirty-two-characters";
const now = Date.parse("2026-11-07T00:00:00.000Z");
const code = "ABCD234567";
it("keeps a bounded, signed public code for thirty days in an HttpOnly same-site cookie", () => {
  const codec = createReferralLinkCodec(secret);
  const cookie = codec.issue(code, now);
  expect(cookie).toContain(`${REFERRAL_COOKIE_NAME}=`);
  for (const attribute of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/", "Max-Age=2592000"])
    expect(cookie).toContain(attribute);
  expect(codec.read(cookie, now)).toBe(code);
  expect(codec.read(cookie, now + 30 * 86400_000 - 1)).toBe(code);
  expect(codec.read(cookie, now + 30 * 86400_000)).toBeNull();
  expect(cookie).not.toContain("example.test");
});
it("rejects altered, oversized, malformed, wrong-key and cleared values without throwing", () => {
  const codec = createReferralLinkCodec(secret),
    issued = codec.issue(code, now);
  const value = issued.split(";", 1)[0]!;
  const token = value.split("=", 2)[1]!;
  const [body, signature] = token.split(".");
  const altered = Buffer.from(
    JSON.stringify({ version: 1, code: "BCDE234567", expires_at: now + 999999 })
  ).toString("base64url");
  for (const cookie of [
    undefined,
    "",
    `${REFERRAL_COOKIE_NAME}=bad`,
    `${REFERRAL_COOKIE_NAME}=${altered}.${signature}`,
    `${REFERRAL_COOKIE_NAME}=${body}.bad`,
    `${REFERRAL_COOKIE_NAME}=${"x".repeat(2000)}`,
    codec.clear()
  ])
    expect(codec.read(cookie, now)).toBeNull();
  expect(createReferralLinkCodec(secret + "different").read(value, now)).toBeNull();
});
it("supports explicit local HTTP while keeping HttpOnly and does not allow arbitrary codes", () => {
  const codec = createReferralLinkCodec(secret, { secure: false });
  const cookie = codec.issue(code, now);
  expect(cookie).not.toContain("Secure");
  expect(cookie).toContain("HttpOnly");
  expect(() => codec.issue("javascript:invalid", now)).toThrow();
  expect(codec.read(`other=ignored; ${cookie}`, now)).toBe(code);
});
