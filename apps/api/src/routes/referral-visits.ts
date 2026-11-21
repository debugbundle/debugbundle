import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  ReferralVisitCaptureSchema,
  ReferralVisitConfirmSchema
} from "../../../../packages/referrals/src/referral-visit-contract.js";
import type { ApiDependencies } from "../api-types.js";
import { enforceRequestRateLimit } from "../api-helpers.js";
import type { OfferRouteHandler } from "./offers.js";

export function isAutomatedReferralVisit(request: FastifyRequest): boolean {
  const { purpose, "sec-purpose": secPurpose, "user-agent": agent } = request.headers;
  return (
    /prefetch|prerender/i.test([purpose, secPurpose].flat().join(" ")) ||
    /googlebot|bingbot|duckduckbot|baiduspider|yandexbot|applebot|gptbot|claudebot|facebookexternalhit|twitterbot|slackbot|discordbot|linkedinbot|telegrambot|headlesschrome|crawler|preview/i.test(
      agent ?? ""
    )
  );
}

export function registerReferralVisitRoutes(
  app: FastifyInstance,
  dependencies: ApiDependencies,
  guard: (handler: OfferRouteHandler) => OfferRouteHandler
): void {
  for (const path of ["visit-receipts", "visits"] as const) {
    app.post(
      `/v2/offers/${path}`,
      { bodyLimit: 2048 },
      guard(async (request, reply) => {
        const offers = dependencies.offers;
        if (!offers?.referralVisits || request.headers.origin !== offers.publicOrigin)
          return reply.status(403).send({ error: "origin_not_allowed" });
        if (
          !(await enforceRequestRateLimit(request, reply, dependencies, {
            bucket: "management-write",
            subject: `referral-visit:${request.ip}`
          }))
        )
          return;
        const automated = isAutomatedReferralVisit(request);
        if (path === "visit-receipts") {
          const body = ReferralVisitCaptureSchema.parse(request.body);
          return reply.send({
            visit: automated ? null : await offers.referralVisits.capture(body)
          });
        }
        const body = ReferralVisitConfirmSchema.parse(request.body);
        return reply.send({ recorded: !automated && (await offers.referralVisits.confirm(body)) });
      })
    );
  }
}
