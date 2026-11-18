import { z } from "zod";
import { PAYOUT_COUNTRIES } from "./payout-countries.js";
export { PAYOUT_COUNTRIES } from "./payout-countries.js";
export const PAYOUT_CURRENCIES = ["usd", "eur", "gbp", "cad", "aud"] as const;
export const PAYOUT_METHODS = ["iban", "wise", "revolut"] as const;
export const PAYOUT_MINIMUM_USD_MINOR = 5000;
export function validPayoutIban(value: string): boolean {
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(value)) return false;
  let remainder = 0;
  for (const char of value.slice(4) + value.slice(0, 4)) {
    const digits = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}
export function maskPayoutDestination(value: string): string {
  return `••••${value.slice(-Math.min(4, Math.max(1, value.length - 4)))}`;
}
export const PayoutStoredDetailsSchema = z
  .object({
    method: z.enum(PAYOUT_METHODS),
    holder: z
      .string()
      .trim()
      .min(2)
      .max(140)
      .refine((value) => !/\p{C}/u.test(value)),
    country: z.string().regex(/^[A-Z]{2}$/),
    currency: z.enum(PAYOUT_CURRENCIES).default("usd"),
    destination: z.string().trim().min(3).max(64)
  })
  .strict()
  .transform((value) => ({
    ...value,
    destination:
      value.method === "iban"
        ? value.destination.replace(/\s/g, "").toUpperCase()
        : value.destination.replace(/^@/, "")
  }))
  .superRefine((value, context) => {
    if (
      value.method === "iban"
        ? !validPayoutIban(value.destination)
        : !/^[A-Za-z0-9._-]{3,50}$/.test(value.destination)
    )
      context.addIssue({
        code: "custom",
        path: ["destination"],
        message:
          value.method === "iban"
            ? "Enter a valid IBAN."
            : "Enter a valid payment tag without a URL."
      });
  })
  .transform((value) => ({
    ...value,
    destination: value.method === "iban" ? value.destination : `@${value.destination}`
  }));
const payoutCountrySet = new Set<string>(PAYOUT_COUNTRIES);
// Eligibility can evolve; historical encrypted instructions must remain readable.
export const PayoutDetailsSchema = PayoutStoredDetailsSchema.refine(
  (value) => payoutCountrySet.has(value.country),
  { path: ["country"], message: "Choose a supported country." }
);
export type PayoutDetails = z.output<typeof PayoutDetailsSchema>;
export const PayoutPreferenceSummarySchema = z
  .object({
    programme_id: z.uuid(),
    revision: z.uuid(),
    method: z.enum(PAYOUT_METHODS),
    country: z.string().regex(/^[A-Z]{2}$/),
    currency: z.enum(PAYOUT_CURRENCIES),
    masked_destination: z.string().min(1).max(12),
    updated_at: z.string().datetime()
  })
  .strict();
export type PayoutPreferenceSummary = z.infer<typeof PayoutPreferenceSummarySchema>;
export const SavePayoutPreferenceSchema = z
  .object({
    programme_id: z.uuid(),
    expected_revision: z.uuid().nullable(),
    details: PayoutDetailsSchema
  })
  .strict();
export const SavePayoutPreferenceActorSchema = SavePayoutPreferenceSchema.extend({
  expected_user_id: z.uuid()
});
export const CreatorPayoutProgrammeSchema = z
  .object({
    programme_id: z.uuid(),
    name: z.string().min(1).max(100),
    preference: PayoutPreferenceSummarySchema.nullable()
  })
  .strict();
export const PayoutProgrammeBalanceSchema = z
  .object({
    programme_id: z.uuid().nullable(),
    name: z.string().min(1).max(100),
    available_minor: z.number().int().safe(),
    preference: PayoutPreferenceSummarySchema.nullable()
  })
  .strict();
export const PrepareProgrammePayoutSchema = z
  .object({
    partner_id: z.uuid(),
    programme_id: z.uuid(),
    claim_id: z.uuid(),
    preference_revision: z.uuid()
  })
  .strict();
export class PayoutPreferenceError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
