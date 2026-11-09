import { SESv2Client, SendEmailCommand, type SendEmailCommandOutput } from "@aws-sdk/client-sesv2";
import { z } from "zod";
import { EmailDeliveryError, type EmailMessage, type EmailTransport } from "./email-types.js";
import { ReportEmailTransportError } from "../../smart-reports/src/report-email.js";
export { ReportEmailTransportError } from "../../smart-reports/src/report-email.js";
export interface SesEmailTransportInput {
  region: string;
  fromEmail: string;
  timeoutMs: number;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  endpoint?: string;
}
function createClient(input: SesEmailTransportInput, maxAttempts?: number): SESv2Client {
  return new SESv2Client({
    region: input.region,
    ...(maxAttempts === undefined ? {} : { maxAttempts }),
    ...(input.endpoint === undefined ? {} : { endpoint: input.endpoint }),
    ...(input.accessKeyId === undefined || input.secretAccessKey === undefined
      ? {}
      : {
          credentials: {
            accessKeyId: input.accessKeyId,
            secretAccessKey: input.secretAccessKey,
            ...(input.sessionToken === undefined ? {} : { sessionToken: input.sessionToken })
          }
        })
  });
}
async function sendMessage(
  client: SESv2Client,
  input: SesEmailTransportInput,
  message: EmailMessage,
  hardDeadline = false
): Promise<SendEmailCommandOutput> {
  let rejectDeadline: ((error: Error) => void) | undefined;
  const deadline = hardDeadline
    ? new Promise<never>((_resolve, reject) => {
        rejectDeadline = reject;
      })
    : null;
  const controller = new AbortController(),
    timeout = setTimeout(() => {
      controller.abort();
      rejectDeadline?.(new Error("report_email_deadline"));
    }, input.timeoutMs);
  try {
    const request = client.send(
      new SendEmailCommand({
        FromEmailAddress: input.fromEmail,
        Destination: { ToAddresses: message.to },
        Content: {
          Simple: {
            Subject: { Data: message.subject, Charset: "UTF-8" },
            Body: {
              Text: { Data: message.text, Charset: "UTF-8" },
              Html: { Data: message.html, Charset: "UTF-8" }
            }
          }
        }
      }),
      { abortSignal: controller.signal }
    );
    return await (deadline === null ? request : Promise.race([request, deadline]));
  } finally {
    clearTimeout(timeout);
  }
}
function httpStatus(error: unknown): number | null {
  return typeof error === "object" && error !== null && "$metadata" in error
    ? ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode ?? null)
    : null;
}
/** Preserve the existing transport's retry configuration and error contract. */
export function createSesEmailTransport(input: SesEmailTransportInput): EmailTransport {
  const client = createClient(input);
  return {
    async send(message): Promise<void> {
      try {
        await sendMessage(client, input, message);
      } catch (error) {
        if (error instanceof EmailDeliveryError) throw error;
        if (error instanceof Error && error.name === "AbortError")
          throw new EmailDeliveryError("email_timeout");
        const status = httpStatus(error);
        if (typeof status === "number") throw new EmailDeliveryError(`email_http_error_${status}`);
        const messageText = error instanceof Error ? error.message : String(error);
        throw new EmailDeliveryError(`email_transport_error:${messageText}`);
      }
    }
  };
}
export interface ReportEmailTransport {
  send(message: EmailMessage): Promise<{ provider_message_id: string | null }>;
}
const reportMessage = z
  .object({
    to: z.array(z.email()).length(1),
    subject: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[^\u0000-\u001f\u007f]+$/),
    text: z.string().max(128 * 1024),
    html: z.string().max(128 * 1024)
  })
  .strict();
/** Report delivery commits its own send intent. Disable SDK retries because a
 * lost provider acknowledgement must remain uncertain, never silently resend. */
export function createSesReportEmailTransport(raw: SesEmailTransportInput): ReportEmailTransport {
  const input = {
      ...raw,
      timeoutMs: Number.isFinite(raw.timeoutMs)
        ? Math.max(1, Math.min(20000, raw.timeoutMs))
        : 20000
    },
    client = createClient(input, 1);
  return {
    async send(message): Promise<{ provider_message_id: string | null }> {
      const parsed = reportMessage.safeParse(message),
        encoder = new TextEncoder();
      if (
        !parsed.success ||
        encoder.encode(parsed.data.html).length > 128 * 1024 ||
        encoder.encode(parsed.data.text).length > 128 * 1024
      )
        throw new ReportEmailTransportError("rejected");
      try {
        const response = await sendMessage(client, input, parsed.data, true);
        return {
          provider_message_id:
            typeof response.MessageId === "string" &&
            /^[A-Za-z0-9:_-]{1,255}$/.test(response.MessageId)
              ? response.MessageId
              : null
        };
      } catch (error) {
        const status = httpStatus(error);
        throw new ReportEmailTransportError(
          status !== null && status >= 400 && status < 500 && status !== 408
            ? "rejected"
            : "uncertain"
        );
      }
    }
  };
}
