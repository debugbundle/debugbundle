import { describe, expect, it, vi } from "vitest";

import { runCli } from "../../../apps/cli/src/main.js";

describe("cli main capture-rule routing", () => {
  it("routes capture-rule list/create/update/delete arguments into command handlers", async () => {
    const listCaptureRulesCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "capture-rule-list"
    });
    const suggestCaptureRulesFromIncidentCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "capture-rule-suggest"
    });
    const createCaptureRuleFromIncidentSuggestionCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "capture-rule-create-from-suggestion"
    });
    const createCaptureRuleCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "capture-rule-create"
    });
    const updateCaptureRuleCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "capture-rule-update"
    });
    const deleteCaptureRuleCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "capture-rule-delete"
    });

    await runCli([
      "capture-rule",
      "list",
      "--project-id",
      "proj_123",
      "--auth-file",
      "/tmp/auth.json",
      "--json"
    ], {
      listCaptureRulesCommand
    });

    await runCli([
      "capture-rule",
      "suggest",
      "inc_123",
      "--auth-file",
      "/tmp/auth.json"
    ], {
      suggestCaptureRulesFromIncidentCommand
    });

    await runCli([
      "capture-rule",
      "create-from-suggestion",
      "inc_123",
      "--suggestion-id",
      "primary_resource_host_demote",
      "--name",
      "Demote analytics noise",
      "--enabled",
      "false"
    ], {
      createCaptureRuleFromIncidentSuggestionCommand
    });

    await runCli([
      "capture-rule",
      "create",
      "--project-id",
      "proj_123",
      "--name",
      "Demote analytics noise",
      "--action",
      "demote",
      "--matcher-json",
      '{"event_types":["frontend_exception"],"browser_event_kind":"resource_error","resource_url":{"host":"analytics.example.com"}}',
      "--description",
      "Known third-party noise",
      "--enabled",
      "false"
    ], {
      createCaptureRuleCommand
    });

    await runCli([
      "capture-rule",
      "update",
      "00000000-0000-4000-8000-000000000101",
      "--project-id",
      "proj_123",
      "--action",
      "sample",
      "--sample-rate",
      "0.25",
      "--sample-event-class",
      "context",
      "--json"
    ], {
      updateCaptureRuleCommand
    });

    const deleteResult = await runCli([
      "capture-rule",
      "delete",
      "00000000-0000-4000-8000-000000000101",
      "--project-id",
      "proj_123"
    ], {
      deleteCaptureRuleCommand
    });

    expect(listCaptureRulesCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      authFilePath: "/tmp/auth.json",
      json: true
    });
    expect(suggestCaptureRulesFromIncidentCommand).toHaveBeenCalledWith({
      incidentId: "inc_123",
      authFilePath: "/tmp/auth.json"
    });
    expect(createCaptureRuleFromIncidentSuggestionCommand).toHaveBeenCalledWith({
      incidentId: "inc_123",
      create: {
        suggestion_id: "primary_resource_host_demote",
        name: "Demote analytics noise",
        enabled: false
      }
    });
    expect(createCaptureRuleCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      create: {
        name: "Demote analytics noise",
        description: "Known third-party noise",
        enabled: false,
        action: "demote",
        matcher: {
          event_types: ["frontend_exception"],
          browser_event_kind: "resource_error",
          resource_url: {
            host: "analytics.example.com"
          }
        },
        sample_rate: null,
        sample_event_class: null,
        created_by_user_id: null,
        created_from_incident_id: null,
        created_from_event_id: null,
        expires_at: null
      }
    });
    expect(updateCaptureRuleCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      ruleId: "00000000-0000-4000-8000-000000000101",
      update: {
        action: "sample",
        sample_rate: 0.25,
        sample_event_class: "context"
      },
      json: true
    });
    expect(deleteCaptureRuleCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      ruleId: "00000000-0000-4000-8000-000000000101"
    });
    expect(deleteResult).toEqual({ exitCode: 0, output: "capture-rule-delete" });
  });

  it("validates required capture-rule options and values", async () => {
    const missingProject = await runCli(["capture-rule", "list"]);
    const missingSuggestion = await runCli(["capture-rule", "create-from-suggestion", "inc_123"]);
    const missingMatcher = await runCli([
      "capture-rule",
      "create",
      "--project-id",
      "proj_123",
      "--name",
      "Rule",
      "--action",
      "demote"
    ]);
    const emptyUpdate = await runCli([
      "capture-rule",
      "update",
      "00000000-0000-4000-8000-000000000101",
      "--project-id",
      "proj_123"
    ]);
    const invalidSampleRate = await runCli([
      "capture-rule",
      "update",
      "00000000-0000-4000-8000-000000000101",
      "--project-id",
      "proj_123",
      "--sample-rate",
      "nan"
    ]);

    expect(missingProject.exitCode).toBe(4);
    expect(missingProject.output).toContain("Missing required option --project-id.");
    expect(missingSuggestion.output).toContain("Missing required option --suggestion-id.");
    expect(missingMatcher.output).toContain("Missing required option --matcher-json.");
    expect(emptyUpdate.output).toContain("At least one capture rule field must be provided.");
    expect(invalidSampleRate.output).toContain("Invalid value for --sample-rate.");
  });
});
