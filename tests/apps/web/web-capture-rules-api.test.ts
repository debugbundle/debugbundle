import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApiUrl, InvalidSessionError, resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import {
  createCaptureRuleFromIncidentSuggestion,
  deleteProjectCaptureRule,
  listProjectCaptureRules,
  suggestCaptureRulesFromIncident,
  updateProjectCaptureRule
} from "../../../apps/web/src/lib/capture-rules-api.ts";

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("web capture-rules api", () => {
  it("builds list, update, delete, suggest, and create-from-suggestion requests", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_mode: "manage", rules: [] }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ rule: { id: "rule_1", enabled: false } }), { status: 200 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ bundle_status: "ready", suggestions: [] }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ rule: { id: "rule_2", enabled: true } }), { status: 200 })
      );

    vi.stubGlobal("fetch", fetchMock);

    await listProjectCaptureRules("proj_1");
    await updateProjectCaptureRule("proj_1", "rule_1", { enabled: false });
    await deleteProjectCaptureRule("proj_1", "rule_1");
    await suggestCaptureRulesFromIncident("inc_1");
    await createCaptureRuleFromIncidentSuggestion("inc_1", {
      suggestion_id: "primary_resource_host_demote"
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, buildApiUrl("/v1/projects/proj_1/capture-rules"), {
      credentials: "include"
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      buildApiUrl("/v1/projects/proj_1/capture-rules/rule_1"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ enabled: false })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      buildApiUrl("/v1/projects/proj_1/capture-rules/rule_1"),
      expect.objectContaining({
        method: "DELETE"
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      buildApiUrl("/v1/incidents/inc_1/capture-rule-suggestion"),
      expect.objectContaining({
        method: "POST"
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      buildApiUrl("/v1/incidents/inc_1/capture-rules"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ suggestion_id: "primary_resource_host_demote" })
      })
    );
  });

  it("maps invalid browser sessions to InvalidSessionError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: "invalid_session" }), { status: 401 })))
    );

    await expect(listProjectCaptureRules("proj_1")).rejects.toBeInstanceOf(InvalidSessionError);
    await expect(suggestCaptureRulesFromIncident("inc_1")).rejects.toBeInstanceOf(InvalidSessionError);
  });
});
