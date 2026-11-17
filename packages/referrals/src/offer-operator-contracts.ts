import { z } from "zod";

export const OfferOperatorActionSchema = z.enum(["read", "manage", "activate", "grant"]);
export type OfferOperatorAction = z.infer<typeof OfferOperatorActionSchema>;
export const OfferDelegationIssueSchema = z
  .object({
    member_token_id: z.uuid(),
    actions: z
      .array(OfferOperatorActionSchema)
      .min(1)
      .max(4)
      .refine((v) => new Set(v).size === v.length)
  })
  .strict();
export const OfferDelegationSchema = z
  .object({
    proof: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    expires_at: z.string().datetime(),
    actions: z.array(OfferOperatorActionSchema).min(1).max(4)
  })
  .strict();
export function isOfferOperatorAllowed(email: string, allowed: ReadonlySet<string>): boolean {
  return allowed.has(email.trim().toLowerCase());
}
