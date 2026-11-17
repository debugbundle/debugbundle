import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { readCookieValue } from "../../auth/src/index.js";
import { PublicOfferCodeSchema } from "./programme-policy.js";

export const OFFER_COOKIE_NAME = "dbundle_offer";
const lifetime = 30 * 86400_000;
const payloadSchema = z
  .object({
    version: z.literal(2),
    code: PublicOfferCodeSchema,
    expires_at: z.number().int().safe().positive()
  })
  .strict();
/** Signed public context only. Claims recheck programme, identity and payment
 * eligibility; this cookie grants neither account access nor a purchase bypass. */
export interface OfferLinkCodec {
  issue(code: string, now?: number): string;
  read(header: string | undefined, now?: number): { code: string; expires_at: number } | null;
  clear(): string;
}
export function createOfferLinkCodec(
  secret: string,
  options: { secure?: boolean } = {}
): OfferLinkCodec {
  z.string().min(32).max(4096).parse(secret);
  const attributes = `Path=/; HttpOnly; SameSite=Lax${options.secure === false ? "" : "; Secure"}`;
  const sign = (body: string): Buffer =>
    createHmac("sha256", secret).update(`offer-link:v2:${body}`).digest();
  return {
    issue(code: string, now = Date.now()): string {
      const payload = payloadSchema.parse({ version: 2, code, expires_at: now + lifetime });
      const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
      return `${OFFER_COOKIE_NAME}=${body}.${sign(body).toString("base64url")}; ${attributes}; Max-Age=${lifetime / 1000}`;
    },
    read(
      header: string | undefined,
      now = Date.now()
    ): { code: string; expires_at: number } | null {
      try {
        const token = readCookieValue(header, OFFER_COOKIE_NAME);
        if (!token || token.length > 1024) return null;
        const [body, signature, extra] = token.split(".");
        if (!body || !signature || extra !== undefined || !/^[A-Za-z0-9_-]+$/.test(signature))
          return null;
        const actual = Buffer.from(signature, "base64url"),
          expected = sign(body);
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
        const payload = payloadSchema.parse(
          JSON.parse(Buffer.from(body, "base64url").toString("utf8"))
        );
        if (
          !Number.isFinite(now) ||
          payload.expires_at <= now ||
          payload.expires_at > now + lifetime
        )
          return null;
        return { code: payload.code, expires_at: payload.expires_at };
      } catch {
        return null;
      }
    },
    clear: () => `${OFFER_COOKIE_NAME}=; ${attributes}; Max-Age=0`
  };
}
