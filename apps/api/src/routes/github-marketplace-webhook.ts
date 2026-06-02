import { createHmac, timingSafeEqual } from "node:crypto";

import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { RuntimeLogger } from "../../../../packages/runtime-logger/src/index.js";
import type { AuditLogStore, GitHubMarketplaceStore } from "../../../../packages/storage/src/index.js";
import { recordAuditLog } from "../audit-logging.js";

const GitHubMarketplaceAccountSchema = z
  .object({
    id: z.coerce.number().int().positive(),
    login: z.string().min(1),
    type: z.enum(["Organization", "User"]),
    node_id: z.string().min(1).nullable().optional()
  })
  .passthrough();

const GitHubMarketplacePlanSchema = z
  .object({
    id: z.coerce.number().int().positive(),
    name: z.string().min(1),
    price_model: z.string().min(1).nullable().optional()
  })
  .passthrough();

const GitHubMarketplacePurchaseSchema = z
  .object({
    account: GitHubMarketplaceAccountSchema,
    plan: GitHubMarketplacePlanSchema,
    billing_cycle: z.enum(["monthly", "yearly"]).nullable().optional(),
    unit_count: z.coerce.number().int().nullable().optional(),
    on_free_trial: z.boolean().optional().default(false),
    free_trial_ends_on: z.string().datetime().nullable().optional(),
    next_billing_date: z.string().datetime().nullable().optional()
  })
  .passthrough();

const GitHubMarketplacePurchaseWebhookPayloadSchema = z
  .object({
    action: z.enum(["purchased", "cancelled", "pending_change", "pending_change_cancelled", "changed"]),
    effective_date: z.string().datetime(),
    installation: z
      .object({
        id: z.coerce.number().int().positive()
      })
      .passthrough()
      .optional(),
    marketplace_purchase: GitHubMarketplacePurchaseSchema
  })
  .passthrough();

function isValidSignature(secret: string, rawBody: Buffer, signature: string): boolean {
  if (!signature.startsWith("sha256=")) {
    return false;
  }

  const expectedSignature = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const providedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export interface GitHubMarketplaceWebhookDependencies {
  webhookSecret: string;
  githubMarketplaceStore: GitHubMarketplaceStore;
  auditLogging?: Pick<AuditLogStore, "createAuditLog">;
  logger?: Pick<RuntimeLogger, "warn" | "error">;
}

export function registerGitHubMarketplaceWebhookRoute(
  app: FastifyInstance,
  dependencies: GitHubMarketplaceWebhookDependencies
): void {
  app.register((scope) => {
    scope.addContentTypeParser("application/json", { parseAs: "buffer" }, (_request, body, done) => {
      done(null, body);
    });

    scope.post("/v1/github/marketplace/webhook", async (request, reply) => {
      const logger = request.log.child({ route: request.routeOptions.url });
      const signature = request.headers["x-hub-signature-256"];
      const eventName = request.headers["x-github-event"];
      const deliveryId = request.headers["x-github-delivery"];

      if (typeof signature !== "string") {
        return reply.status(400).send({ error: "missing_github_signature" });
      }
      if (typeof eventName !== "string") {
        return reply.status(400).send({ error: "missing_github_event" });
      }
      if (typeof deliveryId !== "string") {
        return reply.status(400).send({ error: "missing_github_delivery" });
      }
      if (!(request.body instanceof Buffer)) {
        return reply.status(400).send({ error: "invalid_body" });
      }
      if (!isValidSignature(dependencies.webhookSecret, request.body, signature)) {
        await recordAuditLog(
          dependencies.auditLogging,
          {
            organization_id: null,
            actor_user_id: null,
            actor_type: "system",
            action: "github.marketplace.webhook.process",
            target_type: "github_marketplace_delivery",
            target_id: deliveryId,
            status: "failure",
            ip_address: request.ip,
            metadata: {
              event_name: eventName,
              reason: "invalid_signature"
            }
          },
          logger
        );

        return reply.status(400).send({ error: "invalid_signature" });
      }

      const alreadyProcessed = await dependencies.githubMarketplaceStore.isEventProcessed(deliveryId);
      if (alreadyProcessed) {
        await recordAuditLog(
          dependencies.auditLogging,
          {
            organization_id: null,
            actor_user_id: null,
            actor_type: "system",
            action: "github.marketplace.webhook.process",
            target_type: "github_marketplace_delivery",
            target_id: deliveryId,
            status: "success",
            ip_address: request.ip,
            metadata: {
              duplicate: true,
              event_name: eventName
            }
          },
          logger
        );

        return reply.status(200).send({ received: true, duplicate: true });
      }

      let payload: unknown;
      try {
        payload = JSON.parse(request.body.toString("utf8"));
      } catch {
        return reply.status(400).send({ error: "invalid_payload" });
      }

      if (eventName === "ping") {
        await dependencies.githubMarketplaceStore.markEventProcessed({
          delivery_id: deliveryId,
          event_name: eventName,
          marketplace_account_id: null,
          action: null
        });

        await recordAuditLog(
          dependencies.auditLogging,
          {
            organization_id: null,
            actor_user_id: null,
            actor_type: "system",
            action: "github.marketplace.webhook.process",
            target_type: "github_marketplace_delivery",
            target_id: deliveryId,
            status: "success",
            ip_address: request.ip,
            metadata: {
              duplicate: false,
              event_name: eventName
            }
          },
          logger
        );

        return reply.status(200).send({ received: true });
      }

      if (eventName !== "marketplace_purchase") {
        await dependencies.githubMarketplaceStore.markEventProcessed({
          delivery_id: deliveryId,
          event_name: eventName,
          marketplace_account_id: null,
          action: null
        });

        return reply.status(200).send({ received: true, ignored: true });
      }

      const parsedPayload = GitHubMarketplacePurchaseWebhookPayloadSchema.safeParse(payload);
      if (!parsedPayload.success) {
        return reply.status(400).send({ error: "invalid_payload" });
      }

      const record = await dependencies.githubMarketplaceStore.upsertMarketplaceAccount({
        organization_id: null,
        marketplace_account_id: parsedPayload.data.marketplace_purchase.account.id,
        marketplace_account_login: parsedPayload.data.marketplace_purchase.account.login,
        marketplace_account_type: parsedPayload.data.marketplace_purchase.account.type,
        marketplace_account_node_id: parsedPayload.data.marketplace_purchase.account.node_id ?? null,
        marketplace_listing_plan_id: parsedPayload.data.marketplace_purchase.plan.id,
        marketplace_listing_plan_name: parsedPayload.data.marketplace_purchase.plan.name,
        marketplace_plan_price_model: parsedPayload.data.marketplace_purchase.plan.price_model ?? null,
        billing_cycle: parsedPayload.data.marketplace_purchase.billing_cycle ?? null,
        unit_count: parsedPayload.data.marketplace_purchase.unit_count ?? null,
        on_free_trial: parsedPayload.data.marketplace_purchase.on_free_trial,
        free_trial_ends_on: parsedPayload.data.marketplace_purchase.free_trial_ends_on ?? null,
        next_billing_date: parsedPayload.data.marketplace_purchase.next_billing_date ?? null,
        effective_date: parsedPayload.data.effective_date,
        installation_id: parsedPayload.data.installation?.id ?? null,
        marketplace_purchase_status: parsedPayload.data.action,
        last_event_id: deliveryId,
        last_event_action: parsedPayload.data.action
      });

      await dependencies.githubMarketplaceStore.markEventProcessed({
        delivery_id: deliveryId,
        event_name: eventName,
        marketplace_account_id: record.marketplace_account_id,
        action: parsedPayload.data.action
      });

      await recordAuditLog(
        dependencies.auditLogging,
        {
          organization_id: record.organization_id,
          actor_user_id: null,
          actor_type: "system",
          action: "github.marketplace.webhook.process",
          target_type: "github_marketplace_delivery",
          target_id: deliveryId,
          status: "success",
          ip_address: request.ip,
          metadata: {
            duplicate: false,
            event_name: eventName,
            marketplace_account_id: record.marketplace_account_id,
            installation_id: record.installation_id,
            action: record.marketplace_purchase_status,
            plan_name: record.marketplace_listing_plan_name
          }
        },
        logger
      );

      return reply.status(200).send({ received: true });
    });
  });
}
