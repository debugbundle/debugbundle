import { ArrowDownIcon, ArrowUpIcon, ArrowUpDownIcon } from "lucide-react";

import { Button } from "../ui/button.js";
import { TableHead } from "../ui/table.js";

export type SortDirection = "asc" | "desc";
export type SortableTableHeadAlignment = "left" | "right";

export interface SortState<TField extends string> {
  field: TField;
  direction: SortDirection;
}

export interface SortableTableHeadProps<TField extends string> {
  label: string;
  field: TField;
  sort: SortState<TField>;
  onSortChange: (field: TField) => void;
  className?: string;
  align?: SortableTableHeadAlignment;
}

export function SortableTableHead<TField extends string>({
  label,
  field,
  sort,
  onSortChange,
  className,
  align = "left",
}: SortableTableHeadProps<TField>): JSX.Element {
  const isActive = sort.field === field;
  const Icon = !isActive ? ArrowUpDownIcon : sort.direction === "asc" ? ArrowUpIcon : ArrowDownIcon;
  const isRightAligned = align === "right";

  return (
    <TableHead className={className}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={
          isRightAligned
            ? "-mr-2 ml-auto h-8 px-2 font-medium text-foreground hover:bg-muted"
            : "-ml-2 h-8 px-2 text-left font-medium text-foreground hover:bg-muted"
        }
        onClick={() => onSortChange(field)}
      >
        {isRightAligned ? (
          <>
            <Icon />
            {label}
          </>
        ) : (
          <>
            {label}
            <Icon data-icon="inline-end" />
          </>
        )}
      </Button>
    </TableHead>
  );
}

export function toggleSort<TField extends string>(current: SortState<TField>, field: TField): SortState<TField> {
  if (current.field !== field) {
    return {
      field,
      direction: "asc"
    };
  }

  return {
    field,
    direction: current.direction === "asc" ? "desc" : "asc"
  };
}