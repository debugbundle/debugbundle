import { useEffect, useState } from "react";

import { showErrorToast } from "./notify.js";

export interface CursorPageResult<TItem> {
  items: TItem[];
  nextCursor: string | null;
}

interface CachedCursorPage<TItem> {
  items: TItem[];
  nextCursor: string | null;
}

const EMPTY_PAGE: CachedCursorPage<never> = {
  items: [],
  nextCursor: null
};

export function useCursorPagination<TItem>(
  loadPage: (cursor: string | null) => Promise<CursorPageResult<TItem>>,
  dependencies: ReadonlyArray<unknown>
): {
  items: TItem[] | null;
  isLoading: boolean;
  hasError: boolean;
  page: number;
  hasNextPage: boolean;
  goToNextPage: () => Promise<void>;
  goToPreviousPage: () => void;
  refreshPage: () => Promise<void>;
} {
  const [pages, setPages] = useState<CachedCursorPage<TItem>[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const dependencySignature = JSON.stringify(dependencies);

  useEffect(() => {
    let isCancelled = false;

    setPages([]);
    setPageIndex(0);
    setIsLoading(true);
    setHasError(false);

    void (async () => {
      try {
        const firstPage = await loadPage(null);

        if (!isCancelled) {
          setPages([firstPage]);
          setPageIndex(0);
          setHasError(false);
        }
      } catch {
        if (!isCancelled) {
          setPages([EMPTY_PAGE as CachedCursorPage<TItem>]);
          setHasError(true);
          showErrorToast("Could not load the current page.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [dependencySignature]);

  const currentPage = pages[pageIndex];

  async function goToNextPage(): Promise<void> {
    if (currentPage === undefined || currentPage.nextCursor === null || isLoading) {
      return;
    }

    if (pages[pageIndex + 1] !== undefined) {
      setPageIndex((current) => current + 1);
      return;
    }

    setIsLoading(true);

    try {
      const nextPage = await loadPage(currentPage.nextCursor);
      setPages((current) => [...current, nextPage]);
      setPageIndex((current) => current + 1);
      setHasError(false);
    } catch {
      setHasError(true);
      showErrorToast("Could not load the next page.");
    } finally {
      setIsLoading(false);
    }
  }

  function goToPreviousPage(): void {
    setPageIndex((current) => Math.max(0, current - 1));
  }

  async function refreshPage(): Promise<void> {
    if (isLoading) {
      return;
    }

    const cursor = pageIndex === 0 ? null : pages[pageIndex - 1]?.nextCursor ?? null;

    setIsLoading(true);

    try {
      const refreshedPage = await loadPage(cursor);
      setPages((current) => [...current.slice(0, pageIndex), refreshedPage]);
      setHasError(false);
    } catch {
      setHasError(true);
      showErrorToast("Could not refresh the current page.");
    } finally {
      setIsLoading(false);
    }
  }

  return {
    items: currentPage?.items ?? null,
    isLoading,
    hasError,
    page: pageIndex + 1,
    hasNextPage: currentPage !== undefined && currentPage.nextCursor !== null,
    goToNextPage,
    goToPreviousPage,
    refreshPage
  };
}
