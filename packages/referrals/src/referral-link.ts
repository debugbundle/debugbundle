import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { readCookieValue } from "../../auth/src/index.js";
import { ReferralCodeSchema } from "./referral-contracts.js";

export const REFERRAL_COOKIE_NAME = "dbundle_referral";
const seconds = 30 * 86400;
const PayloadSchema = z
  .object({
    version: z.literal(1),
    code: ReferralCodeSchema,
    expires_at: z.number().int().safe().positive()
  })
  .strict();
export interface ReferralLinkCodec {
  issue(code: string, now?: number): string;
  read(cookieHeader: string | undefined, now?: number): string | null;
  clear(): string;
}
/** This public-code envelope grants no account access. Its separate signature
 * purpose bounds pending attribution across site, authentication and trial. */
export function createReferralLinkCodec(
  secret: string,
  options: { secure?: boolean } = {}
): ReferralLinkCodec {
  z.string().min(32).max(4096).parse(secret);
  const attributes = `Path=/; HttpOnly; SameSite=Lax${options.secure === false ? "" : "; Secure"}`;
  const sign = (body: string): Buffer =>
    createHmac("sha256", secret).update(`referral-link:v1:${body}`).digest();
  return {
    issue(raw, now = Date.now()) {
      const code = ReferralCodeSchema.parse(raw);
      const body = Buffer.from(
        JSON.stringify({ version: 1, code, expires_at: now + seconds * 1000 })
      ).toString("base64url");
      return `${REFERRAL_COOKIE_NAME}=${body}.${sign(body).toString("base64url")}; ${attributes}; Max-Age=${seconds}`;
    },
    read(header, now = Date.now()) {
      try {
        const token = readCookieValue(header, REFERRAL_COOKIE_NAME);
        if (!token || token.length > 1024) return null;
        const parts = token.split(".");
        if (parts.length !== 2 || !parts[0] || !parts[1] || !/^[A-Za-z0-9_-]+$/.test(parts[1]))
          return null;
        const signature = Buffer.from(parts[1], "base64url"),
          expected = sign(parts[0]);
        if (signature.length !== expected.length || !timingSafeEqual(signature, expected))
          return null;
        const payload = PayloadSchema.safeParse(
          JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"))
        );
        if (
          !payload.success ||
          payload.data.expires_at <= now ||
          payload.data.expires_at > now + seconds * 1000
        )
          return null;
        return payload.data.code;
      } catch {
        return null;
      }
    },
    clear() {
      return `${REFERRAL_COOKIE_NAME}=; ${attributes}; Max-Age=0`;
    }
  };
}
