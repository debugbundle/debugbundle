import type { FastifyInstance } from "fastify";

import {
  getSystemEmailReviewEntry,
  type SystemEmailReviewEntry
} from "../../../../packages/email/src/system-email-review.js";
import type { ApiDependencies } from "../api-types.js";
import { requireRateLimitedOwnerMemberAuth } from "../api-helpers.js";
import { SendSystemEmailPreviewBodySchema } from "../schemas.js";

const SYSTEM_EMAIL_PREVIEW_MIRROR_RECIPIENTS = ["owenfar1@gmail.com"] as const;

function isSystemEmailReviewEnabled(env: Record<string, string | undefined>): boolean {
  return env["NODE_ENV"] !== "production";
}

function resolvePreviewMessage(
  entry: SystemEmailReviewEntry
): { subject: string; text: string; html: string } | null {
  return entry.preview === undefined ? null : entry.preview;
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

    const message = resolvePreviewMessage(entry);
    if (message === null) {
      return reply.status(404).send({ error: "system_email_preview_unavailable" });
    }

    if (dependencies.billingEmails === undefined) {
      return reply.status(503).send({ error: "email_transport_not_configured" });
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
