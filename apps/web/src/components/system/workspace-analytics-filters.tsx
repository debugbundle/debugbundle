import { RotateCcwIcon } from "lucide-react";

import type { ProjectRecord } from "../../lib/api.js";
import { Button } from "../ui/button.js";
import { Field, FieldGroup, FieldLabel } from "../ui/field.js";
import { Input } from "../ui/input.js";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../ui/select.js";

export interface WorkspaceAnalyticsFilterValues {
  projectId: string;
  service: string;
  environment: string;
  status: string;
  kind: string;
  severity: string;
  bundleStatus: string;
  from: string;
  to: string;
}

interface WorkspaceAnalyticsFiltersProps {
  mode: "opportunities" | "bundles";
  projects: ProjectRecord[];
  value: WorkspaceAnalyticsFilterValues;
  onChange: (value: WorkspaceAnalyticsFilterValues) => void;
  onApply: () => void;
  onReset: () => void;
}

const kindOptions = [
  ["all", "All analysis kinds"],
  ["usage_summary", "Usage summary"],
  ["route_health", "Route health"],
  ["funnel_dropoff", "Funnel dropoff"],
  ["journey_friction", "Journey friction"],
  ["feature_usage", "Feature usage"],
  ["incident_impact", "Incident impact"],
  ["deploy_comparison", "Deploy comparison"],
  ["conversion_path", "Conversion path"]
] as const;

const opportunityStatusOptions = [
  ["open", "Open"],
  ["resolved", "Resolved"],
  ["snoozed", "Snoozed"],
  ["all", "All statuses"]
] as const;

const bundleGenerationStatusOptions = [
  ["all", "All states"],
  ["pending", "Pending"],
  ["running", "Running"],
  ["completed", "Ready"],
  ["failed", "Failed"]
] as const;

const severityOptions = [
  ["all", "All severities"],
  ["low", "Low"],
  ["medium", "Medium"],
  ["high", "High"]
] as const;

const opportunityBundleStatusOptions = [
  ["all", "All bundle states"],
  ["not_requested", "Not requested"],
  ["pending", "Pending"],
  ["running", "Running"],
  ["completed", "Ready"],
  ["failed", "Failed"]
] as const;

export function WorkspaceAnalyticsFilters({
  mode,
  projects,
  value,
  onChange,
  onApply,
  onReset
}: WorkspaceAnalyticsFiltersProps): JSX.Element {
  function update(key: keyof WorkspaceAnalyticsFilterValues, nextValue: string): void {
    onChange({ ...value, [key]: nextValue });
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onApply();
      }}
    >
      <FieldGroup className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FilterSelect
          id={`workspace-analytics-${mode}-project`}
          label="Project"
          value={value.projectId}
          options={[["all", "All projects"], ...projects.map((project) => [project.project_id, project.name] as const)]}
          onValueChange={(nextValue) => update("projectId", nextValue)}
        />
        <Field>
          <FieldLabel htmlFor={`workspace-analytics-${mode}-service`}>Service</FieldLabel>
          <Input
            id={`workspace-analytics-${mode}-service`}
            value={value.service}
            placeholder="All services"
            maxLength={120}
            onChange={(event) => update("service", event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`workspace-analytics-${mode}-environment`}>
            Environment
          </FieldLabel>
          <Input
            id={`workspace-analytics-${mode}-environment`}
            value={value.environment}
            placeholder="All environments"
            maxLength={120}
            onChange={(event) => update("environment", event.target.value)}
          />
        </Field>
        <FilterSelect
          id={`workspace-analytics-${mode}-kind`}
          label="Analysis kind"
          value={value.kind}
          options={kindOptions}
          onValueChange={(nextValue) => update("kind", nextValue)}
        />
        <FilterSelect
          id={`workspace-analytics-${mode}-status`}
          label="Status"
          value={value.status}
          options={
            mode === "opportunities" ? opportunityStatusOptions : bundleGenerationStatusOptions
          }
          onValueChange={(nextValue) => update("status", nextValue)}
        />
        {mode === "opportunities" ? (
          <>
            <FilterSelect
              id="workspace-analytics-opportunities-severity"
              label="Severity"
              value={value.severity}
              options={severityOptions}
              onValueChange={(nextValue) => update("severity", nextValue)}
            />
            <FilterSelect
              id="workspace-analytics-opportunities-bundle-status"
              label="Bundle state"
              value={value.bundleStatus}
              options={opportunityBundleStatusOptions}
              onValueChange={(nextValue) => update("bundleStatus", nextValue)}
            />
          </>
        ) : null}
        <Field>
          <FieldLabel htmlFor={`workspace-analytics-${mode}-from`}>From</FieldLabel>
          <Input
            id={`workspace-analytics-${mode}-from`}
            type="date"
            value={value.from}
            max={value.to.length === 0 ? undefined : value.to}
            onChange={(event) => update("from", event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`workspace-analytics-${mode}-to`}>To</FieldLabel>
          <Input
            id={`workspace-analytics-${mode}-to`}
            type="date"
            value={value.to}
            min={value.from.length === 0 ? undefined : value.from}
            onChange={(event) => update("to", event.target.value)}
          />
        </Field>
      </FieldGroup>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit">Apply filters</Button>
        <Button type="button" variant="outline" onClick={onReset}>
          <RotateCcwIcon data-icon="inline-start" />
          Reset
        </Button>
      </div>
    </form>
  );
}

function FilterSelect({
  id,
  label,
  value,
  options,
  onValueChange
}: {
  id: string;
  label: string;
  value: string;
  options: ReadonlyArray<readonly [string, string]>;
  onValueChange: (value: string) => void;
}): JSX.Element {
  const labelId = `${id}-label`;
  return (
    <Field>
      <FieldLabel id={labelId} htmlFor={id}>
        {label}
      </FieldLabel>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id={id} aria-labelledby={`${labelId} ${id}`} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map(([optionValue, optionLabel]) => (
              <SelectItem key={optionValue} value={optionValue}>
                {optionLabel}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

export function createWorkspaceAnalyticsFilters(
  mode: "opportunities" | "bundles"
): WorkspaceAnalyticsFilterValues {
  return {
    projectId: "all",
    service: "",
    environment: "",
    status: mode === "opportunities" ? "open" : "all",
    kind: "all",
    severity: "all",
    bundleStatus: "all",
    from: "",
    to: ""
  };
}

export function toAnalyticsDateStart(value: string): string | undefined {
  return value.length === 0 ? undefined : `${value}T00:00:00.000Z`;
}

export function toAnalyticsDateEnd(value: string): string | undefined {
  return value.length === 0 ? undefined : `${value}T23:59:59.999Z`;
}
