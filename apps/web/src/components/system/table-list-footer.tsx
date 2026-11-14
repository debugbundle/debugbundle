import type { ReactNode } from "react";
import { cn } from "../../lib/utils.js";
import { CardFooter } from "../ui/card.js";
import { Field, FieldLabel } from "../ui/field.js";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../ui/select.js";

export function TableListFooter({
  id,
  value,
  onChange,
  ariaLabel,
  disabled = false,
  className,
  children
}: {
  id: string;
  value: number;
  onChange: (value: number) => void;
  ariaLabel: string;
  disabled?: boolean;
  className?: string | undefined;
  children?: ReactNode;
}): JSX.Element {
  return (
    <CardFooter
      className={cn(
        "flex-col items-end gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-4",
        className
      )}
    >
      <Field orientation="horizontal" className="w-auto" data-disabled={disabled || undefined}>
        <FieldLabel htmlFor={id} className="whitespace-nowrap">
          Rows per page
        </FieldLabel>
        <Select
          value={String(value)}
          onValueChange={(next) => onChange(Number(next))}
          disabled={disabled}
        >
          <SelectTrigger id={id} aria-label={ariaLabel} className="w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" side="top" align="end">
            <SelectGroup>
              {[10, 20, 50, 100].map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      {children == null ? null : (
        <div className="flex max-w-full flex-wrap items-center justify-end gap-3 empty:hidden">
          {children}
        </div>
      )}
    </CardFooter>
  );
}
