import { describe, expect, it } from "vitest";

import { EventEnvelopeSchema } from "../../../packages/shared-types/src/index.js";
import {
  createCanonicalMobileEvent,
  createCanonicalMobileFrontendException
} from "../../helpers/mobile-sdk-event-fixtures.ts";

describe("mobile event envelope schema", () => {
  it("accepts the canonical mobile frontend exception payload", (): void => {
    const result = EventEnvelopeSchema.safeParse(createCanonicalMobileFrontendException());

    expect(result.success).toBe(true);
  });

  it.each(["request_event", "log_event", "frontend_breadcrumb", "error_suppressed", "probe_event"])(
    "accepts the canonical mobile %s payload",
    (eventType): void => {
      const result = EventEnvelopeSchema.safeParse(createCanonicalMobileEvent(eventType));

      expect(result.success).toBe(true);
    }
  );

  it("continues to reject mobile device data at the envelope root", (): void => {
    const candidate = createCanonicalMobileFrontendException();
    const payload = candidate["payload"] as Record<string, unknown>;
    candidate["device"] = payload["device"];
    delete payload["device"];

    expect(EventEnvelopeSchema.safeParse(candidate).success).toBe(false);
  });
});
