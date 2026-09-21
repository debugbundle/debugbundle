import { gunzipSync } from "node:zlib";
import { sanitizeTelemetry, type JsonValue } from "../../redaction/src/index.js";
import {
  AnalyticsJourneySampleArtifactSchema,
  AnalyticsJourneySampleMetadataSchema,
  type AnalyticsJourneySampleArtifact,
  type AnalyticsJourneySampleMetadata
} from "../../shared-types/src/index.js";

const MAX_ARTIFACT_BYTES = 512 * 1024;

/** Read-time protection for retained artifacts; never rewrites historical storage. */
function decodeBoundedArtifact(compressed: Buffer): unknown {
  if (compressed.byteLength > MAX_ARTIFACT_BYTES) throw new Error("artifact_unavailable");
  const inflated = gunzipSync(compressed, { maxOutputLength: MAX_ARTIFACT_BYTES });
  return JSON.parse(inflated.toString("utf8"));
}

export function readSanitizedArtifact(compressed: Buffer): JsonValue | null {
  try {
    const parsed = decodeBoundedArtifact(compressed);
    const sanitized = sanitizeTelemetry(parsed, { maxTotalBytes: MAX_ARTIFACT_BYTES });
    return sanitized.ok ? sanitized.value : null;
  } catch {
    return null;
  }
}

/** Preserve validated protocol hash identities while scrubbing historical journey evidence. */
function projectAnalyticsJourney<T extends { session_id_hash: string; visitor_id_hash: string | null }>(
  input: T,
  validate: { safeParse(value: unknown): { success: true; data: T } | { success: false } }
): T | null {
    const identityValues = [input.session_id_hash, input.visitor_id_hash];
    for (const identity of identityValues) {
      if (identity === null) continue;
      const checked = sanitizeTelemetry(identity);
      if (!checked.ok || checked.value !== identity) return null;
    }
    const projected = sanitizeTelemetry(input, { maxTotalBytes: MAX_ARTIFACT_BYTES });
    if (!projected.ok || projected.value === null || Array.isArray(projected.value) ||
        typeof projected.value !== "object") return null;
    const rehydrated = validate.safeParse({
      ...projected.value,
      session_id_hash: input.session_id_hash,
      visitor_id_hash: input.visitor_id_hash
    });
    return rehydrated.success ? rehydrated.data : null;
}

export function sanitizeAnalyticsJourneyMetadata(input: unknown): AnalyticsJourneySampleMetadata | null {
  const parsed = AnalyticsJourneySampleMetadataSchema.safeParse(input);
  return parsed.success ? projectAnalyticsJourney(parsed.data, AnalyticsJourneySampleMetadataSchema) : null;
}

export function readSanitizedAnalyticsJourneyArtifact(compressed: Buffer): AnalyticsJourneySampleArtifact | null {
  try {
    const parsed = AnalyticsJourneySampleArtifactSchema.safeParse(decodeBoundedArtifact(compressed));
    return parsed.success ? projectAnalyticsJourney(parsed.data, AnalyticsJourneySampleArtifactSchema) : null;
  } catch {
    return null;
  }
}
