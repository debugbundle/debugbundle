import { useEffect, useState } from "react";
import { Button } from "../ui/button.js";
import { Field, FieldDescription, FieldLabel } from "../ui/field.js";
import { Input } from "../ui/input.js";

export function BoundedListLimit({
  id,
  label,
  value,
  onChange,
  disabled = false,
  paginated = false
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  paginated?: boolean;
}): JSX.Element {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const valid = /^\d+$/.test(draft) && Number(draft) >= 1 && Number(draft) <= 100;
  return (
    <Field data-invalid={!valid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex flex-wrap items-center gap-3">
        <Input
          id={id}
          type="number"
          min={1}
          max={100}
          step={1}
          value={draft}
          disabled={disabled}
          aria-invalid={!valid}
          aria-describedby={`${id}-description`}
          onChange={(event) => setDraft(event.currentTarget.value)}
          className="w-24"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!valid || disabled}
          onClick={() => onChange(Number(draft))}
        >
          Apply {label.toLowerCase()}
        </Button>
      </div>
      <FieldDescription id={`${id}-description`}>
        {valid
          ? paginated
            ? `Shows up to ${value} records per page.`
            : `Shows up to ${value} records. Older records may exist beyond this limit.`
          : "Choose a whole number from 1 to 100."}
      </FieldDescription>
    </Field>
  );
}
