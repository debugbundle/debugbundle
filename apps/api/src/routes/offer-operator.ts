import { OfferPerformanceQuerySchema } from "../../../../packages/referrals/src/offer-performance.js";
import {
  OfferCodeInventoryQuerySchema,
  OfferClaimInventoryQuerySchema,
  OfferGrantInventoryQuerySchema
} from "../../../../packages/referrals/src/offer-inventory-contracts.js";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  ProgrammeDraftSchema,
  ProgrammeError,
  ProgrammeStateSchema,
  CreatorCodeSchema,
  PromotionCodeSchema,
  PublicOfferCodeSchema
} from "../../../../packages/referrals/src/programme-policy.js";
import { OfferDelegationIssueSchema } from "../../../../packages/referrals/src/offer-operator-contracts.js";
import type { ApiDependencies } from "../api-types.js";
import {
  requireOfferOperator,
  operatorSessionReadiness,
  resolveOfferOperatorSession
} from "../offer-operator-auth.js";
import type { OfferRouteHandler } from "./offers.js";

export function registerOfferOperatorRoutes(
  app: FastifyInstance,
  dependencies: ApiDependencies,
  hooks: {
    guard(handler: OfferRouteHandler): OfferRouteHandler;
    audit(
      request: FastifyRequest,
      input: { organization_id: string; user_id: string; action: string },
      success: boolean
    ): Promise<unknown>;
  }
): void {
  app.get(
    "/v2/offers/operator/access-status",
    hooks.guard(async (request, reply) => {
      if (request.headers.authorization || !dependencies.offers)
        return reply.status(404).send({ error: "not_found" });
      const session = await resolveOfferOperatorSession(request, dependencies);
      const status = operatorSessionReadiness(session, dependencies.offers.operators.isAllowed);
      return status === "not_found"
        ? reply.status(404).send({ error: "not_found" })
        : reply.send({ status });
    })
  );
  const params = z.object({ version_id: z.uuid() }).strict();
  const listSchema = z
    .object({
      limit: z.coerce.number().int().min(1).max(100).default(25),
      before: z.uuid().optional()
    })
    .strict();
  const operations = [
    {
      method: "GET",
      url: "/v2/offers/operator/performance",
      action: "read",
      name: "performance",
      run: async (request: FastifyRequest) => ({
        performance: await dependencies.offers!.store.performance(
          OfferPerformanceQuerySchema.parse(request.query)
        )
      })
    },
    {
      method: "GET",
      url: "/v2/offers/operator/programmes",
      action: "read",
      name: "list",
      run: async (request: FastifyRequest) => ({
        programmes: await dependencies.offers!.store.list(listSchema.parse(request.query))
      })
    },
    {
      method: "GET",
      url: "/v2/offers/operator/codes",
      action: "read",
      name: "codes",
      run: async (request: FastifyRequest) => ({
        codes: await dependencies.offers!.store.inventory.codes(
          OfferCodeInventoryQuerySchema.extend({
            limit: z.coerce.number().int().min(1).max(100).default(25)
          }).parse(request.query)
        )
      })
    },
    {
      method: "GET",
      url: "/v2/offers/operator/claims",
      action: "read",
      name: "claims",
      run: async (request: FastifyRequest) => ({
        claims: await dependencies.offers!.store.inventory.claims(
          OfferClaimInventoryQuerySchema.extend({
            limit: z.coerce.number().int().min(1).max(100).default(25)
          }).parse(request.query)
        )
      })
    },
    {
      method: "GET",
      url: "/v2/offers/operator/early-grants",
      action: "read",
      name: "grants",
      run: async (request: FastifyRequest) => ({
        grants: await dependencies.offers!.store.inventory.grants(
          OfferGrantInventoryQuerySchema.extend({
            limit: z.coerce.number().int().min(1).max(100).default(25)
          }).parse(request.query)
        )
      })
    },
    {
      method: "POST",
      url: "/v2/offers/operator/programmes",
      action: "manage",
      name: "draft",
      run: async (request: FastifyRequest, userId: string) => ({
        programme: await dependencies.offers!.store.createDraft({
          ...ProgrammeDraftSchema.safeExtend({ programme_id: z.uuid().optional() }).parse(
            request.body
          ),
          actor_user_id: userId
        })
      })
    },
    {
      method: "POST",
      url: "/v2/offers/operator/programmes/:version_id/state",
      action: "activate",
      name: "state",
      run: async (request: FastifyRequest, userId: string) => {
        const body = z
          .object({
            state: ProgrammeStateSchema,
            expected_state: ProgrammeStateSchema,
            acknowledge_unlimited: z.boolean()
          })
          .strict()
          .parse(request.body);
        const { version_id } = params.parse(request.params);
        return {
          programme: await dependencies.offers!.changeState({
            actor_user_id: userId,
            version_id,
            ...body
          })
        };
      }
    },
    {
      method: "POST",
      url: "/v2/offers/operator/programmes/:version_id/provider",
      action: "manage",
      name: "provider",
      run: async (request: FastifyRequest, userId: string) => {
        const { version_id } = params.parse(request.params);
        const body = z
          .object({ coupon_id: z.string().min(1).max(255), livemode: z.boolean() })
          .strict()
          .parse(request.body);
        await dependencies.offers!.bindProvider({ actor_user_id: userId, version_id, ...body });
        return { ok: true };
      }
    },
    {
      method: "POST",
      url: "/v2/offers/operator/promotion-codes",
      action: "manage",
      name: "promotion-code",
      run: async (request: FastifyRequest, userId: string) => {
        const body = z
          .object({ version_id: z.uuid(), code: PromotionCodeSchema })
          .strict()
          .parse(request.body);
        await dependencies.offers!.store.createPromotionCode({ actor_user_id: userId, ...body });
        return { ok: true };
      }
    },
    {
      method: "POST",
      url: "/v2/offers/operator/creator-codes",
      action: "manage",
      name: "creator-code",
      run: async (request: FastifyRequest, userId: string) => {
        const body = z
          .object({
            partner_id: z.uuid(),
            code: CreatorCodeSchema,
            reason: z.string().trim().min(1).max(300)
          })
          .strict()
          .parse(request.body);
        return dependencies.offers!.store.creators.correctCode({
          operator_user_id: userId,
          ...body
        });
      }
    },
    {
      method: "POST",
      url: "/v2/offers/operator/codes/block",
      action: "manage",
      name: "code-block",
      run: async (request: FastifyRequest, userId: string) => {
        const body = z
          .object({
            code: PublicOfferCodeSchema,
            blocked: z.boolean(),
            reason: z.string().trim().min(1).max(300)
          })
          .strict()
          .parse(request.body);
        await dependencies.offers!.store.creators.setCodeBlocked({
          operator_user_id: userId,
          ...body
        });
        return { ok: true };
      }
    },
    {
      method: "POST",
      url: "/v2/offers/operator/claims/:claim_id/revoke",
      action: "manage",
      name: "claim-revoke",
      run: async (request: FastifyRequest, userId: string) => {
        const { claim_id } = z.object({ claim_id: z.uuid() }).strict().parse(request.params);
        const { reason } = z
          .object({ reason: z.string().trim().min(1).max(300) })
          .strict()
          .parse(request.body);
        await dependencies.offers!.store.claims.revoke({
          claim_id,
          operator_user_id: userId,
          reason
        });
        return { ok: true };
      }
    },
    {
      method: "POST",
      url: "/v2/offers/operator/early-grants",
      action: "grant",
      name: "early-grant",
      run: async (request: FastifyRequest, userId: string) => {
        const body = z
          .object({
            claim_id: z.uuid(),
            expires_at: z.string().datetime(),
            reason: z.string().trim().min(1).max(300)
          })
          .strict()
          .parse(request.body);
        return dependencies.offers!.benefits.grantEarlyPurchase({
          ...body,
          operator_user_id: userId
        });
      }
    },
    {
      method: "POST",
      url: "/v2/offers/operator/early-grants/:grant_id/revoke",
      action: "grant",
      name: "early-revoke",
      run: async (request: FastifyRequest) => {
        const { grant_id } = z.object({ grant_id: z.uuid() }).strict().parse(request.params);
        await dependencies.offers!.benefits.revokeEarlyPurchase(grant_id);
        return { ok: true };
      }
    },
    {
      method: "POST",
      url: "/v2/offers/operator/delegations",
      action: "manage",
      name: "delegation",
      run: async (request: FastifyRequest, userId: string) => {
        if (request.headers.authorization)
          throw new ProgrammeError("operator_authorization_required");
        const session = await resolveOfferOperatorSession(request, dependencies);
        if (!session || session.user_id !== userId)
          throw new ProgrammeError("operator_authorization_required");
        return dependencies.offers!.operators.issue({
          ...OfferDelegationIssueSchema.parse(request.body),
          user_id: userId,
          session_id: session.session_id
        });
      }
    },
    {
      method: "POST",
      url: "/v2/offers/operator/delegations/revoke",
      action: "manage",
      name: "delegation-revoke",
      run: async (request: FastifyRequest, userId: string) => {
        const body = z
          .object({ operator_authorization: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
          .strict()
          .parse(request.body);
        await dependencies.offers!.operators.revoke({
          user_id: userId,
          proof: body.operator_authorization
        });
        return { ok: true };
      }
    }
  ] as const;
  for (const operation of operations)
    app.route({
      method: operation.method,
      url: operation.url,
      handler: hooks.guard(async (request, reply) => {
        const operator = await requireOfferOperator(request, reply, dependencies, operation.action);
        if (!operator) return;
        const actor = { ...operator, action: `offer.operator.${operation.name}` };
        try {
          const result = await operation.run(request, operator.user_id);
          await hooks.audit(request, actor, true);
          return reply.send(result);
        } catch (error) {
          await hooks.audit(request, actor, false);
          throw error;
        }
      })
    });
}
