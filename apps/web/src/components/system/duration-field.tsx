import { durationToSeconds, DURATION_UNITS, type DurationDraft } from "../../lib/duration-form.js";
import { Field, FieldDescription, FieldLabel } from "../ui/field.js";
import { Input } from "../ui/input.js";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../ui/select.js";

export function DurationField({
  id,
  label,
  value,
  maximum,
  description,
  onChange
}: {
  id: string;
  label: string;
  value: DurationDraft;
  maximum: number;
  description?: string;
  onChange: (value: DurationDraft) => void;
}): JSX.Element {
  const invalid = durationToSeconds(value, maximum) === null;
  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="grid grid-cols-2 gap-3">
        <Input
          id={id}
          type="number"
          min={0}
          step="any"
          value={value.amount}
          required
          aria-invalid={invalid}
          aria-describedby={`${id}-description`}
          onChange={(event) => onChange({ ...value, amount: event.currentTarget.value })}
        />
        <Select
          value={value.unit}
          onValueChange={(unit) => onChange({ ...value, unit: unit as DurationDraft["unit"] })}
        >
          <SelectTrigger aria-label={`${label} unit`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {Object.keys(DURATION_UNITS).map((unit) => (
                <SelectItem key={unit} value={unit}>
                  {unit}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <FieldDescription id={`${id}-description`}>
        {invalid
          ? `Enter a duration between 0 and ${maximum} seconds, in whole seconds.`
          : description}
      </FieldDescription>
    </Field>
  );
}
