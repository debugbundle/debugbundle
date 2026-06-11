// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CursorPaginationControls } from "../../../apps/web/src/components/system/cursor-pagination-controls.js";

describe("CursorPaginationControls", () => {
  it("keeps the page label and controls in a wrapping row with right-aligned navigation", () => {
    render(
      <CursorPaginationControls
        page={2}
        hasNextPage
        isLoading={false}
        onPreviousPage={vi.fn()}
        onNextPage={vi.fn()}
      />
    );

    const pageLabel = screen.getByText("Page 2");
    const container = pageLabel.parentElement;
    const pagination = screen.getByRole("navigation", { name: "Pagination" });

    expect(container).not.toBeNull();
    expect(container).toHaveClass("flex-wrap", "items-center");
    expect(pagination).toHaveClass("ml-auto", "shrink-0", "justify-end");
  });

  it("renders nothing when the first page has no next page", () => {
    const { container } = render(
      <CursorPaginationControls
        page={1}
        hasNextPage={false}
        isLoading={false}
        onPreviousPage={vi.fn()}
        onNextPage={vi.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
