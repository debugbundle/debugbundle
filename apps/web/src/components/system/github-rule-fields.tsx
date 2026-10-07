import type { GitHubRuleDraft } from "../../lib/github-rule-form.js";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../ui/field.js";
import { Input } from "../ui/input.js";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../ui/select.js";
import { Switch } from "../ui/switch.js";
import { DurationField } from "./duration-field.js";
import { LifecycleEventField } from "./lifecycle-event-field.js";
import { ProjectScopeMultiSelect, useProjectScopeOptions } from "./project-scope-controls.js";

export function GitHubRuleFields({
  projectId,
  environmentDefault,
  value,
  onChange
}: {
  projectId: string;
  environmentDefault: string;
  value: GitHubRuleDraft;
  onChange: (value: GitHubRuleDraft) => void;
}): JSX.Element {
  const scope = useProjectScopeOptions(projectId, environmentDefault);
  function selectField<K extends "severity" | "bundleType" | "incidentStatus">(
    key: K,
    label: string,
    options: string[]
  ): JSX.Element {
    const id = `github-rule-${key}`;
    return (
      <Field>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Select
          value={value[key] ?? "__current_all__"}
          onValueChange={(selected) => onChange({ ...value, [key]: selected })}
        >
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {value[key] === null ? (
                <SelectItem value="__current_all__" disabled>
                  All (current setting)
                </SelectItem>
              ) : null}
              {options.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {value[key] === null ? (
          <FieldDescription>
            Saving preserves this existing scope. Choose a value to narrow it.
          </FieldDescription>
        ) : null}
      </Field>
    );
  }
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="github-rule-name">Rule name</FieldLabel>
        <Input
          id="github-rule-name"
          required
          maxLength={200}
          value={value.name}
          onChange={(event) => onChange({ ...value, name: event.currentTarget.value })}
        />
      </Field>
      <LifecycleEventField
        id="github-rule-events"
        value={value.eventTypes}
        onChange={(eventTypes) => onChange({ ...value, eventTypes })}
      />
      <Field>
        <FieldLabel htmlFor="github-rule-environments">Environment list</FieldLabel>
        <ProjectScopeMultiSelect
          id="github-rule-environments"
          label="Environments"
          value={value.environments}
          options={scope.environments}
          onValueChange={(environments) => onChange({ ...value, environments })}
        />
        <FieldDescription>Leave empty for all environments.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="github-rule-services">Service list</FieldLabel>
        <ProjectScopeMultiSelect
          id="github-rule-services"
          label="Services"
          value={value.services}
          options={scope.services}
          onValueChange={(services) => onChange({ ...value, services })}
        />
        <FieldDescription>Leave empty for all services.</FieldDescription>
      </Field>
      {selectField("severity", "Minimum severity", ["low", "medium", "high", "critical"])}
      {selectField("bundleType", "Bundle type", ["failure", "improvement"])}
      {selectField("incidentStatus", "Incident state", [
        "new_only",
        "reopened_only",
        "new_or_reopened"
      ])}
      <DurationField
        id="github-rule-cooldown-seconds"
        label="Cooldown"
        value={value.cooldown}
        maximum={86400}
        onChange={(cooldown) => onChange({ ...value, cooldown })}
      />
      <Field orientation="horizontal">
        <Switch
          id="github-rule-enabled"
          checked={value.enabled}
          onCheckedChange={(enabled) => onChange({ ...value, enabled })}
        />
        <FieldLabel htmlFor="github-rule-enabled">Enabled</FieldLabel>
      </Field>
    </FieldGroup>
  );
}
