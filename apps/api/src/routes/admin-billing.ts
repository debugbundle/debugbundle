import type { FastifyInstance } from "fastify";

import type { ApiDependencies } from "../api-types.js";
import { recordAuditLog } from "../audit-logging.js";
import { enforceRequestRateLimit, requireMemberAuth } from "../api-helpers.js";
import { AdminBillingOverrideBodySchema } from "../schemas.js";

export function registerAdminBillingRoutes(app: FastifyInstance, dependencies: ApiDependencies): void {
  app.post("/v1/admin/billing/override", async (request, reply) => {
    const operator = await requireMemberAuth(request.headers, dependencies);
    if (operator === null) {
      return reply.status(401).send({ error: "invalid_member_token" });
    }

    if (
      !(await enforceRequestRateLimit(request, reply, dependencies, {
        bucket: "management-write",
        subject: `member:${operator.member_id}`
      }))
    ) {
      return;
    }

    if (dependencies.billingAdmin === undefined) {
      return reply.status(404).send({ error: "billing_admin_not_available" });
    }

    if (operator.email === undefined || !dependencies.billingAdmin.isOperatorAllowed({ email: operator.email })) {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: operator.organization_id,
        actor_user_id: operator.member_id,
        actor_type: request.headers.authorization === undefined ? "browser_session" : "member_token",
        action: "billing.admin_override",
        target_type: "organization",
        target_id: operator.organization_id,
        status: "failure",
        ip_address: request.ip,
        metadata: {
          reason: "operator_not_allowed"
        }
      });

      return reply.status(403).send({ error: "forbidden" });
    }

    const parsedBody = AdminBillingOverrideBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    const now = new Date().toISOString();
    const organizationId = parsedBody.data.organization_id ?? operator.organization_id;
    const result = await dependencies.billingAdmin.overrideOrganizationBilling({
      organization_id: organizationId,
      plan: parsedBody.data.plan,
      additional_capacity_units: parsedBody.data.additional_capacity_units,
      now
    });

    await recordAuditLog(dependencies.auditLogging, {
      organization_id: organizationId,
      actor_user_id: operator.member_id,
      actor_type: request.headers.authorization === undefined ? "browser_session" : "member_token",
      action: "billing.admin_override",
      target_type: "organization",
      target_id: organizationId,
      status: result === "billing_not_found" ? "failure" : "success",
      ip_address: request.ip,
      metadata: {
        plan: parsedBody.data.plan,
        additional_capacity_units: parsedBody.data.additional_capacity_units,
        reason: parsedBody.data.reason,
        ...(result === "billing_not_found" ? { error: result } : {})
      }
    });

    if (result === "billing_not_found") {
      return reply.status(404).send({ error: result });
    }

    return reply.status(200).send({ billing: result });
  });
}
