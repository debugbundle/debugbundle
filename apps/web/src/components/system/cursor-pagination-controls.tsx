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
}: CursorPaginationControlsProps): JSX.Element {
  return (
    <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">Page {page}</p>
      <Pagination className="mx-0 w-auto justify-start sm:justify-end">
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