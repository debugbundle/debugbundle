import { RotateCcwIcon, ShieldCheckIcon } from "lucide-react";
import { useEffect, useState } from "react";

import {
  getProjectCapturePolicy,
  updateProjectCapturePolicy,
  type CaptureBreadcrumbs,
  type CaptureLogs,
  type CapturePreset,
  type CaptureProbeEvents,
  type CaptureRequestEvents,
  type ImmediateClientErrorPathRule,
  type ProjectCapturePolicy,
  type ProjectCapturePolicyResponse,
} from "../../lib/api.js";
import { showErrorToast, showSuccessToast } from "../../lib/notify.js";
import { Button } from "../ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.js";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../ui/field.js";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../ui/select.js";

type OverrideValue<T extends string> = "" | T;
type ClientErrorIncidentMode = "preset_default" | "none" | "recommended" | "custom";

interface CapturePolicyDraft {
  access_mode: ProjectCapturePolicyResponse["access_mode"];
  preset: CapturePreset;
  capture_logs: OverrideValue<CaptureLogs>;
  capture_request_events: OverrideValue<CaptureRequestEvents>;
  capture_breadcrumbs: OverrideValue<CaptureBreadcrumbs>;
  capture_probe_events: OverrideValue<CaptureProbeEvents>;
  client_error_incident_mode: ClientErrorIncidentMode;
  client_error_custom_input: string;
  client_error_path_rules_input: string;
}

interface ProjectCapturePolicyCardProps {
  projectId: string;
  organizationPlan: "free" | "solo" | "team";
  canEdit: boolean;
}

const DEFAULT_PRESET_BY_PLAN: Record<ProjectCapturePolicyCardProps["organizationPlan"], CapturePreset> = {
  free: "balanced",
  solo: "balanced",
  team: "balanced"
};

const RECOMMENDED_IMMEDIATE_CLIENT_ERROR_STATUSES = [401, 403, 409, 422] as const;
const HTTP_METHOD_VALUES = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

const PRESET_DEFAULTS: Record<CapturePreset, Omit<ProjectCapturePolicy, "preset">> = {
  minimal: {
    capture_logs: "error",
    capture_request_events: "failures_only",
    capture_breadcrumbs: "local_only",
    capture_probe_events: "buffer_only",
    immediate_client_error_statuses: [],
    immediate_client_error_path_rules: []
  },
  balanced: {
    capture_logs: "warning",
    capture_request_events: "failures_only",
    capture_breadcrumbs: "exception_only",
    capture_probe_events: "buffer_only",
    immediate_client_error_statuses: [],
    immediate_client_error_path_rules: []
  },
  investigative: {
    capture_logs: "info",
    capture_request_events: "all",
    capture_breadcrumbs: "standalone",
    capture_probe_events: "standalone_when_activated",
    immediate_client_error_statuses: [...RECOMMENDED_IMMEDIATE_CLIENT_ERROR_STATUSES],
    immediate_client_error_path_rules: []
  }
};

const presetOptions: Array<{ value: CapturePreset; label: string; description: string }> = [
  { value: "minimal", label: "Minimal", description: "Capture exceptions first and keep low-signal context off by default." },
  { value: "balanced", label: "Balanced", description: "Capture failure-focused request and log context without turning every signal into a standalone event." },
  { value: "investigative", label: "Investigative", description: "Capture the richest standalone context for active debugging and deep incident reconstruction." }
];

const captureLogsOptions: Array<{ value: CaptureLogs; label: string }> = [
  { value: "off", label: "Off" },
  { value: "error", label: "Errors only" },
  { value: "warning", label: "Warnings and errors" },
  { value: "info", label: "Info, warnings, and errors" }
];

const captureRequestOptions: Array<{ value: CaptureRequestEvents; label: string }> = [
  { value: "off", label: "Off" },
  { value: "failures_only", label: "Failures only" },
  { value: "filtered", label: "Filtered request events" },
  { value: "all", label: "All request events" }
];

const captureBreadcrumbOptions: Array<{ value: CaptureBreadcrumbs; label: string }> = [
  { value: "local_only", label: "Attach breadcrumbs to exceptions only" },
  { value: "exception_only", label: "Capture exception breadcrumb trails" },
  { value: "standalone", label: "Store standalone breadcrumb events" }
];

const captureProbeOptions: Array<{ value: CaptureProbeEvents; label: string }> = [
  { value: "buffer_only", label: "Buffer probes inside incident bundles" },
  { value: "standalone_when_activated", label: "Store standalone probe events when activated" }
];

const clientErrorIncidentModeOptions: Array<{ value: ClientErrorIncidentMode; label: string }> = [
  { value: "preset_default", label: "Use preset default" },
  { value: "none", label: "None" },
  { value: "recommended", label: "Recommended for interactive apps" },
  { value: "custom", label: "Custom" }
];

const OVERRIDE_SELECT_DEFAULT_VALUE = "__use_preset_default__";
const inputClassName = "flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60";
const textareaClassName = "flex min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60";

export function ProjectCapturePolicyCard({ projectId, organizationPlan, canEdit }: ProjectCapturePolicyCardProps): JSX.Element {
  const [draft, setDraft] = useState<CapturePolicyDraft | null>(null);
  const [baselineDraft, setBaselineDraft] = useState<CapturePolicyDraft | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadPolicy(): Promise<void> {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const policyResponse = await getProjectCapturePolicy(projectId);
        if (!isActive) {
          return;
        }

        const nextDraft = buildDraft(policyResponse);
        setDraft(nextDraft);
        setBaselineDraft(nextDraft);
      } catch {
        if (!isActive) {
          return;
        }

        setErrorMessage("Could not load capture policy.");
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadPolicy();

    return () => {
      isActive = false;
    };
  }, [projectId]);

  const policyDraft = draft ?? buildDraft(buildDefaultPolicyResponse(organizationPlan));
  const customStatusValidationError = getClientErrorCustomValidationError(policyDraft);
  const pathRulesValidationError = getClientErrorPathRulesValidationError(policyDraft);
  const resolvedPolicy = resolveDraft(policyDraft);
  const showPreviewOnly = policyDraft.access_mode === "preview" || !canEdit;
  const isDirty = baselineDraft !== null && !draftsEqual(policyDraft, baselineDraft);
  const isDisabled = isLoading || isSaving || !canEdit;
  const isSaveDisabled = isDisabled || !isDirty || customStatusValidationError !== null || pathRulesValidationError !== null;

  async function handleSave(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canEdit || !isDirty || customStatusValidationError !== null || pathRulesValidationError !== null) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const updatedPolicyResponse = await updateProjectCapturePolicy(projectId, buildUpdatePayload(policyDraft));
      const nextDraft = buildDraft(updatedPolicyResponse);
      setDraft(nextDraft);
      setBaselineDraft(nextDraft);
      showSuccessToast("Capture policy updated successfully.");
    } catch {
      showErrorToast("Could not save capture policy changes.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleReset(): void {
    if (baselineDraft !== null) {
      setDraft(baselineDraft);
      setErrorMessage(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Capture policy</CardTitle>
        <CardDescription>Control how much request, log, breadcrumb, and probe context the SDK forwards before worker processing begins.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border border-border/80 bg-background/60 p-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <ShieldCheckIcon className="size-4" />
            Effective policy for this project
          </div>
          <p className="mt-2 leading-6">
            {canEdit
              ? "Preset defaults keep common setups fast. Leave an advanced control on its preset default unless this project needs a narrower or richer signal mix."
              : "Members can review the effective policy here, but only project owners and admins can change capture settings."}
          </p>
        </div>

        {errorMessage === null ? null : (
          <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">{errorMessage}</div>
        )}

        <form className="space-y-6" onSubmit={(event) => void handleSave(event)}>
          {showPreviewOnly ? null : (
            <>
              <FieldGroup>
                <Field>
                  <FieldLabel id="project-capture-policy-preset-label" htmlFor="project-capture-policy-preset">Preset</FieldLabel>
                  <FieldDescription>Choose the baseline capture behavior for this project. Advanced controls below can override individual values.</FieldDescription>
                  <Select
                    value={policyDraft.preset}
                    onValueChange={(value) => {
                      setDraft((current) => ({ ...(current ?? policyDraft), preset: value as CapturePreset }));
                    }}
                    disabled={isDisabled}
                  >
                    <SelectTrigger
                      id="project-capture-policy-preset"
                      aria-labelledby="project-capture-policy-preset-label project-capture-policy-preset"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      <SelectGroup>
                        {presetOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription>{presetOptions.find((option) => option.value === policyDraft.preset)?.description}</FieldDescription>
                </Field>
              </FieldGroup>

              <div className="grid gap-4 lg:grid-cols-2">
            <OverrideField
              id="project-capture-policy-logs"
              label="Log events"
              description="Raise or lower standalone log capture independently from the preset."
              disabled={isDisabled}
              value={policyDraft.capture_logs}
              defaultValue={PRESET_DEFAULTS[policyDraft.preset].capture_logs}
              options={captureLogsOptions}
              onChange={(value) => {
                setDraft((current) => ({ ...(current ?? policyDraft), capture_logs: value }));
              }}
            />
            <OverrideField
              id="project-capture-policy-requests"
              label="Request events"
              description="Control how broadly SDKs send standalone request events before worker classification and anomaly thresholds run."
              disabled={isDisabled}
              value={policyDraft.capture_request_events}
              defaultValue={PRESET_DEFAULTS[policyDraft.preset].capture_request_events}
              options={captureRequestOptions}
              onChange={(value) => {
                setDraft((current) => ({ ...(current ?? policyDraft), capture_request_events: value }));
              }}
            />
            <ClientErrorIncidentsField
              draft={policyDraft}
              disabled={isDisabled}
              validationError={customStatusValidationError}
              pathRulesValidationError={pathRulesValidationError}
              onModeChange={(value) => {
                setDraft((current) => ({ ...(current ?? policyDraft), client_error_incident_mode: value }));
              }}
              onCustomInputChange={(value) => {
                setDraft((current) => ({ ...(current ?? policyDraft), client_error_custom_input: value }));
              }}
              onPathRulesInputChange={(value) => {
                setDraft((current) => ({ ...(current ?? policyDraft), client_error_path_rules_input: value }));
              }}
            />
            <OverrideField
              id="project-capture-policy-breadcrumbs"
              label="Breadcrumb events"
              description="Decide whether breadcrumbs only enrich exceptions or persist as standalone events."
              disabled={isDisabled}
              value={policyDraft.capture_breadcrumbs}
              defaultValue={PRESET_DEFAULTS[policyDraft.preset].capture_breadcrumbs}
              options={captureBreadcrumbOptions}
              onChange={(value) => {
                setDraft((current) => ({ ...(current ?? policyDraft), capture_breadcrumbs: value }));
              }}
            />
            <OverrideField
              id="project-capture-policy-probes"
              label="Probe events"
              description="Control whether activated probes stay bundle-only or also persist as standalone events."
              disabled={isDisabled}
              value={policyDraft.capture_probe_events}
              defaultValue={PRESET_DEFAULTS[policyDraft.preset].capture_probe_events}
              options={captureProbeOptions}
              onChange={(value) => {
                setDraft((current) => ({ ...(current ?? policyDraft), capture_probe_events: value }));
              }}
            />
              </div>
            </>
          )}

          <div className="rounded-xl border border-border/80 bg-muted/30 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Resolved policy preview</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <ResolvedValue label="Preset" value={formatPreset(resolvedPolicy.preset)} />
              <ResolvedValue label="Logs" value={formatLogs(resolvedPolicy.capture_logs)} />
              <ResolvedValue label="Request capture" value={formatRequests(resolvedPolicy.capture_request_events)} />
              <ResolvedValue
                label="Client error incidents"
                value={formatClientErrorIncidentsPreview(policyDraft, customStatusValidationError)}
              />
              <ResolvedValue
                label="Client error paths"
                value={formatClientErrorPathRulesPreview(policyDraft, pathRulesValidationError)}
              />
              <ResolvedValue label="Breadcrumbs" value={formatBreadcrumbs(resolvedPolicy.capture_breadcrumbs)} />
              <ResolvedValue label="Probes" value={formatProbes(resolvedPolicy.capture_probe_events)} />
            </div>
          </div>

          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={isSaveDisabled}>
                {isSaving ? "Saving..." : "Save capture policy"}
              </Button>
              <Button type="button" variant="outline" onClick={handleReset} disabled={isDisabled || !isDirty}>
                <RotateCcwIcon data-icon="inline-start" />
                Reset changes
              </Button>
            </div>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

function OverrideField<T extends string>({
  id,
  label,
  description,
  value,
  defaultValue,
  options,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  value: OverrideValue<T>;
  defaultValue: T;
  options: Array<{ value: T; label: string }>;
  disabled: boolean;
  onChange: (value: OverrideValue<T>) => void;
}): JSX.Element {
  const presetDefaultLabel = options.find((option) => option.value === defaultValue)?.label ?? defaultValue;

  return (
    <Field>
      <FieldLabel id={`${id}-label`} htmlFor={id}>{label}</FieldLabel>
      <FieldDescription>{description}</FieldDescription>
      <Select
        value={value === "" ? OVERRIDE_SELECT_DEFAULT_VALUE : value}
        onValueChange={(nextValue) => onChange((nextValue === OVERRIDE_SELECT_DEFAULT_VALUE ? "" : nextValue) as OverrideValue<T>)}
        disabled={disabled}
      >
        <SelectTrigger id={id} aria-labelledby={`${id}-label ${id}`} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectGroup>
            <SelectItem value={OVERRIDE_SELECT_DEFAULT_VALUE}>{formatPresetDefaultOptionLabel(presetDefaultLabel)}</SelectItem>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

function ClientErrorIncidentsField({
  draft,
  disabled,
  validationError,
  pathRulesValidationError,
  onModeChange,
  onCustomInputChange,
  onPathRulesInputChange,
}: {
  draft: CapturePolicyDraft;
  disabled: boolean;
  validationError: string | null;
  pathRulesValidationError: string | null;
  onModeChange: (value: ClientErrorIncidentMode) => void;
  onCustomInputChange: (value: string) => void;
  onPathRulesInputChange: (value: string) => void;
}): JSX.Element {
  const presetDefaultLabel = formatClientErrorStatusList(PRESET_DEFAULTS[draft.preset].immediate_client_error_statuses);

  return (
    <Field>
      <FieldLabel id="project-capture-policy-client-errors-label" htmlFor="project-capture-policy-client-errors">Client error incidents</FieldLabel>
      <FieldDescription>Choose which 4xx responses are allowed to open incidents. Unpromoted 4xx responses stay request telemetry.</FieldDescription>
      <Select
        value={draft.client_error_incident_mode}
        onValueChange={(value) => onModeChange(value as ClientErrorIncidentMode)}
        disabled={disabled}
      >
        <SelectTrigger
          id="project-capture-policy-client-errors"
          aria-labelledby="project-capture-policy-client-errors-label project-capture-policy-client-errors"
          className="w-full"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectGroup>
            <SelectItem value="preset_default">{formatPresetDefaultOptionLabel(presetDefaultLabel)}</SelectItem>
            {clientErrorIncidentModeOptions.filter((option) => option.value !== "preset_default").map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {draft.client_error_incident_mode === "custom" ? (
        <div className="mt-3 space-y-2">
          <FieldLabel htmlFor="project-capture-policy-client-errors-custom">Status codes</FieldLabel>
          <input
            id="project-capture-policy-client-errors-custom"
            className={inputClassName}
            value={draft.client_error_custom_input}
            onChange={(event) => onCustomInputChange(event.currentTarget.value)}
            disabled={disabled}
            aria-invalid={validationError !== null}
          />
          <FieldDescription>Comma-separated 4xx codes, for example 401,403,409,422.</FieldDescription>
          {validationError === null ? null : (
            <p className="text-sm text-destructive" role="alert">{validationError}</p>
          )}
        </div>
      ) : null}
      <div className="mt-3 space-y-2">
        <FieldLabel htmlFor="project-capture-policy-client-error-path-rules">Path rules</FieldLabel>
        <textarea
          id="project-capture-policy-client-error-path-rules"
          className={textareaClassName}
          value={draft.client_error_path_rules_input}
          onChange={(event) => onPathRulesInputChange(event.currentTarget.value)}
          disabled={disabled}
          aria-invalid={pathRulesValidationError !== null}
        />
        <FieldDescription>One rule per line, for example 404=/checkout/*@GET,POST. Omit methods to match any method.</FieldDescription>
        {pathRulesValidationError === null ? null : (
          <p className="text-sm text-destructive" role="alert">{pathRulesValidationError}</p>
        )}
      </div>
      <FieldDescription>Promoted client errors open incidents immediately and can increase incident volume.</FieldDescription>
    </Field>
  );
}

function ResolvedValue({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-lg border border-border/80 bg-background/70 p-4">
      <p className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-3 text-base font-medium leading-8 text-foreground whitespace-normal text-pretty">{value}</p>
    </div>
  );
}

function buildDefaultPolicy(plan: ProjectCapturePolicyCardProps["organizationPlan"]): ProjectCapturePolicy {
  const preset = DEFAULT_PRESET_BY_PLAN[plan];
  return {
    preset,
    ...PRESET_DEFAULTS[preset]
  };
}

function buildDefaultPolicyResponse(plan: ProjectCapturePolicyCardProps["organizationPlan"]): ProjectCapturePolicyResponse {
  return {
    access_mode: "manage",
    policy: buildDefaultPolicy(plan),
    overrides: {
      capture_logs: null,
      capture_request_events: null,
      capture_breadcrumbs: null,
      capture_probe_events: null,
      immediate_client_error_statuses: null,
      immediate_client_error_path_rules: null
    }
  };
}

function buildDraft(policyResponse: ProjectCapturePolicyResponse): CapturePolicyDraft {
  const { policy, overrides } = policyResponse;
  const defaults = PRESET_DEFAULTS[policy.preset];
  const clientErrorOverride = overrides.immediate_client_error_statuses;

  return {
    access_mode: policyResponse.access_mode,
    preset: policy.preset,
    capture_logs: overrides.capture_logs === null ? "" : overrides.capture_logs,
    capture_request_events: overrides.capture_request_events === null ? "" : overrides.capture_request_events,
    capture_breadcrumbs: overrides.capture_breadcrumbs === null ? "" : overrides.capture_breadcrumbs,
    capture_probe_events: overrides.capture_probe_events === null ? "" : overrides.capture_probe_events,
    client_error_incident_mode: getClientErrorIncidentMode(clientErrorOverride, defaults.immediate_client_error_statuses),
    client_error_custom_input:
      clientErrorOverride !== null
      && clientErrorOverride.length > 0
      && !statusesEqual(clientErrorOverride, RECOMMENDED_IMMEDIATE_CLIENT_ERROR_STATUSES)
        ? clientErrorOverride.join(",")
        : "",
    client_error_path_rules_input: formatClientErrorPathRulesInput(
      overrides.immediate_client_error_path_rules ?? policy.immediate_client_error_path_rules ?? []
    )
  };
}

function resolveDraft(draft: CapturePolicyDraft): ProjectCapturePolicy {
  const defaults = PRESET_DEFAULTS[draft.preset];
  const customStatuses = parseClientErrorStatusesInput(draft.client_error_custom_input);
  const pathRules = parseClientErrorPathRulesInput(draft.client_error_path_rules_input);

  return {
    preset: draft.preset,
    capture_logs: draft.capture_logs || defaults.capture_logs,
    capture_request_events: draft.capture_request_events || defaults.capture_request_events,
    capture_breadcrumbs: draft.capture_breadcrumbs || defaults.capture_breadcrumbs,
    capture_probe_events: draft.capture_probe_events || defaults.capture_probe_events,
    immediate_client_error_statuses:
      draft.client_error_incident_mode === "preset_default"
        ? defaults.immediate_client_error_statuses
        : draft.client_error_incident_mode === "none"
          ? []
          : draft.client_error_incident_mode === "recommended"
            ? [...RECOMMENDED_IMMEDIATE_CLIENT_ERROR_STATUSES]
            : (customStatuses.statuses ?? []),
    immediate_client_error_path_rules: pathRules.rules ?? []
  };
}

function buildUpdatePayload(draft: CapturePolicyDraft): {
  preset: CapturePreset;
  capture_logs: CaptureLogs | null;
  capture_request_events: CaptureRequestEvents | null;
  capture_breadcrumbs: CaptureBreadcrumbs | null;
  capture_probe_events: CaptureProbeEvents | null;
  immediate_client_error_statuses: number[] | null;
  immediate_client_error_path_rules: ImmediateClientErrorPathRule[] | null;
} {
  const customStatuses = parseClientErrorStatusesInput(draft.client_error_custom_input);
  const pathRules = parseClientErrorPathRulesInput(draft.client_error_path_rules_input);

  return {
    preset: draft.preset,
    capture_logs: draft.capture_logs || null,
    capture_request_events: draft.capture_request_events || null,
    capture_breadcrumbs: draft.capture_breadcrumbs || null,
    capture_probe_events: draft.capture_probe_events || null,
    immediate_client_error_statuses:
      draft.client_error_incident_mode === "preset_default"
        ? null
        : draft.client_error_incident_mode === "none"
          ? []
          : draft.client_error_incident_mode === "recommended"
            ? [...RECOMMENDED_IMMEDIATE_CLIENT_ERROR_STATUSES]
            : customStatuses.statuses ?? [],
    immediate_client_error_path_rules: draft.client_error_path_rules_input.trim().length === 0
      ? null
      : pathRules.rules ?? []
  };
}

function getClientErrorIncidentMode(
  rawOverride: number[] | null,
  presetDefault: readonly number[]
): ClientErrorIncidentMode {
  if (rawOverride === null) {
    return "preset_default";
  }

  if (rawOverride.length === 0) {
    return "none";
  }

  if (statusesEqual(rawOverride, RECOMMENDED_IMMEDIATE_CLIENT_ERROR_STATUSES)) {
    return "recommended";
  }

  if (statusesEqual(rawOverride, presetDefault)) {
    return "preset_default";
  }

  return "custom";
}

function parseClientErrorStatusesInput(value: string): { statuses?: number[]; error?: string } {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { error: "Enter at least one 4xx status code." };
  }

  const rawParts = trimmed.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
  if (rawParts.length === 0) {
    return { error: "Enter at least one 4xx status code." };
  }

  const parsedNumbers: number[] = [];
  for (const part of rawParts) {
    if (!/^\d+$/.test(part)) {
      return { error: "Use only HTTP 4xx integers between 400 and 499." };
    }

    const status = Number(part);
    if (!Number.isInteger(status) || status < 400 || status > 499) {
      return { error: "Use only HTTP 4xx integers between 400 and 499." };
    }

    parsedNumbers.push(status);
  }

  const normalized = Array.from(new Set(parsedNumbers)).sort((left, right) => left - right);
  if (normalized.length > 12) {
    return { error: "Choose no more than 12 status codes." };
  }

  return { statuses: normalized };
}

function normalizePathPattern(value: string): string {
  return value.trim().replace(/\/{2,}/g, "/");
}

function parseClientErrorPathRulesInput(value: string): { rules?: ImmediateClientErrorPathRule[]; error?: string } {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { rules: [] };
  }

  const rules: ImmediateClientErrorPathRule[] = [];
  for (const [index, rawLine] of trimmed.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (line.length === 0) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0 || separatorIndex === line.length - 1) {
      return { error: `Line ${index + 1}: use status=/path/*@METHOD format.` };
    }

    const status = Number(line.slice(0, separatorIndex));
    if (!Number.isInteger(status) || status < 400 || status > 499) {
      return { error: `Line ${index + 1}: use an HTTP 4xx status.` };
    }

    const ruleValue = line.slice(separatorIndex + 1);
    const methodSeparatorIndex = ruleValue.lastIndexOf("@");
    const pathPattern = normalizePathPattern(methodSeparatorIndex === -1 ? ruleValue : ruleValue.slice(0, methodSeparatorIndex));
    if (!pathPattern.startsWith("/") || pathPattern.includes("?") || pathPattern.includes("#")) {
      return { error: `Line ${index + 1}: path must start with / and exclude query strings.` };
    }
    const wildcardIndex = pathPattern.indexOf("*");
    if (wildcardIndex !== -1 && wildcardIndex !== pathPattern.length - 1) {
      return { error: `Line ${index + 1}: wildcard must be at the end of the path.` };
    }

    const methods = methodSeparatorIndex === -1
      ? []
      : Array.from(new Set(ruleValue
          .slice(methodSeparatorIndex + 1)
          .split(",")
          .map((method) => method.trim().toUpperCase())
          .filter((method): method is ImmediateClientErrorPathRule["methods"][number] =>
            (HTTP_METHOD_VALUES as readonly string[]).includes(method)
          )))
          .sort();

    if (methodSeparatorIndex !== -1 && methods.length === 0) {
      return { error: `Line ${index + 1}: use valid HTTP methods after @.` };
    }

    rules.push({ status_code: status, path_pattern: pathPattern, methods });
  }

  if (rules.length > 25) {
    return { error: "Choose no more than 25 path rules." };
  }

  return {
    rules: Array.from(
      new Map(rules.map((rule) => [`${rule.status_code}:${rule.path_pattern}:${rule.methods.join(",")}`, rule])).values()
    ).sort((left, right) => {
      if (left.status_code !== right.status_code) return left.status_code - right.status_code;
      const pathComparison = left.path_pattern.localeCompare(right.path_pattern);
      if (pathComparison !== 0) return pathComparison;
      return left.methods.join(",").localeCompare(right.methods.join(","));
    })
  };
}

function formatClientErrorPathRulesInput(rules: readonly ImmediateClientErrorPathRule[]): string {
  return rules
    .map((rule) => {
      const methods = rule.methods.length === 0 ? "" : `@${rule.methods.join(",")}`;
      return `${rule.status_code}=${rule.path_pattern}${methods}`;
    })
    .join("\n");
}

function getClientErrorCustomValidationError(draft: CapturePolicyDraft): string | null {
  if (draft.client_error_incident_mode !== "custom") {
    return null;
  }

  return parseClientErrorStatusesInput(draft.client_error_custom_input).error ?? null;
}

function getClientErrorPathRulesValidationError(draft: CapturePolicyDraft): string | null {
  return parseClientErrorPathRulesInput(draft.client_error_path_rules_input).error ?? null;
}

function draftsEqual(left: CapturePolicyDraft, right: CapturePolicyDraft): boolean {
  return left.preset === right.preset
    && left.capture_logs === right.capture_logs
    && left.capture_request_events === right.capture_request_events
    && left.capture_breadcrumbs === right.capture_breadcrumbs
    && left.capture_probe_events === right.capture_probe_events
    && left.client_error_incident_mode === right.client_error_incident_mode
    && left.client_error_custom_input === right.client_error_custom_input
    && left.client_error_path_rules_input === right.client_error_path_rules_input;
}

function statusesEqual(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function formatPreset(value: CapturePreset): string {
  switch (value) {
    case "minimal":
      return "Minimal";
    case "balanced":
      return "Balanced";
    case "investigative":
      return "Investigative";
  }
}

function formatPresetDefaultOptionLabel(defaultLabel: string): string {
  return `Use preset default (${defaultLabel})`;
}

function formatLogs(value: CaptureLogs): string {
  return captureLogsOptions.find((option) => option.value === value)?.label ?? value;
}

function formatRequests(value: CaptureRequestEvents): string {
  return captureRequestOptions.find((option) => option.value === value)?.label ?? value;
}

function formatBreadcrumbs(value: CaptureBreadcrumbs): string {
  return captureBreadcrumbOptions.find((option) => option.value === value)?.label ?? value;
}

function formatProbes(value: CaptureProbeEvents): string {
  return captureProbeOptions.find((option) => option.value === value)?.label ?? value;
}

function formatClientErrorIncidentsPreview(draft: CapturePolicyDraft, validationError: string | null): string {
  const presetDefault = PRESET_DEFAULTS[draft.preset].immediate_client_error_statuses;

  switch (draft.client_error_incident_mode) {
    case "preset_default":
      return formatClientErrorStatusList(presetDefault);
    case "none":
      return "None";
    case "recommended":
      return formatClientErrorStatusList(RECOMMENDED_IMMEDIATE_CLIENT_ERROR_STATUSES);
    case "custom":
      if (validationError !== null) {
        return "Custom (invalid)";
      }

      return formatClientErrorStatusList(parseClientErrorStatusesInput(draft.client_error_custom_input).statuses ?? []);
  }
}

function formatClientErrorPathRulesPreview(draft: CapturePolicyDraft, validationError: string | null): string {
  if (validationError !== null) {
    return "Custom (invalid)";
  }

  const parsed = parseClientErrorPathRulesInput(draft.client_error_path_rules_input);
  const rules = parsed.rules ?? [];
  if (rules.length === 0) {
    return "None";
  }

  return rules.length === 1 ? formatClientErrorPathRulesInput(rules) : `${rules.length} rules`;
}

function formatClientErrorStatusList(statuses: readonly number[]): string {
  return statuses.length === 0 ? "None" : statuses.join(", ");
}
