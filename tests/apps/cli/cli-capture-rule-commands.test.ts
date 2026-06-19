import { describe, expect, it, vi } from "vitest";

import { CliAuthStateError } from "../../../apps/cli/src/auth-state.js";
import {
  CaptureRuleApiError,
  createCaptureRuleApi,
  createCaptureRuleCommand,
  createCaptureRuleFromIncidentSuggestionCommand,
  deleteCaptureRuleCommand,
  deleteCaptureRuleWithAuthCommand,
  listCaptureRulesCommand,
  listCaptureRulesWithAuthCommand,
  suggestCaptureRulesFromIncidentCommand,
  updateCaptureRuleCommand
} from "../../../apps/cli/src/capture-rule-commands.js";

const rule = {
  id: "00000000-0000-4000-8000-000000000101",
  project_id: "proj_1",
  name: "Demote analytics resource noise",
  description: null,
  enabled: true,
  action: "demote" as const,
  matcher: {
    event_types: ["frontend_exception"] as const,
    browser_event_kind: "resource_error" as const,
    resource_url: { host: "analytics.example.com" }
  },
  sample_rate: null,
  sample_event_class: null,
  created_by_user_id: null,
  created_from_incident_id: null,
  created_from_event_id: null,
  expires_at: null,
  hit_count: 0,
  last_matched_at: null,
  created_at: "2026-05-26T10:00:00.000Z",
  updated_at: "2026-05-26T10:00:00.000Z"
};

describe("cli capture-rule commands", () => {
  it("renders capture rules in human mode", async () => {
    const result = await listCaptureRulesCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1"
      },
      {
        listCaptureRules: vi.fn().mockResolvedValue({
          access_mode: "manage",
          rules: [rule]
        })
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("enabled");
    expect(result.output).toContain(rule.name);
    expect(result.output).toContain("browser_event_kind=resource_error");
  });

  it("renders create/update/delete results", async () => {
    const created = await createCaptureRuleCommand(
      {
        bearerToken: "dbundle_mem_owner",
        projectId: "proj_1",
        create: {
          name: rule.name,
          description: null,
          enabled: true,
          action: "demote",
          matcher: rule.matcher,
          sample_rate: null,
          sample_event_class: null,
          created_by_user_id: null,
          created_from_incident_id: null,
          created_from_event_id: null,
          expires_at: null
        },
        json: true
      },
      {
        createCaptureRule: vi.fn().mockResolvedValue({ rule })
      }
    );

    const updated = await updateCaptureRuleCommand(
      {
        bearerToken: "dbundle_mem_owner",
        projectId: "proj_1",
        ruleId: rule.id,
        update: {
          action: "sample",
          sample_rate: 0.2,
          sample_event_class: "context"
        }
      },
      {
        updateCaptureRule: vi.fn().mockResolvedValue({
          rule: {
            ...rule,
            action: "sample",
            sample_rate: 0.2,
            sample_event_class: "context"
          }
        })
      }
    );

    const deleted = await deleteCaptureRuleCommand(
      {
        bearerToken: "dbundle_mem_owner",
        projectId: "proj_1",
        ruleId: rule.id
      },
      {
        deleteCaptureRule: vi.fn().mockResolvedValue({ success: true })
      }
    );

    expect(created.exitCode).toBe(0);
    expect(JSON.parse(created.output)).toEqual({ rule });
    expect(updated.output).toContain("Capture rule updated.");
    expect(updated.output).toContain("sample:0.2:context");
    expect(deleted).toEqual({ exitCode: 0, output: "Capture rule deleted." });
  });

  it("renders incident suggestion flows", async () => {
    const suggested = await suggestCaptureRulesFromIncidentCommand(
      {
        bearerToken: "dbundle_mem_owner",
        incidentId: "inc_123"
      },
      {
        suggestCaptureRulesFromIncident: vi.fn().mockResolvedValue({
          bundle_status: "ready",
          suggestions: [
            {
              suggestion_id: "primary_resource_host_demote",
              label: "Demote resource errors from analytics.example.com",
              recommended_action: "demote",
              confidence: "high",
              reason: "Known third-party resource noise.",
              requires_confirmation: false,
              created_rule_id: rule.id,
              created_rule_enabled: false,
              rule: {
                name: "Demote resource errors from analytics.example.com",
                description: null,
                enabled: true,
                action: "demote",
                matcher: rule.matcher,
                sample_rate: null,
                sample_event_class: null,
                created_by_user_id: null,
                created_from_incident_id: "inc_123",
                created_from_event_id: null,
                expires_at: null
              }
            }
          ]
        })
      }
    );
    const created = await createCaptureRuleFromIncidentSuggestionCommand(
      {
        bearerToken: "dbundle_mem_owner",
        incidentId: "inc_123",
        create: {
          suggestion_id: "primary_resource_host_demote",
          name: "Demote analytics resource noise"
        }
      },
      {
        createCaptureRuleFromIncidentSuggestion: vi.fn().mockResolvedValue({ rule })
      }
    );

    expect(suggested.exitCode).toBe(0);
    expect(suggested.output).toContain("primary_resource_host_demote");
    expect(suggested.output).toContain("Known third-party resource noise.");
    expect(suggested.output).toContain(`existing_rule: ${rule.id} (disabled)`);
    expect(created.output).toContain("Capture rule applied.");
  });

  it("loads stored auth state and forwards it into list/delete commands", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const httpClient = { request: vi.fn() };
    const createHttpClient = vi.fn().mockReturnValue(httpClient);
    const listCaptureRules = vi.fn().mockResolvedValue({
      access_mode: "manage",
      rules: [rule]
    });
    const deleteCaptureRule = vi.fn().mockResolvedValue({ success: true });
    const createApi = vi.fn().mockReturnValue({ listCaptureRules, deleteCaptureRule });

    const listResult = await listCaptureRulesWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        projectId: "proj_1",
        json: true
      },
      {
        readAuthState,
        createHttpClient,
        createApi
      }
    );

    const deleteResult = await deleteCaptureRuleWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        projectId: "proj_1",
        ruleId: rule.id,
        json: true
      },
      {
        readAuthState,
        createHttpClient,
        createApi
      }
    );

    expect(createHttpClient).toHaveBeenCalledWith({
      baseUrl: "https://selfhost.debugbundle.test"
    });
    expect(listCaptureRules).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: "proj_1"
    });
    expect(deleteCaptureRule).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: "proj_1",
      ruleId: rule.id
    });
    expect(JSON.parse(listResult.output)).toEqual({
      access_mode: "manage",
      rules: [rule]
    });
    expect(JSON.parse(deleteResult.output)).toEqual({ success: true });
  });

  it("maps auth state and API failures to CLI exit codes", async () => {
    const authFailure = await listCaptureRulesWithAuthCommand(
      {
        projectId: "proj_1"
      },
      {
        readAuthState: vi.fn().mockRejectedValue(new CliAuthStateError("auth_state_missing", "Not logged in."))
      }
    );
    const unauthorized = await listCaptureRulesCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1" },
      { listCaptureRules: vi.fn().mockRejectedValue(new CaptureRuleApiError(401, "invalid_member_token")) }
    );
    const forbidden = await deleteCaptureRuleCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1", ruleId: rule.id },
      { deleteCaptureRule: vi.fn().mockRejectedValue(new CaptureRuleApiError(403, "forbidden")) }
    );
    const badRequest = await createCaptureRuleCommand(
      {
        bearerToken: "dbundle_mem_owner",
        projectId: "proj_1",
        create: {
          name: rule.name,
          description: null,
          enabled: true,
          action: "sample",
          matcher: rule.matcher,
          sample_rate: null,
          sample_event_class: null,
          created_by_user_id: null,
          created_from_incident_id: null,
          created_from_event_id: null,
          expires_at: null
        }
      },
      { createCaptureRule: vi.fn() }
    );

    expect(authFailure.exitCode).toBe(2);
    expect(unauthorized.exitCode).toBe(2);
    expect(forbidden.exitCode).toBe(3);
    expect(badRequest.exitCode).toBe(5);
    expect(badRequest.output).toBe("Invalid capture rule create payload.");
  });

  it("builds CRUD requests against the capture-rule API and accepts idempotent suggestion creates", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        body: {
          access_mode: "manage",
          rules: [rule]
        }
      })
      .mockResolvedValueOnce({
        status: 201,
        body: { rule }
      })
      .mockResolvedValueOnce({
        status: 200,
        body: {
          bundle_status: "ready",
          suggestions: []
        }
      })
      .mockResolvedValueOnce({
        status: 200,
        body: { rule }
      })
      .mockResolvedValueOnce({
        status: 200,
        body: {
          rule: {
            ...rule,
            enabled: false
          }
        }
      })
      .mockResolvedValueOnce({
        status: 200,
        body: { success: true }
      });

    const api = createCaptureRuleApi({ request });
    const listResponse = await api.listCaptureRules({
      bearerToken: "dbundle_mem_owner",
      projectId: "proj_1"
    });
    const createResponse = await api.createCaptureRule({
      bearerToken: "dbundle_mem_owner",
      projectId: "proj_1",
      create: {
        name: rule.name,
        description: null,
        enabled: true,
        action: "demote",
        matcher: rule.matcher,
        sample_rate: null,
        sample_event_class: null,
        created_by_user_id: null,
        created_from_incident_id: null,
        created_from_event_id: null,
        expires_at: null
      }
    });
    const suggestionResponse = await api.suggestCaptureRulesFromIncident({
      bearerToken: "dbundle_mem_owner",
      incidentId: "inc_123"
    });
    const createFromSuggestionResponse = await api.createCaptureRuleFromIncidentSuggestion({
      bearerToken: "dbundle_mem_owner",
      incidentId: "inc_123",
      create: {
        suggestion_id: "primary_resource_host_demote",
        name: "Demote analytics resource noise"
      }
    });
    const updateResponse = await api.updateCaptureRule({
      bearerToken: "dbundle_mem_owner",
      projectId: "proj_1",
      ruleId: rule.id,
      update: { enabled: false }
    });
    const deleteResponse = await api.deleteCaptureRule({
      bearerToken: "dbundle_mem_owner",
      projectId: "proj_1",
      ruleId: rule.id
    });

    expect(request.mock.calls).toEqual([
      [
        {
          method: "GET",
          path: "/v1/projects/proj_1/capture-rules",
          bearerToken: "dbundle_mem_owner"
        }
      ],
      [
        {
          method: "POST",
          path: "/v1/projects/proj_1/capture-rules",
          bearerToken: "dbundle_mem_owner",
          body: {
            name: rule.name,
            description: null,
            enabled: true,
            action: "demote",
            matcher: rule.matcher,
            sample_rate: null,
            sample_event_class: null,
            created_by_user_id: null,
            created_from_incident_id: null,
            created_from_event_id: null,
            expires_at: null
          }
        }
      ],
      [
        {
          method: "POST",
          path: `/v1/incidents/${encodeURIComponent("inc_123")}/capture-rule-suggestion`,
          bearerToken: "dbundle_mem_owner"
        }
      ],
      [
        {
          method: "POST",
          path: `/v1/incidents/${encodeURIComponent("inc_123")}/capture-rules`,
          bearerToken: "dbundle_mem_owner",
          body: {
            suggestion_id: "primary_resource_host_demote",
            name: "Demote analytics resource noise"
          }
        }
      ],
      [
        {
          method: "PATCH",
          path: `/v1/projects/proj_1/capture-rules/${encodeURIComponent(rule.id)}`,
          bearerToken: "dbundle_mem_owner",
          body: { enabled: false }
        }
      ],
      [
        {
          method: "DELETE",
          path: `/v1/projects/proj_1/capture-rules/${encodeURIComponent(rule.id)}`,
          bearerToken: "dbundle_mem_owner"
        }
      ]
    ]);
    expect(listResponse.rules).toEqual([rule]);
    expect(createResponse.rule).toEqual(rule);
    expect(suggestionResponse.suggestions).toEqual([]);
    expect(createFromSuggestionResponse.rule).toEqual(rule);
    expect(updateResponse.rule.enabled).toBe(false);
    expect(deleteResponse).toEqual({ success: true });
  });
});
