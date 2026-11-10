import type { AnalyticsFilterOptionSet } from "../../../../../packages/shared-types/src/analytics-filter-options.js";
import type { AnalyticsFilterChoices } from "../../hooks/use-analytics-filter-options.js";
import {
  ANALYTICS_DIMENSION_FIELDS,
  type AnalyticsFilterDraft
} from "../../lib/analytics-filter-form.js";
import { formatAnalyticsDimensionValue } from "../../lib/analytics-presentation.js";
import { Button } from "../ui/button.js";
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

/** Prefix actual values so captured literals such as "all" and empty custom values remain selectable. */
const ALL = "all";
const encode = (value: string): string => `value:${value}`;

export function ObservedAnalyticsSelect({
  id,
  label,
  dimension,
  selected,
  choices,
  status,
  onChange
}: {
  id: string;
  label: string;
  dimension: string;
  selected: string | undefined;
  choices: AnalyticsFilterOptionSet | undefined;
  status: AnalyticsFilterChoices["status"];
  onChange: (value: string | undefined) => void;
}): JSX.Element {
  const values = [...new Set(choices?.values ?? [])];
  const retained = selected !== undefined && !values.includes(selected);
  const disabled = status !== "ready" || values.length === 0;
  const help =
    status === "loading"
      ? "Loading choices…"
      : status === "invalid"
        ? "Choose a valid time window first."
        : status === "unavailable"
          ? "Choices unavailable."
          : values.length === 0
            ? "No available values in this window and scope."
            : choices?.truncated
              ? "Some values omitted. Narrow the window or scope for more choices."
              : undefined;
  const display = (value: string): string =>
    value === "" ? "(Empty)" : formatAnalyticsDimensionValue(dimension, value);
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        value={selected === undefined ? ALL : encode(selected)}
        disabled={disabled}
        onValueChange={(value) =>
          onChange(value === ALL ? undefined : value.slice("value:".length))
        }
      >
        <SelectTrigger
          id={id}
          className="w-full"
          aria-describedby={help || retained ? `${id}-help` : undefined}
        >
          <SelectValue
            placeholder={status === "loading" ? "Loading choices…" : "No available values"}
          />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value={ALL}>All values</SelectItem>
            {retained ? (
              <SelectItem value={encode(selected)}>
                {display(selected)} (Current selection)
              </SelectItem>
            ) : null}
            {values.map((value) => (
              <SelectItem key={encode(value)} value={encode(value)}>
                {display(value)}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {help || retained ? (
        <FieldDescription id={`${id}-help`}>
          {help}
          {retained
            ? " Current selection retained; reset or remove its applied filter to clear it."
            : ""}
        </FieldDescription>
      ) : null}
    </Field>
  );
}

export function AnalyticsDimensionFields({
  id,
  value,
  onChange,
  choices
}: {
  id: string;
  value: AnalyticsFilterDraft;
  onChange: (value: AnalyticsFilterDraft) => void;
  choices: AnalyticsFilterChoices;
}): JSX.Element {
  let selectedCustom: Record<string, string> = {};
  try {
    const parsed: unknown = JSON.parse(value.customDimensions || "{}");
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed))
      selectedCustom = Object.fromEntries(
        Object.entries(parsed).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string"
        )
      );
  } catch {
    /* Existing draft validation explains invalid persisted input. */
  }
  const customSets = new Map(choices.data?.custom_dimensions.map((set) => [set.key, set]) ?? []);
  const customKeys = [...new Set([...customSets.keys(), ...Object.keys(selectedCustom)])];
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${id}-granularity`}>Granularity</FieldLabel>
        <Select
          value={value.granularity}
          onValueChange={(granularity) =>
            onChange({ ...value, granularity: granularity as "hour" | "day" })
          }
        >
          <SelectTrigger id={`${id}-granularity`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="day">Daily</SelectItem>
              <SelectItem value="hour">Hourly</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-limit`}>Metric limit</FieldLabel>
        <Input
          id={`${id}-limit`}
          type="number"
          min={1}
          max={100}
          step={1}
          placeholder="Default for this section"
          value={value.limit}
          onChange={(event) => onChange({ ...value, limit: event.currentTarget.value })}
        />
        <FieldDescription>
          Up to 100 aggregate rows. This is a bounded result, not a total.
        </FieldDescription>
      </Field>
      {choices.status === "unavailable" ? (
        <div className="flex flex-col items-start gap-2 text-sm" role="status">
          <p className="text-muted-foreground">
            Filter choices could not be loaded. Existing selections are preserved.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={choices.retry}>
            Retry filter choices
          </Button>
        </div>
      ) : null}
      {[
        ...ANALYTICS_DIMENSION_FIELDS,
        { key: "auth_state" as const, label: "Authentication state" }
      ].map((field) => (
        <ObservedAnalyticsSelect
          key={field.key}
          id={`${id}-${field.key}`}
          label={field.label}
          dimension={field.key}
          selected={value.dimensions[field.key] || undefined}
          status={choices.status}
          choices={choices.data?.options[field.key]}
          onChange={(selected) =>
            onChange({ ...value, dimensions: { ...value.dimensions, [field.key]: selected ?? "" } })
          }
        />
      ))}
      {customKeys.map((key) => (
        <ObservedAnalyticsSelect
          key={key}
          id={`${id}-custom-${key}`}
          label={`Custom dimension: ${key}`}
          dimension={key}
          selected={Object.hasOwn(selectedCustom, key) ? selectedCustom[key] : undefined}
          status={choices.status}
          choices={customSets.get(key)}
          onChange={(selected) => {
            const next = new Map(Object.entries(selectedCustom));
            if (selected === undefined) next.delete(key);
            else next.set(key, selected);
            onChange({
              ...value,
              customDimensions: next.size === 0 ? "" : JSON.stringify(Object.fromEntries(next))
            });
          }}
        />
      ))}
      {customKeys.length === 0 ? (
        <FieldDescription>
          {choices.status === "ready"
            ? "No approved custom dimensions are available in this scope."
            : "Custom dimension choices are unavailable until choices load."}
        </FieldDescription>
      ) : null}
    </>
  );
}
