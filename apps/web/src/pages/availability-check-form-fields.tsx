import type { Dispatch, SetStateAction } from "react";

import {
  ProjectScopeSelect,
  type ProjectScopeOptions
} from "../components/system/project-scope-controls.js";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../components/ui/field.js";
import { Input } from "../components/ui/input.js";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../components/ui/select.js";
import { Switch } from "../components/ui/switch.js";
import type { AvailabilityCheckLimits } from "../lib/api.js";
import type { AvailabilityCheckFormState } from "./project-health-page-utils.js";

const METHOD_OPTIONS: Array<{ value: "GET" | "HEAD"; label: string }> = [
  { value: "GET", label: "GET" },
  { value: "HEAD", label: "HEAD" }
];

export function AvailabilityCheckFormFields({
  formState,
  limits,
  scopeOptions,
  setFormState
}: {
  formState: AvailabilityCheckFormState;
  limits: AvailabilityCheckLimits | null;
  scopeOptions: ProjectScopeOptions;
  setFormState: Dispatch<SetStateAction<AvailabilityCheckFormState>>;
}): JSX.Element {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="health-check-name">Name</FieldLabel>
        <FieldDescription>
          Use a short label that describes what this endpoint proves, such as API root or checkout
          health.
        </FieldDescription>
        <Input
          id="health-check-name"
          value={formState.name}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setFormState((current) => ({ ...current, name: value }));
          }}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="health-check-url">Check URL</FieldLabel>
        <FieldDescription>
          Public HTTP or HTTPS endpoint that should respond from outside your network.
        </FieldDescription>
        <Input
          id="health-check-url"
          type="url"
          placeholder="https://app.example.com/health"
          value={formState.url}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setFormState((current) => ({ ...current, url: value }));
          }}
        />
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="health-check-method">Method</FieldLabel>
          <Select
            value={formState.method}
            onValueChange={(value) =>
              setFormState((current) => ({ ...current, method: value as "GET" | "HEAD" }))
            }
          >
            <SelectTrigger id="health-check-method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {METHOD_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="health-check-timeout">Timeout (ms)</FieldLabel>
          <Input
            id="health-check-timeout"
            type="number"
            min={500}
            max={5000}
            value={formState.timeout_ms}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setFormState((current) => ({ ...current, timeout_ms: value }));
            }}
          />
        </Field>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="health-check-status-min">Expected status minimum</FieldLabel>
          <Input
            id="health-check-status-min"
            type="number"
            min={100}
            max={599}
            value={formState.expected_status_min}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setFormState((current) => ({ ...current, expected_status_min: value }));
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="health-check-status-max">Expected status maximum</FieldLabel>
          <Input
            id="health-check-status-max"
            type="number"
            min={100}
            max={599}
            value={formState.expected_status_max}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setFormState((current) => ({ ...current, expected_status_max: value }));
            }}
          />
        </Field>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="health-check-interval">Interval (seconds)</FieldLabel>
          <FieldDescription>
            Your plan's minimum interval is {limits?.min_interval_seconds ?? 30} seconds.
          </FieldDescription>
          <Input
            id="health-check-interval"
            type="number"
            min={limits?.min_interval_seconds ?? 30}
            max={86400}
            value={formState.interval_seconds}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setFormState((current) => ({ ...current, interval_seconds: value }));
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="health-check-failures">Failure threshold</FieldLabel>
          <FieldDescription>
            {limits?.recommended_failure_threshold ?? 3} consecutive failures is recommended. Use 1
            only for especially critical endpoints.
          </FieldDescription>
          <Input
            id="health-check-failures"
            type="number"
            min={1}
            max={10}
            value={formState.failure_threshold}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setFormState((current) => ({ ...current, failure_threshold: value }));
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="health-check-recovery">Recovery threshold</FieldLabel>
          <Input
            id="health-check-recovery"
            type="number"
            min={1}
            max={10}
            value={formState.recovery_threshold}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setFormState((current) => ({ ...current, recovery_threshold: value }));
            }}
          />
        </Field>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="health-check-environment">Environment label</FieldLabel>
          <FieldDescription>
            Defaults to the project environment so incidents line up with the rest of the project.
          </FieldDescription>
          <ProjectScopeSelect
            id="health-check-environment"
            label="Environment"
            value={formState.environment}
            options={scopeOptions.environments}
            allLabel="All environments"
            includeAll={false}
            onValueChange={(environment) =>
              setFormState((current) => ({ ...current, environment }))
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="health-check-service">Service label</FieldLabel>
          <FieldDescription>
            Optional service name to group uptime incidents with the same service filters.
          </FieldDescription>
          <ProjectScopeSelect
            id="health-check-service"
            label="Service"
            value={formState.service_name}
            options={scopeOptions.services}
            allLabel="No service label"
            onValueChange={(service_name) =>
              setFormState((current) => ({ ...current, service_name }))
            }
          />
        </Field>
      </div>
      <Field orientation="horizontal" className="items-center justify-between gap-4">
        <div className="flex flex-1 flex-col gap-1">
          <FieldLabel id="health-check-enabled-label" htmlFor="health-check-enabled">
            Enabled
          </FieldLabel>
          <FieldDescription>
            Disabled checks stay saved but do not execute until you re-enable them.
          </FieldDescription>
        </div>
        <Switch
          id="health-check-enabled"
          aria-labelledby="health-check-enabled-label"
          checked={formState.enabled}
          onCheckedChange={(checked) =>
            setFormState((current) => ({ ...current, enabled: Boolean(checked) }))
          }
        />
      </Field>
    </FieldGroup>
  );
}
