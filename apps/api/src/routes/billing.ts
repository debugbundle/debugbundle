import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { ApiDependencies } from "../api-types.js";
import { recordAuditLog, resolveAuditActorType } from "../audit-logging.js";
import { ensureBillingAdminDefaultPlan, isBillingAdminOperator } from "../billing-admin-helpers.js";
import { enforceRequestRateLimit, requireOwnerMemberAuth, resolveBrowserSession } from "../api-helpers.js";
import {
  BillingCheckoutBodySchema,
  BillingCheckoutConfirmBodySchema,
  BillingCapacityChangeBodySchema,
  BillingTrialStartBodySchema
} from "../schemas.js";

async function requireOwnerBillingPrincipal(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: ApiDependencies,
  bucket: "management-read" | "management-write"
): Promise<
  | {
      organization_id: string;
      subject: string;
      user_id: string;
      email: string | undefined;
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
      subject: `member:${session.user_id}`,
      user_id: session.user_id,
      email: session.email
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
    subject: `member:${member.member_id}`,
    user_id: member.member_id,
    email: member.email
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

function getTrialPlan(billing: {
  trial?: {
    plan?: "solo" | "team" | null;
  };
}): "solo" | "team" | null {
  return billing.trial?.plan === "solo" || billing.trial?.plan === "team"
    ? billing.trial.plan
    : null;
}

function hasActiveTrial(billing: {
  trial?: {
    active?: boolean;
  };
}): boolean {
  return billing.trial?.active === true;
}

function canCheckoutToTargetPlan(
  billing: {
    plan: "free" | "solo" | "team";
    trial?: {
      active?: boolean;
      plan?: "solo" | "team" | null;
    };
  },
  targetPlan: "solo" | "team"
): boolean {
  if (hasActiveTrial(billing)) {
    const trialPlan = getTrialPlan(billing);
    if (trialPlan === "solo") {
      return targetPlan === "solo" || targetPlan === "team";
    }

    return trialPlan === "team" && targetPlan === "team";
  }

  return canUpgrade(billing.plan, targetPlan);
}

async function recordBillingAdminOverrideAudit(
  dependencies: Pick<ApiDependencies, "auditLogging">,
  request: FastifyRequest,
  input: {
    organization_id: string;
    user_id: string;
    plan: "free" | "solo" | "team";
    additional_capacity_units: number;
    reason: string;
    status: "success" | "failure";
    error?: string;
  }
): Promise<void> {
  await recordAuditLog(dependencies.auditLogging, {
    organization_id: input.organization_id,
    actor_user_id: input.user_id,
    actor_type: resolveAuditActorType(request.headers),
    action: "billing.admin_override",
    target_type: "organization",
    target_id: input.organization_id,
    status: input.status,
    ip_address: request.ip,
    metadata: {
      plan: input.plan,
      additional_capacity_units: input.additional_capacity_units,
      reason: input.reason,
      ...(input.error === undefined ? {} : { error: input.error })
    }
  });
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

    const now = new Date().toISOString();
    const adminDefault = await ensureBillingAdminDefaultPlan({
      organization_id: principal.organization_id,
      email: principal.email,
      now,
      dependencies
    });
    if (adminDefault?.default_applied === true) {
      await recordBillingAdminOverrideAudit(dependencies, request, {
        organization_id: principal.organization_id,
        user_id: principal.user_id,
        plan: "team",
        additional_capacity_units: 0,
        reason: "billing_admin_auto_default_team",
        status: "success"
      });
    }

    const billing =
      adminDefault?.billing ??
      (await dependencies.billingManagement.getBillingSummaryForOrganization({
        organization_id: principal.organization_id,
        now
      }));
    if (billing === null) {
      return reply.status(404).send({ error: "billing_not_found" });
    }

    return reply.status(200).send({ billing });
  });

  app.post("/v1/billing/trial/start", async (request, reply) => {
    const principal = await requireOwnerBillingPrincipal(request, reply, dependencies, "management-write");
    if (principal === null) {
      return;
    }
    if (dependencies.billingManagement?.startTrial === undefined) {
      return reply.status(404).send({ error: "billing_not_available" });
    }

    const parsedBody = BillingTrialStartBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    const started = await dependencies.billingManagement.startTrial({
      organization_id: principal.organization_id,
      target_plan: parsedBody.data.target_plan,
      now: new Date().toISOString()
    });

    if (typeof started === "string") {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: principal.organization_id,
        actor_user_id: principal.user_id,
        actor_type: resolveAuditActorType(request.headers),
        action: "billing.trial.start",
        target_type: "organization",
        target_id: principal.organization_id,
        status: "failure",
        ip_address: request.ip,
        metadata: {
          target_plan: parsedBody.data.target_plan,
          reason: started
        }
      });

      const statusCode = started === "billing_not_found" ? 404 : 409;
      return reply.status(statusCode).send({ error: started });
    }

    await recordAuditLog(dependencies.auditLogging, {
      organization_id: principal.organization_id,
      actor_user_id: principal.user_id,
      actor_type: resolveAuditActorType(request.headers),
      action: "billing.trial.start",
      target_type: "organization",
      target_id: principal.organization_id,
      status: "success",
      ip_address: request.ip,
      metadata: {
        target_plan: parsedBody.data.target_plan,
        ends_at: started.trial.ends_at
      }
    });

    return reply.status(200).send({ billing: started });
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
    if (!canCheckoutToTargetPlan(billing, parsedBody.data.target_plan)) {
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

    return reply.status(200).send({ billing: result });
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
    if (billing.stripe_customer_id === null) {
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
          reason: "billing_managed_internally"
        }
      });

      return reply.status(409).send({ error: "billing_managed_internally" });
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
    if (dependencies.billingManagement?.increaseCapacity === undefined) {
      return reply.status(404).send({ error: "billing_not_available" });
    }

    const parsedBody = BillingCapacityChangeBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    const now = new Date().toISOString();
    const adminDefault = isBillingAdminOperator(dependencies, principal.email)
      ? await ensureBillingAdminDefaultPlan({
          organization_id: principal.organization_id,
          email: principal.email,
          now,
          dependencies
        })
      : undefined;
    if (adminDefault?.default_applied === true) {
      await recordBillingAdminOverrideAudit(dependencies, request, {
        organization_id: principal.organization_id,
        user_id: principal.user_id,
        plan: "team",
        additional_capacity_units: 0,
        reason: "billing_admin_auto_default_team",
        status: "success"
      });
    }

    const currentBilling = isBillingAdminOperator(dependencies, principal.email)
      ? adminDefault?.billing
      : undefined;
    const billing =
      currentBilling ??
      (await dependencies.billingManagement.getBillingSummaryForOrganization({
        organization_id: principal.organization_id,
        now
      }));
    if (billing !== null && hasActiveTrial(billing)) {
      return reply.status(409).send({ error: "trial_conversion_required" });
    }

    const isInternalOperatorBilling =
      isBillingAdminOperator(dependencies, principal.email) &&
      billing !== null &&
      billing.plan !== "free" &&
      !hasActiveTrial(billing) &&
      (
        billing.billing_state === "admin_override" ||
        billing.billing_state === null ||
        billing.billing_state === undefined
      ) &&
      billing.stripe_customer_id === null;

    const result = isInternalOperatorBilling
      ? parsedBody.data.target_additional_capacity_units <= billing.capacity_units.additional_purchased
        ? "invalid_target_quantity"
        : await dependencies.billingAdmin!.overrideOrganizationBilling({
            organization_id: principal.organization_id,
            plan: billing.plan,
            additional_capacity_units: parsedBody.data.target_additional_capacity_units,
            now
          })
      : await dependencies.billingManagement.increaseCapacity({
          organization_id: principal.organization_id,
          target_additional_capacity_units: parsedBody.data.target_additional_capacity_units,
          now
        });

    if (isInternalOperatorBilling && result !== "invalid_target_quantity") {
      await recordBillingAdminOverrideAudit(dependencies, request, {
        organization_id: principal.organization_id,
        user_id: principal.user_id,
        plan: billing.plan,
        additional_capacity_units: parsedBody.data.target_additional_capacity_units,
        reason: "billing_admin_capacity_increase",
        status: typeof result === "string" ? "failure" : "success",
        ...(typeof result === "string" ? { error: result } : {})
      });
    }

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
    if (dependencies.billingManagement?.scheduleCapacityReduction === undefined) {
      return reply.status(404).send({ error: "billing_not_available" });
    }

    const parsedBody = BillingCapacityChangeBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    const now = new Date().toISOString();
    const adminDefault = isBillingAdminOperator(dependencies, principal.email)
      ? await ensureBillingAdminDefaultPlan({
          organization_id: principal.organization_id,
          email: principal.email,
          now,
          dependencies
        })
      : undefined;
    if (adminDefault?.default_applied === true) {
      await recordBillingAdminOverrideAudit(dependencies, request, {
        organization_id: principal.organization_id,
        user_id: principal.user_id,
        plan: "team",
        additional_capacity_units: 0,
        reason: "billing_admin_auto_default_team",
        status: "success"
      });
    }

    const currentBilling = isBillingAdminOperator(dependencies, principal.email)
      ? adminDefault?.billing
      : undefined;
    const billing =
      currentBilling ??
      (await dependencies.billingManagement.getBillingSummaryForOrganization({
        organization_id: principal.organization_id,
        now
      }));
    if (billing !== null && hasActiveTrial(billing)) {
      return reply.status(409).send({ error: "trial_conversion_required" });
    }

    const isInternalOperatorBilling =
      isBillingAdminOperator(dependencies, principal.email) &&
      billing !== null &&
      billing.plan !== "free" &&
      !hasActiveTrial(billing) &&
      (
        billing.billing_state === "admin_override" ||
        billing.billing_state === null ||
        billing.billing_state === undefined
      ) &&
      billing.stripe_customer_id === null;

    const result = isInternalOperatorBilling
      ? parsedBody.data.target_additional_capacity_units < 0 ||
        parsedBody.data.target_additional_capacity_units >= billing.capacity_units.additional_purchased
        ? "invalid_target_quantity"
        : await dependencies.billingAdmin!.overrideOrganizationBilling({
            organization_id: principal.organization_id,
            plan: billing.plan,
            additional_capacity_units: parsedBody.data.target_additional_capacity_units,
            now
          })
      : await dependencies.billingManagement.scheduleCapacityReduction({
          organization_id: principal.organization_id,
          target_additional_capacity_units: parsedBody.data.target_additional_capacity_units,
          now
        });

    if (isInternalOperatorBilling && result !== "invalid_target_quantity") {
      await recordBillingAdminOverrideAudit(dependencies, request, {
        organization_id: principal.organization_id,
        user_id: principal.user_id,
        plan: billing.plan,
        additional_capacity_units: parsedBody.data.target_additional_capacity_units,
        reason: "billing_admin_capacity_reduction",
        status: typeof result === "string" ? "failure" : "success",
        ...(typeof result === "string" ? { error: result } : {})
      });
    }

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
    if (dependencies.billingManagement?.cancelCapacityReduction === undefined) {
      return reply.status(404).send({ error: "billing_not_available" });
    }

    const billing = await dependencies.billingManagement.getBillingSummaryForOrganization({
      organization_id: principal.organization_id,
      now: new Date().toISOString()
    });
    if (billing !== null && hasActiveTrial(billing)) {
      return reply.status(409).send({ error: "trial_conversion_required" });
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
