import { expect, it, vi } from "vitest";
import { createApiServer } from "../../../apps/api/src/server.js";
import { fingerprint, normalizeEvent } from "../../../packages/event-normalizer/src/index.js";
import { CaptureRuleSchema } from "../../../packages/shared-types/src/capture-rules.js";
import { createBaseDependencies } from "../../helpers/api-capture-rule-ingestion.js";
import { browserResourceEvent } from "../../helpers/browser-resource-fixtures.js";

it.each(["v1", "v2", "v3"] as const)(
  "enforces installed %s resource fingerprint rules during ingestion",
  async (version) => {
    const event = { ...browserResourceEvent(), project_token: "dbundle_proj_test" };
    const rule = CaptureRuleSchema.parse({
      id: "00000000-0000-4000-8000-000000000106",
      project_id: "proj_123",
      name: "Existing exact resource policy",
      description: null,
      sample_rate: null,
      sample_event_class: null,
      created_by_user_id: null,
      created_from_incident_id: null,
      created_from_event_id: null,
      expires_at: null,
      hit_count: 0,
      last_matched_at: null,
      enabled: true,
      action: "demote",
      matcher: {
        event_types: ["frontend_exception"],
        fingerprint: { version, value: fingerprint(normalizeEvent(event, version)) }
      },
      created_at: "2026-05-26T10:00:00.000Z",
      updated_at: "2026-05-26T10:00:00.000Z"
    });
    const persist = vi.fn().mockResolvedValue({ object_key: "raw" });
    const app = createApiServer(
      createBaseDependencies({
        persistAndEnqueue: persist,
        captureRuleManagement: {
          listCaptureRulesForProject: vi.fn(),
          listActiveCaptureRulesForProject: vi.fn().mockResolvedValue([rule]),
          createCaptureRuleForProject: vi.fn(),
          updateCaptureRuleForProject: vi.fn(),
          deleteCaptureRuleForProject: vi.fn(),
          recordCaptureRuleMatch: vi.fn().mockResolvedValue(undefined)
        }
      })
    );
    try {
      const response = await app.inject({
        method: "POST",
        url: "/v1/events",
        headers: { authorization: "Bearer dbundle_proj_test" },
        payload: { events: [event] }
      });
      expect(response.statusCode).toBe(202);
      expect(persist).toHaveBeenCalledWith(
        expect.any(Object),
        "proj_123",
        expect.objectContaining({
          captureRule: expect.objectContaining({ rule_id: rule.id, outcome: "demote" })
        })
      );
    } finally {
      await app.close();
    }
  }
);
