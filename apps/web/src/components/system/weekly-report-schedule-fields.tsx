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
import { dayOptions, hourOptions } from "../../lib/weekly-report-form.js";
import type { WeeklyReportChannelRecord } from "../../lib/api.js";
type Schedule = WeeklyReportChannelRecord["schedule"];
export function WeeklyReportScheduleFields({
  id,
  value,
  disabled,
  onChange
}: {
  id: string;
  value: Schedule;
  disabled: boolean;
  onChange: (value: Schedule) => void;
}): JSX.Element {
  return (
    <>
      <FieldGroupSchedule id={id} value={value} disabled={disabled} onChange={onChange} />
      <Field>
        <FieldLabel htmlFor={`${id}-timezone`}>Timezone</FieldLabel>
        <Input
          id={`${id}-timezone`}
          value={value.timezone}
          disabled={disabled}
          required
          placeholder="UTC"
          onChange={(event) => onChange({ ...value, timezone: event.currentTarget.value })}
        />
        <FieldDescription>
          Use an IANA timezone such as UTC, Europe/Ljubljana, or America/New_York.
        </FieldDescription>
      </Field>
    </>
  );
}
function FieldGroupSchedule({
  id,
  value,
  disabled,
  onChange
}: {
  id: string;
  value: Schedule;
  disabled: boolean;
  onChange: (value: Schedule) => void;
}): JSX.Element {
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_0.75fr]">
      <Field>
        <FieldLabel id={`${id}-day-label`} htmlFor={`${id}-day`}>
          Day
        </FieldLabel>
        <Select
          value={value.day_of_week}
          disabled={disabled}
          onValueChange={(day) =>
            onChange({ ...value, day_of_week: day as Schedule["day_of_week"] })
          }
        >
          <SelectTrigger
            id={`${id}-day`}
            aria-labelledby={`${id}-day-label ${id}-day`}
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectGroup>
              {dayOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel id={`${id}-hour-label`} htmlFor={`${id}-hour`}>
          Hour
        </FieldLabel>
        <Select
          value={String(value.hour_of_day)}
          disabled={disabled}
          onValueChange={(hour) => onChange({ ...value, hour_of_day: Number(hour) })}
        >
          <SelectTrigger
            id={`${id}-hour`}
            aria-labelledby={`${id}-hour-label ${id}-hour`}
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectGroup>
              {hourOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}
