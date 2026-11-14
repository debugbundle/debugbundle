import { cn } from "../../lib/utils.js";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious
} from "../ui/pagination.js";

export interface CursorPaginationControlsProps {
  page: number;
  totalPages: number;
  hasNextPage: boolean;
  isLoading: boolean;
  onPreviousPage: () => void;
  onNextPage: () => void;
  embedded?: boolean;
}

export function CursorPaginationControls({
  page,
  totalPages,
  hasNextPage,
  isLoading,
  onPreviousPage,
  onNextPage,
  embedded = false
}: CursorPaginationControlsProps): JSX.Element | null {
  if (page === 1 && !hasNextPage) {
    return null;
  }

  const controls = (
    <>
      <p className="text-sm text-muted-foreground whitespace-nowrap">
        Page {page} of {totalPages}
      </p>
      <Pagination className={cn("mx-0 w-auto shrink-0 justify-end", !embedded && "ml-auto")}>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              compactOnMobile={embedded}
              type="button"
              onClick={onPreviousPage}
              disabled={page === 1 || isLoading}
            />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext
              compactOnMobile={embedded}
              type="button"
              onClick={onNextPage}
              disabled={!hasNextPage || isLoading}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </>
  );
  return embedded ? (
    controls
  ) : (
    <div className="flex flex-wrap items-center gap-3 border-t pt-4">{controls}</div>
  );
}
