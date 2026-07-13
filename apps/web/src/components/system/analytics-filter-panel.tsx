import { ListFilterIcon, XIcon } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { useIsMobile } from "../../hooks/use-mobile.js";
import { cn } from "../../lib/utils.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger
} from "../ui/popover.js";
import { Separator } from "../ui/separator.js";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "../ui/sheet.js";

export interface AppliedAnalyticsFilter {
  key: string;
  label: string;
  onRemove: () => void;
}

export function AnalyticsFilterPanel({
  triggerLabel,
  title,
  description,
  activeFilterCount,
  scrollable = false,
  desktopSize = "default",
  onApply,
  onReset,
  onDismiss,
  children
}: {
  triggerLabel: string;
  title: string;
  description: string;
  activeFilterCount: number;
  scrollable?: boolean;
  desktopSize?: "default" | "wide";
  onApply: () => void;
  onReset: () => void;
  onDismiss: () => void;
  children: ReactNode;
}): JSX.Element {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  function applyFilters(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onApply();
    setOpen(false);
  }

  function resetFilters(): void {
    onReset();
    setOpen(false);
  }

  function changeOpen(nextOpen: boolean): void {
    if (open && !nextOpen) onDismiss();
    setOpen(nextOpen);
  }

  const trigger = (
    <Button type="button" variant="outline" className="w-fit">
      <ListFilterIcon data-icon="inline-start" />
      {triggerLabel}
      {activeFilterCount > 0 ? (
        <Badge variant="secondary" aria-label={`${activeFilterCount} active filters`}>
          {activeFilterCount}
        </Badge>
      ) : null}
    </Button>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={changeOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="right" className="w-full gap-0">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={applyFilters}>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
            <Separator />
            <SheetFooter>
              <Button type="submit">Apply filters</Button>
              <Button type="button" variant="outline" onClick={resetFilters}>
                Reset filters
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        role="dialog"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        align="end"
        className={cn("p-0", desktopSize === "wide" ? "w-[min(48rem,calc(100vw-2rem))]" : "w-96")}
      >
        <form
          className={cn("flex flex-col", scrollable && "max-h-[min(42rem,calc(100vh-2rem))]")}
          onSubmit={applyFilters}
        >
          <PopoverHeader className="shrink-0 p-4">
            <PopoverTitle id={titleId}>{title}</PopoverTitle>
            <PopoverDescription id={descriptionId}>{description}</PopoverDescription>
          </PopoverHeader>
          <div className={cn("px-4 pb-4", scrollable && "min-h-0 overflow-y-auto")}>{children}</div>
          <Separator />
          <div className="flex shrink-0 justify-end gap-2 p-4">
            <Button type="button" variant="outline" onClick={resetFilters}>
              Reset
            </Button>
            <Button type="submit">Apply filters</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export function AppliedAnalyticsFilterList({
  filters,
  className
}: {
  filters: AppliedAnalyticsFilter[];
  className?: string;
}): JSX.Element | null {
  if (filters.length === 0) return null;

  return (
    <div
      className={cn("flex min-w-0 flex-wrap items-center justify-start gap-2", className)}
      aria-label="Applied filters"
    >
      {filters.map((filter) => (
        <Button
          key={filter.key}
          type="button"
          variant="outline"
          size="xs"
          className="max-w-full"
          aria-label={`Remove ${filter.label} filter`}
          onClick={filter.onRemove}
        >
          <span className="truncate">{filter.label}</span>
          <XIcon data-icon="inline-end" />
        </Button>
      ))}
    </div>
  );
}
