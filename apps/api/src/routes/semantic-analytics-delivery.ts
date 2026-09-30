import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  hashToken,
  readBearerToken,
  validateAnalyticsWriterToken
} from "../../../../packages/auth/src/index.js";
import {
  AnalyticsDeliveryReceiptSchema,
  AnalyticsRelayIdentityContextReferenceSchema,
  MAX_SEMANTIC_ANALYTICS_EVENT_BYTES,
  SemanticAnalyticsEventSchema,
  isSelfHostMode
} from "../../../../packages/shared-types/src/index.js";
import type { ApiDependencies } from "../api-types.js";

const BODY_LIMIT_BYTES = 256 * 1024;
const BodySchema = z
  .object({
    events: z.array(z.unknown()).min(1).max(256),
    identity_context: AnalyticsRelayIdentityContextReferenceSchema.optional()
  })
  .strict();

/** Candidate server and relay adapters. Runtime capture stays closed until projection gates pass. */
export function registerSemanticAnalyticsDeliveryRoutes(
  app: FastifyInstance,
  dependencies: ApiDependencies
): void {
  for (const route of [
    { path: "/v1/analytics/deliver", writerKind: "server" },
    { path: "/v1/analytics/relay/events", writerKind: "relay" }
  ] as const) {
    app.post(route.path, { bodyLimit: BODY_LIMIT_BYTES }, async (request, reply) => {
      reply.header("Cache-Control", "private, no-store");
      reply.header("Vary", "Authorization, Origin");
      const bearer = readBearerToken(request.headers.authorization);
      const writerStore = dependencies.analyticsWriters;
      if (bearer === null || writerStore === undefined)
        return reply.status(401).send({ error: "invalid_analytics_writer" });
      const writer = await validateAnalyticsWriterToken(
        bearer,
        (credentialHash) => writerStore.resolveByTokenHash(credentialHash),
        { allowedKinds: [route.writerKind] }
      );
      if (!writer.ok || request.headers.origin !== undefined)
        return reply.status(401).send({ error: "invalid_analytics_writer" });

      const delivery =
        route.writerKind === "server"
          ? dependencies.semanticAnalyticsDelivery
          : dependencies.semanticAnalyticsRelayDelivery;
      if (delivery?.enabled !== true)
        return reply.status(503).send({ error: "analytics_delivery_unavailable" });
      const body = BodySchema.safeParse(request.body);
      if (!body.success) return reply.status(400).send({ error: "invalid_payload" });
      if (route.writerKind !== "relay" && body.data.identity_context !== undefined)
        return reply.status(400).send({ error: "invalid_payload" });

      const errors: Array<{ index: number; reason: string }> = [];
      const validEvents: Array<{
        index: number;
        event: ReturnType<typeof SemanticAnalyticsEventSchema.parse>;
      }> = [];
      const acceptedEvents: Array<{
        index: number;
        event_id: string;
        operation_id: string | null;
        content_hash: string;
        accepted_at: string;
        expires_at: string;
        duplicate: boolean;
      }> = [];
      for (const [index, candidate] of body.data.events.entries()) {
        // The server may have sent its request-timeout response while an earlier
        // protected S3/receipt handoff was running. Do not start another write.
        if (reply.raw.writableEnded || reply.raw.destroyed || request.raw.aborted) return reply;
        let parsed: ReturnType<typeof SemanticAnalyticsEventSchema.safeParse>;
        try {
          const serialized = JSON.stringify(candidate);
          if (typeof serialized !== "string") {
            errors.push({ index, reason: "invalid_event" });
            continue;
          }
          if (Buffer.byteLength(serialized, "utf8") > MAX_SEMANTIC_ANALYTICS_EVENT_BYTES) {
            errors.push({ index, reason: "event_too_large" });
            continue;
          }
          parsed = SemanticAnalyticsEventSchema.safeParse(candidate);
        } catch {
          errors.push({ index, reason: "invalid_event" });
          continue;
        }
        if (!parsed.success) {
          errors.push({ index, reason: "invalid_event" });
          continue;
        }
        if (route.writerKind === "relay" && parsed.data.producer.kind === "server") {
          errors.push({ index, reason: "source_not_authorized" });
          continue;
        }
        if (
          body.data.identity_context !== undefined &&
          (parsed.data.correlation.namespace_revision !== null ||
            parsed.data.correlation.anonymous_id_hash !== null ||
            parsed.data.correlation.user_id_hash !== null ||
            parsed.data.correlation.account_id_hash !== null)
        ) {
          errors.push({ index, reason: "identity_not_authorized" });
          continue;
        }
        validEvents.push({ index, event: parsed.data });
      }

      const credentialHash = hashToken(bearer);
      if (validEvents.length > 0 && !isSelfHostMode()) {
        const limiter = dependencies.ingestionRateLimiter;
        if (limiter === undefined)
          return reply.status(503).send({ error: "analytics_delivery_unavailable" });
        let limit: number | null;
        let claim: Awaited<ReturnType<typeof limiter.claimEvents>>;
        try {
          limit = await delivery.getRateLimitPerMinute(writer.context.project_id);
          if (limit === null || !Number.isInteger(limit) || limit < 1)
            return reply.status(503).send({ error: "analytics_delivery_unavailable" });
          claim = await limiter.claimEvents({
            token_hash: credentialHash,
            project_id: writer.context.project_id,
            event_count: validEvents.length,
            limit,
            now: new Date().toISOString()
          });
        } catch {
          return reply.status(503).send({ error: "analytics_delivery_unavailable" });
        }
        if (!claim.allowed) {
          errors.push(...validEvents.map(({ index }) => ({ index, reason: "rate_limited" })));
          const receipt = AnalyticsDeliveryReceiptSchema.parse({
            protocol: "2026-09-analytics-delivery-01",
            project_id: writer.context.project_id,
            submitted: body.data.events.length,
            accepted: 0,
            rejected: errors.length,
            errors,
            accepted_events: []
          });
          return reply
            .header("Retry-After", Math.max(1, Math.ceil(claim.retry_after_ms / 1_000)))
            .status(429)
            .send(receipt);
        }
      }

      for (const { index, event } of validEvents) {
        if (reply.raw.writableEnded || reply.raw.destroyed || request.raw.aborted) return reply;
        let result: Awaited<ReturnType<typeof delivery.persist>>;
        try {
          result = await delivery.persist({
            projectId: writer.context.project_id,
            credentialHash,
            event,
            ...(body.data.identity_context === undefined
              ? {}
              : { identityContext: body.data.identity_context })
          });
        } catch {
          return reply.status(503).send({ error: "analytics_delivery_unavailable" });
        }
        if (result.kind === "accepted") {
          if (
            result.receipt.event_id.toLowerCase() !== event.event_id.toLowerCase() ||
            (result.receipt.operation_id?.toLowerCase() ?? null) !==
              (event.operation_id?.toLowerCase() ?? null)
          )
            return reply.status(503).send({ error: "analytics_delivery_unavailable" });
          acceptedEvents.push({ index, ...result.receipt, duplicate: result.duplicate });
        } else if (result.kind === "rejected") {
          errors.push({ index, reason: result.reason });
        } else if (result.kind === "authority_changed" || result.kind === "object_not_staged") {
          return reply.status(503).send({ error: "analytics_delivery_unavailable" });
        } else {
          errors.push({
            index,
            reason: result.kind === "quota_exceeded" ? "analytics_quota_exceeded" : result.kind
          });
        }
      }

      const receipt = AnalyticsDeliveryReceiptSchema.parse({
        protocol: "2026-09-analytics-delivery-01",
        project_id: writer.context.project_id,
        submitted: body.data.events.length,
        accepted: acceptedEvents.length,
        rejected: errors.length,
        errors,
        accepted_events: acceptedEvents
      });
      return reply.status(200).send(receipt);
    });
  }
}
