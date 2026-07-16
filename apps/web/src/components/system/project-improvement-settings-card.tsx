import { GaugeIcon, RotateCcwIcon, SparklesIcon } from "lucide-react";
import { useEffect, useState } from "react";

import {
  getProjectImprovementSettings,
  updateProjectImprovementSettings,
  type ImprovementBundleSensitivity,
  type ProjectImprovementSettingsResponse,
} from "../../lib/api.js";
import { showErrorToast, showSuccessToast } from "../../lib/notify.js";
import { HostedImprovementsUpgradeCallout } from "./hosted-improvements-upgrade-callout.js";
import { Button } from "../ui/button.js";
import { CollapsibleCard } from "../ui/collapsible-card.js";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../ui/field.js";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../ui/select.js";
import { Switch } from "../ui/switch.js";

interface ProjectImprovementSettingsCardProps {
  projectId: string;
  organizationPlan: "free" | "solo" | "team";
  canEdit: boolean;
}

interface ImprovementSettingsDraft {
  access_mode: ProjectImprovementSettingsResponse["access_mode"];
  cloud_automation_available: boolean;
  automated_improvement_bundles_enabled: boolean;
  improvement_bundle_sensitivity: ImprovementBundleSensitivity;
}

const sensitivityOptions: Array<{
  value: ImprovementBundleSensitivity;
  label: string;
  description: string;
}> = [
  {
    value: "high_confidence",
    label: "High confidence only",
    description: "Generate fewer bundles and preserve quota for only the strongest recurring signals."
  },
  {
    value: "balanced",
    label: "Balanced",
    description: "Catch meaningful recurring issues without turning normal variance into queue noise."
  },
  {
    value: "verbose",
    label: "Verbose",
    description: "Generate more hardening opportunities during active tuning, rollout validation, or cleanup work."
  }
];

function buildDefaultDraft(
  organizationPlan: ProjectImprovementSettingsCardProps["organizationPlan"],
  canEdit: boolean
): ImprovementSettingsDraft {
  return {
    access_mode: canEdit ? "manage" : "preview",
    cloud_automation_available: organizationPlan !== "free",
    automated_improvement_bundles_enabled: true,
    improvement_bundle_sensitivity: "high_confidence"
  };
}

function buildDraft(response: ProjectImprovementSettingsResponse): ImprovementSettingsDraft {
  return {
    access_mode: response.access_mode,
    cloud_automation_available: response.cloud_automation_available,
    automated_improvement_bundles_enabled: response.settings.automated_improvement_bundles_enabled,
    improvement_bundle_sensitivity: response.settings.improvement_bundle_sensitivity
  };
}

function draftsEqual(left: ImprovementSettingsDraft, right: ImprovementSettingsDraft): boolean {
  return (
    left.access_mode === right.access_mode &&
    left.cloud_automation_available === right.cloud_automation_available &&
    left.automated_improvement_bundles_enabled === right.automated_improvement_bundles_enabled &&
    left.improvement_bundle_sensitivity === right.improvement_bundle_sensitivity
  );
}

function formatSensitivityLabel(value: ImprovementBundleSensitivity): string {
  return sensitivityOptions.find((option) => option.value === value)?.label ?? value;
}

export function ProjectImprovementSettingsCard({
  projectId,
  organizationPlan,
  canEdit
}: ProjectImprovementSettingsCardProps): JSX.Element {
  const [draft, setDraft] = useState<ImprovementSettingsDraft | null>(null);
  const [baselineDraft, setBaselineDraft] = useState<ImprovementSettingsDraft | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadSettings(): Promise<void> {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await getProjectImprovementSettings(projectId);
        if (!isActive) {
          return;
        }

        const nextDraft = buildDraft(response);
        setDraft(nextDraft);
        setBaselineDraft(nextDraft);
      } catch {
        if (!isActive) {
          return;
        }

        setErrorMessage("Could not load automated improvement settings.");
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
  }, [projectId]);

  const settingsDraft = draft ?? buildDefaultDraft(organizationPlan, canEdit);
  const showManageControls =
    canEdit && settingsDraft.access_mode === "manage" && settingsDraft.cloud_automation_available;
  const isDirty = baselineDraft !== null && !draftsEqual(settingsDraft, baselineDraft);
  const isDisabled = isLoading || isSaving || !showManageControls;
  const isSaveDisabled = isDisabled || !isDirty;

  async function handleSave(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!showManageControls || !isDirty) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const response = await updateProjectImprovementSettings(projectId, {
        automated_improvement_bundles_enabled: settingsDraft.automated_improvement_bundles_enabled,
        improvement_bundle_sensitivity: settingsDraft.improvement_bundle_sensitivity
      });
      const nextDraft = buildDraft(response);
      setDraft(nextDraft);
      setBaselineDraft(nextDraft);
      showSuccessToast("Improvement settings updated successfully.");
    } catch {
      showErrorToast("Could not save improvement settings.");
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
    <CollapsibleCard
      title="Improvement bundles"
      description="Generate automated hosted hardening signals for this project."
      contentClassName="flex flex-col gap-6"
    >
        {settingsDraft.cloud_automation_available ? null : <HostedImprovementsUpgradeCallout scope="project" />}

        {errorMessage === null ? null : (
          <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">{errorMessage}</div>
        )}

        <form className="flex flex-col gap-6" onSubmit={(event) => void handleSave(event)}>
          {showManageControls ? (
            <FieldGroup>
              <Field orientation="horizontal" className="items-center justify-between gap-4">
                <div className="flex flex-1 flex-col gap-1">
                  <FieldLabel id="project-improvement-bundles-enabled-label" htmlFor="project-improvement-bundles-enabled">Enabled</FieldLabel>
                  <FieldDescription>
                    Create improvement bundles from recurring project signals.
                  </FieldDescription>
                </div>
                <Switch
                  id="project-improvement-bundles-enabled"
                  aria-labelledby="project-improvement-bundles-enabled-label"
                  checked={settingsDraft.automated_improvement_bundles_enabled}
                  disabled={isDisabled}
                  onCheckedChange={(checked) => {
                    setDraft((current) => ({
                      ...(current ?? settingsDraft),
                      automated_improvement_bundles_enabled: checked
                    }));
                  }}
                />
              </Field>

              {settingsDraft.automated_improvement_bundles_enabled ? (
                <Field>
                  <FieldLabel id="project-improvement-sensitivity-label" htmlFor="project-improvement-sensitivity">
                    Sensitivity
                  </FieldLabel>
                  <FieldDescription>
                    Choose how aggressively hosted signals should become improvement bundles.
                  </FieldDescription>
                  <Select
                    value={settingsDraft.improvement_bundle_sensitivity}
                    onValueChange={(value) => {
                      setDraft((current) => ({
                        ...(current ?? settingsDraft),
                        improvement_bundle_sensitivity: value as ImprovementBundleSensitivity
                      }));
                    }}
                    disabled={isDisabled}
                  >
                    <SelectTrigger
                      id="project-improvement-sensitivity"
                      aria-labelledby="project-improvement-sensitivity-label project-improvement-sensitivity"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      <SelectGroup>
                        {sensitivityOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    {sensitivityOptions.find((option) => option.value === settingsDraft.improvement_bundle_sensitivity)?.description}
                  </FieldDescription>
                </Field>
              ) : null}
            </FieldGroup>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <SummaryTile
                icon={SparklesIcon}
                label="Automation"
                value={
                  settingsDraft.cloud_automation_available
                    ? settingsDraft.automated_improvement_bundles_enabled
                      ? "Enabled"
                      : "Disabled"
                    : "Unavailable"
                }
              />
              <SummaryTile
                icon={GaugeIcon}
                label="Sensitivity"
                value={
                  settingsDraft.cloud_automation_available
                    ? formatSensitivityLabel(settingsDraft.improvement_bundle_sensitivity)
                    : "Balanced"
                }
              />
            </div>
          )}

          {showManageControls ? (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" disabled={!isDirty || isSaving} onClick={handleReset}>
                <RotateCcwIcon data-icon="inline-start" />
                Reset
              </Button>
              <Button type="submit" disabled={isSaveDisabled}>
                Save improvement settings
              </Button>
            </div>
          ) : null}

        </form>
    </CollapsibleCard>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value
}: {
  icon: typeof SparklesIcon;
  label: string;
  value: string;
}): JSX.Element {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/80 bg-background/60 px-4 py-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-sm leading-normal text-muted-foreground">{value}</p>
      </div>
    </div>
  );
}
