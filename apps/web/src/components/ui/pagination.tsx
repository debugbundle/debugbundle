import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from "lucide-react";

import { cn } from "../../lib/utils.js";
import { Button, buttonVariants } from "./button.js";

function Pagination({ className, ...props }: React.ComponentProps<"nav">): JSX.Element {
  return <nav aria-label="Pagination" className={cn("mx-auto flex w-full justify-center", className)} {...props} />;
}

function PaginationContent({ className, ...props }: React.ComponentProps<"ul">): JSX.Element {
  return <ul className={cn("flex flex-row items-center gap-1", className)} {...props} />;
}

function PaginationItem(props: React.ComponentProps<"li">): JSX.Element {
  return <li {...props} />;
}

function PaginationLink({ className, isActive, size = "icon", ...props }: React.ComponentProps<"button"> & { isActive?: boolean; size?: React.ComponentProps<typeof Button>["size"] }): JSX.Element {
  return (
    <button
      aria-current={isActive ? "page" : undefined}
      className={cn(buttonVariants({ variant: isActive ? "outline" : "ghost", size }), className)}
      {...props}
    />
  );
}

function PaginationPrevious({ className, children = "Previous", ...props }: React.ComponentProps<typeof PaginationLink>): JSX.Element {
  return (
    <PaginationLink aria-label="Go to previous page" size="default" className={cn("gap-1 px-2.5 sm:pl-2.5", className)} {...props}>
      <ChevronLeftIcon data-icon="inline-start" />
      <span>{children}</span>
    </PaginationLink>
  );
}

function PaginationNext({ className, children = "Next", ...props }: React.ComponentProps<typeof PaginationLink>): JSX.Element {
  return (
    <PaginationLink aria-label="Go to next page" size="default" className={cn("gap-1 px-2.5 sm:pr-2.5", className)} {...props}>
      <span>{children}</span>
      <ChevronRightIcon data-icon="inline-end" />
    </PaginationLink>
  );
}

function PaginationEllipsis({ className, ...props }: React.ComponentProps<"span">): JSX.Element {
  return (
    <span aria-hidden className={cn("flex size-9 items-center justify-center", className)} {...props}>
      <MoreHorizontalIcon />
      <span className="sr-only">More pages</span>
    </span>
  );
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
};