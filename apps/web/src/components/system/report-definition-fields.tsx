import { useId } from "react";
import { getDefaultTimezone } from "../../lib/weekly-report-form.js";
import type { CreateReportDefinition } from "../../../../../packages/smart-reports/src/report-definition.js";
import type { MultiSelectOption } from "./multi-select.js";
import { MultiSelect } from "./multi-select.js";
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldContent } from "../ui/field.js";
import { Input } from "../ui/input.js";
import { Checkbox } from "../ui/checkbox.js";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group.js";
export function ReportDefinitionFields({
  value,
  onChange,
  projects,
  recipients,
  disabled
}: {
  value: CreateReportDefinition;
  onChange: (value: CreateReportDefinition) => void;
  projects: MultiSelectOption[];
  recipients: MultiSelectOption[];
  disabled: boolean;
}): JSX.Element {
  const id = useId(),
    change = (patch: Partial<CreateReportDefinition>): void => onChange({ ...value, ...patch });
  return (
    <FieldGroup className="grid lg:grid-cols-2">
      <Field>
        <FieldLabel htmlFor={`${id}-name`}>Report name</FieldLabel>
        <Input
          id={`${id}-name`}
          value={value.name}
          maxLength={120}
          required
          disabled={disabled}
          onChange={(event) => change({ name: event.currentTarget.value })}
        />
      </Field>
      <Field>
        <FieldLabel id={`${id}-cadence`}>Reporting period</FieldLabel>
        <ToggleGroup
          type="single"
          variant="outline"
          aria-labelledby={`${id}-cadence`}
          value={value.cadence}
          disabled={disabled}
          onValueChange={(cadence) => {
            if (cadence === "daily" || cadence === "weekly" || cadence === "monthly")
              change({ cadence });
          }}
        >
          {["daily", "weekly", "monthly"].map((cadence) => (
            <ToggleGroupItem key={cadence} value={cadence}>
              {cadence[0]?.toUpperCase()}
              {cadence.slice(1)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <FieldDescription>
          Complete UTC days, Monday–Sunday weeks or calendar months. The delivery timezone never
          changes the fact period.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-projects`}>Projects</FieldLabel>
        <MultiSelect
          id={`${id}-projects`}
          label="Projects"
          value={value.project_ids}
          options={projects.map((option) => ({
            ...option,
            disabled: !value.project_ids.includes(option.value) && value.project_ids.length >= 10
          }))}
          disabled={disabled}
          onValueChange={(project_ids) => change({ project_ids })}
        />
        <FieldDescription>
          Choose up to ten explicit projects in this workspace. Future projects are never added
          automatically.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-recipients`}>Email recipients</FieldLabel>
        <MultiSelect
          id={`${id}-recipients`}
          label="Email recipients"
          value={value.recipient_user_ids}
          options={recipients.map((option) => ({
            ...option,
            disabled:
              !value.recipient_user_ids.includes(option.value) &&
              value.recipient_user_ids.length >= 10
          }))}
          disabled={disabled}
          onValueChange={(recipient_user_ids) => change({ recipient_user_ids })}
        />
        <FieldDescription>
          Choose up to ten verified people who can access all selected projects. Access is checked
          again before each email.
        </FieldDescription>
      </Field>
      <Field className="lg:col-span-2">
        <FieldLabel id={`${id}-privacy`}>Evidence sent for analysis</FieldLabel>
        <ToggleGroup
          type="single"
          variant="outline"
          aria-labelledby={`${id}-privacy`}
          value={value.privacy_mode}
          disabled={disabled}
          onValueChange={(privacy_mode) => {
            if (privacy_mode === "full" || privacy_mode === "restricted")
              change({ privacy_mode, source_collection_consent: false });
          }}
        >
          <ToggleGroupItem value="full">Full</ToggleGroupItem>
          <ToggleGroupItem value="restricted">Restricted</ToggleGroupItem>
        </ToggleGroup>
        <FieldDescription>
          {value.privacy_mode === "full"
            ? "Recommended: redacted incident details, context, improvements, downtime and trends. Raw logs, request bodies, headers, stack traces and secrets are excluded."
            : "Trends and counts with generic project labels. Incident details and context are excluded, so analysis is more limited."}{" "}
          Reports are retained for 90 days. Source evidence may expire sooner.
        </FieldDescription>
      </Field>
      {value.privacy_mode === "full" ? (
        <Field orientation="horizontal" className="lg:col-span-2">
          <Checkbox
            id={`${id}-consent`}
            checked={value.source_collection_consent}
            disabled={disabled}
            onCheckedChange={(checked) => change({ source_collection_consent: checked === true })}
          />
          <FieldLabel htmlFor={`${id}-consent`}>
            I agree to collect bounded redacted source summaries and send this report’s selected
            evidence to the configured AI provider.
          </FieldLabel>
        </Field>
      ) : null}
      <Field orientation="horizontal" className="lg:col-span-2">
        <Checkbox
          id={`${id}-enabled`}
          checked={value.enabled}
          disabled={disabled}
          onCheckedChange={(checked) =>
            change({
              enabled: checked === true,
              schedule:
                checked === true
                  ? (value.schedule ?? { time: "09:00", timezone: getDefaultTimezone() })
                  : value.schedule
            })
          }
        />
        <FieldContent>
          <FieldLabel htmlFor={`${id}-enabled`}>Generate reports automatically</FieldLabel>
          <FieldDescription>
            Generate after each selected period closes. Email overviews go to selected recipients.
            Turn off for manual generation only. All runs share the monthly allowance; a schedule
            may skip when it is exhausted.
          </FieldDescription>
        </FieldContent>
      </Field>
      {value.enabled && value.schedule ? (
        <>
          <Field>
            <FieldLabel htmlFor={`${id}-time`}>Delivery time</FieldLabel>
            <Input
              id={`${id}-time`}
              type="time"
              value={value.schedule.time}
              disabled={disabled}
              required
              onChange={(event) =>
                change({ schedule: { ...value.schedule!, time: event.currentTarget.value } })
              }
            />
            <FieldDescription>
              After the period closes: the next day, Monday after a week, or first day of the
              following month. Daylight-saving transitions do not duplicate a report.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-timezone`}>Delivery timezone</FieldLabel>
            <Input
              id={`${id}-timezone`}
              value={value.schedule.timezone}
              disabled={disabled}
              required
              placeholder="Europe/Ljubljana"
              onChange={(event) =>
                change({ schedule: { ...value.schedule!, timezone: event.currentTarget.value } })
              }
            />
            <FieldDescription>
              Defaults to your device timezone. Use an IANA timezone such as UTC or
              Europe/Ljubljana.
            </FieldDescription>
          </Field>
        </>
      ) : null}
      {value.cadence === "weekly" ? (
        <Field orientation="horizontal" className="lg:col-span-2">
          <Checkbox
            id={`${id}-overlap`}
            checked={value.weekly_overlap === "keep_existing"}
            disabled={disabled}
            onCheckedChange={(checked) => {
              const next = { ...value };
              if (checked === true) next.weekly_overlap = "keep_existing";
              else delete next.weekly_overlap;
              onChange(next);
            }}
          />
          <div>
            <FieldLabel htmlFor={`${id}-overlap`}>
              Keep the existing weekly digest alongside this report
            </FieldLabel>
            <FieldDescription>
              Required when an existing digest is enabled. Its settings and recipients remain
              separately controlled.
            </FieldDescription>
          </div>
        </Field>
      ) : null}
    </FieldGroup>
  );
}
