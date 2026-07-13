import {
  type CaptureRuleAction,
  type CaptureRuleBrowserEventKind,
  type CaptureRuleClientKind,
  type CaptureRuleEventType,
  type CaptureRuleMatcher,
  type CaptureRuleRuntime,
  type ProjectCaptureRuleCreate
} from "../../lib/capture-rules-api.js";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../ui/field.js";
import { Input } from "../ui/input.js";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../ui/select.js";
import { Switch } from "../ui/switch.js";
import { Textarea } from "../ui/textarea.js";
import {
  joinScopeValues,
  ProjectScopeMultiSelect,
  splitScopeValues
} from "./project-scope-controls.js";

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
  { value: "sample", label: "Sample matching events" },
  { value: "drop", label: "Drop before storage" }
];

const runtimeOptions: Array<{ value: CaptureRuleRuntime; label: string }> = [
  { value: "browser", label: "Browser" },
  { value: "node", label: "Node.js" },
  { value: "python", label: "Python" },
  { value: "php", label: "PHP" },
  { value: "java", label: "Java" },
  { value: "go", label: "Go" },
  { value: "ruby", label: "Ruby" },
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

export interface CaptureRuleCreateDraft {
  name: string;
  description: string;
  enabled: boolean;
  action: CaptureRuleAction;
  eventType: CaptureRuleEventType;
  serviceNames: string;
  environments: string;
  runtime: CaptureRuleRuntime | "";
  firstParty: "" | "true" | "false";
  errorName: string;
  messageContains: string;
  messageEquals: string;
  browserEventKind: CaptureRuleBrowserEventKind | "";
  browserEventOpaque: boolean;
  clientKind: CaptureRuleClientKind | "";
  botFamily: string;
  resourceHost: string;
  resourcePathEquals: string;
  requestPathEquals: string;
  statusCodes: string;
  fingerprintVersion: string;
  fingerprintValue: string;
  sampleRatePercent: string;
  sampleEventClass: "preserve" | "context";
  expiresAt: string;
  advancedMatcherJson: string;
}

interface CaptureRuleCreateFormProps {
  draft: CaptureRuleCreateDraft;
  disabled: boolean;
  serviceOptions?: string[];
  environmentOptions?: string[];
  onDraftChange: (draft: CaptureRuleCreateDraft) => void;
}

export function createDefaultCaptureRuleCreateDraft(): CaptureRuleCreateDraft {
  return {
    name: "",
    description: "",
    enabled: true,
    action: "demote",
    eventType: "frontend_exception",
    serviceNames: "",
    environments: "",
    runtime: "",
    firstParty: "",
    errorName: "",
    messageContains: "",
    messageEquals: "",
    browserEventKind: "",
    browserEventOpaque: false,
    clientKind: "",
    botFamily: "",
    resourceHost: "",
    resourcePathEquals: "",
    requestPathEquals: "",
    statusCodes: "",
    fingerprintVersion: "",
    fingerprintValue: "",
    sampleRatePercent: "25",
    sampleEventClass: "preserve",
    expiresAt: "",
    advancedMatcherJson: ""
  };
}

export function getCaptureRuleCreateDraftValidationError(draft: CaptureRuleCreateDraft): string | null {
  if (draft.name.trim().length === 0) {
    return "Rule name is required.";
  }

  if (draft.action === "sample") {
    const sampleRate = Number(draft.sampleRatePercent);
    if (!Number.isFinite(sampleRate) || sampleRate <= 0 || sampleRate > 100) {
      return "Sample rate must be greater than 0 and at most 100.";
    }
  }

  if (draft.statusCodes.trim().length > 0 && parseNumberList(draft.statusCodes).length === 0) {
    return "Status codes must be a comma-separated list of HTTP status codes.";
  }

  if (draft.fingerprintValue.trim().length > 0 && draft.fingerprintVersion.trim().length === 0) {
    return "Fingerprint version is required when matching a fingerprint value.";
  }

  if (draft.advancedMatcherJson.trim().length > 0) {
    try {
      JSON.parse(draft.advancedMatcherJson);
    } catch {
      return "Advanced matcher JSON must be valid JSON.";
    }
  }

  const matcher = buildCaptureRuleMatcher(draft);
  const hasNarrowingField = Object.keys(matcher).some((key) => key !== "event_types");
  if (!hasNarrowingField) {
    return "Add at least one matcher field beyond event type.";
  }

  if (matcher.browser_event_kind === "resource_error" && matcher.resource_url === undefined && matcher.fingerprint === undefined) {
    return "Resource-error rules need a resource URL matcher or exact fingerprint.";
  }

  return null;
}

export function buildProjectCaptureRuleCreate(draft: CaptureRuleCreateDraft): ProjectCaptureRuleCreate {
  const expiresAt = parseDateTimeLocalValue(draft.expiresAt);
  return {
    name: draft.name.trim(),
    description: draft.description.trim().length === 0 ? null : draft.description.trim(),
    enabled: draft.enabled,
    action: draft.action,
    matcher: buildCaptureRuleMatcher(draft),
    sample_rate: draft.action === "sample" ? Number(draft.sampleRatePercent) / 100 : null,
    sample_event_class: draft.action === "sample" ? draft.sampleEventClass : null,
    created_by_user_id: null,
    created_from_incident_id: null,
    created_from_event_id: null,
    expires_at: expiresAt
  };
}

export function CaptureRuleCreateForm({
  draft,
  disabled,
  serviceOptions = [],
  environmentOptions = [],
  onDraftChange
}: CaptureRuleCreateFormProps): JSX.Element {
  function update<Key extends keyof CaptureRuleCreateDraft>(key: Key, value: CaptureRuleCreateDraft[Key]): void {
    onDraftChange({ ...draft, [key]: value });
  }

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
          <Select value={draft.action} onValueChange={(value) => update("action", value as CaptureRuleAction)} disabled={disabled}>
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

      <div className="grid gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="capture-rule-create-event-type">Event type</FieldLabel>
          <Select value={draft.eventType} onValueChange={(value) => update("eventType", value as CaptureRuleEventType)} disabled={disabled}>
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
            onValueChange={(value) => update("runtime", value === NO_VALUE ? "" : (value as CaptureRuleRuntime))}
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
              update("browserEventKind", value === NO_VALUE ? "" : (value as CaptureRuleBrowserEventKind))
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
            onValueChange={(value) => update("clientKind", value === NO_VALUE ? "" : (value as CaptureRuleClientKind))}
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
            onValueChange={(value) => update("firstParty", value === NO_VALUE ? "" : (value as "true" | "false"))}
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
          <FieldLabel id="capture-rule-create-opaque-label" htmlFor="capture-rule-create-opaque">Opaque browser event</FieldLabel>
          <FieldDescription>Use this for browser-native errors without useful application stack evidence.</FieldDescription>
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
          <Input id="capture-rule-create-error-name" value={draft.errorName} onChange={(event) => update("errorName", event.currentTarget.value)} disabled={disabled} />
        </Field>

        <Field>
          <FieldLabel htmlFor="capture-rule-create-message-equals">Message equals</FieldLabel>
          <Input id="capture-rule-create-message-equals" value={draft.messageEquals} onChange={(event) => update("messageEquals", event.currentTarget.value)} disabled={disabled} />
        </Field>

        <Field>
          <FieldLabel htmlFor="capture-rule-create-message-contains">Message contains</FieldLabel>
          <Input id="capture-rule-create-message-contains" value={draft.messageContains} onChange={(event) => update("messageContains", event.currentTarget.value)} disabled={disabled} />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="capture-rule-create-resource-host">Resource host</FieldLabel>
          <Input id="capture-rule-create-resource-host" value={draft.resourceHost} onChange={(event) => update("resourceHost", event.currentTarget.value)} disabled={disabled} placeholder="analytics.example.com" />
        </Field>

        <Field>
          <FieldLabel htmlFor="capture-rule-create-resource-path">Resource path equals</FieldLabel>
          <Input id="capture-rule-create-resource-path" value={draft.resourcePathEquals} onChange={(event) => update("resourcePathEquals", event.currentTarget.value)} disabled={disabled} placeholder="/tag.js" />
        </Field>

        <Field>
          <FieldLabel htmlFor="capture-rule-create-request-path">Request path equals</FieldLabel>
          <Input id="capture-rule-create-request-path" value={draft.requestPathEquals} onChange={(event) => update("requestPathEquals", event.currentTarget.value)} disabled={disabled} placeholder="/api/bootstrap" />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="capture-rule-create-status-codes">Status codes</FieldLabel>
          <Input id="capture-rule-create-status-codes" value={draft.statusCodes} onChange={(event) => update("statusCodes", event.currentTarget.value)} disabled={disabled} placeholder="404, 429" />
        </Field>

        <Field>
          <FieldLabel htmlFor="capture-rule-create-fingerprint-version">Fingerprint version</FieldLabel>
          <Input id="capture-rule-create-fingerprint-version" value={draft.fingerprintVersion} onChange={(event) => update("fingerprintVersion", event.currentTarget.value)} disabled={disabled} placeholder="v1" />
        </Field>

        <Field>
          <FieldLabel htmlFor="capture-rule-create-fingerprint-value">Fingerprint value</FieldLabel>
          <Input id="capture-rule-create-fingerprint-value" value={draft.fingerprintValue} onChange={(event) => update("fingerprintValue", event.currentTarget.value)} disabled={disabled} />
        </Field>
      </div>

      {draft.action === "sample" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="capture-rule-create-sample-rate">Sample rate percent</FieldLabel>
            <Input id="capture-rule-create-sample-rate" type="number" min="1" max="100" value={draft.sampleRatePercent} onChange={(event) => update("sampleRatePercent", event.currentTarget.value)} disabled={disabled} />
          </Field>

          <Field>
            <FieldLabel htmlFor="capture-rule-create-sample-class">Sampled-in class</FieldLabel>
            <Select value={draft.sampleEventClass} onValueChange={(value) => update("sampleEventClass", value as "preserve" | "context")} disabled={disabled}>
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

      <div className="grid gap-4 md:grid-cols-2">
        <Field orientation="horizontal" className="items-center justify-between gap-4">
          <div className="flex flex-1 flex-col gap-1">
            <FieldLabel id="capture-rule-create-enabled-label" htmlFor="capture-rule-create-enabled">Enabled</FieldLabel>
            <FieldDescription>Create disabled when you want to stage the rule for later review.</FieldDescription>
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
          <Input id="capture-rule-create-expires-at" type="datetime-local" value={draft.expiresAt} onChange={(event) => update("expiresAt", event.currentTarget.value)} disabled={disabled} />
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="capture-rule-create-advanced-json">Additional matcher JSON</FieldLabel>
        <Textarea
          id="capture-rule-create-advanced-json"
          value={draft.advancedMatcherJson}
          onChange={(event) => update("advancedMatcherJson", event.currentTarget.value)}
          disabled={disabled}
          rows={4}
          placeholder='{"status_ranges":[{"start":500,"end":599}]}'
        />
        <FieldDescription>Optional. Merge extra matcher fields that are not covered by the guided controls.</FieldDescription>
      </Field>
    </FieldGroup>
  );
}

function buildCaptureRuleMatcher(draft: CaptureRuleCreateDraft): CaptureRuleMatcher {
  const matcher: CaptureRuleMatcher = {
    event_types: [draft.eventType]
  };
  const services = parseStringList(draft.serviceNames);
  const environments = parseStringList(draft.environments);
  const statusCodes = parseNumberList(draft.statusCodes);

  if (services.length > 0) matcher.services = services;
  if (environments.length > 0) matcher.environments = environments;
  if (draft.runtime !== "") matcher.runtime = [draft.runtime];
  if (draft.firstParty !== "") matcher.first_party = draft.firstParty === "true";
  if (draft.errorName.trim().length > 0) matcher.error_name = draft.errorName.trim();
  if (draft.messageContains.trim().length > 0) matcher.message_contains = draft.messageContains.trim();
  if (draft.messageEquals.trim().length > 0) matcher.message_equals = draft.messageEquals.trim();
  if (draft.browserEventKind !== "") matcher.browser_event_kind = draft.browserEventKind;
  if (draft.browserEventOpaque) matcher.browser_event_opaque = true;
  if (draft.clientKind !== "") matcher.client_kind = draft.clientKind;
  if (draft.botFamily.trim().length > 0) matcher.bot_family = draft.botFamily.trim();
  if (statusCodes.length > 0) matcher.status_codes = statusCodes;

  const resourceUrl = buildUrlMatcher(draft.resourceHost, draft.resourcePathEquals);
  if (resourceUrl !== null) matcher.resource_url = resourceUrl;
  const requestUrl = buildUrlMatcher("", draft.requestPathEquals);
  if (requestUrl !== null) matcher.request_url = requestUrl;
  if (draft.fingerprintValue.trim().length > 0) {
    matcher.fingerprint = {
      version: draft.fingerprintVersion.trim(),
      value: draft.fingerprintValue.trim()
    };
  }

  if (draft.advancedMatcherJson.trim().length === 0) {
    return matcher;
  }

  return {
    ...matcher,
    ...(JSON.parse(draft.advancedMatcherJson) as CaptureRuleMatcher)
  };
}

function buildUrlMatcher(host: string, pathEquals: string): NonNullable<CaptureRuleMatcher["resource_url"]> | null {
  const matcher: NonNullable<CaptureRuleMatcher["resource_url"]> = {};
  if (host.trim().length > 0) matcher.host = host.trim().toLowerCase();
  if (pathEquals.trim().length > 0) matcher.path_equals = normalizePath(pathEquals.trim());
  return Object.keys(matcher).length === 0 ? null : matcher;
}

function parseStringList(value: string): string[] {
  return Array.from(new Set(value.split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0)));
}

function parseNumberList(value: string): number[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((entry) => Number(entry.trim()))
        .filter((entry) => Number.isInteger(entry) && entry >= 100 && entry <= 599)
    )
  ).sort((left, right) => left - right);
}

function normalizePath(value: string): string {
  return value.startsWith("/") ? value : `/${value}`;
}

function parseDateTimeLocalValue(value: string): string | null {
  if (value.trim().length === 0) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}
