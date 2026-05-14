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
  type ProjectCapturePolicy,
  type ProjectCapturePolicyResponse,
} from "../../lib/api.js";
import { showErrorToast, showSuccessToast } from "../../lib/notify.js";
import { Button } from "../ui/button.js";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.js";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../ui/field.js";

type OverrideValue<T extends string> = "" | T;
type ClientErrorIncidentMode = "preset_default" | "none" | "recommended" | "custom";

interface CapturePolicyDraft {
  preset: CapturePreset;
  capture_logs: OverrideValue<CaptureLogs>;
  capture_request_events: OverrideValue<CaptureRequestEvents>;
  capture_breadcrumbs: OverrideValue<CaptureBreadcrumbs>;
  capture_probe_events: OverrideValue<CaptureProbeEvents>;
  client_error_incident_mode: ClientErrorIncidentMode;
  client_error_custom_input: string;
}

interface ProjectCapturePolicyCardProps {
  projectId: string;
  organizationPlan: "free" | "solo" | "team";
  canEdit: boolean;
}

const DEFAULT_PRESET_BY_PLAN: Record<ProjectCapturePolicyCardProps["organizationPlan"], CapturePreset> = {
  free: "minimal",
  solo: "balanced",
  team: "balanced"
};

const RECOMMENDED_IMMEDIATE_CLIENT_ERROR_STATUSES = [401, 403, 409, 422] as const;

const PRESET_DEFAULTS: Record<CapturePreset, Omit<ProjectCapturePolicy, "preset">> = {
  minimal: {
    capture_logs: "error",
    capture_request_events: "failures_only",
    capture_breadcrumbs: "local_only",
    capture_probe_events: "buffer_only",
    immediate_client_error_statuses: []
  },
  balanced: {
    capture_logs: "warning",
    capture_request_events: "failures_only",
    capture_breadcrumbs: "exception_only",
    capture_probe_events: "buffer_only",
    immediate_client_error_statuses: []
  },
  investigative: {
    capture_logs: "info",
    capture_request_events: "all",
    capture_breadcrumbs: "standalone",
    capture_probe_events: "standalone_when_activated",
    immediate_client_error_statuses: [...RECOMMENDED_IMMEDIATE_CLIENT_ERROR_STATUSES]
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

const selectClassName = "flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60";
const inputClassName = selectClassName;

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
  const resolvedPolicy = resolveDraft(policyDraft);
  const isDirty = baselineDraft !== null && !draftsEqual(policyDraft, baselineDraft);
  const isDisabled = isLoading || isSaving || !canEdit;
  const isSaveDisabled = isDisabled || !isDirty || customStatusValidationError !== null;

  async function handleSave(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canEdit || !isDirty || customStatusValidationError !== null) {
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
        <CardAction>
          <div className="inline-flex items-center rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {formatPreset(DEFAULT_PRESET_BY_PLAN[organizationPlan])} default on {organizationPlan}
          </div>
        </CardAction>
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
              : "Members can review the effective policy here, but only owners can change project capture settings."}
          </p>
        </div>

        {errorMessage === null ? null : (
          <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">{errorMessage}</div>
        )}

        <form className="space-y-6" onSubmit={(event) => void handleSave(event)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="project-capture-policy-preset">Preset</FieldLabel>
              <FieldDescription>Projects in organizations on the {organizationPlan} plan default to {formatPreset(DEFAULT_PRESET_BY_PLAN[organizationPlan]).toLowerCase()} unless an owner saves a different policy.</FieldDescription>
              <select
                id="project-capture-policy-preset"
                className={selectClassName}
                value={policyDraft.preset}
                onChange={(event) => {
                  const value = event.currentTarget.value as CapturePreset;
                  setDraft((current) => ({ ...(current ?? policyDraft), preset: value }));
                }}
                disabled={isDisabled}
              >
                {presetOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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
              onModeChange={(value) => {
                setDraft((current) => ({ ...(current ?? policyDraft), client_error_incident_mode: value }));
              }}
              onCustomInputChange={(value) => {
                setDraft((current) => ({ ...(current ?? policyDraft), client_error_custom_input: value }));
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
  const defaultLabel = options.find((option) => option.value === defaultValue)?.label ?? defaultValue;

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FieldDescription>{description}</FieldDescription>
      <select
        id={id}
        className={selectClassName}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value as OverrideValue<T>)}
        disabled={disabled}
      >
        <option value="">Use preset default ({defaultLabel})</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

function ClientErrorIncidentsField({
  draft,
  disabled,
  validationError,
  onModeChange,
  onCustomInputChange,
}: {
  draft: CapturePolicyDraft;
  disabled: boolean;
  validationError: string | null;
  onModeChange: (value: ClientErrorIncidentMode) => void;
  onCustomInputChange: (value: string) => void;
}): JSX.Element {
  return (
    <Field>
      <FieldLabel htmlFor="project-capture-policy-client-errors">Client error incidents</FieldLabel>
      <FieldDescription>Choose which 4xx responses should open incidents immediately instead of waiting for repeated-anomaly thresholds.</FieldDescription>
      <select
        id="project-capture-policy-client-errors"
        className={selectClassName}
        value={draft.client_error_incident_mode}
        onChange={(event) => onModeChange(event.currentTarget.value as ClientErrorIncidentMode)}
        disabled={disabled}
      >
        {clientErrorIncidentModeOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
    policy: buildDefaultPolicy(plan),
    overrides: {
      capture_logs: null,
      capture_request_events: null,
      capture_breadcrumbs: null,
      capture_probe_events: null,
      immediate_client_error_statuses: null
    }
  };
}

function buildDraft(policyResponse: ProjectCapturePolicyResponse): CapturePolicyDraft {
  const { policy, overrides } = policyResponse;
  const defaults = PRESET_DEFAULTS[policy.preset];
  const clientErrorOverride = overrides.immediate_client_error_statuses;

  return {
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
        : ""
  };
}

function resolveDraft(draft: CapturePolicyDraft): ProjectCapturePolicy {
  const defaults = PRESET_DEFAULTS[draft.preset];
  const customStatuses = parseClientErrorStatusesInput(draft.client_error_custom_input);

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
            : (customStatuses.statuses ?? [])
  };
}

function buildUpdatePayload(draft: CapturePolicyDraft): {
  preset: CapturePreset;
  capture_logs: CaptureLogs | null;
  capture_request_events: CaptureRequestEvents | null;
  capture_breadcrumbs: CaptureBreadcrumbs | null;
  capture_probe_events: CaptureProbeEvents | null;
  immediate_client_error_statuses: number[] | null;
} {
  const customStatuses = parseClientErrorStatusesInput(draft.client_error_custom_input);

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
            : customStatuses.statuses ?? []
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

function getClientErrorCustomValidationError(draft: CapturePolicyDraft): string | null {
  if (draft.client_error_incident_mode !== "custom") {
    return null;
  }

  return parseClientErrorStatusesInput(draft.client_error_custom_input).error ?? null;
}

function draftsEqual(left: CapturePolicyDraft, right: CapturePolicyDraft): boolean {
  return left.preset === right.preset
    && left.capture_logs === right.capture_logs
    && left.capture_request_events === right.capture_request_events
    && left.capture_breadcrumbs === right.capture_breadcrumbs
    && left.capture_probe_events === right.capture_probe_events
    && left.client_error_incident_mode === right.client_error_incident_mode
    && left.client_error_custom_input === right.client_error_custom_input;
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
      return `Preset default (${formatStatusList(presetDefault)})`;
    case "none":
      return "None";
    case "recommended":
      return `Recommended (${formatStatusList(RECOMMENDED_IMMEDIATE_CLIENT_ERROR_STATUSES)})`;
    case "custom":
      if (validationError !== null) {
        return "Custom (invalid)";
      }

      return `Custom (${formatStatusList(parseClientErrorStatusesInput(draft.client_error_custom_input).statuses ?? [])})`;
  }
}

function formatStatusList(statuses: readonly number[]): string {
  return statuses.length === 0 ? "none" : statuses.join(", ");
}
