import { mockedObject } from "../../helpers/vitest.js";
import { expect, it, vi } from "vitest";
import { createApiServer } from "../../../apps/api/src/server.js";
import { createBaseDependencies } from "../../helpers/api-capture-rule-ingestion.js";
it("keeps lifecycle-aware capture rules server-side for mixed SDK compatibility", async () => {
  const baseRule = {
    id: "00000000-0000-4000-8000-000000000101",
    project_id: "proj_123",
    name: "resource rule",
    description: null,
    enabled: true,
    action: "demote" as const,
    sample_rate: null,
    sample_event_class: null,
    created_by_user_id: null,
    created_from_incident_id: null,
    created_from_event_id: null,
    expires_at: null,
    hit_count: 0,
    last_matched_at: null,
    created_at: "2026-09-22T00:00:00.000Z",
    updated_at: "2026-09-22T00:00:00.000Z"
  };
  const sdkSafeRule = {
    ...baseRule,
    action: "drop" as const,
    matcher: {
      browser_event_kind: "resource_error" as const,
      resource_url: { host: "app.example.com", path_equals: "/asset.js" }
    }
  };
  const serverOnlyRule = {
    ...baseRule,
    id: "00000000-0000-4000-8000-000000000102",
    action: "demote" as const,
    matcher: {
      ...sdkSafeRule.matcher,
      browser_page_visibility_state: "hidden" as const
    }
  };
  const app = createApiServer(
    createBaseDependencies({
      captureRuleManagement: mockedObject<NonNullable<Parameters<typeof createApiServer>[0]["captureRuleManagement"]>>({
        listActiveCaptureRulesForProject: vi.fn().mockResolvedValue([sdkSafeRule, serverOnlyRule])
      })
    })
  );

  const response = await app.inject({
    method: "GET",
    url: "/v1/sdk/config",
    headers: { authorization: "Bearer dbundle_proj_test" }
  });

  expect(response.statusCode).toBe(200);
  expect(response.json().capture_rules).toEqual([]);
  await app.close();
});
