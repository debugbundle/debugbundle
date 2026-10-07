import type { ReactNode } from "react";
import type {
  AlertChannel,
  AlertConditionType,
  AlertSeverityLifecycleScope
} from "../../lib/api.js";
import {
  ALERT_CONDITION_OPTIONS,
  SEVERITY_OPTIONS,
  ALERT_SEVERITY_LIFECYCLE_SCOPE_OPTIONS,
  ALERT_SEVERITY_ANY_VALUE,
  describeAlertChannel,
  describeAlertCooldown,
  type AlertChannelOption
} from "../../lib/alert-form.js";
import type { DurationDraft } from "../../lib/duration-form.js";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../ui/field.js";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../ui/select.js";
import { DurationField } from "./duration-field.js";

export function AlertRuleFields({
  channel,
  setChannel,
  channelOptions,
  conditionType,
  setConditionType,
  severityLifecycleScope,
  setSeverityLifecycleScope,
  severityMin,
  setSeverityMin,
  cooldown,
  onCooldownChange,
  destinationFields,
  advancedFields
}: {
  channel: AlertChannel;
  setChannel: (value: AlertChannel) => void;
  conditionType: AlertConditionType;
  setConditionType: (value: AlertConditionType) => void;
  severityLifecycleScope: AlertSeverityLifecycleScope;
  setSeverityLifecycleScope: (value: AlertSeverityLifecycleScope) => void;
  severityMin: "" | "low" | "medium" | "high" | "critical";
  setSeverityMin: (value: "" | "low" | "medium" | "high" | "critical") => void;
  channelOptions: AlertChannelOption[];
  cooldown: DurationDraft;
  onCooldownChange: (value: DurationDraft) => void;
  destinationFields: ReactNode;
  advancedFields: ReactNode;
}): JSX.Element {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel id="project-alert-channel-label" htmlFor="project-alert-channel">
          Channel
        </FieldLabel>
        <Select value={channel} onValueChange={(value) => setChannel(value as AlertChannel)}>
          <SelectTrigger
            id="project-alert-channel"
            aria-labelledby="project-alert-channel-label project-alert-channel"
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectGroup>
              {channelOptions.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled === true}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription>{describeAlertChannel(channel)}</FieldDescription>
      </Field>
      {destinationFields}
      <Field>
        <FieldLabel id="project-alert-condition-label" htmlFor="project-alert-condition">
          Condition
        </FieldLabel>
        <Select
          value={conditionType}
          onValueChange={(value) => setConditionType(value as AlertConditionType)}
        >
          <SelectTrigger
            id="project-alert-condition"
            aria-labelledby="project-alert-condition-label project-alert-condition"
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectGroup>
              {ALERT_CONDITION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      {conditionType === "severity_threshold" ? (
        <Field>
          <FieldLabel
            id="project-alert-severity-lifecycle-label"
            htmlFor="project-alert-severity-lifecycle"
          >
            Notify on
          </FieldLabel>
          <Select
            value={severityLifecycleScope}
            onValueChange={(value) =>
              setSeverityLifecycleScope(value as AlertSeverityLifecycleScope)
            }
          >
            <SelectTrigger
              id="project-alert-severity-lifecycle"
              aria-labelledby="project-alert-severity-lifecycle-label project-alert-severity-lifecycle"
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectGroup>
                {ALERT_SEVERITY_LIFECYCLE_SCOPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      ) : null}
      <Field>
        <FieldLabel id="project-alert-severity-label" htmlFor="project-alert-severity">
          Minimum severity
        </FieldLabel>
        <FieldDescription>
          Leave unset to deliver for all severities matching the selected condition.
        </FieldDescription>
        <Select
          value={severityMin === "" ? ALERT_SEVERITY_ANY_VALUE : severityMin}
          onValueChange={(value) =>
            setSeverityMin((value === ALERT_SEVERITY_ANY_VALUE ? "" : value) as typeof severityMin)
          }
        >
          <SelectTrigger
            id="project-alert-severity"
            aria-labelledby="project-alert-severity-label project-alert-severity"
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectGroup>
              {SEVERITY_OPTIONS.map((option) => (
                <SelectItem
                  key={option.value || "any"}
                  value={option.value === "" ? ALERT_SEVERITY_ANY_VALUE : option.value}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      {advancedFields}
      <DurationField
        id="project-alert-cooldown"
        label="Cooldown"
        value={cooldown}
        maximum={604800}
        description={describeAlertCooldown(channel)}
        onChange={(value) => {
          onCooldownChange(value);
        }}
      />
    </FieldGroup>
  );
}
