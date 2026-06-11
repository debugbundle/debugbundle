import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "../ui/pagination.js";

export interface CursorPaginationControlsProps {
  page: number;
  hasNextPage: boolean;
  isLoading: boolean;
  onPreviousPage: () => void;
  onNextPage: () => void;
}

export function CursorPaginationControls({
  page,
  hasNextPage,
  isLoading,
  onPreviousPage,
  onNextPage
}: CursorPaginationControlsProps): JSX.Element | null {
  if (page === 1 && !hasNextPage) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-t pt-4">
      <p className="text-sm text-muted-foreground">Page {page}</p>
      <Pagination className="mx-0 ml-auto w-auto shrink-0 justify-end">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious type="button" onClick={onPreviousPage} disabled={page === 1 || isLoading} />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext type="button" onClick={onNextPage} disabled={!hasNextPage || isLoading} />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
