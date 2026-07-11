import { RotateCcwIcon } from "lucide-react";
import { useEffect, useState } from "react";

import {
  getProjectAnalyticsSettings,
  updateProjectAnalyticsSettings,
  type AnalyticsPrivacyMode,
  type ProjectAnalyticsSettings,
  type ProjectAnalyticsSettingsResponse
} from "../../lib/api.js";
import { showErrorToast, showSuccessToast } from "../../lib/notify.js";
import { Button } from "../ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.js";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "../ui/field.js";
import { Input } from "../ui/input.js";
import { Notice } from "../ui/notice.js";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../ui/select.js";
import { Skeleton } from "../ui/skeleton.js";
import { Switch } from "../ui/switch.js";
import { PlanUpgradeCallout } from "./plan-upgrade-callout.js";

interface ProjectAnalyticsSettingsCardProps {
  projectId: string;
  organizationPlan: "free" | "solo" | "team";
  canEdit: boolean;
}

interface AnalyticsSettingsDraft extends ProjectAnalyticsSettings {
  access_mode: ProjectAnalyticsSettingsResponse["access_mode"];
  analytics_available: boolean;
  approved_custom_dimensions_text: string;
}

const defaultSettings: ProjectAnalyticsSettings = {
  enabled: false,
  privacy_mode: "strict",
  consent_required: false,
  capture_page_views: true,
  capture_route_changes: true,
  capture_actions: false,
  capture_friction_signals: true,
  journey_sample_rate: 0,
  raw_retention_days: 1,
  sample_retention_days: 7,
  aggregate_retention_months: 12,
  max_saved_funnels: 3,
  max_custom_dimensions: 0,
  approved_custom_dimensions: []
};

const privacyOptions: Array<{ value: AnalyticsPrivacyMode; label: string; description: string }> = [
  {
    value: "strict",
    label: "Strict",
    description: "Use session-only identity and the smallest durable analytics footprint."
  },
  {
    value: "standard",
    label: "Standard",
    description: "Allow a project-scoped anonymous returning-visitor hash when consent permits."
  },
  {
    value: "custom",
    label: "Custom",
    description: "Use explicit SDK configuration while preserving DebugBundle redaction rules."
  }
];

function buildDraft(response: ProjectAnalyticsSettingsResponse): AnalyticsSettingsDraft {
  return {
    access_mode: response.access_mode,
    analytics_available: response.analytics_available,
    ...response.settings,
    approved_custom_dimensions_text: response.settings.approved_custom_dimensions.join(", ")
  };
}

function buildFallbackDraft(input: ProjectAnalyticsSettingsCardProps): AnalyticsSettingsDraft {
  return {
    access_mode: input.canEdit ? "manage" : "preview",
    analytics_available: input.organizationPlan !== "free",
    ...defaultSettings,
    approved_custom_dimensions_text: ""
  };
}

function parseCustomDimensionKeys(value: string): string[] {
  return value
    .split(",")
    .map((key) => key.trim())
    .filter((key, index, keys) => key.length > 0 && keys.indexOf(key) === index);
}

function settingsPayload(draft: AnalyticsSettingsDraft): ProjectAnalyticsSettings {
  return {
    enabled: draft.enabled,
    privacy_mode: draft.privacy_mode,
    consent_required: draft.consent_required,
    capture_page_views: draft.capture_page_views,
    capture_route_changes: draft.capture_route_changes,
    capture_actions: draft.capture_actions,
    capture_friction_signals: draft.capture_friction_signals,
    journey_sample_rate: draft.journey_sample_rate,
    raw_retention_days: draft.raw_retention_days,
    sample_retention_days: draft.sample_retention_days,
    aggregate_retention_months: draft.aggregate_retention_months,
    max_saved_funnels: draft.max_saved_funnels,
    max_custom_dimensions: draft.max_custom_dimensions,
    approved_custom_dimensions: draft.approved_custom_dimensions
  };
}

function draftsEqual(left: AnalyticsSettingsDraft, right: AnalyticsSettingsDraft): boolean {
  return JSON.stringify(settingsPayload(left)) === JSON.stringify(settingsPayload(right));
}

function formatPrivacyMode(value: AnalyticsPrivacyMode): string {
  return `${privacyOptions.find((option) => option.value === value)?.label ?? value} privacy`;
}

export function ProjectAnalyticsSettingsCard(props: ProjectAnalyticsSettingsCardProps): JSX.Element {
  const { projectId, organizationPlan, canEdit } = props;
  const [draft, setDraft] = useState<AnalyticsSettingsDraft | null>(null);
  const [baseline, setBaseline] = useState<AnalyticsSettingsDraft | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadSettings(): Promise<void> {
      setIsLoading(true);
      setLoadError(null);
      try {
        const response = await getProjectAnalyticsSettings(projectId);
        if (isActive) {
          const nextDraft = buildDraft(response);
          setDraft(nextDraft);
          setBaseline(nextDraft);
        }
      } catch {
        if (isActive) {
          setLoadError("Could not load product analytics settings.");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadSettings();
    return () => {
      isActive = false;
    };
  }, [loadAttempt, projectId]);

  const settingsDraft = draft ?? buildFallbackDraft(props);
  const hasLoadedSettings = draft !== null && loadError === null;
  const canManage =
    hasLoadedSettings && canEdit && settingsDraft.access_mode === "manage" && settingsDraft.analytics_available;
  const isTeam = organizationPlan === "team";
  const customDimensionKeys = parseCustomDimensionKeys(settingsDraft.approved_custom_dimensions_text);
  const customDimensionsInvalid =
    isTeam &&
    (customDimensionKeys.length > settingsDraft.max_custom_dimensions ||
      customDimensionKeys.some((key) => !/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(key)));
  const isDirty = baseline !== null && !draftsEqual(settingsDraft, baseline);

  function updateDraft(update: Partial<AnalyticsSettingsDraft>): void {
    setDraft((current) => ({ ...(current ?? settingsDraft), ...update }));
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canManage || !isDirty || customDimensionsInvalid) {
      return;
    }

    setIsSaving(true);
    try {
      const response = await updateProjectAnalyticsSettings(projectId, settingsPayload(settingsDraft));
      const nextDraft = buildDraft(response);
      setDraft(nextDraft);
      setBaseline(nextDraft);
      showSuccessToast("Analytics settings updated successfully.");
    } catch {
      showErrorToast("Could not save analytics settings.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Product analytics</CardTitle>
        <CardDescription>Configure opt-in browser usage capture, privacy, and bounded retention.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {loadError === null ? null : (
          <Notice title="Analytics settings unavailable" tone="destructive">
            <div className="flex flex-col items-start gap-2">
              <p>{loadError}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
                Retry
              </Button>
            </div>
          </Notice>
        )}

        {isLoading && draft === null ? (
          <div className="flex flex-col gap-3" aria-label="Loading product analytics settings">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : null}

        {!hasLoadedSettings || settingsDraft.analytics_available ? null : (
          <PlanUpgradeCallout
            title="Upgrade to Solo or Team to unlock product analytics"
            description="Product analytics capture, aggregate metrics, journey evidence, and AnalyticsBundles are available on paid plans."
          />
        )}

        {canManage ? (
          <form className="flex flex-col gap-6" onSubmit={(event) => void handleSave(event)}>
            <FieldGroup>
              <SwitchField
                id="project-analytics-enabled"
                label="Analytics capture"
                description="Accept opted-in browser analytics events for this project. Debug capture remains independent."
                checked={settingsDraft.enabled}
                disabled={isLoading || isSaving}
                onCheckedChange={(enabled) => updateDraft({ enabled })}
              />

              <Field>
                <FieldLabel id="project-analytics-privacy-label" htmlFor="project-analytics-privacy">Privacy mode</FieldLabel>
                <FieldDescription>Choose the identity and storage posture applied to browser analytics.</FieldDescription>
                <Select
                  value={settingsDraft.privacy_mode}
                  disabled={isLoading || isSaving}
                  onValueChange={(privacyMode) => updateDraft({ privacy_mode: privacyMode as AnalyticsPrivacyMode })}
                >
                  <SelectTrigger id="project-analytics-privacy" aria-labelledby="project-analytics-privacy-label project-analytics-privacy" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectGroup>
                      {privacyOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>{privacyOptions.find((option) => option.value === settingsDraft.privacy_mode)?.description}</FieldDescription>
              </Field>

              <SwitchField
                id="project-analytics-consent"
                label="Require consent"
                description="Keep analytics capture paused until the browser SDK receives explicit consent."
                checked={settingsDraft.consent_required}
                disabled={isLoading || isSaving}
                onCheckedChange={(consentRequired) => updateDraft({ consent_required: consentRequired })}
              />
            </FieldGroup>

            <FieldSet>
              <FieldLegend>Capture</FieldLegend>
              <FieldDescription>Choose the bounded product signals the browser SDK may emit.</FieldDescription>
              <FieldGroup className="grid gap-5 md:grid-cols-2">
                <SwitchField id="project-analytics-page-views" label="Capture page views" description="Record initial browser page views." checked={settingsDraft.capture_page_views} disabled={isLoading || isSaving} onCheckedChange={(capturePageViews) => updateDraft({ capture_page_views: capturePageViews })} />
                <SwitchField id="project-analytics-route-changes" label="Capture route changes" description="Record safe SPA navigation transitions." checked={settingsDraft.capture_route_changes} disabled={isLoading || isSaving} onCheckedChange={(captureRouteChanges) => updateDraft({ capture_route_changes: captureRouteChanges })} />
                <SwitchField id="project-analytics-actions" label="Capture semantic actions" description="Record explicitly named product actions and conversions." checked={settingsDraft.capture_actions} disabled={isLoading || isSaving} onCheckedChange={(captureActions) => updateDraft({ capture_actions: captureActions })} />
                <SwitchField id="project-analytics-friction" label="Capture friction signals" description="Record fixed repeated-click, dead-click, and backtrack markers." checked={settingsDraft.capture_friction_signals} disabled={isLoading || isSaving} onCheckedChange={(captureFriction) => updateDraft({ capture_friction_signals: captureFriction })} />
              </FieldGroup>
            </FieldSet>

            <FieldSet>
              <FieldLegend>Sampling and retention</FieldLegend>
              <FieldDescription>Raw and journey evidence expires; aggregate metrics remain for the configured window.</FieldDescription>
              <FieldGroup className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                <NumberField id="project-analytics-sample-rate" label="Journey sample rate (%)" value={settingsDraft.journey_sample_rate * 100} min={0} max={100} step={1} disabled={isLoading || isSaving} onChange={(value) => updateDraft({ journey_sample_rate: value / 100 })} />
                <NumberField id="project-analytics-raw-retention" label="Raw retention (days)" value={settingsDraft.raw_retention_days} min={1} max={30} disabled={isLoading || isSaving} onChange={(rawRetentionDays) => updateDraft({ raw_retention_days: rawRetentionDays })} />
                <NumberField id="project-analytics-sample-retention" label="Journey retention (days)" value={settingsDraft.sample_retention_days} min={1} max={365} disabled={isLoading || isSaving} onChange={(sampleRetentionDays) => updateDraft({ sample_retention_days: sampleRetentionDays })} />
                <NumberField id="project-analytics-aggregate-retention" label="Aggregate retention (months)" value={settingsDraft.aggregate_retention_months} min={1} max={120} disabled={isLoading || isSaving} onChange={(aggregateRetentionMonths) => updateDraft({ aggregate_retention_months: aggregateRetentionMonths })} />
                <NumberField id="project-analytics-saved-funnels" label="Saved funnel limit" value={settingsDraft.max_saved_funnels} min={0} max={organizationPlan === "team" ? 50 : 10} disabled={isLoading || isSaving} onChange={(maxSavedFunnels) => updateDraft({ max_saved_funnels: maxSavedFunnels })} />
              </FieldGroup>
            </FieldSet>

            {isTeam ? (
              <FieldSet>
                <FieldLegend>Controlled custom dimensions</FieldLegend>
                <FieldDescription>Allow only low-cardinality, non-sensitive keys approved for this project.</FieldDescription>
                <FieldGroup className="grid gap-5 md:grid-cols-[12rem_1fr]">
                  <NumberField id="project-analytics-custom-dimension-limit" label="Custom dimension limit" value={settingsDraft.max_custom_dimensions} min={0} max={8} disabled={isLoading || isSaving} onChange={(maxCustomDimensions) => updateDraft({ max_custom_dimensions: maxCustomDimensions })} />
                  <Field data-invalid={customDimensionsInvalid || undefined}>
                    <FieldLabel htmlFor="project-analytics-custom-dimensions">Approved custom dimensions</FieldLabel>
                    <Input
                      id="project-analytics-custom-dimensions"
                      value={settingsDraft.approved_custom_dimensions_text}
                      aria-invalid={customDimensionsInvalid || undefined}
                      placeholder="account_type, release_channel"
                      disabled={isLoading || isSaving}
                      onChange={(event) => updateDraft({
                        approved_custom_dimensions_text: event.target.value,
                        approved_custom_dimensions: parseCustomDimensionKeys(event.target.value)
                      })}
                    />
                    <FieldDescription>Comma-separated keys using letters, numbers, dots, underscores, or hyphens.</FieldDescription>
                    {customDimensionsInvalid ? <FieldError>Use valid unique keys and keep their count within the selected limit.</FieldError> : null}
                  </Field>
                </FieldGroup>
              </FieldSet>
            ) : (
              <Notice title="Controlled custom dimensions require Team">
                Solo keeps analytics intentionally bounded to standard device, location, campaign, route, and product signals.
              </Notice>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" disabled={!isDirty || isSaving} onClick={() => baseline === null ? undefined : setDraft(baseline)}>
                <RotateCcwIcon data-icon="inline-start" />
                Reset
              </Button>
              <Button type="submit" disabled={isLoading || isSaving || !isDirty || customDimensionsInvalid}>
                Save analytics settings
              </Button>
            </div>
          </form>
        ) : hasLoadedSettings && settingsDraft.analytics_available ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SummaryTile label="Capture" value={`Analytics capture is ${settingsDraft.enabled ? "enabled" : "disabled"}`} />
            <SummaryTile label="Privacy" value={formatPrivacyMode(settingsDraft.privacy_mode)} />
            <SummaryTile label="Consent" value={settingsDraft.consent_required ? "Required" : "Not required"} />
            <SummaryTile label="Journey sampling" value={`${settingsDraft.journey_sample_rate * 100}%`} />
            <SummaryTile label="Raw retention" value={`${settingsDraft.raw_retention_days} days`} />
            <SummaryTile label="Aggregate retention" value={`${settingsDraft.aggregate_retention_months} months`} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SwitchField(input: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}): JSX.Element {
  return (
    <Field orientation="horizontal" className="items-center justify-between gap-4">
      <div className="flex flex-1 flex-col gap-1">
        <FieldLabel id={`${input.id}-label`} htmlFor={input.id}>{input.label}</FieldLabel>
        <FieldDescription>{input.description}</FieldDescription>
      </div>
      <Switch id={input.id} aria-labelledby={`${input.id}-label`} checked={input.checked} disabled={input.disabled} onCheckedChange={input.onCheckedChange} />
    </Field>
  );
}

function NumberField(input: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled: boolean;
  onChange: (value: number) => void;
}): JSX.Element {
  return (
    <Field>
      <FieldLabel htmlFor={input.id}>{input.label}</FieldLabel>
      <Input
        id={input.id}
        type="number"
        value={input.value}
        min={input.min}
        max={input.max}
        step={input.step ?? 1}
        disabled={input.disabled}
        onChange={(event) => {
          const value = event.currentTarget.valueAsNumber;
          if (Number.isFinite(value)) {
            input.onChange(value);
          }
        }}
        required
      />
    </Field>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border/80 bg-background/60 px-4 py-3">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="text-sm leading-normal text-muted-foreground">{value}</p>
    </div>
  );
}
