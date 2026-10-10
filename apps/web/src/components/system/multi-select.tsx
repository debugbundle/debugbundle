import { ChevronDownIcon } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "../ui/button.js";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../ui/dropdown-menu.js";
import { Input } from "../ui/input.js";

export type MultiSelectOption = { value: string; label: string; disabled?: boolean };

/** Controlled selections retain unloaded values; searching never changes the selection. */
export function MultiSelect({
  id,
  label,
  value,
  options,
  onValueChange,
  placeholder = "Select options",
  disabled = false,
  loadMore
}: {
  id: string;
  label: string;
  value: string[];
  options: MultiSelectOption[];
  onValueChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  loadMore?: { label: string; onLoadMore: () => void } | undefined;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedLabel =
    value.length === 1
      ? (options.find((option) => option.value === value[0])?.label ?? "1 selected")
      : `${value.length} selected`;
  const summary = value.length === 0 ? placeholder : selectedLabel;
  const matches = options.filter((option) =>
    option.label.toLowerCase().includes(search.trim().toLowerCase())
  );
  return (
    <DropdownMenu
      modal={false}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className="w-full min-w-0 justify-between"
          disabled={disabled}
          aria-label={`${label}: ${summary}`}
        >
          <span className="truncate">{summary}</span>
          <ChevronDownIcon data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        ref={menuRef}
        align="start"
        aria-label={label}
        aria-busy={disabled}
        onFocus={(event) => {
          // Redirect Radix's initial menu focus to search without moving focus from items.
          if (event.target === event.currentTarget) {
            event.preventDefault();
            searchRef.current?.focus();
          }
        }}
      >
        <div className="p-1">
          <Input
            ref={searchRef}
            id={searchId}
            type="search"
            aria-label={`Search ${label}`}
            placeholder="Search…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              // Search is outside the roving-focus items; arrows explicitly enter the menu.
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                event.stopPropagation();
                const items = menuRef.current?.querySelectorAll<HTMLElement>(
                  '[role="menuitemcheckbox"]:not([data-disabled]), [role="menuitem"]:not([data-disabled])'
                );
                items?.[event.key === "ArrowDown" ? 0 : items.length - 1]?.focus();
              } else if (!["Escape", "Tab"].includes(event.key)) {
                // Typed text belongs to search rather than Radix's item typeahead.
                event.stopPropagation();
              }
            }}
          />
        </div>
        <DropdownMenuGroup className="max-h-60 overflow-y-auto">
          {matches.length === 0 ? (
            <DropdownMenuLabel>No matches</DropdownMenuLabel>
          ) : (
            matches.map((option) => (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={value.includes(option.value)}
                disabled={disabled || option.disabled === true}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={(checked) =>
                  onValueChange(
                    checked
                      ? [...value, option.value]
                      : value.filter((selected) => selected !== option.value)
                  )
                }
              >
                <span className="truncate">{option.label}</span>
              </DropdownMenuCheckboxItem>
            ))
          )}
        </DropdownMenuGroup>
        {loadMore ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                disabled={disabled}
                onSelect={(event) => {
                  event.preventDefault();
                  // Keep focus on a stable element when pagination removes this menu item.
                  searchRef.current?.focus();
                  loadMore.onLoadMore();
                }}
              >
                {loadMore.label}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
