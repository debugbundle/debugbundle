import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { readCookieValue, SESSION_COOKIE_NAME } from "../../../../packages/auth/src/index.js";
import type { ApiDependencies } from "../api-types.js";

const RenewalBodySchema = z.object({}).strict();

export function registerSessionRenewalRoute(
  app: FastifyInstance,
  dependencies: ApiDependencies,
  helpers: {
    enforceAuthRateLimit: (
      request: FastifyRequest,
      reply: FastifyReply,
      dependencies: ApiDependencies
    ) => Promise<boolean>;
  }
): void {
  app.post("/v1/auth/session/renew", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const token = readCookieValue(request.headers.cookie, SESSION_COOKIE_NAME);
    // Bearer requests bypass the shared browser CSRF hook, so never accept one here.
    if (token === null || request.headers.authorization !== undefined) {
      return reply.status(401).send({ error: "invalid_session" });
    }
    const appOrigin = new URL(process.env["APP_BASE_URL"] ?? "http://localhost:5291").origin;
    if (request.headers.origin !== appOrigin) {
      return reply.status(403).send({ error: "invalid_origin" });
    }
    if (!RenewalBodySchema.safeParse(request.body ?? {}).success) {
      return reply.status(400).send({ error: "invalid_body" });
    }
    if (!(await helpers.enforceAuthRateLimit(request, reply, dependencies))) return;
    if (dependencies.webAuth?.renewSessionByToken === undefined) {
      return reply.status(503).send({ error: "auth_not_configured" });
    }
    const renewed = await dependencies.webAuth.renewSessionByToken(token, { now: new Date() });
    if (renewed === null) return reply.status(401).send({ error: "invalid_session" });
    // Only sign-in writes the absolute-lifetime cookie. A late renewal response
    // must never overwrite a subsequent sign-in or logout cookie.
    return reply.status(200).send(renewed);
  });
}
