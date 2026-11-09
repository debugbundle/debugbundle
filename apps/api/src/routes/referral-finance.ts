import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { ApiDependencies } from "../api-types.js";
import { requireRateLimitedMemberAuth } from "../api-helpers.js";
import type { ReferralFinance } from "../../../../packages/referrals/src/referral-finance.js";
import {
  ReferralPayoutPageSchema,
  ReferralOperatorPayoutPageSchema,
  ReferralPayoutClaimSchema,
  ReferralPayoutRecordSchema
} from "../../../../packages/referrals/src/referral-ledger-contracts.js";

type Handler = (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
const page = ReferralPayoutPageSchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(25)
});
const operatorPage = ReferralOperatorPayoutPageSchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(25)
});
const params = z.object({ id: z.uuid() }).strict();
const paidBody = ReferralPayoutRecordSchema.omit({ batch_id: true }).extend({
  confirmed_external_payment: z.literal(true)
});
export function registerReferralFinanceRoutes(
  app: FastifyInstance,
  dependencies: ApiDependencies,
  hooks: {
    guard(handler: Handler): Handler;
    audit(
      request: FastifyRequest,
      input: { user_id: string; organization_id: string; action: string }
    ): void;
  }
): void {
  function route(
    method: "GET" | "POST",
    url: string,
    action: string | null,
    run: (
      service: ReferralFinance,
      userId: string,
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<unknown>
  ): void {
    app.route({
      method,
      url,
      handler: hooks.guard(async (request, reply) => {
        const member = await requireRateLimitedMemberAuth(
          request,
          reply,
          dependencies,
          method === "GET" ? "management-read" : "management-write"
        );
        if (!member) return;
        if (action)
          hooks.audit(request, {
            user_id: member.member_id,
            organization_id: member.organization_id,
            action
          });
        const service = dependencies.referrals?.finance;
        if (!service) return reply.status(503).send({ error: "program_unavailable" });
        return run(service, member.member_id, request, reply);
      })
    });
  }
  route("GET", "/v1/referrals/earnings", null, async (service, user, _request, reply) =>
    reply.send(await service.earnings(user))
  );
  route("GET", "/v1/referrals/payouts", null, async (service, user, request, reply) => {
    const query = page.safeParse(request.query);
    if (!query.success) return reply.status(400).send({ error: "invalid_query" });
    return reply.send({ payouts: await service.payouts(user, query.data) });
  });
  route("GET", "/v1/referrals/operator/balances", null, async (service, user, request, reply) => {
    const query = page.safeParse(request.query);
    if (!query.success) return reply.status(400).send({ error: "invalid_query" });
    return reply.send({ partners: await service.operatorBalances(user, query.data) });
  });
  route("GET", "/v1/referrals/operator/payouts", null, async (service, user, request, reply) => {
    const query = operatorPage.safeParse(request.query);
    if (!query.success) return reply.status(400).send({ error: "invalid_query" });
    return reply.send({ payouts: await service.operatorPayouts(user, query.data) });
  });
  route(
    "POST",
    "/v1/referrals/operator/payouts/claim",
    "referral.payout.claim",
    async (service, user, request, reply) => {
      const body = ReferralPayoutClaimSchema.safeParse(request.body);
      if (!body.success) return reply.status(400).send({ error: "invalid_payload" });
      return reply.send({ payout: await service.claim(user, body.data) });
    }
  );
  route(
    "POST",
    "/v1/referrals/operator/payouts/:id/uncertain",
    "referral.payout.uncertain",
    async (service, user, request, reply) => {
      const id = params.safeParse(request.params),
        body = z.object({}).strict().safeParse(request.body);
      if (!id.success || !body.success) return reply.status(400).send({ error: "invalid_payload" });
      return reply.send({ payout: await service.markUncertain(user, id.data.id) });
    }
  );
  route(
    "POST",
    "/v1/referrals/operator/payouts/:id/paid",
    "referral.payout.record",
    async (service, user, request, reply) => {
      const id = params.safeParse(request.params),
        body = paidBody.safeParse(request.body);
      if (!id.success || !body.success) return reply.status(400).send({ error: "invalid_payload" });
      return reply.send({
        payout: await service.recordPayment(user, {
          batch_id: id.data.id,
          external_reference: body.data.external_reference
        })
      });
    }
  );
}
