import { z } from "zod";
import type { ReportContentView } from "./report-content.js";
export const ReportEmailDeliverySchema = z
  .object({
    id: z.uuid(),
    run_id: z.uuid().nullable(),
    recipient_user_id: z.uuid().nullable(),
    status: z.enum([
      "queued",
      "sending",
      "accepted",
      "failed",
      "uncertain",
      "suppressed",
      "cancelled"
    ]),
    reason: z.string().max(100).nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    accepted_at: z.string().datetime().nullable()
  })
  .strict();
export type ReportEmailDelivery = z.infer<typeof ReportEmailDeliverySchema>;
export const ReportEmailDeliveriesSchema = z
  .object({ deliveries: z.array(ReportEmailDeliverySchema).max(10) })
  .strict();
export const ReportEmailReceiptSchema = z
  .object({
    provider_message_id: z
      .string()
      .regex(/^[A-Za-z0-9:_-]{1,255}$/)
      .nullable()
  })
  .strict();
export type ReportEmailSend = (input: {
  recipient: string;
  view: ReportContentView;
}) => Promise<z.infer<typeof ReportEmailReceiptSchema>>;
export class ReportEmailTransportError extends Error {
  constructor(readonly state: "rejected" | "uncertain") {
    super(`report_email_${state}`);
    this.name = "ReportEmailTransportError";
  }
}
