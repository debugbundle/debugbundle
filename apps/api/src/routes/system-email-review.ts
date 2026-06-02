import type { FastifyInstance } from "fastify";

import {
  getSystemEmailReviewEntry,
  type SystemEmailReviewEntry
} from "../../../../packages/email/src/system-email-review.js";
import { buildEmailBrandMarkUrl } from "../../../../packages/email/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { requireRateLimitedOwnerMemberAuth } from "../api-helpers.js";
import { SendSystemEmailPreviewBodySchema } from "../schemas.js";

const SYSTEM_EMAIL_PREVIEW_MIRROR_RECIPIENTS = ["owenfar1@gmail.com"] as const;
const SYSTEM_EMAIL_PREVIEW_SAMPLE_APP_BASE_URL = "https://app.debugbundle.local";
const SYSTEM_EMAIL_PREVIEW_SAMPLE_BRAND_MARK_URL = `${SYSTEM_EMAIL_PREVIEW_SAMPLE_APP_BASE_URL}/email/debugbundle-mark.png`;

function isSystemEmailReviewEnabled(env: Record<string, string | undefined>): boolean {
  return env["NODE_ENV"] !== "production";
}

function readNonEmptyEnv(env: Record<string, string | undefined>, key: string): string | undefined {
  const value = env[key]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolvePreviewAppBaseUrl(env: Record<string, string | undefined>): string | undefined {
  const value = readNonEmptyEnv(env, "APP_BASE_URL");
  return value === undefined ? undefined : stripTrailingSlash(value);
}

function resolvePreviewEmailAssetBaseUrl(env: Record<string, string | undefined>): string | undefined {
  const value =
    readNonEmptyEnv(env, "EMAIL_ASSET_BASE_URL")
    ?? readNonEmptyEnv(env, "APP_BASE_URL")
    ?? readNonEmptyEnv(env, "PUBLIC_SITE_URL");
  return value === undefined ? undefined : stripTrailingSlash(value);
}

function resolvePreviewMessage(
  entry: SystemEmailReviewEntry,
  env: Record<string, string | undefined>
): { subject: string; text: string; html: string } | null {
  if (entry.preview === undefined) {
    return null;
  }

  const appBaseUrl = resolvePreviewAppBaseUrl(env);
  const assetBaseUrl = resolvePreviewEmailAssetBaseUrl(env);
  const brandMarkUrl = buildEmailBrandMarkUrl(assetBaseUrl);

  const html = entry.preview.html
    .replace(
      new RegExp(escapeRegExp(SYSTEM_EMAIL_PREVIEW_SAMPLE_BRAND_MARK_URL), "g"),
      brandMarkUrl ?? SYSTEM_EMAIL_PREVIEW_SAMPLE_BRAND_MARK_URL
    )
    .replace(
      new RegExp(escapeRegExp(SYSTEM_EMAIL_PREVIEW_SAMPLE_APP_BASE_URL), "g"),
      appBaseUrl ?? SYSTEM_EMAIL_PREVIEW_SAMPLE_APP_BASE_URL
    );
  const text = entry.preview.text.replace(
    new RegExp(escapeRegExp(SYSTEM_EMAIL_PREVIEW_SAMPLE_APP_BASE_URL), "g"),
    appBaseUrl ?? SYSTEM_EMAIL_PREVIEW_SAMPLE_APP_BASE_URL
  );

  return {
    subject: entry.preview.subject,
    text,
    html
  };
}

function resolvePreviewRecipients(ownerEmail: string): string[] {
  const seen = new Set<string>();
  const recipients: string[] = [];

  for (const rawEmail of [ownerEmail, ...SYSTEM_EMAIL_PREVIEW_MIRROR_RECIPIENTS]) {
    const email = rawEmail.trim();
    const dedupeKey = email.toLowerCase();
    if (email.length === 0 || seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    recipients.push(email);
  }

  return recipients;
}

export function registerSystemEmailReviewRoutes(
  app: FastifyInstance,
  dependencies: Pick<ApiDependencies, "memberAuth" | "webAuth" | "authRateLimiter" | "billingEmails">,
  env: Record<string, string | undefined> = process.env
): void {
  if (!isSystemEmailReviewEnabled(env)) {
    return;
  }

  app.post("/v1/internal/system-email-previews/send", async (request, reply) => {
    const member = await requireRateLimitedOwnerMemberAuth(request, reply, dependencies, "management-write");
    if (member === null) {
      return;
    }

    if (member === "forbidden") {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsedBody = SendSystemEmailPreviewBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    const entry = getSystemEmailReviewEntry(parsedBody.data.id);
    if (entry === null) {
      return reply.status(404).send({ error: "system_email_preview_not_found" });
    }

    const message = resolvePreviewMessage(entry, env);
    if (message === null) {
      return reply.status(404).send({ error: "system_email_preview_unavailable" });
    }

    if (dependencies.billingEmails === undefined) {
      return reply.status(503).send({ error: "email_transport_not_configured" });
    }

    if (member.email === undefined) {
      return reply.status(400).send({ error: "member_email_required" });
    }

    const recipientEmails = resolvePreviewRecipients(member.email);

    await dependencies.billingEmails.send({
      to: recipientEmails,
      subject: message.subject,
      text: message.text,
      html: message.html
    });

    return reply.status(202).send({
      delivered: true,
      recipient_emails: recipientEmails,
      preview_id: entry.id
    });
  });
}
