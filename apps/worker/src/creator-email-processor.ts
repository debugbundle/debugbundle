import { createSesReportEmailTransport } from "../../../packages/email/src/ses-transport.js";
import {
  buildEmailBrandMarkUrl,
  formatProductFromEmail
} from "../../../packages/email/src/index.js";
import { deliverCreatorEmail } from "../../../packages/referrals/src/creator-email-delivery.js";
import { createCreatorEmailStore } from "../../../packages/storage/src/creator-email-store.js";
import type { Queryable } from "../../../packages/storage/src/types.js";
import { resolveWorkerEmailAssetBaseUrl } from "./worker-env.js";
import type { RuntimeLogger } from "../../../packages/runtime-logger/src/index.js";

/** Reuse the SES transport with explicit acknowledgement and no SDK retry.
 * It is optional and independent of the financial reconciliation lane. */
export function createCreatorEmailProcessor(input: {
  db: Queryable;
  env: Record<string, string | undefined>;
  logger?: Pick<RuntimeLogger, "warn">;
}): (() => Promise<{ processed: boolean }>) | null {
  const { env } = input;
  const from = env["SES_FROM_EMAIL"]?.trim(),
    region = env["SES_REGION"] ?? env["S3_REGION"],
    appBaseUrl = env["APP_BASE_URL"];
  if (!from || !region || !appBaseUrl) return null;
  const timeout = Number(env["WEEKLY_REPORT_EMAIL_TIMEOUT_MS"] ?? 10000);
  const transport = createSesReportEmailTransport({
    region,
    fromEmail: formatProductFromEmail(from),
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 10000,
    ...(env["AWS_ACCESS_KEY_ID"] ? { accessKeyId: env["AWS_ACCESS_KEY_ID"] } : {}),
    ...(env["AWS_SECRET_ACCESS_KEY"] ? { secretAccessKey: env["AWS_SECRET_ACCESS_KEY"] } : {}),
    ...(env["AWS_SESSION_TOKEN"] ? { sessionToken: env["AWS_SESSION_TOKEN"] } : {})
  });
  const store = createCreatorEmailStore(input.db);
  const brandMarkUrl = buildEmailBrandMarkUrl(resolveWorkerEmailAssetBaseUrl(env));
  return async () => {
    let schedulingFailed = false;
    try {
      await store.schedule();
    } catch {
      schedulingFailed = true;
    }
    const result = await deliverCreatorEmail({
      store,
      transport,
      appBaseUrl,
      publicBaseUrl: env["REFERRAL_LANDING_URL"] ?? "https://debugbundle.com",
      ...(brandMarkUrl ? { brandMarkUrl } : {})
    });
    if (result.attention) input.logger?.warn(result.attention, "creator_email_delivery_attention");
    if (schedulingFailed) throw new Error("creator_email_schedule_failed");
    return result;
  };
}
