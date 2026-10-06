// @vitest-environment jsdom

import { act, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as notify from "../../../apps/web/src/lib/notify.js";
import {
  useCursorPagination,
  type CursorPageResult
} from "../../../apps/web/src/lib/use-cursor-pagination.js";

function PaginationHarness(input: {
  loadPage: (cursor: string | null) => Promise<CursorPageResult<string>>;
  filter?: string;
}): JSX.Element {
  const {
    items,
    isLoading,
    page,
    totalPages,
    hasNextPage,
    goToNextPage,
    goToPreviousPage,
    refreshPage
  } = useCursorPagination(input.loadPage, [input.filter]);

  return (
    <div>
      <p data-testid="loading-state">{isLoading ? "loading" : "idle"}</p>
      <p data-testid="page-number">{page}</p>
      <p data-testid="total-pages">{totalPages}</p>
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
  it("restarts from the refreshed first page when its cursor changes so rows are not skipped", async () => {
    const user = userEvent.setup();
    let inserted = false;
    const loadPage = vi.fn(async (cursor: string | null): Promise<CursorPageResult<string>> => {
      if (cursor === null) {
        return inserted
          ? { items: ["New", "First"], nextCursor: "after_first", totalPages: 3 }
          : { items: ["First", "Second"], nextCursor: "after_second", totalPages: 2 };
      }
      return cursor === "after_first"
        ? { items: ["Second", "Third"], nextCursor: "after_third" }
        : { items: ["Third", "Fourth"], nextCursor: null };
    });
    render(<PaginationHarness loadPage={loadPage} />);
    await screen.findByText("First");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Third");
    inserted = true;
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(screen.getByTestId("loading-state")).toHaveTextContent("idle"));
    expect(screen.getByTestId("page-number")).toHaveTextContent("1");
    expect(screen.getByText("New")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Second")).toBeInTheDocument();
    expect(screen.getByText("Third")).toBeInTheDocument();
    expect(loadPage).toHaveBeenLastCalledWith("after_first");
  });

  it("keeps the last populated page reachable when remaining rows disappear", async () => {
    const user = userEvent.setup();
    const loadPage = vi
      .fn<(cursor: string | null) => Promise<CursorPageResult<string>>>()
      .mockResolvedValueOnce({ items: ["First"], nextCursor: "next", totalPages: 2 })
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    render(<PaginationHarness loadPage={loadPage} />);
    await screen.findByText("First");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByTestId("loading-state")).toHaveTextContent("idle"));
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByTestId("page-number")).toHaveTextContent("1");
    expect(screen.getByTestId("total-pages")).toHaveTextContent("1");
    expect(screen.getByTestId("next-page-available")).toHaveTextContent("false");
  });
  it("keeps the current page on refresh when the first-page cursor is stable", async () => {
    const user = userEvent.setup();
    const loadPage = vi
      .fn<(cursor: string | null) => Promise<CursorPageResult<string>>>()
      .mockResolvedValueOnce({ items: ["First"], nextCursor: "next", totalPages: 2 })
      .mockResolvedValueOnce({ items: ["Second"], nextCursor: null })
      .mockImplementation(async (cursor) =>
        cursor === null
          ? { items: ["First refreshed"], nextCursor: "next", totalPages: 3 }
          : { items: ["Second refreshed"], nextCursor: "last" }
      );
    render(<PaginationHarness loadPage={loadPage} />);
    await screen.findByText("First");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Second");
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("Second refreshed")).toBeInTheDocument();
    expect(screen.getByTestId("page-number")).toHaveTextContent("2");
    expect(screen.getByTestId("total-pages")).toHaveTextContent("3");
    expect(screen.getByTestId("next-page-available")).toHaveTextContent("true");
  });
  it("refreshes the total and returns to the first page if the current page disappears", async () => {
    const user = userEvent.setup();
    const loadPage = vi
      .fn<(cursor: string | null) => Promise<CursorPageResult<string>>>()
      .mockResolvedValueOnce({ items: ["First"], nextCursor: "next", totalPages: 2 })
      .mockResolvedValueOnce({ items: ["Second"], nextCursor: null })
      .mockImplementation(async (cursor) =>
        cursor === null
          ? { items: ["Remaining"], nextCursor: null, totalPages: 1 }
          : { items: [], nextCursor: null }
      );
    render(<PaginationHarness loadPage={loadPage} />);
    await screen.findByText("First");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Second");
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("Remaining")).toBeInTheDocument();
    expect(screen.getByTestId("page-number")).toHaveTextContent("1");
    expect(screen.getByTestId("total-pages")).toHaveTextContent("1");
  });
  it.each(["Next", "Refresh"])(
    "ignores an old %s response after the filter changes",
    async (action) => {
      const user = userEvent.setup();
      let finishOldRequest!: (page: CursorPageResult<string>) => void;
      const oldRequest = new Promise<CursorPageResult<string>>((resolve) => {
        finishOldRequest = resolve;
      });
      const loadPage = vi
        .fn<(cursor: string | null) => Promise<CursorPageResult<string>>>()
        .mockResolvedValueOnce({ items: ["Old first"], nextCursor: "old_next", totalPages: 5 })
        .mockReturnValueOnce(oldRequest)
        .mockResolvedValueOnce({ items: ["New filter"], nextCursor: null, totalPages: 1 });
      const view = render(<PaginationHarness loadPage={loadPage} filter="old" />);
      await screen.findByText("Old first");
      await user.click(screen.getByRole("button", { name: action }));
      view.rerender(<PaginationHarness loadPage={loadPage} filter="new" />);
      await screen.findByText("New filter");
      await act(async () =>
        finishOldRequest({ items: ["Stale result"], nextCursor: null, totalPages: 5 })
      );
      expect(screen.getByText("New filter")).toBeInTheDocument();
      expect(screen.queryByText("Stale result")).not.toBeInTheDocument();
      expect(screen.getByTestId("page-number")).toHaveTextContent("1");
      expect(screen.getByTestId("total-pages")).toHaveTextContent("1");
    }
  );

  it("keeps the first-page total while later cursor responses omit it", async () => {
    const user = userEvent.setup();
    const loadPage = vi
      .fn<(cursor: string | null) => Promise<CursorPageResult<string>>>()
      .mockResolvedValueOnce({ items: ["First"], nextCursor: "cursor_2", totalPages: 2 })
      .mockResolvedValueOnce({ items: ["Second"], nextCursor: null });

    render(<PaginationHarness loadPage={loadPage} />);
    expect(await screen.findByText("First")).toBeInTheDocument();
    expect(screen.getByTestId("total-pages")).toHaveTextContent("2");

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Second")).toBeInTheDocument();
    expect(screen.getByTestId("page-number")).toHaveTextContent("2");
    expect(screen.getByTestId("total-pages")).toHaveTextContent("2");
  });

  it("does not offer a phantom next page when a legacy cursor reaches the exact total", async () => {
    const loadPage = vi
      .fn<(cursor: string | null) => Promise<CursorPageResult<string>>>()
      .mockResolvedValue({ items: ["Only page"], nextCursor: "stale_cursor", totalPages: 1 });

    render(<PaginationHarness loadPage={loadPage} />);
    expect(await screen.findByText("Only page")).toBeInTheDocument();
    expect(screen.getByTestId("next-page-available")).toHaveTextContent("false");
  });

  it("shows an error toast and clears loading when the first page request fails", async () => {
    const showErrorToast = vi.spyOn(notify, "showErrorToast").mockImplementation(() => undefined);
    const loadPage = vi
      .fn<(cursor: string | null) => Promise<CursorPageResult<string>>>()
      .mockRejectedValue(new Error("boom"));

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
        nextCursor: "cursor_2",
        totalPages: 2
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
    expect(screen.getByTestId("total-pages")).toHaveTextContent("2");
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
