import type { WebhookEventType } from "../../lib/api.js";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../ui/field.js";
import { Input } from "../ui/input.js";
import { Switch } from "../ui/switch.js";
import { Checkbox } from "../ui/checkbox.js";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../ui/select.js";
import {
  ProjectScopeMultiSelect,
  joinScopeValues,
  splitScopeValues,
  useProjectScopeOptions
} from "./project-scope-controls.js";

const WEBHOOK_EVENT_GROUPS: Array<{
  title: string;
  description: string;
  events: Array<{ value: WebhookEventType; label: string }>;
}> = [
  {
    title: "Bundle lifecycle",
    description:
      "Track incident bundle creation, refreshes, reopen events, and resolution changes.",
    events: [
      { value: "bundle.created", label: "bundle.created" },
      { value: "bundle.updated", label: "bundle.updated" },
      { value: "bundle.reopened", label: "bundle.reopened" },
      { value: "bundle.resolved", label: "bundle.resolved" }
    ]
  },
  {
    title: "Verification",
    description: "React to delivery verification checks and downstream health monitoring.",
    events: [
      { value: "verification.passed", label: "verification.passed" },
      { value: "verification.failed", label: "verification.failed" }
    ]
  },
  {
    title: "Automation signals",
    description: "Use high-signal automation events for spike handling and improvement workflows.",
    events: [
      { value: "incident.spike_detected", label: "incident.spike_detected" },
      { value: "improvement_bundle.created", label: "improvement_bundle.created" }
    ]
  }
];

const SEVERITY_FILTER_OPTIONS: Array<{
  value: "" | "low" | "medium" | "high" | "critical";
  label: string;
}> = [
  { value: "", label: "Any severity" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" }
];

const BUNDLE_TYPE_FILTER_OPTIONS: Array<{ value: "failure" | "improvement"; label: string }> = [
  { value: "failure", label: "Failure bundles" },
  { value: "improvement", label: "Improvement bundles" }
];

const ANY_SEVERITY_SELECT_VALUE = "__any_severity__";

export function WebhookRuleFields({
  projectId,
  environmentDefault,
  endpointUrl,
  selectedEvents,
  environmentFilter,
  serviceFilter,
  severityMin,
  selectedBundleTypes,
  verificationScope,
  enabled,
  setEndpointUrl,
  setEnvironmentFilter,
  setServiceFilter,
  setSeverityMin,
  setVerificationScope,
  toggleEventSelection,
  toggleBundleTypeSelection,
  setEnabled
}: {
  projectId: string;
  environmentDefault: string;
  endpointUrl: string;
  selectedEvents: WebhookEventType[];
  environmentFilter: string;
  serviceFilter: string;
  severityMin: "" | "low" | "medium" | "high" | "critical";
  selectedBundleTypes: Array<"failure" | "improvement">;
  verificationScope: "all" | "verification_only" | "non_verification_only";
  enabled: boolean;
  setEndpointUrl: (value: string) => void;
  setEnvironmentFilter: (value: string) => void;
  setServiceFilter: (value: string) => void;
  setSeverityMin: (value: "" | "low" | "medium" | "high" | "critical") => void;
  setVerificationScope: (value: "all" | "verification_only" | "non_verification_only") => void;
  setEnabled: (value: boolean) => void;
  toggleEventSelection: (event: WebhookEventType) => void;
  toggleBundleTypeSelection: (type: "failure" | "improvement") => void;
}): JSX.Element {
  const scopeOptions = useProjectScopeOptions(projectId, environmentDefault);
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="webhook-endpoint-url">Endpoint URL</FieldLabel>
        <FieldDescription>
          DebugBundle signs every outgoing payload. Point this at the automation endpoint that
          should receive lifecycle events.
        </FieldDescription>
        <Input
          id="webhook-endpoint-url"
          type="url"
          value={endpointUrl}
          onChange={(event) => setEndpointUrl(event.currentTarget.value)}
        />
      </Field>
      <Field>
        <FieldLabel>Subscribed events</FieldLabel>
        <FieldDescription>
          Choose the event families this endpoint should receive. Filters below narrow delivery
          further without changing the subscription list.
        </FieldDescription>
        <div className="space-y-4 pt-1">
          {WEBHOOK_EVENT_GROUPS.map((group) => (
            <fieldset key={group.title} className="space-y-2">
              <legend className="text-sm font-medium text-foreground">{group.title}</legend>
              <p className="text-sm text-muted-foreground">{group.description}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.events.map((eventOption) => (
                  <label
                    key={eventOption.value}
                    className="grid grid-cols-[auto_1fr] items-center gap-3 rounded-md border border-border bg-background/70 px-3 py-2 text-sm"
                  >
                    <Checkbox
                      checked={selectedEvents.includes(eventOption.value)}
                      onCheckedChange={() => toggleEventSelection(eventOption.value)}
                    />
                    <span className="min-w-0 break-all font-mono text-[11px] uppercase leading-5 tracking-[0.12em] sm:text-xs">
                      {eventOption.label}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </Field>
      <Field>
        <FieldLabel>Optional filters</FieldLabel>
        <FieldDescription>
          Leave filters empty to deliver every selected event. These match the environment and
          service metadata coming from the app that sends events into DebugBundle, not DebugBundle's
          own internal services.
        </FieldDescription>
        <div className="grid gap-4 pt-1 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="webhook-filter-environment">Environments</FieldLabel>
            <FieldDescription>
              Limit delivery to selected app environments. Leave empty to deliver every environment.
            </FieldDescription>
            <ProjectScopeMultiSelect
              id="webhook-filter-environment"
              label="Environments"
              value={splitScopeValues(environmentFilter)}
              options={scopeOptions.environments}
              onValueChange={(values) => setEnvironmentFilter(joinScopeValues(values))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="webhook-filter-service">Services</FieldLabel>
            <FieldDescription>
              Limit delivery to selected app services. Leave empty to deliver every service.
            </FieldDescription>
            <ProjectScopeMultiSelect
              id="webhook-filter-service"
              label="Services"
              value={splitScopeValues(serviceFilter)}
              options={scopeOptions.services}
              onValueChange={(values) => setServiceFilter(joinScopeValues(values))}
            />
          </Field>
          <Field>
            <FieldLabel id="webhook-filter-severity-label" htmlFor="webhook-filter-severity">
              Minimum severity
            </FieldLabel>
            <Select
              value={severityMin === "" ? ANY_SEVERITY_SELECT_VALUE : severityMin}
              onValueChange={(value) =>
                setSeverityMin(
                  (value === ANY_SEVERITY_SELECT_VALUE ? "" : value) as typeof severityMin
                )
              }
            >
              <SelectTrigger
                id="webhook-filter-severity"
                aria-labelledby="webhook-filter-severity-label webhook-filter-severity"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectGroup>
                  {SEVERITY_FILTER_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value || "any"}
                      value={option.value === "" ? ANY_SEVERITY_SELECT_VALUE : option.value}
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel
              id="webhook-filter-verification-label"
              htmlFor="webhook-filter-verification"
            >
              Verification scope
            </FieldLabel>
            <Select
              value={verificationScope}
              onValueChange={(value) => setVerificationScope(value as typeof verificationScope)}
            >
              <SelectTrigger
                id="webhook-filter-verification"
                aria-labelledby="webhook-filter-verification-label webhook-filter-verification"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectGroup>
                  <SelectItem value="all">All matching events</SelectItem>
                  <SelectItem value="verification_only">Verification events only</SelectItem>
                  <SelectItem value="non_verification_only">
                    Non-verification events only
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field className="md:col-span-2">
            <FieldLabel>Bundle type</FieldLabel>
            <FieldDescription>
              Restrict delivery to failure bundles, improvement bundles, or both.
            </FieldDescription>
            <div className="grid gap-2 pt-1 sm:grid-cols-2">
              {BUNDLE_TYPE_FILTER_OPTIONS.map((bundleTypeOption) => (
                <label
                  key={bundleTypeOption.value}
                  className="flex items-center gap-3 rounded-md border border-border bg-background/70 px-3 py-2 text-sm"
                >
                  <Checkbox
                    checked={selectedBundleTypes.includes(bundleTypeOption.value)}
                    onCheckedChange={() => toggleBundleTypeSelection(bundleTypeOption.value)}
                  />
                  <span>{bundleTypeOption.label}</span>
                </label>
              ))}
            </div>
          </Field>
        </div>
      </Field>
      <Field orientation="horizontal">
        <Switch id="webhook-enabled" checked={enabled} onCheckedChange={setEnabled} />
        <FieldLabel htmlFor="webhook-enabled">Enabled</FieldLabel>
      </Field>
    </FieldGroup>
  );
}
