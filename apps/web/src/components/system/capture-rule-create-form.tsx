import {
  type CaptureRuleAction,
  type CaptureRuleBrowserEventKind,
  type CaptureRuleClientKind,
  type CaptureRuleEventType,
  type CaptureRuleRuntime,
  type CaptureRuleThresholdGroupBy
} from "../../lib/capture-rules-api.js";
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
import { Textarea } from "../ui/textarea.js";
import {
  type CaptureRuleCreateDraft,
  type ThresholdWindowPreset,
  parseExactResourceUrlsText
} from "./capture-rule-form-helpers.js";
import {
  joinScopeValues,
  ProjectScopeMultiSelect,
  splitScopeValues
} from "./project-scope-controls.js";

export {
  buildProjectCaptureRuleCreate,
  createDefaultCaptureRuleCreateDraft,
  getCaptureRuleCreateDraftValidationError,
  THRESHOLD_WINDOW_PRESET_VALUES,
  type CaptureRuleCreateDraft,
  type ThresholdWindowPreset
} from "./capture-rule-form-helpers.js";

const NO_VALUE = "__none__";

const eventTypeOptions: Array<{ value: CaptureRuleEventType; label: string }> = [
  { value: "frontend_exception", label: "Frontend exception" },
  { value: "backend_exception", label: "Backend exception" },
  { value: "request_event", label: "Request event" },
  { value: "log_event", label: "Log event" },
  { value: "frontend_breadcrumb", label: "Frontend breadcrumb" },
  { value: "deploy_metadata", label: "Deploy metadata" },
  { value: "error_suppressed", label: "Suppression checkpoint" },
  { value: "probe_event", label: "Probe event" }
];

const actionOptions: Array<{ value: CaptureRuleAction; label: string }> = [
  { value: "demote", label: "Demote to context" },
  { value: "threshold", label: "Open after repeated failures" },
  { value: "allow", label: "Allow immediately" },
  { value: "sample", label: "Sample matching events" },
  { value: "drop", label: "Drop before storage" }
];

const thresholdWindowOptions: Array<{ value: ThresholdWindowPreset; label: string }> = [
  { value: "300", label: "5 minutes" },
  { value: "900", label: "15 minutes" },
  { value: "3600", label: "1 hour" },
  { value: "21600", label: "6 hours" },
  { value: "86400", label: "24 hours" },
  { value: "custom", label: "Custom seconds" }
];

const thresholdGroupByOptions: Array<{ value: CaptureRuleThresholdGroupBy; label: string }> = [
  { value: "resource", label: "Resource host + path" },
  { value: "fingerprint", label: "Incident fingerprint" }
];

const runtimeOptions: Array<{ value: CaptureRuleRuntime; label: string }> = [
  { value: "browser", label: "Browser" },
  { value: "node", label: "Node.js" },
  { value: "python", label: "Python" },
  { value: "php", label: "PHP" },
  { value: "java", label: "Java" },
  { value: "go", label: "Go" },
  { value: "ruby", label: "Ruby" },
  { value: "dotnet", label: ".NET" },
  { value: "rust", label: "Rust" },
  { value: "android", label: "Android" },
  { value: "swift", label: "iOS (Swift)" },
  { value: "react-native", label: "React Native" },
  { value: "unknown", label: "Unknown runtime" }
];

const browserEventKindOptions: Array<{ value: CaptureRuleBrowserEventKind; label: string }> = [
  { value: "window_error", label: "Window error" },
  { value: "resource_error", label: "Resource error" }
];

const clientKindOptions: Array<{ value: CaptureRuleClientKind; label: string }> = [
  { value: "human", label: "Human" },
  { value: "bot", label: "Bot" },
  { value: "unknown", label: "Unknown" }
];

interface CaptureRuleCreateFormProps {
  draft: CaptureRuleCreateDraft;
  disabled: boolean;
  serviceOptions?: string[];
  environmentOptions?: string[];
  onDraftChange: (draft: CaptureRuleCreateDraft) => void;
}

export function CaptureRuleCreateForm({
  draft,
  disabled,
  serviceOptions = [],
  environmentOptions = [],
  onDraftChange
}: CaptureRuleCreateFormProps): JSX.Element {
  function update<Key extends keyof CaptureRuleCreateDraft>(
    key: Key,
    value: CaptureRuleCreateDraft[Key]
  ): void {
    onDraftChange({ ...draft, [key]: value });
  }

  function handleActionChange(nextAction: CaptureRuleAction): void {
    if (nextAction === "threshold") {
      const nextGroupBy: CaptureRuleThresholdGroupBy =
        draft.matcherJsonOnly
          ? draft.thresholdGroupBy
          : draft.eventType === "frontend_exception" && draft.browserEventKind === "resource_error"
            ? "resource"
            : "fingerprint";
      onDraftChange({ ...draft, action: nextAction, thresholdGroupBy: nextGroupBy });
      return;
    }
    onDraftChange({ ...draft, action: nextAction });
  }

  const parsedResourceUrls = parseExactResourceUrlsText(draft.resourceUrlsText);
  const resourceUrlsInlineError = !parsedResourceUrls.ok
    ? parsedResourceUrls.error
    : (draft.resourceHost.trim().length > 0 || draft.resourcePathEquals.trim().length > 0) &&
        parsedResourceUrls.urls.length > 0
      ? "Clear single Resource host/path fields when listing multiple exact resource URLs."
      : null;

  return (
    <FieldGroup>
      <div className="grid gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="capture-rule-create-name">Rule name</FieldLabel>
          <Input
            id="capture-rule-create-name"
            value={draft.name}
            onChange={(event) => update("name", event.currentTarget.value)}
            disabled={disabled}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="capture-rule-create-action">Action</FieldLabel>
          <Select
            value={draft.action}
            onValueChange={(value) => handleActionChange(value as CaptureRuleAction)}
            disabled={disabled}
          >
            <SelectTrigger id="capture-rule-create-action" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {actionOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </div>

      {draft.action === "threshold" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="capture-rule-create-threshold-count">
                Occurrences before opening
              </FieldLabel>
              <Input
                id="capture-rule-create-threshold-count"
                aria-describedby="capture-rule-create-threshold-count-help"
                type="number"
                min="2"
                max="1000"
                step="1"
                value={draft.thresholdCount}
                onChange={(event) => update("thresholdCount", event.currentTarget.value)}
                disabled={disabled}
              />
              <FieldDescription id="capture-rule-create-threshold-count-help">
                2–1000 matching failures in the rolling window.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="capture-rule-create-threshold-window">Rolling window</FieldLabel>
              <Select
                value={draft.thresholdWindowPreset}
                onValueChange={(value) => {
                  const preset = value as ThresholdWindowPreset;
                  onDraftChange({
                    ...draft,
                    thresholdWindowPreset: preset,
                    ...(preset === "custom" ? {} : { thresholdWindowCustomSeconds: preset })
                  });
                }}
                disabled={disabled}
              >
                <SelectTrigger id="capture-rule-create-threshold-window" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {thresholdWindowOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>Window evaluated from server receipt time.</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="capture-rule-create-threshold-group-by">
                Group threshold by
              </FieldLabel>
              <Select
                value={draft.thresholdGroupBy}
                onValueChange={(value) =>
                  update("thresholdGroupBy", value as CaptureRuleThresholdGroupBy)
                }
                disabled={disabled}
              >
                <SelectTrigger id="capture-rule-create-threshold-group-by" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {thresholdGroupByOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                Resource counts per host + path across routes; fingerprint counts per incident key.
              </FieldDescription>
            </Field>
          </div>

          {draft.thresholdWindowPreset === "custom" ? (
            <Field>
              <FieldLabel htmlFor="capture-rule-create-threshold-custom-seconds">
                Custom window (seconds)
              </FieldLabel>
              <Input
                id="capture-rule-create-threshold-custom-seconds"
                aria-describedby="capture-rule-create-threshold-custom-seconds-help"
                type="number"
                min="60"
                max="86400"
                step="1"
                value={draft.thresholdWindowCustomSeconds}
                onChange={(event) =>
                  update("thresholdWindowCustomSeconds", event.currentTarget.value)
                }
                disabled={disabled}
              />
              <FieldDescription id="capture-rule-create-threshold-custom-seconds-help">
                Between 60 seconds (1 minute) and 86400 seconds (24 hours).
              </FieldDescription>
            </Field>
          ) : null}
        </div>
      ) : null}

      {draft.action === "sample" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="capture-rule-create-sample-rate">Sample rate percent</FieldLabel>
            <Input
              id="capture-rule-create-sample-rate"
              type="number"
              min="0"
              max="100"
              step="any"
              value={draft.sampleRatePercent}
              onChange={(event) => update("sampleRatePercent", event.currentTarget.value)}
              disabled={disabled}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="capture-rule-create-sample-class">Sampled-in class</FieldLabel>
            <Select
              value={draft.sampleEventClass}
              onValueChange={(value) => update("sampleEventClass", value as "preserve" | "context")}
              disabled={disabled}
            >
              <SelectTrigger id="capture-rule-create-sample-class" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="preserve">Preserve original class</SelectItem>
                  <SelectItem value="context">Store as context only</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </div>
      ) : null}

      <Field>
        <FieldLabel htmlFor="capture-rule-create-description">Description</FieldLabel>
        <Textarea
          id="capture-rule-create-description"
          value={draft.description}
          onChange={(event) => update("description", event.currentTarget.value)}
          disabled={disabled}
          rows={3}
        />
        <FieldDescription>Use this to record why this rule is safe to apply.</FieldDescription>
      </Field>

      {draft.matcherJsonOnly ? null : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="capture-rule-create-event-type">Event type</FieldLabel>
              <Select
                value={draft.eventType}
                onValueChange={(value) => update("eventType", value as CaptureRuleEventType)}
                disabled={disabled}
              >
                <SelectTrigger id="capture-rule-create-event-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {eventTypeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="capture-rule-create-runtime">Runtime</FieldLabel>
              <Select
                value={draft.runtime === "" ? NO_VALUE : draft.runtime}
                onValueChange={(value) =>
                  update("runtime", value === NO_VALUE ? "" : (value as CaptureRuleRuntime))
                }
                disabled={disabled}
              >
                <SelectTrigger id="capture-rule-create-runtime" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={NO_VALUE}>Any runtime</SelectItem>
                    {runtimeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="capture-rule-create-services">Services</FieldLabel>
              <ProjectScopeMultiSelect
                id="capture-rule-create-services"
                label="Services"
                value={splitScopeValues(draft.serviceNames)}
                options={serviceOptions}
                onValueChange={(values) => update("serviceNames", joinScopeValues(values))}
                disabled={disabled}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="capture-rule-create-environments">Environments</FieldLabel>
              <ProjectScopeMultiSelect
                id="capture-rule-create-environments"
                label="Environments"
                value={splitScopeValues(draft.environments)}
                options={environmentOptions}
                onValueChange={(values) => update("environments", joinScopeValues(values))}
                disabled={disabled}
              />
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="capture-rule-create-browser-kind">Browser event kind</FieldLabel>
              <Select
                value={draft.browserEventKind === "" ? NO_VALUE : draft.browserEventKind}
                onValueChange={(value) =>
                  update(
                    "browserEventKind",
                    value === NO_VALUE ? "" : (value as CaptureRuleBrowserEventKind)
                  )
                }
                disabled={disabled}
              >
                <SelectTrigger id="capture-rule-create-browser-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={NO_VALUE}>Any browser event</SelectItem>
                    {browserEventKindOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="capture-rule-create-client-kind">Client kind</FieldLabel>
              <Select
                value={draft.clientKind === "" ? NO_VALUE : draft.clientKind}
                onValueChange={(value) =>
                  update("clientKind", value === NO_VALUE ? "" : (value as CaptureRuleClientKind))
                }
                disabled={disabled}
              >
                <SelectTrigger id="capture-rule-create-client-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={NO_VALUE}>Any client</SelectItem>
                    {clientKindOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="capture-rule-create-first-party">Request scope</FieldLabel>
              <Select
                value={draft.firstParty === "" ? NO_VALUE : draft.firstParty}
                onValueChange={(value) =>
                  update("firstParty", value === NO_VALUE ? "" : (value as "true" | "false"))
                }
                disabled={disabled}
              >
                <SelectTrigger id="capture-rule-create-first-party" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={NO_VALUE}>Any request scope</SelectItem>
                    <SelectItem value="true">First-party only</SelectItem>
                    <SelectItem value="false">Third-party allowed</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="capture-rule-create-bot-family">Bot family</FieldLabel>
              <Input
                id="capture-rule-create-bot-family"
                value={draft.botFamily}
                onChange={(event) => update("botFamily", event.currentTarget.value)}
                disabled={disabled}
                placeholder="Googlebot"
              />
            </Field>
          </div>

          <Field orientation="horizontal" className="items-center justify-between gap-4">
            <div className="flex flex-1 flex-col gap-1">
              <FieldLabel
                id="capture-rule-create-opaque-label"
                htmlFor="capture-rule-create-opaque"
              >
                Opaque browser event
              </FieldLabel>
              <FieldDescription>
                Use this for browser-native errors without useful application stack evidence.
              </FieldDescription>
            </div>
            <Switch
              id="capture-rule-create-opaque"
              aria-labelledby="capture-rule-create-opaque-label"
              checked={draft.browserEventOpaque}
              disabled={disabled}
              onCheckedChange={(checked) => update("browserEventOpaque", checked)}
            />
          </Field>

          <div className="grid gap-4 md:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="capture-rule-create-error-name">Error name</FieldLabel>
              <Input
                id="capture-rule-create-error-name"
                value={draft.errorName}
                onChange={(event) => update("errorName", event.currentTarget.value)}
                disabled={disabled}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="capture-rule-create-message-equals">Message equals</FieldLabel>
              <Input
                id="capture-rule-create-message-equals"
                value={draft.messageEquals}
                onChange={(event) => update("messageEquals", event.currentTarget.value)}
                disabled={disabled}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="capture-rule-create-message-contains">
                Message contains
              </FieldLabel>
              <Input
                id="capture-rule-create-message-contains"
                value={draft.messageContains}
                onChange={(event) => update("messageContains", event.currentTarget.value)}
                disabled={disabled}
              />
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="capture-rule-create-resource-host">Resource host</FieldLabel>
              <Input
                id="capture-rule-create-resource-host"
                value={draft.resourceHost}
                onChange={(event) => update("resourceHost", event.currentTarget.value)}
                disabled={disabled}
                placeholder="analytics.example.com"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="capture-rule-create-resource-path">
                Resource path equals
              </FieldLabel>
              <Input
                id="capture-rule-create-resource-path"
                value={draft.resourcePathEquals}
                onChange={(event) => update("resourcePathEquals", event.currentTarget.value)}
                disabled={disabled}
                placeholder="/tag.js"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="capture-rule-create-request-path">
                Request path equals
              </FieldLabel>
              <Input
                id="capture-rule-create-request-path"
                value={draft.requestPathEquals}
                onChange={(event) => update("requestPathEquals", event.currentTarget.value)}
                disabled={disabled}
                placeholder="/api/bootstrap"
              />
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="capture-rule-create-resource-urls">
              Multiple exact resource URLs
            </FieldLabel>
            <Textarea
              id="capture-rule-create-resource-urls"
              aria-describedby="capture-rule-create-resource-urls-help"
              value={draft.resourceUrlsText}
              onChange={(event) => update("resourceUrlsText", event.currentTarget.value)}
              disabled={disabled}
              rows={3}
              placeholder={"https://cdn.example.com/widget.js\nhttps://fallback.example.com/widget.js"}
            />
            <FieldDescription id="capture-rule-create-resource-urls-help">
              Optional. One exact https://host/path URL per line (1–10 entries) for primary and
              fallback CDN endpoints. Cannot be combined with single resource host/path fields.
            </FieldDescription>
            {resourceUrlsInlineError === null ? null : (
              <p role="alert" className="text-xs text-destructive">
                {resourceUrlsInlineError}
              </p>
            )}
          </Field>

          <div className="grid gap-4 md:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="capture-rule-create-status-codes">Status codes</FieldLabel>
              <Input
                id="capture-rule-create-status-codes"
                value={draft.statusCodes}
                onChange={(event) => update("statusCodes", event.currentTarget.value)}
                disabled={disabled}
                placeholder="404, 429"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="capture-rule-create-fingerprint-version">
                Fingerprint version
              </FieldLabel>
              <Input
                id="capture-rule-create-fingerprint-version"
                value={draft.fingerprintVersion}
                onChange={(event) => update("fingerprintVersion", event.currentTarget.value)}
                disabled={disabled}
                placeholder="v1"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="capture-rule-create-fingerprint-value">
                Fingerprint value
              </FieldLabel>
              <Input
                id="capture-rule-create-fingerprint-value"
                value={draft.fingerprintValue}
                onChange={(event) => update("fingerprintValue", event.currentTarget.value)}
                disabled={disabled}
              />
            </Field>
          </div>
        </>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Field orientation="horizontal" className="items-center justify-between gap-4">
          <div className="flex flex-1 flex-col gap-1">
            <FieldLabel
              id="capture-rule-create-enabled-label"
              htmlFor="capture-rule-create-enabled"
            >
              Enabled
            </FieldLabel>
            <FieldDescription>Disable a rule to stage it for later review.</FieldDescription>
          </div>
          <Switch
            id="capture-rule-create-enabled"
            aria-labelledby="capture-rule-create-enabled-label"
            checked={draft.enabled}
            disabled={disabled}
            onCheckedChange={(checked) => update("enabled", checked)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="capture-rule-create-expires-at">Expires at</FieldLabel>
          <Input
            id="capture-rule-create-expires-at"
            type="datetime-local"
            value={draft.expiresAt}
            onChange={(event) => update("expiresAt", event.currentTarget.value)}
            disabled={disabled}
          />
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="capture-rule-create-advanced-json">
          {draft.matcherJsonOnly ? "Matcher JSON" : "Additional matcher JSON"}
        </FieldLabel>
        <Textarea
          id="capture-rule-create-advanced-json"
          value={draft.advancedMatcherJson}
          onChange={(event) => update("advancedMatcherJson", event.currentTarget.value)}
          disabled={disabled}
          rows={4}
          placeholder='{"status_ranges":[{"start":500,"end":599}]}'
        />
        <FieldDescription>
          {draft.matcherJsonOnly
            ? "Edit the complete matcher. Existing event arrays and lifecycle predicates are preserved until you change them."
            : "Optional. Merge extra matcher fields that are not covered by the guided controls."}
        </FieldDescription>
      </Field>
    </FieldGroup>
  );
}
