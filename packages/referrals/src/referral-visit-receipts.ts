import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { PublicOfferCodeSchema } from "./programme-policy.js";
import {
  ReferralVisitCaptureSchema,
  ReferralVisitConfirmSchema,
  type ReferralVisitReceiptSchema
} from "./referral-visit-contract.js";

const durationMs = 24 * 60 * 60_000;
const payload = z
  .object({ id: z.uuid(), code: PublicOfferCodeSchema, startedAt: z.number().int() })
  .strict();
export type ReferralVisit = z.infer<typeof payload>;
type Receipt = z.infer<typeof ReferralVisitReceiptSchema>;

export interface ReferralVisits {
  capture(input: z.output<typeof ReferralVisitCaptureSchema>): Promise<Receipt | null>;
  confirm(input: z.output<typeof ReferralVisitConfirmSchema>): Promise<boolean>;
}

export function createReferralVisits(input: {
  secret: string;
  available(code: string): Promise<boolean>;
  record(visit: ReferralVisit): Promise<boolean>;
  now?: () => number;
}): ReferralVisits {
  const now = input.now ?? Date.now;
  const sign = (body: string): Buffer =>
    createHmac("sha256", input.secret).update(`referral-visit:v1:${body}`).digest();
  function read(token: string | undefined, at: number): ReferralVisit | null {
    if (!token) return null;
    const [body, signature] = token.split(".") as [string, string];
    const actual = Buffer.from(signature, "base64url");
    const expected = sign(body);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    try {
      const visit = payload.parse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
      return visit.startedAt <= at && visit.startedAt + durationMs > at ? visit : null;
    } catch {
      return null;
    }
  }

  return {
    async capture(raw) {
      const request = ReferralVisitCaptureSchema.parse(raw);
      if (!(await input.available(request.code))) return null;
      const at = now();
      const previous = read(request.receipt, at);
      const visit =
        previous?.code === request.code
          ? previous
          : { id: randomUUID(), code: request.code, startedAt: at };
      const body = Buffer.from(JSON.stringify(visit)).toString("base64url");
      return {
        receipt: `${body}.${sign(body).toString("base64url")}`,
        expires_at: new Date(visit.startedAt + durationMs).toISOString()
      };
    },
    async confirm(raw) {
      const request = ReferralVisitConfirmSchema.safeParse(raw);
      if (!request.success) return false;
      const visit = read(request.data.receipt, now());
      return visit !== null && (await input.available(visit.code)) && (await input.record(visit));
    }
  };
}
