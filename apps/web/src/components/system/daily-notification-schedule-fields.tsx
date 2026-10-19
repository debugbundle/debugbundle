import { useState } from "react";
import type { NotificationSchedule } from "../../../../../packages/shared-types/src/notification-preferences.js";
import { hourOptions } from "../../lib/weekly-report-form.js";
import { Button } from "../ui/button.js";
import { Field, FieldDescription, FieldError, FieldLabel } from "../ui/field.js";
import { Input } from "../ui/input.js";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../ui/select.js";

/** Account and project editors share the weekly report's schedule layout and hour choices. */
export function DailyNotificationScheduleFields({
  id,
  value,
  inherit,
  disabled,
  invalid,
  onChange
}: {
  id: string;
  value: NotificationSchedule;
  inherit?: boolean;
  disabled: boolean;
  invalid: boolean;
  onChange: (value: NotificationSchedule | null) => void;
}): JSX.Element {
  const [customSelected, setCustomSelected] = useState(false);
  const custom = customSelected || !/^\d{2}:00$/.test(value.time);
  const scheduleDisabled = disabled || inherit === true;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[1fr_0.75fr]">
        <Field>
          <FieldLabel htmlFor={`${id}-schedule`}>Daily schedule</FieldLabel>
          {inherit === undefined ? (
            <Input id={`${id}-schedule`} value="Every day" readOnly />
          ) : (
            <Select
              value={inherit ? "inherit" : "custom"}
              disabled={disabled}
              onValueChange={(next) => onChange(next === "inherit" ? null : value)}
            >
              <SelectTrigger id={`${id}-schedule`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectGroup>
                  <SelectItem value="inherit">Use account schedule</SelectItem>
                  <SelectItem value="custom">Custom schedule</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field data-invalid={invalid}>
          <FieldLabel htmlFor={`${id}-hour`}>Hour</FieldLabel>
          <Select
            value={custom ? "custom" : value.time}
            disabled={scheduleDisabled}
            onValueChange={(next) => {
              setCustomSelected(next === "custom");
              if (next !== "custom") onChange({ ...value, time: next });
            }}
          >
            <SelectTrigger id={`${id}-hour`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectGroup>
                {hourOptions.map((option) => (
                  <SelectItem key={option.label} value={option.label}>
                    {option.label}
                  </SelectItem>
                ))}
                <SelectItem value="custom">Custom time…</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          {custom && (
            <>
              <FieldLabel htmlFor={`${id}-time`}>Custom time</FieldLabel>
              <Input
                id={`${id}-time`}
                type="time"
                value={value.time}
                aria-invalid={invalid}
                disabled={scheduleDisabled}
                onChange={(event) => onChange({ ...value, time: event.currentTarget.value })}
              />
            </>
          )}
        </Field>
      </div>
      <Field data-invalid={invalid}>
        <FieldLabel htmlFor={`${id}-timezone`}>Timezone</FieldLabel>
        <Input
          id={`${id}-timezone`}
          value={value.timezone}
          placeholder="UTC"
          required
          aria-invalid={invalid}
          disabled={scheduleDisabled}
          onChange={(event) => onChange({ ...value, timezone: event.currentTarget.value })}
        />
        <FieldDescription>
          Use an IANA timezone such as UTC, Europe/Ljubljana, or America/New_York. Daylight-saving
          changes are automatic.
        </FieldDescription>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          disabled={scheduleDisabled}
          onClick={() =>
            onChange({ ...value, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
          }
        >
          Use device time zone
        </Button>
        {invalid && <FieldError>Enter a valid time and IANA time zone.</FieldError>}
      </Field>
    </>
  );
}
