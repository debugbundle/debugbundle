import { useEffect, useRef, useState } from "react";

import { showErrorToast } from "./notify.js";
import { isInvalidSessionError } from "./api-client.js";

export interface CursorPageResult<TItem> {
  items: TItem[];
  nextCursor: string | null;
  totalPages?: number | undefined;
  totalCount?: number | undefined;
}

interface CachedCursorPage<TItem> {
  items: TItem[];
  nextCursor: string | null;
  totalPages?: number | undefined;
  totalCount?: number | undefined;
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
  totalPages: number;
  totalCount: number | null;
  hasNextPage: boolean;
  goToNextPage: () => Promise<void>;
  goToPreviousPage: () => void;
  refreshPage: (mode?: "foreground" | "background") => Promise<void>;
} {
  const [pages, setPages] = useState<CachedCursorPage<TItem>[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const dependencySignature = JSON.stringify(dependencies);
  const generation = useRef(0);
  const pending = useRef<"foreground" | "background" | null>(null);

  useEffect(() => {
    let isCancelled = false;
    generation.current += 1;
    pending.current = "foreground";

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
          pending.current = null;
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isCancelled = true;
      generation.current += 1;
    };
  }, [dependencySignature]);

  const currentPage = pages[pageIndex];

  async function goToNextPage(): Promise<void> {
    if (
      currentPage === undefined ||
      currentPage.nextCursor === null ||
      pageIndex + 1 >= (pages[0]?.totalPages ?? Number.POSITIVE_INFINITY) ||
      pending.current === "foreground"
    ) {
      return;
    }

    // Explicit navigation takes priority over an in-flight background refresh.
    const requestGeneration = ++generation.current;
    if (pages[pageIndex + 1] !== undefined) {
      pending.current = null;
      setPageIndex((current) => current + 1);
      return;
    }

    pending.current = "foreground";
    setIsLoading(true);

    try {
      const nextPage = await loadPage(currentPage.nextCursor);
      if (generation.current !== requestGeneration) return;
      if (nextPage.items.length === 0 && nextPage.nextCursor === null) {
        setPages((current) =>
          current.map((page, index) => ({
            ...page,
            ...(index === 0 ? { totalPages: pageIndex + 1 } : {}),
            ...(index === pageIndex ? { nextCursor: null } : {})
          }))
        );
      } else {
        setPages((current) =>
          [...current, nextPage].map((page, index) =>
            index === 0 && nextPage.nextCursor === null
              ? { ...page, totalPages: pageIndex + 2 }
              : page
          )
        );
        setPageIndex((current) => current + 1);
      }
      setHasError(false);
    } catch {
      if (generation.current !== requestGeneration) return;
      setHasError(true);
      showErrorToast("Could not load the next page.");
    } finally {
      if (generation.current === requestGeneration) {
        pending.current = null;
        setIsLoading(false);
      }
    }
  }

  function goToPreviousPage(): void {
    if (pending.current === "foreground" || pageIndex === 0) return;
    generation.current += 1;
    pending.current = null;
    setPageIndex((current) => Math.max(0, current - 1));
  }

  async function refreshPage(mode: "foreground" | "background" = "foreground"): Promise<void> {
    if (
      pending.current === "foreground" ||
      (pending.current === "background" && mode === "background")
    ) {
      return;
    }

    const cursor = pageIndex === 0 ? null : (pages[pageIndex - 1]?.nextCursor ?? null);

    const requestGeneration = ++generation.current;
    pending.current = mode;
    if (mode === "foreground") setIsLoading(true);

    try {
      const [firstPage, refreshedPage] =
        cursor === null
          ? await loadPage(null).then((page) => [page, page] as const)
          : await Promise.all([loadPage(null), loadPage(cursor)]);
      if (generation.current !== requestGeneration) return;
      // A changed first-page boundary invalidates the cached cursor chain.
      const firstPageBoundaryChanged =
        pageIndex > 0 && firstPage.nextCursor !== pages[0]?.nextCursor;
      if (
        firstPageBoundaryChanged ||
        refreshedPage.items.length === 0 ||
        pageIndex >= (firstPage.totalPages ?? Infinity)
      ) {
        setPages([firstPage]);
        setPageIndex(0);
      } else {
        setPages((current) => {
          const refreshed = [...current.slice(0, pageIndex), refreshedPage];
          refreshed[0] = firstPage;
          return refreshed;
        });
      }
      setHasError(false);
    } catch (error) {
      if (generation.current !== requestGeneration || mode === "background") return;
      setHasError(true);
      if (!isInvalidSessionError(error)) showErrorToast("Could not refresh the current page.");
    } finally {
      if (generation.current === requestGeneration) {
        pending.current = null;
        if (mode === "foreground") setIsLoading(false);
      }
    }
  }

  return {
    items: currentPage?.items ?? null,
    isLoading,
    hasError,
    totalCount: hasError
      ? null
      : (pages[0]?.totalCount ?? (pages[0]?.nextCursor === null ? pages[0].items.length : null)),
    page: pageIndex + 1,
    totalPages: Math.max(
      pageIndex + 1,
      pages[0]?.totalPages ?? pages.length + (pages.at(-1)?.nextCursor === null ? 0 : 1)
    ),
    hasNextPage:
      currentPage !== undefined &&
      currentPage.nextCursor !== null &&
      pageIndex + 1 < (pages[0]?.totalPages ?? Number.POSITIVE_INFINITY),
    goToNextPage,
    goToPreviousPage,
    refreshPage
  };
}
