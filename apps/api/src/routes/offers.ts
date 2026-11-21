import { ReferralError } from "../../../../packages/referrals/src/referral-contracts.js";
import { PublicOfferContextQuerySchema } from "../../../../packages/referrals/src/offer-choice.js";
import { offerAuditDetails } from "../offer-audit.js";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  ProgrammeError,
  PublicOfferCodeSchema,
  publicOfferDefinition
} from "../../../../packages/referrals/src/programme-policy.js";
import { OFFER_OPERATIONS } from "../../../../packages/referral-client/src/offer-api.js";
import type { ApiDependencies } from "../api-types.js";
import { enforceRequestRateLimit, requireRateLimitedMemberAuth } from "../api-helpers.js";
import { requireOwnerBillingPrincipal } from "./billing-principal.js";
import { recordAuditLog } from "../audit-logging.js";
import { registerOfferOperatorRoutes } from "./offer-operator.js";
import { isAutomatedReferralVisit, registerReferralVisitRoutes } from "./referral-visits.js";
import { OfferQuoteRequestSchema } from "../../../../packages/referrals/src/offer-quote-contracts.js";
import { canCheckoutToBillingPlan } from "../../../../packages/billing/src/billing-offer-admission.js";

export type OfferRouteHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
export function offerRouteGuard(handler: OfferRouteHandler): OfferRouteHandler {
  return async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    try {
      return await handler(request, reply);
    } catch (error) {
      if (error instanceof ReferralError)
        return reply
          .status(
            ["forbidden", "email_verification_required", "referral_self_claim"].includes(error.code)
              ? 403
              : error.code === "program_unavailable"
                ? 503
                : 409
          )
          .send({
            error:
              error.code === "attribution_change_requires_confirmation"
                ? "offer_change_requires_confirmation"
                : error.code
          });
      if (error instanceof z.ZodError) return reply.status(400).send({ error: "invalid_payload" });
      if (error instanceof ProgrammeError)
        return reply
          .status(
            error.code === "programme_not_found"
              ? 404
              : error.code === "programme_unavailable" ||
                  error.code === "programme_payment_setup_failed"
                ? 503
                : 409
          )
          .send({ error: error.code });
      request.log.warn("offer_service_unavailable");
      return reply.status(503).send({ error: "offer_service_unavailable" });
    }
  };
}
const pageSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    before: z.uuid().optional()
  })
  .strict();
export function registerOfferRoutes(app: FastifyInstance, dependencies: ApiDependencies): void {
  const audit = async (
    request: FastifyRequest,
    input: { organization_id: string; user_id: string; action: string },
    success: boolean
  ): Promise<void> =>
    recordAuditLog(dependencies.auditLogging, {
      organization_id: input.organization_id,
      actor_user_id: input.user_id,
      actor_type: request.headers.authorization ? "member_token" : "browser_session",
      action: input.action,
      target_type: "offer_programme",
      target_id: offerAuditDetails(request).target_id,
      status: success ? "success" : "failure",
      ip_address: request.ip,
      metadata: offerAuditDetails(request).metadata
    });
  registerOfferOperatorRoutes(app, dependencies, { audit, guard: offerRouteGuard });
  registerReferralVisitRoutes(app, dependencies, offerRouteGuard);
  app.get(
    "/v2/offers/capabilities",
    offerRouteGuard(async (_request, reply) =>
      reply.send({ enabled: dependencies.offers?.enabled === true })
    )
  );
  app.get(
    "/v2/offers/programmes",
    offerRouteGuard(async (request, reply) => {
      if (
        !(await enforceRequestRateLimit(request, reply, dependencies, {
          bucket: "management-read",
          subject: `offer-public:${request.ip}`
        }))
      )
        return;
      const query = pageSchema.parse(request.query);
      return reply.send({
        programmes: dependencies.offers?.enabled
          ? (await dependencies.offers.store.list({ ...query, public_only: true })).map(
              publicOfferDefinition
            )
          : []
      });
    })
  );
  app.get(
    "/v2/offers/context",
    offerRouteGuard(async (request, reply) => {
      if (
        !(await enforceRequestRateLimit(request, reply, dependencies, {
          bucket: "management-read",
          subject: `offer-public:${request.ip}`
        }))
      )
        return;
      const query = PublicOfferContextQuerySchema.parse(request.query);
      const selection =
        query.target_plan && query.interval
          ? { target_plan: query.target_plan, interval: query.interval }
          : undefined;
      const service = dependencies.offers;
      return reply.send({
        offer: service
          ? query.code
            ? selection
              ? await service.preview(query.code, selection)
              : await service.preview(query.code)
            : selection
              ? await service.context(request.headers.cookie, selection)
              : await service.context(request.headers.cookie)
          : null
      });
    })
  );
  app.get(
    "/v2/offers/visit/:code",
    offerRouteGuard(async (request, reply) => {
      const service = dependencies.offers;
      if (
        !(await enforceRequestRateLimit(request, reply, dependencies, {
          bucket: "management-read",
          subject: `offer-public:${request.ip}`
        }))
      )
        return;
      const { code } = z.object({ code: PublicOfferCodeSchema }).parse(request.params);
      const cookie = service ? await service.visit(code, request.headers.cookie) : null;
      if (cookie) reply.header("Set-Cookie", [...service!.clearCookies(), cookie]);
      if (!service?.referralVisits || request.method !== "GET" || isAutomatedReferralVisit(request))
        return reply.redirect(service?.publicLandingUrl ?? "https://debugbundle.com/");
      const destination = new URL(service.publicLandingUrl);
      destination.searchParams.set("referral_visit", code);
      return reply.redirect(destination.toString());
    })
  );
  for (const method of ["POST", "DELETE"] as const)
    app.route({
      method,
      url: "/v2/offers/pending",
      handler: offerRouteGuard(async (request, reply) => {
        const service = dependencies.offers;
        // Anonymous hint writes grant no account authority. Exact Origin plus the
        // method-specific JSON boundary prevents cross-site cookie replacement.
        if (
          !service ||
          ![service.publicOrigin, service.appOrigin].includes(request.headers.origin ?? "")
        )
          return reply.status(403).send({ error: "origin_not_allowed" });
        if (
          !(await enforceRequestRateLimit(request, reply, dependencies, {
            bucket: "management-write",
            subject: `offer-pending:${request.ip}`
          }))
        )
          return;
        if (method === "DELETE") {
          reply.header("Set-Cookie", service.clearCookies());
          return reply.send({ offer: null });
        }
        const input = z
          .object({ code: PublicOfferCodeSchema, explicit_correction: z.boolean().default(false) })
          .strict()
          .parse(request.body);
        const previous = await service.pending(request.headers.cookie);
        if (
          previous?.available &&
          previous.code !== input.code &&
          !input.explicit_correction &&
          !(await service.mayReplacePending(previous.code, input.code))
        )
          throw new ProgrammeError("offer_change_requires_confirmation");
        const offer = await service.preview(input.code);
        if (!offer?.available) throw new ProgrammeError("invalid_offer_code");
        const cookie = await service.visit(
          input.code,
          input.explicit_correction ? undefined : request.headers.cookie
        );
        if (cookie) reply.header("Set-Cookie", [...service.clearCookies(), cookie]);
        return reply.send({ offer });
      })
    });
  for (const method of ["GET", "POST"] as const)
    app.route({
      method,
      url: "/v2/offers/creator",
      handler: offerRouteGuard(async (request, reply) => {
        const member = await requireRateLimitedMemberAuth(
          request,
          reply,
          dependencies,
          method === "GET" ? "management-read" : "management-write"
        );
        if (!member) return;
        if (member.token_policy !== undefined)
          return reply.status(403).send({ error: "forbidden" });
        const service = dependencies.offers;
        if (!service) throw new ProgrammeError("programme_unavailable");
        if (method === "GET") {
          const creator = await service.store.creators.read(member.member_id);
          return reply.send({
            creator,
            share_url: creator ? service.shareLink(creator.code) : null
          });
        }
        if (!service.enabled) throw new ProgrammeError("programme_unavailable");
        const body = z
          .object({ version_id: z.uuid(), terms_version: z.string().min(1).max(100) })
          .strict()
          .parse(request.body);
        const actor = {
          organization_id: member.organization_id,
          user_id: member.member_id,
          action: "offer.creator.join"
        };
        try {
          const creator = await service.store.creators.join({ user_id: member.member_id, ...body });
          await audit(request, actor, true);
          return reply.send({ creator, share_url: service.shareLink(creator.code) });
        } catch (error) {
          await audit(request, actor, false);
          throw error;
        }
      })
    });
  app.get(
    "/v2/offers/creator/code",
    offerRouteGuard(async (request, reply) => {
      const member = await requireRateLimitedMemberAuth(
        request,
        reply,
        dependencies,
        "management-read"
      );
      if (!member) return;
      if (member.token_policy !== undefined) return reply.status(403).send({ error: "forbidden" });
      OFFER_OPERATIONS.creator_code_status.input.parse(request.query);
      const service = dependencies.offers;
      return reply.send({
        can_replace:
          service?.enabled === true &&
          (await service.store.creators.canReplaceCode(member.member_id))
      });
    })
  );
  app.post(
    "/v2/offers/creator/code",
    offerRouteGuard(async (request, reply) => {
      const member = await requireRateLimitedMemberAuth(
        request,
        reply,
        dependencies,
        "management-write"
      );
      if (!member) return;
      if (member.token_policy !== undefined) return reply.status(403).send({ error: "forbidden" });
      const service = dependencies.offers;
      if (!service?.enabled) throw new ProgrammeError("programme_unavailable");
      const body = OFFER_OPERATIONS.code.input.parse(request.body);
      const actor = {
        organization_id: member.organization_id,
        user_id: member.member_id,
        action:
          body.expected_code === undefined ? "offer.creator.code" : "offer.creator.code.replace"
      };
      try {
        const creator = await service.store.creators.claimCode({
          ...body,
          user_id: member.member_id
        });
        await audit(request, actor, true);
        return reply.send({ creator, share_url: service.shareLink(creator.code) });
      } catch (error) {
        await audit(request, actor, false);
        throw error;
      }
    })
  );
  for (const method of ["GET", "POST"] as const)
    app.route({
      method,
      url: "/v2/offers/customer",
      handler: offerRouteGuard(async (request, reply) => {
        const principal = await requireOwnerBillingPrincipal(
          request,
          reply,
          dependencies,
          method === "GET" ? "management-read" : "management-write",
          true
        );
        if (!principal) return;
        if ("organization_scope_id" in principal || "origin_project_ids" in principal)
          return reply.status(403).send({ error: "forbidden" });
        const service = dependencies.offers;
        if (!service) throw new ProgrammeError("programme_unavailable");
        const actor = {
          organization_id: principal.organization_id,
          actor_user_id: principal.user_id
        };
        if (method === "GET") {
          const claim = await service.store.claims.read(actor),
            legacy = claim ? null : await service.legacy?.customer(actor);
          return reply.send({
            claim,
            pending: await service.pending(request.headers.cookie),
            early_purchase_allowed: await service.benefits.earlyPurchaseAllowed(actor),
            legacy_attribution: legacy?.attribution ?? null,
            legacy_discount_eligible: legacy?.discount_eligible ?? false
          });
        }
        const body = z
          .object({
            code: PublicOfferCodeSchema,
            explicit_correction: z.boolean().default(false),
            expected_organization_id: z.uuid()
          })
          .strict()
          .parse(request.body);
        if (body.expected_organization_id !== principal.organization_id)
          throw new ProgrammeError("offer_context_changed");
        const auditActor = {
          organization_id: principal.organization_id,
          user_id: principal.user_id,
          action: "offer.customer.apply"
        };
        try {
          const preview = await service.preview(body.code);
          if (preview && "legacy_terms_version" in preview.version && service.legacy) {
            const legacy_attribution = await service.legacy.attribute(
              actor,
              body.code,
              body.explicit_correction,
              "manual"
            );
            reply.header("Set-Cookie", service.clearCookies());
            await audit(request, auditActor, true);
            return reply.send({ claim: null, legacy_attribution });
          }
          const claim = await service.apply(actor, body.code, body.explicit_correction, "manual");
          reply.header("Set-Cookie", service.clearCookies());
          await audit(request, auditActor, true);
          return reply.send({ claim });
        } catch (error) {
          await audit(request, auditActor, false);
          throw error;
        }
      })
    });
  app.post(
    "/v2/offers/signup-intent/retry",
    offerRouteGuard(async (request, reply) => {
      const principal = await requireOwnerBillingPrincipal(
        request,
        reply,
        dependencies,
        "management-write",
        true
      );
      if (!principal) return;
      if ("organization_scope_id" in principal || "origin_project_ids" in principal)
        return reply.status(403).send({ error: "forbidden" });
      if (!dependencies.offers) throw new ProgrammeError("programme_unavailable");
      return reply.send({
        intent: await dependencies.offers.retrySignup({
          organization_id: principal.organization_id,
          actor_user_id: principal.user_id
        })
      });
    })
  );
  app.post(
    "/v2/offers/quote",
    offerRouteGuard(async (request, reply) => {
      const principal = await requireOwnerBillingPrincipal(
        request,
        reply,
        dependencies,
        "management-read",
        true
      );
      if (!principal) return;
      if ("organization_scope_id" in principal || "origin_project_ids" in principal)
        return reply.status(403).send({ error: "forbidden" });
      if (!dependencies.offers) throw new ProgrammeError("programme_unavailable");
      return reply.send({
        quote: await dependencies.offers.quote(
          { organization_id: principal.organization_id, actor_user_id: principal.user_id },
          OfferQuoteRequestSchema.parse(request.body)
        )
      });
    })
  );
  app.post(
    "/v2/offers/checkout",
    offerRouteGuard(async (request, reply) => {
      const principal = await requireOwnerBillingPrincipal(
        request,
        reply,
        dependencies,
        "management-write",
        true
      );
      if (!principal) return;
      if ("organization_scope_id" in principal || "origin_project_ids" in principal)
        return reply.status(403).send({ error: "forbidden" });
      if (!dependencies.offers || !dependencies.billingManagement)
        throw new ProgrammeError("programme_unavailable");
      const actor = {
        organization_id: principal.organization_id,
        actor_user_id: principal.user_id
      };
      const { confirmation_token } = z
        .object({ confirmation_token: z.string().min(1).max(8192) })
        .strict()
        .parse(request.body);
      const verified = dependencies.offers.verifyQuote(confirmation_token, actor);
      if (!verified) throw new ProgrammeError("offer_context_changed");
      for (const [bucket, subject] of [
        ["billing-checkout-account", principal.organization_id],
        ["billing-checkout-ip", request.ip]
      ] as const)
        if (!(await enforceRequestRateLimit(request, reply, dependencies, { bucket, subject })))
          return;
      const billing = await dependencies.billingManagement.getBillingSummaryForOrganization({
        organization_id: principal.organization_id,
        now: new Date().toISOString()
      });
      if (!billing || !canCheckoutToBillingPlan(billing, verified.target_plan))
        throw new ProgrammeError("offer_ineligible");
      let context;
      try {
        context = verified.code
          ? await dependencies.offers.prepareCheckout(actor, verified)
          : await dependencies.offers.benefits.context(actor);
        if (
          !context ||
          context.claim_id !== verified.claim_id ||
          context.version_id !== verified.version_id
        )
          throw new ProgrammeError("offer_context_changed");
      } catch (error) {
        // Definitive preparation rejections precede Checkout admission for both
        // fresh claims and saved replacements. Transport errors and all failures
        // from createCheckoutLink stay outside this safe-to-review boundary.
        if (error instanceof ProgrammeError)
          return reply.status(409).send({ error: "offer_confirmation_required" });
        throw error;
      }
      const auditActor = {
        organization_id: principal.organization_id,
        user_id: principal.user_id,
        action: "offer.customer.checkout"
      };
      try {
        const result = await dependencies.billingManagement.createCheckoutLink({
          organization_id: principal.organization_id,
          actor_user_id: principal.user_id,
          billing_email: context.verified_owner_email,
          current_plan: billing.plan,
          target_plan: verified.target_plan,
          interval: verified.interval,
          additional_capacity_units: verified.additional_capacity_units,
          expected_offer: {
            claim_id: verified.claim_id,
            version_id: verified.version_id,
            expires_at: verified.expires_at
          }
        });
        if (!result || typeof result === "string") {
          await audit(request, auditActor, false);
          return reply.status(409).send({ error: result ?? "checkout_not_allowed" });
        }
        await audit(request, auditActor, true);
        return reply.send(result);
      } catch (error) {
        await audit(request, auditActor, false);
        throw error;
      }
    })
  );
  app.post(
    "/v2/offers/customer/remove",
    offerRouteGuard(async (request, reply) => {
      const principal = await requireOwnerBillingPrincipal(
        request,
        reply,
        dependencies,
        "management-write",
        true
      );
      if (!principal) return;
      if ("organization_scope_id" in principal || "origin_project_ids" in principal)
        return reply.status(403).send({ error: "forbidden" });
      const body = z
        .object({ expected_organization_id: z.uuid(), confirmed: z.literal(true) })
        .strict()
        .parse(request.body);
      if (body.expected_organization_id !== principal.organization_id)
        throw new ProgrammeError("offer_context_changed");
      if (!dependencies.offers) throw new ProgrammeError("programme_unavailable");
      const actor = {
        organization_id: principal.organization_id,
        user_id: principal.user_id,
        action: "offer.customer.remove"
      };
      try {
        await dependencies.offers.store.claims.remove({
          organization_id: principal.organization_id,
          actor_user_id: principal.user_id
        });
        reply.header("Set-Cookie", dependencies.offers.clearCookies());
        await audit(request, actor, true);
        return reply.send({ ok: true });
      } catch (error) {
        await audit(request, actor, false);
        throw error;
      }
    })
  );
}
