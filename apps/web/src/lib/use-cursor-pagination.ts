import { useEffect, useState } from "react";

export interface CursorPageResult<TItem> {
  items: TItem[];
  nextCursor: string | null;
}

interface CachedCursorPage<TItem> {
  items: TItem[];
  nextCursor: string | null;
}

export function useCursorPagination<TItem>(
  loadPage: (cursor: string | null) => Promise<CursorPageResult<TItem>>,
  dependencies: ReadonlyArray<unknown>
): {
  items: TItem[] | null;
  isLoading: boolean;
  page: number;
  hasNextPage: boolean;
  goToNextPage: () => Promise<void>;
  goToPreviousPage: () => void;
} {
  const [pages, setPages] = useState<CachedCursorPage<TItem>[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const dependencySignature = JSON.stringify(dependencies);

  useEffect(() => {
    let isCancelled = false;

    setPages([]);
    setPageIndex(0);
    setIsLoading(true);

    void (async () => {
      const firstPage = await loadPage(null);

      if (!isCancelled) {
        setPages([firstPage]);
        setPageIndex(0);
        setIsLoading(false);
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
    } finally {
      setIsLoading(false);
    }
  }

  function goToPreviousPage(): void {
    setPageIndex((current) => Math.max(0, current - 1));
  }

  return {
    items: currentPage?.items ?? null,
    isLoading,
    page: pageIndex + 1,
    hasNextPage: currentPage !== undefined && currentPage.nextCursor !== null,
    goToNextPage,
    goToPreviousPage
  };
}