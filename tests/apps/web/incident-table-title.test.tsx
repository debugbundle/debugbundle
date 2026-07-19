// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "../../../node_modules/.pnpm/node_modules/react-router-dom/dist/index.js";
import { describe, expect, it, vi } from "vitest";

import { BoundedTableTitle } from "../../../apps/web/src/components/system/bounded-table-title.js";
import type { ImprovementRecord } from "../../../apps/web/src/lib/api.js";
import { ImprovementsTable } from "../../../apps/web/src/pages/improvements-page.js";

describe("BoundedTableTitle", () => {
  it("visually clamps long titles without changing the accessible title", () => {
    const title =
      "javax.faces.application.ViewExpiredException: viewId:/index.xhtml - View /index.xhtml could not be restored at com.sun.faces.lifecycle.RestoreViewPhase.execute";

    render(
      <MemoryRouter>
        <BoundedTableTitle title={title} to="/incidents/inc_123" rowInteractive />
      </MemoryRouter>
    );

    const link = screen.getByRole("link", { name: title });

    expect(link).toHaveAttribute("href", "/incidents/inc_123");
    expect(link).toHaveAttribute("title", title);
    expect(link).toHaveClass("line-clamp-2");
    expect(link.className).toContain("[overflow-wrap:anywhere]");
    expect(link).toHaveAttribute("data-row-interactive", "true");
  });

  it("supports non-link table titles while preserving the full value", () => {
    const title =
      "Recurring incident: javax.faces.application.ViewExpiredException: viewId:/index.xhtml";

    render(<BoundedTableTitle title={title} />);

    const text = screen.getByText(title);

    expect(text.tagName).toBe("SPAN");
    expect(text).toHaveClass("line-clamp-2", "whitespace-normal");
    expect(text.className).toContain("[overflow-wrap:anywhere]");
    expect(text).toHaveAttribute("title", title);
  });

  it("bounds long titles in the improvements table shared by workspace and project views", () => {
    const title =
      "Recurring incident: javax.faces.application.ViewExpiredException: viewId:/index.xhtml - View /index.xhtml could not be restored at com.sun.jsf-impl@2.3.{dynamic}.SP01//com.sun.faces.lifecycle.RestoreViewPhase.execute(RestoreViewPhase.java:{dynamic})";
    const improvement: ImprovementRecord = {
      improvement_id: "imp_123",
      project_id: "proj_123",
      project_name: "Main App",
      project_color_tag: null,
      project_slug: "main-app",
      service_id: null,
      service_name: "checkout-api",
      service_runtime: "node",
      service_framework: "fastify",
      environment: "production",
      kind: "recurring_incident",
      status: "open",
      severity: "medium",
      confidence: 0.78,
      fingerprint: "fp_recurring_incident",
      title,
      summary: "Repeated incident pattern detected for checkout-api in production.",
      occurrence_count: 7,
      evidence: { kind: "recurring_incident" },
      related_incident_ids: ["inc_123"],
      first_detected_at: "2026-05-18T12:00:00.000Z",
      last_detected_at: "2026-05-18T12:30:00.000Z",
      resolved_at: null,
      snoozed_until: null,
      bundle_generation_number: 0,
      bundle_created_at: null,
      bundle_updated_at: null,
      bundle_failure_reason: "covered_by_incident_bundle"
    };

    render(
      <MemoryRouter>
        <ImprovementsTable
          improvements={[improvement]}
          sort={{ field: "last_detected_at", direction: "desc" }}
          onSortChange={vi.fn()}
          selectedImprovementIds={new Set()}
          onToggleImprovementSelection={vi.fn()}
          onImprovementRowClick={vi.fn()}
          projectScoped
        />
      </MemoryRouter>
    );

    const link = screen.getByRole("link", { name: title });

    expect(link).toHaveAttribute("href", "/projects/proj_123/improvements/imp_123");
    expect(link).toHaveClass("line-clamp-2", "whitespace-normal");
    expect(link.className).toContain("[overflow-wrap:anywhere]");
    expect(link).toHaveAttribute("title", title);
  });
});
