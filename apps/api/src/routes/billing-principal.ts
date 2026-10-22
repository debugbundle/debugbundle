import type { FastifyRequest, FastifyReply } from "fastify";
import type { ApiDependencies } from "../api-types.js";
import {
  enforceRequestRateLimit,
  requireOwnerMemberAuth,
  resolveBrowserSession
} from "../api-helpers.js";

export async function requireOwnerBillingPrincipal(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: ApiDependencies,
  bucket: "management-read" | "management-write",
  requireVerified = false
): Promise<{
  organization_id: string;
  subject: string;
  user_id: string;
  email: string | undefined;
} | null> {
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

    if (requireVerified && !session.email_verified_at) {
      await reply.status(403).send({ error: "email_verification_required" });
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
