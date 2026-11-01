import { z } from "zod";
import type { EventEnvelope } from "../../shared-types/src/index.js";
import { validateEvent } from "./index.js";

/** The supplied first receipt makes future-context validation replayable without bundle wall-clock reads. */
export function validateEventAtAdmission(
  candidate: unknown,
  receivedAt: string
): ReturnType<typeof validateEvent> {
  const result = validateEvent(candidate);
  if (
    result.success &&
    result.data.event_type === "diagnostic_context" &&
    (!Number.isFinite(Date.parse(receivedAt)) ||
      Date.parse(result.data.occurred_at) > Date.parse(receivedAt) + 60_000)
  ) {
    return {
      success: false,
      error: new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          path: ["occurred_at"],
          message: "Diagnostic context is ahead of its receipt"
        }
      ]) as z.ZodError<EventEnvelope>
    };
  }
  return result;
}
