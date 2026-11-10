import { isDeepStrictEqual } from "node:util";
import type { FastifyReply } from "fastify";
import { z } from "zod";
import { sanitizeTelemetry } from "../../../../packages/redaction/src/index.js";

function projectAnalyticsRead<T>(value: unknown, schema: z.ZodType<T>): T | null {
  const projected = sanitizeTelemetry(value, { maxTotalBytes: 512 * 1024 });
  if (!projected.ok) return null;
  const parsed = schema.safeParse(projected.value);
  return parsed.success ? parsed.data : null;
}

export function sendProjectedAnalyticsRead<T>(
  reply: FastifyReply,
  value: unknown,
  schema: z.ZodType<T>,
  requireUnchanged = false
): FastifyReply {
  const projected = projectAnalyticsRead(value, schema);
  // Selectable literals must survive projection unchanged; object key order is immaterial.
  return projected === null || (requireUnchanged && !isDeepStrictEqual(projected, value))
    ? reply.status(503).send({ error: "privacy_projection_unavailable" })
    : reply
        .header("x-debugbundle-privacy-policy", "telemetry-privacy-v1")
        .status(200)
        .send(projected);
}
