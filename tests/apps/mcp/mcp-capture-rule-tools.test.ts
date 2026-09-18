import { describe, expect, it, vi } from "vitest";

import { CaptureRuleApiError } from "../../../apps/cli/src/capture-rule-commands.js";
import { buildBrowserResourceSuggestions } from "../../../packages/shared-types/src/browser-resource-suggestions.js";
import { browserResourceEvent } from "../../helpers/browser-resource-fixtures.js";
import {
  CAPTURE_RULE_MCP_TOOL_NAMES,
  createCaptureRuleMcpTools
} from "../../../apps/mcp/src/capture-rule-tools.ts";

describe("mcp capture-rule tools", () => {
  it.each(["resource_context", "resource_drop"])(
    "preserves the server-reviewed scope and opaque ID for %s",
    async (suggestionId) => {
      const event = browserResourceEvent();
      const suggestions = buildBrowserResourceSuggestions({
        browserEvent: event.payload.browser_event,
        service: event.service.name,
        environment: event.service.environment,
        incident: {
          incident_id: "inc_1",
          project_id: "proj_1",
          fingerprint: "hash",
          fingerprint_version: "v3",
          title: "Google Tag Manager script failed to load",
          occurrence_count: 4,
          matched_fields: []
        }
      });
      const response = { access_mode: "manage", bundle_status: "ready", suggestions };
      const apply = vi.fn().mockResolvedValue({ rule: { id: "rule_1" } });
      const tools = createCaptureRuleMcpTools({
        listCaptureRules: vi.fn(),
        createCaptureRule: vi.fn(),
        updateCaptureRule: vi.fn(),
        deleteCaptureRule: vi.fn(),
        suggestCaptureRulesFromIncident: vi.fn().mockResolvedValue(response),
        createCaptureRuleFromIncidentSuggestion: apply
      });

      const result = await tools.suggest_capture_rules_from_incident({
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_1"
      });
      expect(result).toEqual(response);
      expect(apply).not.toHaveBeenCalled();
      const selected = suggestions.find((suggestion) => suggestion.suggestion_id === suggestionId);
      expect(selected?.requires_confirmation).toBe(true);
      expect(selected?.rule.matcher).toMatchObject({
        services: [event.service.name],
        environments: [event.service.environment],
        browser_event_kind: "resource_error",
        browser_event_opaque: true,
        resource_url: { host: "www.googletagmanager.com", path_equals: "/gtm.js" }
      });
      await tools.create_capture_rule_from_incident_suggestion({
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_1",
        create: { suggestion_id: selected!.suggestion_id }
      });
      expect(apply).toHaveBeenCalledWith({
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_1",
        create: { suggestion_id: suggestionId }
      });
    }
  );

  it("declares capture-rule tool parity", () => {
    expect(CAPTURE_RULE_MCP_TOOL_NAMES).toEqual([
      "list_capture_rules",
      "create_capture_rule",
      "update_capture_rule",
      "delete_capture_rule",
      "suggest_capture_rules_from_incident",
      "create_capture_rule_from_incident_suggestion"
    ]);
  });

  it("forwards capture-rule requests", async () => {
    const api = {
      listCaptureRules: vi.fn().mockResolvedValue({ access_mode: "manage", rules: [] }),
      createCaptureRule: vi.fn().mockResolvedValue({ rule: { id: "rule_1" } }),
      updateCaptureRule: vi.fn().mockResolvedValue({ rule: { id: "rule_1", enabled: false } }),
      deleteCaptureRule: vi.fn().mockResolvedValue({ success: true }),
      suggestCaptureRulesFromIncident: vi.fn().mockResolvedValue({ bundle_status: "ready", suggestions: [] }),
      createCaptureRuleFromIncidentSuggestion: vi.fn().mockResolvedValue({ rule: { id: "rule_2" } })
    };
    const tools = createCaptureRuleMcpTools(api);

    await expect(
      tools.list_capture_rules({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1"
      })
    ).resolves.toEqual({ access_mode: "manage", rules: [] });

    await expect(
      tools.create_capture_rule({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        create: { name: "Demote analytics noise" }
      })
    ).resolves.toEqual({ rule: { id: "rule_1" } });

    await expect(
      tools.update_capture_rule({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        ruleId: "rule_1",
        update: { enabled: false }
      })
    ).resolves.toEqual({ rule: { id: "rule_1", enabled: false } });

    await expect(
      tools.delete_capture_rule({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        ruleId: "rule_1"
      })
    ).resolves.toEqual({ success: true });

    await expect(
      tools.suggest_capture_rules_from_incident({
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_1"
      })
    ).resolves.toEqual({ bundle_status: "ready", suggestions: [] });

    await expect(
      tools.create_capture_rule_from_incident_suggestion({
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_1",
        create: { suggestion_id: "primary_resource_host_demote" }
      })
    ).resolves.toEqual({ rule: { id: "rule_2" } });
  });

  it("maps capture-rule api and unknown errors to mcp tool errors", async () => {
    const tools = createCaptureRuleMcpTools({
      listCaptureRules: vi.fn().mockRejectedValue(new CaptureRuleApiError(401, "invalid_member_token")),
      createCaptureRule: vi.fn().mockRejectedValue(new Error("boom")),
      updateCaptureRule: vi.fn().mockResolvedValue({}),
      deleteCaptureRule: vi.fn().mockResolvedValue({}),
      suggestCaptureRulesFromIncident: vi.fn().mockResolvedValue({}),
      createCaptureRuleFromIncidentSuggestion: vi.fn().mockResolvedValue({})
    });

    await expect(
      tools.list_capture_rules({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1"
      })
    ).rejects.toThrow("mcp_tool_error:invalid_member_token");

    await expect(
      tools.create_capture_rule({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        create: { name: "Rule" }
      })
    ).rejects.toThrow("mcp_tool_error:unknown_error");
  });
});
