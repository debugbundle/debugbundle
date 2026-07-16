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
import { AnalyticsFilterPanel, type AppliedAnalyticsFilter } from "./analytics-filter-panel.js";
import { ProjectScopeSelect, useProjectScopeOptions } from "./project-scope-controls.js";

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

export type WorkspaceAnalyticsFilterKey = keyof WorkspaceAnalyticsFilterValues;

interface WorkspaceAnalyticsFiltersProps {
  mode: "opportunities" | "bundles";
  projects: ProjectRecord[];
  value: WorkspaceAnalyticsFilterValues;
  activeFilterCount: number;
  onChange: (value: WorkspaceAnalyticsFilterValues) => void;
  onApply: () => void;
  onReset: () => void;
  onDismiss: () => void;
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
  activeFilterCount,
  onChange,
  onApply,
  onReset,
  onDismiss
}: WorkspaceAnalyticsFiltersProps): JSX.Element {
  const selectedProject = projects.find((project) => project.project_id === value.projectId);
  const scopeOptions = useProjectScopeOptions(
    selectedProject?.project_id ?? null,
    selectedProject?.environment_default ?? "production"
  );
  function update(key: keyof WorkspaceAnalyticsFilterValues, nextValue: string): void {
    onChange({ ...value, [key]: nextValue });
  }

  return (
    <div
      role="group"
      aria-label="Analytics filter controls"
      className="flex min-w-0 flex-wrap items-center justify-start gap-2 sm:justify-end"
    >
      <AnalyticsFilterPanel
        triggerLabel="Filters"
        title={`Filter analytics ${mode}`}
        description="Limit the inventory by project, scope, analysis details, or date range."
        activeFilterCount={activeFilterCount}
        scrollable
        desktopSize="wide"
        onApply={onApply}
        onReset={onReset}
        onDismiss={onDismiss}
      >
        <FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <FilterSelect
            id={`workspace-analytics-${mode}-project`}
            label="Project"
            value={value.projectId}
            options={[
              ["all", "All projects"],
              ...projects.map((project) => [project.project_id, project.name] as const)
            ]}
            onValueChange={(nextValue) => update("projectId", nextValue)}
          />
          <Field>
            <FieldLabel htmlFor={`workspace-analytics-${mode}-service`}>Service</FieldLabel>
            <ProjectScopeSelect
              id={`workspace-analytics-${mode}-service`}
              label="Service"
              value={value.service}
              options={scopeOptions.services}
              allLabel="All services"
              onValueChange={(nextValue) => update("service", nextValue)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`workspace-analytics-${mode}-environment`}>Environment</FieldLabel>
            <ProjectScopeSelect
              id={`workspace-analytics-${mode}-environment`}
              label="Environment"
              value={value.environment}
              options={scopeOptions.environments}
              allLabel="All environments"
              onValueChange={(nextValue) => update("environment", nextValue)}
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
      </AnalyticsFilterPanel>
      {activeFilterCount === 0 ? null : (
        <Button type="button" variant="outline" onClick={onReset}>
          <RotateCcwIcon data-icon="inline-start" />
          Reset filters
        </Button>
      )}
    </div>
  );
}

export function createWorkspaceAnalyticsAppliedFilters(
  mode: "opportunities" | "bundles",
  value: WorkspaceAnalyticsFilterValues,
  projects: ProjectRecord[],
  onRemove: (key: WorkspaceAnalyticsFilterKey) => void
): AppliedAnalyticsFilter[] {
  const filters: AppliedAnalyticsFilter[] = [];
  const add = (key: WorkspaceAnalyticsFilterKey, label: string, active: boolean): void => {
    if (active) filters.push({ key, label, onRemove: () => onRemove(key) });
  };

  add(
    "projectId",
    `Project: ${projects.find((project) => project.project_id === value.projectId)?.name ?? value.projectId}`,
    value.projectId !== "all"
  );
  add("service", `Service: ${value.service}`, value.service.length > 0);
  add("environment", `Environment: ${value.environment}`, value.environment.length > 0);
  add("kind", `Analysis: ${labelForOption(kindOptions, value.kind)}`, value.kind !== "all");
  const defaultStatus = createWorkspaceAnalyticsFilters(mode).status;
  add(
    "status",
    `Status: ${labelForOption(
      mode === "opportunities" ? opportunityStatusOptions : bundleGenerationStatusOptions,
      value.status
    )}`,
    value.status !== defaultStatus
  );
  if (mode === "opportunities") {
    add(
      "severity",
      `Severity: ${labelForOption(severityOptions, value.severity)}`,
      value.severity !== "all"
    );
    add(
      "bundleStatus",
      `Bundle: ${labelForOption(opportunityBundleStatusOptions, value.bundleStatus)}`,
      value.bundleStatus !== "all"
    );
  }
  add("from", `From: ${value.from}`, value.from.length > 0);
  add("to", `To: ${value.to}`, value.to.length > 0);

  return filters;
}

function labelForOption(options: ReadonlyArray<readonly [string, string]>, value: string): string {
  return options.find(([optionValue]) => optionValue === value)?.[1] ?? value;
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

export function clearWorkspaceAnalyticsFilter(
  mode: "opportunities" | "bundles",
  value: WorkspaceAnalyticsFilterValues,
  key: WorkspaceAnalyticsFilterKey
): WorkspaceAnalyticsFilterValues {
  const defaults = createWorkspaceAnalyticsFilters(mode);
  return {
    ...value,
    [key]: defaults[key]
  };
}

export function toAnalyticsDateStart(value: string): string | undefined {
  return value.length === 0 ? undefined : `${value}T00:00:00.000Z`;
}

export function toAnalyticsDateEnd(value: string): string | undefined {
  return value.length === 0 ? undefined : `${value}T23:59:59.999Z`;
}
