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
} from "../../lib/api.js";
import { showErrorToast, showSuccessToast } from "../../lib/notify.js";
import { Button } from "../ui/button.js";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.js";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../ui/field.js";

type OverrideValue<T extends string> = "" | T;

interface CapturePolicyDraft {
  preset: CapturePreset;
  capture_logs: OverrideValue<CaptureLogs>;
  capture_request_events: OverrideValue<CaptureRequestEvents>;
  capture_breadcrumbs: OverrideValue<CaptureBreadcrumbs>;
  capture_probe_events: OverrideValue<CaptureProbeEvents>;
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

const PRESET_DEFAULTS: Record<CapturePreset, Omit<ProjectCapturePolicy, "preset">> = {
  minimal: {
    capture_logs: "error",
    capture_request_events: "off",
    capture_breadcrumbs: "local_only",
    capture_probe_events: "buffer_only"
  },
  balanced: {
    capture_logs: "warning",
    capture_request_events: "failures_only",
    capture_breadcrumbs: "exception_only",
    capture_probe_events: "buffer_only"
  },
  investigative: {
    capture_logs: "info",
    capture_request_events: "all",
    capture_breadcrumbs: "standalone",
    capture_probe_events: "standalone_when_activated"
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

const selectClassName = "flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60";

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
        const policy = await getProjectCapturePolicy(projectId);
        if (!isActive) {
          return;
        }

        const nextDraft = buildDraft(policy);
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

  const policyDraft = draft ?? buildDraft(buildDefaultPolicy(organizationPlan));
  const resolvedPolicy = resolveDraft(policyDraft);
  const isDirty = baselineDraft !== null && !draftsEqual(policyDraft, baselineDraft);
  const isDisabled = isLoading || isSaving || !canEdit;

  async function handleSave(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canEdit || !isDirty) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const updatedPolicy = await updateProjectCapturePolicy(projectId, buildUpdatePayload(policyDraft));
      const nextDraft = buildDraft(updatedPolicy);
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
              description="Keep request-event capture off, failure-only, or open it up when you need richer traces."
              disabled={isDisabled}
              value={policyDraft.capture_request_events}
              defaultValue={PRESET_DEFAULTS[policyDraft.preset].capture_request_events}
              options={captureRequestOptions}
              onChange={(value) => {
                setDraft((current) => ({ ...(current ?? policyDraft), capture_request_events: value }));
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
              <ResolvedValue label="Requests" value={formatRequests(resolvedPolicy.capture_request_events)} />
              <ResolvedValue label="Breadcrumbs" value={formatBreadcrumbs(resolvedPolicy.capture_breadcrumbs)} />
              <ResolvedValue label="Probes" value={formatProbes(resolvedPolicy.capture_probe_events)} />
            </div>
          </div>

          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={isDisabled || !isDirty}>
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

function buildDraft(policy: ProjectCapturePolicy): CapturePolicyDraft {
  const defaults = PRESET_DEFAULTS[policy.preset];
  return {
    preset: policy.preset,
    capture_logs: policy.capture_logs === defaults.capture_logs ? "" : policy.capture_logs,
    capture_request_events: policy.capture_request_events === defaults.capture_request_events ? "" : policy.capture_request_events,
    capture_breadcrumbs: policy.capture_breadcrumbs === defaults.capture_breadcrumbs ? "" : policy.capture_breadcrumbs,
    capture_probe_events: policy.capture_probe_events === defaults.capture_probe_events ? "" : policy.capture_probe_events,
  };
}

function resolveDraft(draft: CapturePolicyDraft): ProjectCapturePolicy {
  const defaults = PRESET_DEFAULTS[draft.preset];
  return {
    preset: draft.preset,
    capture_logs: draft.capture_logs || defaults.capture_logs,
    capture_request_events: draft.capture_request_events || defaults.capture_request_events,
    capture_breadcrumbs: draft.capture_breadcrumbs || defaults.capture_breadcrumbs,
    capture_probe_events: draft.capture_probe_events || defaults.capture_probe_events,
  };
}

function buildUpdatePayload(draft: CapturePolicyDraft): {
  preset: CapturePreset;
  capture_logs: CaptureLogs | null;
  capture_request_events: CaptureRequestEvents | null;
  capture_breadcrumbs: CaptureBreadcrumbs | null;
  capture_probe_events: CaptureProbeEvents | null;
} {
  return {
    preset: draft.preset,
    capture_logs: draft.capture_logs || null,
    capture_request_events: draft.capture_request_events || null,
    capture_breadcrumbs: draft.capture_breadcrumbs || null,
    capture_probe_events: draft.capture_probe_events || null,
  };
}

function draftsEqual(left: CapturePolicyDraft, right: CapturePolicyDraft): boolean {
  return left.preset === right.preset
    && left.capture_logs === right.capture_logs
    && left.capture_request_events === right.capture_request_events
    && left.capture_breadcrumbs === right.capture_breadcrumbs
    && left.capture_probe_events === right.capture_probe_events;
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