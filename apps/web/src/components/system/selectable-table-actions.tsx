import { useCallback, useEffect, useMemo, useState, type RefCallback } from "react";

import { Button } from "../ui/button.js";
import { Checkbox } from "../ui/checkbox.js";
import { cn } from "../../lib/utils.js";

// The following text cell adds px-2; pl-3/pr-1 keeps a compact, balanced inset.
export const tableSelectionCellClassName = "w-8 pl-3 pr-1";

function useTableActionFocus(targetId: string | undefined): RefCallback<HTMLDivElement> {
  return useCallback(
    (node) => {
      if (node === null) return;
      // Ref cleanup runs before removal. Leave focus alone when a row/filter owns it.
      return () => {
        if (targetId && node.contains(document.activeElement))
          document.getElementById(targetId)?.focus();
      };
    },
    [targetId]
  );
}

/** Shared table selection keeps pointer/keyboard changes separate from row navigation. */
export function TableSelectionCheckbox({
  label,
  checked,
  onToggle
}: {
  label: string;
  checked: boolean | "indeterminate";
  onToggle: () => void;
}): JSX.Element {
  return (
    <Checkbox
      aria-label={label}
      className="mx-auto block"
      checked={checked}
      onCheckedChange={onToggle}
      onClick={(event) => {
        event.stopPropagation();
        // Clearing the conditional header removes it; keep keyboard focus in the table.
        if (checked === true && event.currentTarget.closest("thead"))
          event.currentTarget
            .closest("table")
            ?.querySelector<HTMLElement>("tbody [data-slot='checkbox']")
            ?.focus();
      }}
    />
  );
}

export function TableSelectAllCheckbox({
  label,
  ids,
  selectedIds,
  onToggle
}: {
  label: string;
  ids: string[];
  selectedIds: Set<string>;
  onToggle: () => void;
}): JSX.Element | null {
  const count = ids.filter((id) => selectedIds.has(id)).length;
  // Selection controls appear after the first row selection, including in the header.
  if (count === 0) return null;
  return (
    <TableSelectionCheckbox
      label={label}
      checked={count === ids.length ? true : "indeterminate"}
      onToggle={onToggle}
    />
  );
}

const INTERACTIVE_ROW_SELECTOR = [
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "[role='button']",
  "[role='link']",
  "[role='checkbox']",
  "[data-row-interactive='true']"
].join(",");

export function shouldIgnoreTableRowActivation(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(INTERACTIVE_ROW_SELECTOR) !== null;
}

export function useVisibleRowSelection(ids: string[]): {
  allSelected: boolean;
  selectedCount: number;
  selectedIdSet: Set<string>;
  clearSelection: () => void;
  toggleId: (id: string) => void;
  toggleSelectAll: () => void;
} {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const idsKey = ids.join("|");

  useEffect(() => {
    const visibleIdSet = new Set(ids);
    setSelectedIds((current) => {
      const retained = current.filter((id) => visibleIdSet.has(id));
      return retained.length === current.length ? current : retained;
    });
  }, [ids, idsKey]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = ids.length > 0 && ids.every((id) => selectedIdSet.has(id));

  return {
    allSelected,
    selectedCount: selectedIds.length,
    selectedIdSet,
    clearSelection: () => {
      setSelectedIds([]);
    },
    toggleId: (id) => {
      setSelectedIds((current) =>
        current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
      );
    },
    toggleSelectAll: () => {
      setSelectedIds((current) => {
        const currentSelection = new Set(current);
        const nextAllSelected = ids.length > 0 && ids.every((id) => currentSelection.has(id));
        return nextAllSelected ? [] : [...ids];
      });
    }
  };
}

export function SelectableTableActions(input: {
  itemLabel: string;
  focusTargetId?: string;
  selectedCount: number;
  className?: string;
  isBusy?: boolean;
  primaryActionLabel: string;
  secondaryActionLabel: string;
  primaryActionDisabled?: boolean;
  secondaryActionDisabled?: boolean;
  onPrimaryAction: () => void;
  onSecondaryAction: () => void;
}): JSX.Element | null {
  const {
    itemLabel,
    focusTargetId,
    selectedCount,
    className,
    isBusy = false,
    primaryActionLabel,
    secondaryActionLabel,
    primaryActionDisabled = false,
    secondaryActionDisabled = false,
    onPrimaryAction,
    onSecondaryAction
  } = input;

  const focusRef = useTableActionFocus(focusTargetId);
  if (selectedCount === 0) return null;

  return (
    <div
      ref={focusRef}
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <p className="text-sm text-muted-foreground">
        {`${selectedCount} ${itemLabel}${selectedCount === 1 ? "" : "s"} selected on this page.`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={primaryActionDisabled || isBusy}
          onClick={onPrimaryAction}
        >
          {primaryActionLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={secondaryActionDisabled || isBusy}
          onClick={onSecondaryAction}
        >
          {secondaryActionLabel}
        </Button>
      </div>
    </div>
  );
}

export function StickyMobileTableActions(input: {
  selectedCount: number;
  focusTargetId?: string;
  totalCount: number;
  allSelected: boolean;
  isBusy?: boolean;
  primaryActionLabel: string;
  secondaryActionLabel: string;
  primaryActionDisabled?: boolean;
  secondaryActionDisabled?: boolean;
  onToggleSelectAll: () => void;
  onClearSelection: () => void;
  onPrimaryAction: () => void;
  onSecondaryAction: () => void;
}): JSX.Element | null {
  const {
    selectedCount,
    focusTargetId,
    totalCount,
    allSelected,
    isBusy = false,
    primaryActionLabel,
    secondaryActionLabel,
    primaryActionDisabled = false,
    secondaryActionDisabled = false,
    onToggleSelectAll,
    onClearSelection,
    onPrimaryAction,
    onSecondaryAction
  } = input;

  const focusRef = useTableActionFocus(focusTargetId);
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div
      ref={focusRef}
      className="fixed inset-x-4 z-40 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur sm:hidden"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground">{selectedCount} selected</p>
        <div className="flex items-center gap-2">
          {!allSelected && totalCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isBusy}
              onClick={onToggleSelectAll}
            >
              Select all
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isBusy}
            onClick={onClearSelection}
          >
            Clear
          </Button>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={primaryActionDisabled || isBusy}
          onClick={onPrimaryAction}
        >
          {primaryActionLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={secondaryActionDisabled || isBusy}
          onClick={onSecondaryAction}
        >
          {secondaryActionLabel}
        </Button>
      </div>
    </div>
  );
}
