import { gunzipSync } from "node:zlib";
import type { EventEnvelope } from "../../shared-types/src/index.js";
import { sanitizeEvent } from "./event-privacy.js";
import { validateEvent } from "./index.js";

const MAX_RAW_EVENT_BYTES = 256 * 1024;

/** Historical raw objects are untrusted, even when a current ingestion path is protected. */
export function parseStoredEvent(rawBody: Buffer): EventEnvelope | null {
  try {
    const parsed: unknown = JSON.parse(gunzipSync(rawBody, { maxOutputLength: MAX_RAW_EVENT_BYTES }).toString("utf8"));
    const validated = validateEvent(parsed);
    return validated.success ? sanitizeEvent(validated.data) : null;
  } catch {
    return null;
  }
}
