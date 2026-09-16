// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "../../../node_modules/.pnpm/node_modules/react-router-dom/dist/index.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IncidentCaptureRuleSuggestionsDialog } from "../../../apps/web/src/components/system/incident-capture-rule-suggestions-dialog.js";
import * as api from "../../../apps/web/src/lib/capture-rules-api.js";
vi.mock("../../../apps/web/src/lib/capture-rules-api.js", () => ({
  suggestCaptureRulesFromIncident: vi.fn(),
  createCaptureRuleFromIncidentSuggestion: vi.fn()
}));

const suggestion: api.CaptureRuleSuggestion = {
  suggestion_id: "resource_drop",
  label: "Stop capturing Google Tag Manager failures",
  recommended_action: "drop",
  confidence: "medium",
  reason: "Only if this dependency is optional; matching events will be discarded.",
  requires_confirmation: true,
  created_rule_id: null,
  created_rule_enabled: null,
  rule: {
    name: "Stop capturing GTM",
    description: null,
    enabled: true,
    action: "drop",
    matcher: {
      event_types: ["frontend_exception"],
      browser_event_kind: "resource_error",
      browser_event_opaque: true,
      services: ["web"],
      environments: ["production"],
      resource_url: { host: "www.googletagmanager.com", path_equals: "/gtm.js" }
    },
    sample_rate: null,
    sample_event_class: null,
    created_by_user_id: null,
    created_from_incident_id: "inc_test",
    created_from_event_id: null,
    expires_at: null
  }
};
function renderDialog() {
  return render(
    <MemoryRouter>
      <IncidentCaptureRuleSuggestionsDialog
        incidentId="inc_test"
        projectId="proj_test"
        open
        onOpenChange={() => undefined}
      />
    </MemoryRouter>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
});

describe("incident noise controls", () => {
  it("shows the complete scope and requires an explicit review before dropping", async () => {
    vi.mocked(api.suggestCaptureRulesFromIncident).mockResolvedValue({
      access_mode: "manage",
      bundle_status: "ready",
      suggestions: [suggestion]
    });
    vi.mocked(api.createCaptureRuleFromIncidentSuggestion).mockResolvedValue({
      id: "rule_test",
      enabled: true
    } as api.ProjectCaptureRule);
    renderDialog();
    const create = await screen.findByRole("button", { name: "Create rule" });
    expect(create).toBeDisabled();
    expect(screen.getByText(/resource: www.googletagmanager.com \/gtm.js/)).toHaveTextContent(
      "services: web • environments: production"
    );
    fireEvent.click(create);
    expect(api.createCaptureRuleFromIncidentSuggestion).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(create);
    await waitFor(() =>
      expect(api.createCaptureRuleFromIncidentSuggestion).toHaveBeenCalledWith("inc_test", {
        suggestion_id: "resource_drop"
      })
    );
    expect(await screen.findByRole("button", { name: "Rule exists" })).toBeDisabled();
  });
  it("keeps shared members in preview mode", async () => {
    vi.mocked(api.suggestCaptureRulesFromIncident).mockResolvedValue({
      access_mode: "preview",
      bundle_status: "ready",
      suggestions: [suggestion]
    });
    renderDialog();
    expect(await screen.findByRole("button", { name: "Create rule" })).toBeDisabled();
    expect(screen.getByText(/project owner or admin/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
