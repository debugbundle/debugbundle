import { useEffect, useMemo, useState } from "react";

import { Button } from "../ui/button.js";

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
    setSelectedIds((current) => current.filter((id) => visibleIdSet.has(id)));
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
      setSelectedIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
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
  totalCount: number;
  selectedCount: number;
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
}): JSX.Element {
  const {
    itemLabel,
    totalCount,
    selectedCount,
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

  const hasItems = totalCount > 0;
  const hasSelection = selectedCount > 0;
  const itemLabelPlural = `${itemLabel}${itemLabel === "improvement" || itemLabel.endsWith("s") ? "s" : "s"}`;

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <p className="text-sm text-muted-foreground">
          {hasSelection
            ? `${selectedCount} ${itemLabel}${selectedCount === 1 ? "" : "s"} selected on this page.`
            : `Select ${itemLabelPlural} on this page to apply a bulk action.`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {!allSelected && hasItems ? (
            <Button type="button" variant="ghost" size="sm" disabled={isBusy} onClick={onToggleSelectAll}>
              {`Select all visible ${itemLabelPlural}`}
            </Button>
          ) : null}
          {hasSelection ? (
            <Button type="button" variant="ghost" size="sm" disabled={isBusy} onClick={onClearSelection}>
              Clear selection
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={primaryActionDisabled || isBusy} onClick={onPrimaryAction}>
          {primaryActionLabel}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={secondaryActionDisabled || isBusy} onClick={onSecondaryAction}>
          {secondaryActionLabel}
        </Button>
      </div>
    </div>
  );
}

export function StickyMobileTableActions(input: {
  selectedCount: number;
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

  if (selectedCount === 0) {
    return null;
  }

  return (
    <div
      className="fixed inset-x-4 z-40 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur sm:hidden"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground">{selectedCount} selected</p>
        <div className="flex items-center gap-2">
          {!allSelected && totalCount > 0 ? (
            <Button type="button" variant="ghost" size="sm" disabled={isBusy} onClick={onToggleSelectAll}>
              Select all
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="sm" disabled={isBusy} onClick={onClearSelection}>
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
