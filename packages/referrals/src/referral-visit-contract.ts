import { z } from "zod";
import { PublicOfferCodeSchema } from "./programme-policy.js";

const receipt = z
  .string()
  .max(512)
  .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
export const ReferralVisitCaptureSchema = z
  .object({ code: PublicOfferCodeSchema, receipt: receipt.optional() })
  .strict();
export const ReferralVisitConfirmSchema = z.object({ receipt }).strict();
export const ReferralVisitReceiptSchema = z
  .object({ receipt, expires_at: z.iso.datetime() })
  .strict();
