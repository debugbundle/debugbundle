import type { Dispatch, SetStateAction } from "react";
import type { EmailWeeklyReportDraft } from "../../lib/weekly-report-form.js";
import { WeeklyReportScheduleFields } from "./weekly-report-schedule-fields.js";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../ui/field.js";
import { Switch } from "../ui/switch.js";
import { Input } from "../ui/input.js";
export function WeeklyReportEmailFields({
  value,
  disabled,
  onChange
}: {
  value: EmailWeeklyReportDraft;
  disabled: boolean;
  onChange: Dispatch<SetStateAction<EmailWeeklyReportDraft | null>>;
}): JSX.Element {
  return (
    <FieldGroup>
      <Field orientation="horizontal" className="items-center justify-between gap-4">
        <div className="flex flex-1 flex-col gap-1">
          <FieldLabel
            id="project-weekly-report-enabled-label"
            htmlFor="project-weekly-report-enabled"
          >
            Enabled
          </FieldLabel>
          <FieldDescription>
            Include this project in scheduled weekly email reports.
          </FieldDescription>
        </div>
        <Switch
          id="project-weekly-report-enabled"
          aria-labelledby="project-weekly-report-enabled-label"
          checked={value.is_enabled}
          disabled={disabled}
          onCheckedChange={(checked) => {
            onChange((current) => ({
              ...(current ?? value),
              is_enabled: checked
            }));
          }}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="project-weekly-report-recipients">Recipients</FieldLabel>
        <FieldDescription>Separate up to 3 email addresses with commas.</FieldDescription>
        <Input
          id="project-weekly-report-recipients"
          value={value.recipients}
          onChange={(event) => {
            const recipients = event.currentTarget.value;
            onChange((current) => ({
              ...(current ?? value),
              recipients
            }));
          }}
          placeholder="owner@example.com, team@example.com"
          autoComplete="email"
          disabled={disabled}
        />
      </Field>

      <WeeklyReportScheduleFields
        id="project-weekly-report"
        value={value}
        disabled={disabled}
        onChange={(schedule) => onChange((current) => ({ ...(current ?? value), ...schedule }))}
      />
    </FieldGroup>
  );
}
