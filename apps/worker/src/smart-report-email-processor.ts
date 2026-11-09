import { createSesReportEmailTransport } from "../../../packages/email/src/ses-transport.js";
import { renderSmartReportEmail } from "../../../packages/email/src/smart-report-email.js";
import {
  buildEmailBrandMarkUrl,
  formatProductFromEmail
} from "../../../packages/email/src/index.js";
import {
  ReportEmailTransportError,
  type ReportEmailSend
} from "../../../packages/smart-reports/src/report-email.js";
import { resolveWorkerEmailAssetBaseUrl } from "./worker-env.js";
/** Optional existing SES configuration never becomes a debugging dependency.
 * This callback is invoked only after the store's committed per-recipient fence. */
export function createSmartReportEmailSender(env: NodeJS.ProcessEnv): ReportEmailSend | null {
  const from = env["SES_FROM_EMAIL"]?.trim(),
    region = env["SES_REGION"] ?? env["S3_REGION"],
    appBaseUrl = env["APP_BASE_URL"];
  if (!from || !region || !appBaseUrl) return null;
  const configuredTimeout = Number(env["WEEKLY_REPORT_EMAIL_TIMEOUT_MS"] ?? 10000),
    timeoutMs =
      Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 10000;
  try {
    const transport = createSesReportEmailTransport({
      region,
      fromEmail: formatProductFromEmail(from),
      timeoutMs,
      ...(env["AWS_ACCESS_KEY_ID"] === undefined ? {} : { accessKeyId: env["AWS_ACCESS_KEY_ID"] }),
      ...(env["AWS_SECRET_ACCESS_KEY"] === undefined
        ? {}
        : { secretAccessKey: env["AWS_SECRET_ACCESS_KEY"] }),
      ...(env["AWS_SESSION_TOKEN"] === undefined ? {} : { sessionToken: env["AWS_SESSION_TOKEN"] })
    });
    const brandMarkUrl = buildEmailBrandMarkUrl(resolveWorkerEmailAssetBaseUrl(env));
    return async ({ recipient, view }) => {
      let rendered: ReturnType<typeof renderSmartReportEmail>;
      try {
        rendered = renderSmartReportEmail({
          document: view.document,
          appBaseUrl,
          ...(brandMarkUrl === undefined ? {} : { brandMarkUrl })
        });
      } catch {
        throw new ReportEmailTransportError("rejected");
      }
      return transport.send({ to: [recipient], ...rendered });
    };
  } catch {
    return null;
  }
}
