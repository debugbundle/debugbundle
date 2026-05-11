import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { ApiDependencies } from "../api-types.js";
import { recordAuditLog } from "../audit-logging.js";
import { enforceRequestRateLimit, requireOwnerMemberAuth, resolveBrowserSession } from "../api-helpers.js";
import { BillingCheckoutBodySchema, BillingCheckoutConfirmBodySchema, BillingCapacityChangeBodySchema } from "../schemas.js";

async function requireOwnerBillingPrincipal(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: ApiDependencies,
  bucket: "management-read" | "management-write"
): Promise<
  | {
      organization_id: string;
      email_verified_at: string | null;
      verification_required: boolean;
      subject: string;
    }
  | null
> {
  if (request.headers.authorization === undefined) {
    const session = await resolveBrowserSession(request.headers.cookie, dependencies);
    if (session === null) {
      await reply.status(401).send({ error: "invalid_session" });
      return null;
    }

    if (session.role !== "owner") {
      await reply.status(403).send({ error: "forbidden" });
      return null;
    }

    if (
      !(await enforceRequestRateLimit(request, reply, dependencies, {
        bucket,
        subject: `member:${session.user_id}`
      }))
    ) {
      return null;
    }

    return {
      organization_id: session.organization_id,
      email_verified_at: session.email_verified_at,
      verification_required: session.email_verified_at === null,
      subject: `member:${session.user_id}`
    };
  }

  const member = await requireOwnerMemberAuth(request.headers, dependencies);
  if (member === null) {
    await reply.status(401).send({ error: "invalid_member_token" });
    return null;
  }
  if (member === "forbidden") {
    await reply.status(403).send({ error: "forbidden" });
    return null;
  }

  if (
    !(await enforceRequestRateLimit(request, reply, dependencies, {
      bucket,
      subject: `member:${member.member_id}`
    }))
  ) {
    return null;
  }

  return {
    organization_id: member.organization_id,
    email_verified_at: null,
    verification_required: false,
    subject: `member:${member.member_id}`
  };
}

function canUpgrade(currentPlan: "free" | "solo" | "team", targetPlan: "solo" | "team"): boolean {
  if (currentPlan === "free") {
    return true;
  }

  if (currentPlan === "solo") {
    return targetPlan === "team";
  }

  return false;
}

export function registerBillingRoutes(app: FastifyInstance, dependencies: ApiDependencies): void {
  app.get("/v1/billing", async (request, reply) => {
    const principal = await requireOwnerBillingPrincipal(request, reply, dependencies, "management-read");
    if (principal === null) {
      return;
    }
    if (dependencies.billingManagement === undefined) {
      return reply.status(404).send({ error: "billing_not_available" });
    }

    const billing = await dependencies.billingManagement.getBillingSummaryForOrganization({
      organization_id: principal.organization_id,
      now: new Date().toISOString()
    });
    if (billing === null) {
      return reply.status(404).send({ error: "billing_not_found" });
    }

    return reply.status(200).send({
      billing: {
        ...billing,
        email_verification_required: principal.verification_required
      }
    });
  });

  app.post("/v1/billing/checkout", async (request, reply) => {
    const session = await resolveBrowserSession(request.headers.cookie, dependencies);
    if (session === null) {
      return reply.status(401).send({ error: "invalid_session" });
    }
    if (session.role !== "owner") {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (
      !(await enforceRequestRateLimit(request, reply, dependencies, {
        bucket: "management-write",
        subject: `member:${session.user_id}`
      }))
    ) {
      return;
    }
    if (session.email_verified_at === null) {
      return reply.status(403).send({ error: "verification_required" });
    }
    if (dependencies.billingManagement === undefined) {
      return reply.status(404).send({ error: "billing_not_available" });
    }

    const parsedBody = BillingCheckoutBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    const billing = await dependencies.billingManagement.getBillingSummaryForOrganization({
      organization_id: session.organization_id,
      now: new Date().toISOString()
    });
    if (billing === null) {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: session.organization_id,
        actor_user_id: session.user_id,
        actor_type: "browser_session",
        action: "billing.checkout",
        target_type: "billing_checkout",
        target_id: session.organization_id,
        status: "failure",
        ip_address: request.ip,
        metadata: {
          target_plan: parsedBody.data.target_plan,
          reason: "billing_not_found"
        }
      });

      return reply.status(404).send({ error: "billing_not_found" });
    }
    if (!canUpgrade(billing.plan, parsedBody.data.target_plan)) {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: session.organization_id,
        actor_user_id: session.user_id,
        actor_type: "browser_session",
        action: "billing.checkout",
        target_type: "billing_checkout",
        target_id: session.organization_id,
        status: "failure",
        ip_address: request.ip,
        metadata: {
          current_plan: billing.plan,
          target_plan: parsedBody.data.target_plan,
          reason: "invalid_plan_change"
        }
      });

      return reply.status(409).send({ error: "invalid_plan_change" });
    }

    const checkout = await dependencies.billingManagement.createCheckoutLink({
      organization_id: session.organization_id,
      billing_email: session.email,
      current_plan: billing.plan,
      target_plan: parsedBody.data.target_plan
    });
    if (checkout === null) {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: session.organization_id,
        actor_user_id: session.user_id,
        actor_type: "browser_session",
        action: "billing.checkout",
        target_type: "billing_checkout",
        target_id: session.organization_id,
        status: "failure",
        ip_address: request.ip,
        metadata: {
          current_plan: billing.plan,
          target_plan: parsedBody.data.target_plan,
          reason: "billing_not_configured"
        }
      });

      return reply.status(503).send({ error: "billing_not_configured" });
    }

    await recordAuditLog(dependencies.auditLogging, {
      organization_id: session.organization_id,
      actor_user_id: session.user_id,
      actor_type: "browser_session",
      action: "billing.checkout",
      target_type: "billing_checkout",
      target_id: session.organization_id,
      status: "success",
      ip_address: request.ip,
      metadata: {
        current_plan: billing.plan,
        target_plan: parsedBody.data.target_plan
      }
    });

    return reply.status(200).send(checkout);
  });

  app.post("/v1/billing/checkout/confirm", async (request, reply) => {
    const session = await resolveBrowserSession(request.headers.cookie, dependencies);
    if (session === null) {
      return reply.status(401).send({ error: "invalid_session" });
    }
    if (session.role !== "owner") {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (
      !(await enforceRequestRateLimit(request, reply, dependencies, {
        bucket: "management-write",
        subject: `member:${session.user_id}`
      }))
    ) {
      return;
    }
    if (dependencies.billingManagement?.confirmCheckoutSession === undefined) {
      return reply.status(404).send({ error: "billing_not_available" });
    }

    const parsedBody = BillingCheckoutConfirmBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    const result = await dependencies.billingManagement.confirmCheckoutSession({
      organization_id: session.organization_id,
      session_id: parsedBody.data.session_id,
      now: new Date().toISOString()
    });

    if (typeof result === "string") {
      const statusCode = result === "billing_not_configured" || result === "billing_service_error"
        ? 503
        : result === "billing_not_found" || result === "checkout_session_not_found"
          ? 404
          : 409;

      await recordAuditLog(dependencies.auditLogging, {
        organization_id: session.organization_id,
        actor_user_id: session.user_id,
        actor_type: "browser_session",
        action: "billing.checkout.confirm",
        target_type: "billing_checkout",
        target_id: parsedBody.data.session_id,
        status: "failure",
        ip_address: request.ip,
        metadata: {
          reason: result
        }
      });

      return reply.status(statusCode).send({ error: result });
    }

    await recordAuditLog(dependencies.auditLogging, {
      organization_id: session.organization_id,
      actor_user_id: session.user_id,
      actor_type: "browser_session",
      action: "billing.checkout.confirm",
      target_type: "billing_checkout",
      target_id: parsedBody.data.session_id,
      status: "success",
      ip_address: request.ip,
      metadata: {
        plan: result.plan
      }
    });

    return reply.status(200).send({
      billing: {
        ...result,
        email_verification_required: session.email_verified_at === null
      }
    });
  });

  app.post("/v1/billing/portal", async (request, reply) => {
    const session = await resolveBrowserSession(request.headers.cookie, dependencies);
    if (session === null) {
      return reply.status(401).send({ error: "invalid_session" });
    }
    if (session.role !== "owner") {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (
      !(await enforceRequestRateLimit(request, reply, dependencies, {
        bucket: "management-write",
        subject: `member:${session.user_id}`
      }))
    ) {
      return;
    }
    if (session.email_verified_at === null) {
      return reply.status(403).send({ error: "verification_required" });
    }
    if (dependencies.billingManagement === undefined) {
      return reply.status(404).send({ error: "billing_not_available" });
    }

    const billing = await dependencies.billingManagement.getBillingSummaryForOrganization({
      organization_id: session.organization_id,
      now: new Date().toISOString()
    });
    if (billing === null) {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: session.organization_id,
        actor_user_id: session.user_id,
        actor_type: "browser_session",
        action: "billing.portal",
        target_type: "billing_portal",
        target_id: session.organization_id,
        status: "failure",
        ip_address: request.ip,
        metadata: {
          reason: "billing_not_found"
        }
      });

      return reply.status(404).send({ error: "billing_not_found" });
    }
    if (billing.plan === "free") {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: session.organization_id,
        actor_user_id: session.user_id,
        actor_type: "browser_session",
        action: "billing.portal",
        target_type: "billing_portal",
        target_id: session.organization_id,
        status: "failure",
        ip_address: request.ip,
        metadata: {
          current_plan: billing.plan,
          reason: "no_active_subscription"
        }
      });

      return reply.status(409).send({ error: "no_active_subscription" });
    }

    const portal = await dependencies.billingManagement.createPortalLink({
      organization_id: session.organization_id,
      current_plan: billing.plan
    });
    if (portal === null) {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: session.organization_id,
        actor_user_id: session.user_id,
        actor_type: "browser_session",
        action: "billing.portal",
        target_type: "billing_portal",
        target_id: session.organization_id,
        status: "failure",
        ip_address: request.ip,
        metadata: {
          current_plan: billing.plan,
          reason: "billing_not_configured"
        }
      });

      return reply.status(503).send({ error: "billing_not_configured" });
    }

    await recordAuditLog(dependencies.auditLogging, {
      organization_id: session.organization_id,
      actor_user_id: session.user_id,
      actor_type: "browser_session",
      action: "billing.portal",
      target_type: "billing_portal",
      target_id: session.organization_id,
      status: "success",
      ip_address: request.ip,
      metadata: {
        current_plan: billing.plan
      }
    });

    return reply.status(200).send(portal);
  });

  app.post("/v1/billing/capacity/increase", async (request, reply) => {
    const principal = await requireOwnerBillingPrincipal(request, reply, dependencies, "management-write");
    if (principal === null) {
      return;
    }
    if (principal.verification_required) {
      return reply.status(403).send({ error: "verification_required" });
    }
    if (dependencies.billingManagement?.increaseCapacity === undefined) {
      return reply.status(404).send({ error: "billing_not_available" });
    }

    const parsedBody = BillingCapacityChangeBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    const result = await dependencies.billingManagement.increaseCapacity({
      organization_id: principal.organization_id,
      target_additional_capacity_units: parsedBody.data.target_additional_capacity_units,
      now: new Date().toISOString()
    });

    if (typeof result === "string") {
      const statusCode =
        result === "billing_not_configured"
          ? 503
          : result === "billing_not_found"
            ? 404
            : 409;

      return reply.status(statusCode).send({ error: result });
    }

    return reply.status(200).send({ billing: result });
  });

  app.post("/v1/billing/capacity/scheduled-reduction", async (request, reply) => {
    const principal = await requireOwnerBillingPrincipal(request, reply, dependencies, "management-write");
    if (principal === null) {
      return;
    }
    if (principal.verification_required) {
      return reply.status(403).send({ error: "verification_required" });
    }
    if (dependencies.billingManagement?.scheduleCapacityReduction === undefined) {
      return reply.status(404).send({ error: "billing_not_available" });
    }

    const parsedBody = BillingCapacityChangeBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    const result = await dependencies.billingManagement.scheduleCapacityReduction({
      organization_id: principal.organization_id,
      target_additional_capacity_units: parsedBody.data.target_additional_capacity_units,
      now: new Date().toISOString()
    });

    if (typeof result === "string") {
      const statusCode =
        result === "billing_not_configured"
          ? 503
          : result === "billing_not_found"
            ? 404
            : 409;

      return reply.status(statusCode).send({ error: result });
    }

    return reply.status(200).send({ billing: result });
  });

  app.delete("/v1/billing/capacity/scheduled-reduction", async (request, reply) => {
    const principal = await requireOwnerBillingPrincipal(request, reply, dependencies, "management-write");
    if (principal === null) {
      return;
    }
    if (principal.verification_required) {
      return reply.status(403).send({ error: "verification_required" });
    }
    if (dependencies.billingManagement?.cancelCapacityReduction === undefined) {
      return reply.status(404).send({ error: "billing_not_available" });
    }

    const result = await dependencies.billingManagement.cancelCapacityReduction({
      organization_id: principal.organization_id,
      now: new Date().toISOString()
    });

    if (typeof result === "string") {
      const statusCode =
        result === "billing_not_configured"
          ? 503
          : result === "billing_not_found"
            ? 404
            : 409;

      return reply.status(statusCode).send({ error: result });
    }

    return reply.status(200).send({ billing: result });
  });
}