import { IngestionRequestSchema } from "./schemas.js";

function isRecord(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === "object" && candidate !== null && !Array.isArray(candidate);
}

/**
 * Accepts the canonical `{ events }` request and the exact `{ batch }` wrapper
 * emitted by installed Swift releases. The caller invokes this only after
 * project-token authentication, and non-Swift batch payloads remain rejected.
 */
export function parseCompatibleIngestionRequest(candidate: unknown): {
  parsedBody: ReturnType<typeof IngestionRequestSchema.safeParse>;
  compatibility: "legacy_swift_batch" | null;
} {
  const canonical = IngestionRequestSchema.safeParse(candidate);
  if (canonical.success) {
    return { parsedBody: canonical, compatibility: null };
  }

  if (
    !isRecord(candidate) ||
    Object.keys(candidate).length !== 1 ||
    !Array.isArray(candidate["batch"])
  ) {
    return { parsedBody: canonical, compatibility: null };
  }

  const batch = candidate["batch"];
  const isInstalledSwiftBatch =
    batch.length > 0 &&
    batch.every((event) => isRecord(event) && event["sdk_name"] === "@debugbundle/sdk-swift");
  if (!isInstalledSwiftBatch) {
    return { parsedBody: canonical, compatibility: null };
  }

  return {
    parsedBody: IngestionRequestSchema.safeParse({ events: batch }),
    compatibility: "legacy_swift_batch"
  };
}
