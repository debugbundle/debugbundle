import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  REFERRAL_TERMS_VERSION,
  ReferralCodeSchema,
  ReferralError,
  type ReferralPartnerResponse
} from "../../../../packages/referrals/src/referral-contracts.js";
import type { ApiDependencies } from "../api-types.js";
import { enforceRequestRateLimit, requireRateLimitedMemberAuth } from "../api-helpers.js";
import { requireOwnerBillingPrincipal } from "./billing-principal.js";
import { recordAuditLog, resolveAuditActorType } from "../audit-logging.js";
import { registerReferralFinanceRoutes } from "./referral-finance.js";

const JoinSchema = z.object({ terms_version: z.string().min(1).max(100) }).strict();
const AttributionSchema = z
  .object({
    code: ReferralCodeSchema,
    explicit_correction: z.boolean().default(false),
    expected_organization_id: z.uuid().optional()
  })
  .strict();
const ClientsSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    before: z.uuid().optional()
  })
  .strict();
type Handler = (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
function guarded(handler: Handler): Handler {
  return async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    try {
      return await handler(request, reply);
    } catch (error) {
      if (error instanceof ReferralError) {
        const status = ["forbidden", "email_verification_required", "referral_self_claim"].includes(
          error.code
        )
          ? 403
          : ["terms_mismatch", "invalid_referral_code"].includes(error.code)
            ? 400
            : error.code === "payout_not_found"
              ? 404
              : error.code === "program_unavailable"
                ? 503
                : 409;
        return reply.status(status).send({ error: error.code });
      }
      request.log.warn("referral_service_unavailable");
      return reply.status(503).send({ error: "referral_service_unavailable" });
    }
  };
}
/** All personal finance reads use the human identity; customer attribution uses
 * current Owner authority. Restricted project credentials remain fail closed. */
export function registerReferralRoutes(app: FastifyInstance, dependencies: ApiDependencies): void {
  const audits = new WeakMap<
    FastifyRequest,
    { user_id: string; organization_id: string; action: string }
  >();
  registerReferralFinanceRoutes(app, dependencies, {
    guard: guarded,
    audit: (request, input) => audits.set(request, input)
  });
  app.addHook("onResponse", async (request, reply) => {
    const context = audits.get(request);
    if (!context) return;
    await recordAuditLog(dependencies.auditLogging, {
      organization_id: context.organization_id,
      actor_user_id: context.user_id,
      actor_type: resolveAuditActorType(request.headers),
      action: context.action,
      target_type: "referral_program",
      target_id: context.organization_id,
      status: reply.statusCode < 400 ? "success" : "failure",
      ip_address: request.ip,
      metadata: {}
    });
  });
  function service(reply: FastifyReply): ApiDependencies["referrals"] | null {
    const available = dependencies.referrals;
    if (!available) {
      void reply.status(503).send({ error: "program_unavailable" });
      return null;
    }
    return available;
  }
  const partnerResponse = (
    partner: Awaited<ReturnType<NonNullable<ApiDependencies["referrals"]>["partner"]>>,
    manager: NonNullable<ApiDependencies["referrals"]>
  ): ReferralPartnerResponse => ({
    partner,
    share_url: partner ? manager.shareLink(partner.code) : null,
    enrollment_enabled: manager.enrollmentEnabled,
    terms_version: REFERRAL_TERMS_VERSION
  });
  for (const write of [false, true])
    app.route({
      method: write ? "POST" : "GET",
      url: "/v1/referrals/partner",
      handler: guarded(async (request, reply) => {
        const member = await requireRateLimitedMemberAuth(
          request,
          reply,
          dependencies,
          write ? "management-write" : "management-read"
        );
        if (!member) return;
        if (write)
          audits.set(request, {
            user_id: member.member_id,
            organization_id: member.organization_id,
            action: "referral.partner.join"
          });
        const manager = service(reply);
        if (!manager) return;
        if (!write)
          return reply.send(partnerResponse(await manager.partner(member.member_id), manager));
        const body = JoinSchema.safeParse(request.body);
        if (!body.success) return reply.status(400).send({ error: "invalid_payload" });
        return reply.send(
          partnerResponse(await manager.join(member.member_id, body.data.terms_version), manager)
        );
      })
    });
  app.get(
    "/v1/referrals/clients",
    guarded(async (request, reply) => {
      const member = await requireRateLimitedMemberAuth(
        request,
        reply,
        dependencies,
        "management-read"
      );
      if (!member) return;
      const manager = service(reply);
      if (!manager) return;
      const query = ClientsSchema.safeParse(request.query);
      if (!query.success) return reply.status(400).send({ error: "invalid_query" });
      return reply.send({
        clients: await manager.clients({
          user_id: member.member_id,
          limit: query.data.limit,
          ...(query.data.before === undefined ? {} : { before: query.data.before })
        })
      });
    })
  );
  for (const write of [false, true])
    app.route({
      method: write ? "POST" : "GET",
      url: "/v1/referrals/attribution",
      handler: guarded(async (request, reply) => {
        const principal = await requireOwnerBillingPrincipal(
          request,
          reply,
          dependencies,
          write ? "management-write" : "management-read",
          true
        );
        if (!principal) return;
        const actor = {
          organization_id: principal.organization_id,
          actor_user_id: principal.user_id
        };
        if (write)
          audits.set(request, {
            user_id: principal.user_id,
            organization_id: principal.organization_id,
            action: "referral.attribution.assign"
          });
        const manager = service(reply);
        if (!manager) return;
        if (!write)
          return reply.send({
            attribution: await manager.customer(actor),
            pending_code: await manager.pendingCode(request.headers.cookie)
          });
        const body = AttributionSchema.safeParse(request.body);
        if (!body.success) return reply.status(400).send({ error: "invalid_payload" });
        if (
          body.data.expected_organization_id !== undefined &&
          body.data.expected_organization_id !== principal.organization_id
        )
          return reply.status(409).send({ error: "organization_context_changed" });
        const attribution = await manager.attribute({
          ...actor,
          code: body.data.code,
          explicit_correction: body.data.explicit_correction,
          source: "manual"
        });
        reply.header("Set-Cookie", manager.clearPendingCookie());
        return reply.send({ attribution });
      })
    });
  app.get("/v1/referrals/visit/:code", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    if (
      !(await enforceRequestRateLimit(request, reply, dependencies, {
        bucket: "management-read",
        subject: `referral-link:${request.ip}`
      }))
    )
      return;
    const manager = dependencies.referrals;
    const params = z.object({ code: ReferralCodeSchema }).safeParse(request.params);
    if (manager && params.success) {
      try {
        const result = await manager.visit(params.data.code, request.headers.cookie);
        if (result?.cookie) reply.header("Set-Cookie", result.cookie);
      } catch {
        request.log.warn("referral_visit_unavailable");
      }
    }
    // The destination is configuration, never a caller-controlled redirect.
    return reply.redirect(manager?.publicLandingUrl ?? "https://debugbundle.com/");
  });
}
