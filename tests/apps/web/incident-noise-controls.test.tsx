// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
      browser_target_tag_name: "script",
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
      ...suggestion.rule,
      id: "rule_test",
      enabled: true
    } as api.ProjectCaptureRule);
    renderDialog();
    const create = await screen.findByRole("button", { name: "Stop capturing" });
    expect(create).toBeDisabled();
    expect(screen.getByText(/resource: www.googletagmanager.com \/gtm.js/)).toHaveTextContent(
      "services: web • environments: production"
    );
    expect(screen.getByText(/resource: www.googletagmanager.com \/gtm.js/)).toHaveTextContent(
      "target: script"
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
    expect(await screen.findByRole("button", { name: "Stop capturing" })).toBeDisabled();
    expect(screen.getByText(/project owner or admin/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
  it.each([
    ["pending", "The incident bundle is still being generated."],
    ["failed", "Capture rule suggestions are unavailable"],
    ["ready", "There is not enough retained evidence"]
  ] as const)("keeps %s evidence read-only", async (bundle_status, message) => {
    vi.mocked(api.suggestCaptureRulesFromIncident).mockResolvedValue({
      access_mode: "manage",
      bundle_status,
      suggestions: []
    });
    renderDialog();
    expect(await screen.findByText(new RegExp(message))).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Stop capturing" })).toBeNull();
    expect(api.createCaptureRuleFromIncidentSuggestion).not.toHaveBeenCalled();
  });
  it("shows loading and read errors without offering a rule", async () => {
    let reject!: (error: Error) => void;
    vi.mocked(api.suggestCaptureRulesFromIncident).mockReturnValue(
      new Promise((_, fail) => {
        reject = fail;
      })
    );
    renderDialog();
    expect(screen.getByText("Loading suggestions...")).toBeInTheDocument();
    await act(async () => reject(new Error("unavailable")));
    expect(await screen.findByText(/Could not load capture rule suggestions/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(api.createCaptureRuleFromIncidentSuggestion).not.toHaveBeenCalled();
  });
  it("keeps existing paused rules visible without offering duplicate creation", async () => {
    vi.mocked(api.suggestCaptureRulesFromIncident).mockResolvedValue({
      access_mode: "manage",
      bundle_status: "ready",
      suggestions: [{ ...suggestion, created_rule_id: "old-rule", created_rule_enabled: false }]
    });
    renderDialog();
    expect(await screen.findByRole("button", { name: "Rule exists" })).toBeDisabled();
    expect(screen.getByText("Rule paused")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage project rules" })).toHaveAttribute(
      "href",
      "/projects/proj_test/settings"
    );
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
  it("shows the actual saved scope when creation returns an existing legacy rule", async () => {
    vi.mocked(api.suggestCaptureRulesFromIncident).mockResolvedValue({
      access_mode: "manage",
      suggestions: [suggestion]
    });
    const matcher = { ...suggestion.rule.matcher };
    delete matcher.browser_target_tag_name;
    vi.mocked(api.createCaptureRuleFromIncidentSuggestion).mockResolvedValue({
      ...suggestion.rule,
      id: "legacy-rule",
      enabled: false,
      matcher
    } as api.ProjectCaptureRule);
    renderDialog();
    const create = await screen.findByRole("button", { name: "Stop capturing" });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(create);
    expect(await screen.findByText("Rule paused")).toBeInTheDocument();
    expect(screen.getByText(/resource: www.googletagmanager.com \/gtm.js/)).not.toHaveTextContent(
      "target: script"
    );
    expect(screen.getByText(/resource: www.googletagmanager.com \/gtm.js/)).toHaveTextContent(
      "services: web"
    );
  });
  it("retains the reviewed choice after a failed creation so the user can retry", async () => {
    vi.mocked(api.suggestCaptureRulesFromIncident).mockResolvedValue({
      access_mode: "manage",
      suggestions: [suggestion]
    });
    vi.mocked(api.createCaptureRuleFromIncidentSuggestion).mockRejectedValue(
      new Error("unavailable")
    );
    renderDialog();
    const create = await screen.findByRole("button", { name: "Stop capturing" });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(create);
    await waitFor(() => expect(create).toBeEnabled());
    expect(screen.getByRole("checkbox")).toBeChecked();
  });
  it("ignores a completed creation after switching to another incident", async () => {
    vi.mocked(api.suggestCaptureRulesFromIncident).mockResolvedValue({
      access_mode: "manage",
      suggestions: [suggestion]
    });
    let finish!: (rule: api.ProjectCaptureRule) => void;
    vi.mocked(api.createCaptureRuleFromIncidentSuggestion).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const view = renderDialog();
    const create = await screen.findByRole("button", { name: "Stop capturing" });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(create);
    view.rerender(
      <MemoryRouter>
        <IncidentCaptureRuleSuggestionsDialog
          incidentId="inc_next"
          projectId="proj_test"
          open
          onOpenChange={() => undefined}
        />
      </MemoryRouter>
    );
    await screen.findByRole("button", { name: "Stop capturing" });
    await act(async () => finish({ id: "old-rule", enabled: true } as api.ProjectCaptureRule));
    expect(screen.queryByRole("button", { name: "Rule exists" })).toBeNull();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Stop capturing" })).toBeEnabled();
  });
});
