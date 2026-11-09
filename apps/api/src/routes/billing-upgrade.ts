import type { FastifyInstance } from "fastify";
import type { ApiDependencies } from "../api-types.js";
import { enforceRequestRateLimit, resolveBrowserSession } from "../api-helpers.js";
import { z } from "zod";
import { BillingOfferSelectionSchema } from "../../../../packages/shared-types/src/index.js";
import { requireInteractiveBillingOwner } from "./billing-principal.js";

export function registerBillingUpgradeRoutes(
  app: FastifyInstance,
  dependencies: ApiDependencies
): void {
  app.post("/v1/billing/offers/upgrade-preview", async (request, reply) => {
    const session = await requireInteractiveBillingOwner(request, reply, dependencies);
    if (!session) return;
    reply.header("Cache-Control", "no-store");
    const parsed = BillingOfferSelectionSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_payload" });
    if (
      !(await enforceRequestRateLimit(request, reply, dependencies, {
        bucket: "management-write",
        subject: `member:${session.user_id}`
      }))
    )
      return;
    if (!dependencies.billingManagement?.previewOfferUpgrade)
      return reply.status(503).send({ error: "billing_not_configured" });
    const result = await dependencies.billingManagement.previewOfferUpgrade({
      organization_id: session.organization_id,
      actor_user_id: session.user_id,
      ...parsed.data
    });
    return typeof result === "string"
      ? reply.status(result === "billing_service_error" ? 503 : 409).send({ error: result })
      : reply.status(200).send(result);
  });
  app.post("/v1/billing/upgrade/preview", async (request, reply) => {
    const session = await resolveBrowserSession(request.headers.cookie, dependencies);
    if (!session) return reply.status(401).send({ error: "invalid_session" });
    if (session.role !== "owner") return reply.status(403).send({ error: "forbidden" });
    if (!session.email_verified_at)
      return reply.status(403).send({ error: "email_verification_required" });
    reply.header("Cache-Control", "no-store");
    if (!z.object({}).strict().safeParse(request.body).success)
      return reply.status(400).send({ error: "invalid_payload" });
    if (
      !(await enforceRequestRateLimit(request, reply, dependencies, {
        bucket: "management-write",
        subject: `member:${session.user_id}`
      }))
    )
      return;
    if (!dependencies.billingManagement?.previewUpgrade)
      return reply.status(503).send({ error: "billing_not_configured" });
    const result = await dependencies.billingManagement.previewUpgrade({
      organization_id: session.organization_id
    });
    return typeof result === "string"
      ? reply.status(result === "billing_service_error" ? 503 : 409).send({ error: result })
      : reply.status(200).send(result);
  });
}
