// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "../../../node_modules/.pnpm/node_modules/react-router-dom/dist/index.js";
import { describe, expect, it } from "vitest";

import { IncidentTableTitle } from "../../../apps/web/src/components/system/incident-table-title.js";

describe("IncidentTableTitle", () => {
  it("visually clamps long titles without changing the accessible title", () => {
    const title =
      "javax.faces.application.ViewExpiredException: viewId:/index.xhtml - View /index.xhtml could not be restored at com.sun.faces.lifecycle.RestoreViewPhase.execute";

    render(
      <MemoryRouter>
        <IncidentTableTitle title={title} to="/incidents/inc_123" rowInteractive />
      </MemoryRouter>
    );

    const link = screen.getByRole("link", { name: title });

    expect(link).toHaveAttribute("href", "/incidents/inc_123");
    expect(link).toHaveAttribute("title", title);
    expect(link).toHaveClass("line-clamp-2");
    expect(link.className).toContain("[overflow-wrap:anywhere]");
    expect(link).toHaveAttribute("data-row-interactive", "true");
  });
});
