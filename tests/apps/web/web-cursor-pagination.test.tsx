// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as notify from "../../../apps/web/src/lib/notify.js";
import { useCursorPagination, type CursorPageResult } from "../../../apps/web/src/lib/use-cursor-pagination.js";

function PaginationHarness(input: {
  loadPage: (cursor: string | null) => Promise<CursorPageResult<string>>;
}): JSX.Element {
  const { items, isLoading, page, hasNextPage, goToNextPage, goToPreviousPage, refreshPage } = useCursorPagination(input.loadPage, []);

  return (
    <div>
      <p data-testid="loading-state">{isLoading ? "loading" : "idle"}</p>
      <p data-testid="page-number">{page}</p>
      <p data-testid="next-page-available">{String(hasNextPage)}</p>
      <ul aria-label="items">
        {(items ?? []).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <button type="button" onClick={() => void goToPreviousPage()}>
        Previous
      </button>
      <button type="button" onClick={() => void goToNextPage()}>
        Next
      </button>
      <button type="button" onClick={() => void refreshPage()}>
        Refresh
      </button>
    </div>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useCursorPagination", () => {
  it("shows an error toast and clears loading when the first page request fails", async () => {
    const showErrorToast = vi.spyOn(notify, "showErrorToast").mockImplementation(() => undefined);
    const loadPage = vi.fn<(cursor: string | null) => Promise<CursorPageResult<string>>>().mockRejectedValue(new Error("boom"));

    render(<PaginationHarness loadPage={loadPage} />);

    await waitFor(() => {
      expect(screen.getByTestId("loading-state")).toHaveTextContent("idle");
    });

    expect(loadPage).toHaveBeenCalledWith(null);
    expect(showErrorToast).toHaveBeenCalledWith("Could not load the current page.");
    expect(screen.getByTestId("page-number")).toHaveTextContent("1");
    expect(screen.getByTestId("next-page-available")).toHaveTextContent("false");
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("shows an error toast and keeps the current page visible when loading the next page fails", async () => {
    const user = userEvent.setup();
    const showErrorToast = vi.spyOn(notify, "showErrorToast").mockImplementation(() => undefined);
    const loadPage = vi
      .fn<(cursor: string | null) => Promise<CursorPageResult<string>>>()
      .mockResolvedValueOnce({
        items: ["First page item"],
        nextCursor: "cursor_2"
      })
      .mockRejectedValueOnce(new Error("next page failed"));

    render(<PaginationHarness loadPage={loadPage} />);

    expect(await screen.findByText("First page item")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(showErrorToast).toHaveBeenCalledWith("Could not load the next page.");
    });

    expect(screen.getByText("First page item")).toBeInTheDocument();
    expect(screen.getByTestId("page-number")).toHaveTextContent("1");
    expect(screen.getByTestId("next-page-available")).toHaveTextContent("true");
    expect(screen.getByTestId("loading-state")).toHaveTextContent("idle");
  });

  it("shows an error toast and preserves the current page when refresh fails", async () => {
    const user = userEvent.setup();
    const showErrorToast = vi.spyOn(notify, "showErrorToast").mockImplementation(() => undefined);
    const loadPage = vi
      .fn<(cursor: string | null) => Promise<CursorPageResult<string>>>()
      .mockResolvedValueOnce({
        items: ["First page item"],
        nextCursor: null
      })
      .mockRejectedValueOnce(new Error("refresh failed"));

    render(<PaginationHarness loadPage={loadPage} />);

    expect(await screen.findByText("First page item")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /refresh/i }));

    await waitFor(() => {
      expect(showErrorToast).toHaveBeenCalledWith("Could not refresh the current page.");
    });

    expect(screen.getByText("First page item")).toBeInTheDocument();
    expect(screen.getByTestId("page-number")).toHaveTextContent("1");
    expect(screen.getByTestId("loading-state")).toHaveTextContent("idle");
  });
});
