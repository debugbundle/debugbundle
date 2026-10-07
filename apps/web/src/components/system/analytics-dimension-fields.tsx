import {
  ANALYTICS_DIMENSION_FIELDS,
  type AnalyticsFilterDraft
} from "../../lib/analytics-filter-form.js";
import { Field, FieldDescription, FieldLabel } from "../ui/field.js";
import { Input } from "../ui/input.js";
import { Textarea } from "../ui/textarea.js";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../ui/select.js";
export function AnalyticsDimensionFields({
  id,
  value,
  onChange
}: {
  id: string;
  value: AnalyticsFilterDraft;
  onChange: (value: AnalyticsFilterDraft) => void;
}): JSX.Element {
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
      {ANALYTICS_DIMENSION_FIELDS.map((field) => (
        <Field key={field.key}>
          <FieldLabel htmlFor={`${id}-${field.key}`}>{field.label}</FieldLabel>
          <Input
            id={`${id}-${field.key}`}
            value={value.dimensions[field.key] ?? ""}
            maxLength={field.maximum}
            onChange={(event) =>
              onChange({
                ...value,
                dimensions: { ...value.dimensions, [field.key]: event.currentTarget.value }
              })
            }
          />
        </Field>
      ))}
      <Field>
        <FieldLabel htmlFor={`${id}-auth`}>Authentication state</FieldLabel>
        <Select
          value={value.dimensions.auth_state || "all"}
          onValueChange={(auth) =>
            onChange({
              ...value,
              dimensions: { ...value.dimensions, auth_state: auth === "all" ? "" : auth }
            })
          }
        >
          <SelectTrigger id={`${id}-auth`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">All states</SelectItem>
              <SelectItem value="anonymous">Anonymous</SelectItem>
              <SelectItem value="authenticated">Authenticated</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-custom`}>Custom dimensions (JSON)</FieldLabel>
        <Textarea
          id={`${id}-custom`}
          value={value.customDimensions}
          placeholder={'{"plan":"team"}'}
          onChange={(event) => onChange({ ...value, customDimensions: event.currentTarget.value })}
        />
        <FieldDescription>
          Up to eight dimension keys and string values. These filters affect aggregate metrics;
          opportunity and bundle inventories use time, service and environment. Retained samples use
          service, environment and tag.
        </FieldDescription>
      </Field>
    </>
  );
}
