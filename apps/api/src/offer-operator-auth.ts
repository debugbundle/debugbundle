import { recordAuditLog } from "./audit-logging.js";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { ApiDependencies } from "./api-types.js";
import { enforceRequestRateLimit } from "./api-helpers.js";
import { readCookieValue, SESSION_COOKIE_NAME } from "../../../packages/auth/src/index.js";
import type { OfferOperatorAction } from "../../../packages/referrals/src/offer-operator-contracts.js";
import type { WebSessionRecord } from "../../../packages/auth/src/primitives.js";

export function hasVerifiedOperatorEmailAuth(session: WebSessionRecord): boolean {
  return session.email_verified_at !== null && session.session_auth_method === "email_code";
}

export function operatorSessionReadiness(
  session: WebSessionRecord | null,
  isAllowed: (email: string) => boolean
): "not_found" | "email_auth_required" | "ready" {
  if (!session || !isAllowed(session.email)) return "not_found";
  return hasVerifiedOperatorEmailAuth(session) ? "ready" : "email_auth_required";
}
export async function resolveOfferOperatorSession(
  request: FastifyRequest,
  dependencies: ApiDependencies
): Promise<WebSessionRecord | null> {
  if (request.headers.authorization !== undefined || !dependencies.webAuth) return null;
  const token = readCookieValue(request.headers.cookie, SESSION_COOKIE_NAME);
  return token ? dependencies.webAuth.resolveSessionByToken(token) : null;
}
export async function requireOfferOperator(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: ApiDependencies,
  action: OfferOperatorAction
): Promise<{ user_id: string; organization_id: string; session_id?: string } | null> {
  const service = dependencies.offers;
  let principal: { user_id: string; organization_id: string; session_id?: string } | null = null;
  if (service && request.headers.authorization === undefined) {
    const session = await resolveOfferOperatorSession(request, dependencies);
    if (session && operatorSessionReadiness(session, service.operators.isAllowed) === "ready")
      principal = session;
  } else if (service) {
    const authorization = request.headers.authorization;
    const proofHeader = request.headers["x-debugbundle-operator-authorization"];
    if (
      authorization?.startsWith("Bearer ") &&
      typeof proofHeader === "string" &&
      proofHeader.startsWith("Bearer ")
    )
      principal = await service.operators.authorize({
        bearer_token: authorization.slice(7),
        proof: proofHeader.slice(7),
        action
      });
  }
  if (!principal) {
    await recordAuditLog(dependencies.auditLogging, {
      organization_id: null,
      actor_user_id: null,
      actor_type: "anonymous",
      action: `offer.operator.authorization.${action}`,
      target_type: "offer_programme",
      target_id: null,
      status: "failure",
      ip_address: request.ip,
      metadata: {}
    });
    await reply.status(404).send({ error: "not_found" });
    return null;
  }
  if (
    !(await enforceRequestRateLimit(request, reply, dependencies, {
      bucket: action === "read" ? "management-read" : "management-write",
      subject: `offer-operator:${principal.user_id}`
    }))
  )
    return null;
  return principal;
}
