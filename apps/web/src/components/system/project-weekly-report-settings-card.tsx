import { BellRingIcon, CalendarClockIcon, MailIcon, PlusIcon, RotateCcwIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { getTierCapabilities } from "../../../../../packages/shared-types/src/index.js";
import { WeeklyReportSlackChannels } from "./weekly-report-slack-channels.js";
import { WeeklyReportEmailFields } from "./weekly-report-email-fields.js";
import { WeeklyReportScheduleFields } from "./weekly-report-schedule-fields.js";
import { BoundedListLimit } from "./bounded-list-limit.js";
import { ResourceDeleteDialog } from "./resource-delete-dialog.js";
import { ConnectedSlackDestinationField } from "./connected-slack-destination-field.js";
import { DialogFormContent } from "./dialog-form-content.js";
import { CalloutCard } from "./callout-card.js";
import { ProjectResourceEmptyState } from "./project-resource-empty-state.js";

import { Button } from "../ui/button.js";
import { CollapsibleCard } from "../ui/collapsible-card.js";
import { Dialog } from "../ui/dialog.js";
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
import {
  createProjectWeeklyReportChannel,
  deleteProjectWeeklyReportChannel,
  listProjectWeeklyReportChannels,
  updateProjectWeeklyReportChannel,
  type WeeklyReportChannelRecord
} from "../../lib/api.js";
import { showErrorToast, showSuccessToast } from "../../lib/notify.js";
import {
  deleteProjectSlackDestination,
  getSlackInstallUrl,
  listProjectSlackDestinations,
  testProjectSlackDestination,
  type SlackDestinationRecord
} from "../../lib/slack-api.js";
import {
  getSlackDestinationErrorMessage,
  resolveSlackDestinationSelection
} from "../../lib/slack-destinations.js";

import {
  maxEmailRecipients,
  buildDefaultEmailDraft,
  buildEmailDraft,
  buildSlackDraft,
  normalizeRecipients,
  emailDraftsEqual,
  formatSchedule,
  type EmailWeeklyReportDraft,
  type SlackWeeklyReportDraft
} from "../../lib/weekly-report-form.js";

interface ProjectWeeklyReportSettingsCardProps {
  projectId: string;
  organizationPlan: "free" | "solo" | "team";
  canEdit: boolean;
}

export function ProjectWeeklyReportSettingsCard({
  projectId,
  organizationPlan,
  canEdit
}: ProjectWeeklyReportSettingsCardProps): JSX.Element {
  const generation = useRef(0);
  const [channelLimit, setChannelLimit] = useState(50);
  const [isDeletingEmail, setIsDeletingEmail] = useState(false);
  useEffect(() => {
    generation.current += 1;
    setEmailDraft(null);
    setBaselineEmailDraft(null);
    setSlackChannels([]);
    setSlackDestinations([]);
    setSlackDestinationsLoaded(false);
    setIsConnectingSlack(false);
    setSlackTestDestinationId(null);
    setSlackDeleteDestinationId(null);
    setErrorMessage(null);
    setIsSavingEmail(false);
    setIsSavingSlack(false);
    setIsDeletingEmail(false);
    setIsSlackDialogOpen(false);
    setSlackDraft(null);
    return () => {
      generation.current += 1;
    };
  }, [projectId]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [emailDraft, setEmailDraft] = useState<EmailWeeklyReportDraft | null>(null);
  const [baselineEmailDraft, setBaselineEmailDraft] = useState<EmailWeeklyReportDraft | null>(null);
  const [slackChannels, setSlackChannels] = useState<WeeklyReportChannelRecord[]>([]);
  const [slackDestinations, setSlackDestinations] = useState<SlackDestinationRecord[]>([]);
  const [slackDestinationsLoaded, setSlackDestinationsLoaded] = useState(false);
  const [preferredSlackDestinationId, setPreferredSlackDestinationId] = useState<string | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [isSlackDialogOpen, setIsSlackDialogOpen] = useState(false);
  const [slackDraft, setSlackDraft] = useState<SlackWeeklyReportDraft | null>(null);
  const [isSavingSlack, setIsSavingSlack] = useState(false);
  const [isConnectingSlack, setIsConnectingSlack] = useState(false);
  const [slackTestDestinationId, setSlackTestDestinationId] = useState<string | null>(null);
  const [slackDeleteDestinationId, setSlackDeleteDestinationId] = useState<string | null>(null);
  const [slackChannelToDelete, setSlackChannelToDelete] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const slackEnabled = getTierCapabilities(organizationPlan).slack_integration;

  async function refreshSlackDestinations(
    nextPreferredDestinationId: string | null = preferredSlackDestinationId
  ): Promise<void> {
    const requestGeneration = generation.current;
    try {
      const destinations = await listProjectSlackDestinations(projectId);
      if (generation.current !== requestGeneration) return;
      setSlackDestinations(destinations);
      const resolvedDestinationId = resolveSlackDestinationSelection(
        destinations,
        nextPreferredDestinationId
      );
      setSlackDraft((current) =>
        current === null
          ? current
          : {
              ...current,
              slack_destination_id:
                current.slack_destination_id.length > 0 &&
                destinations.some(
                  (destination) => destination.slack_destination_id === current.slack_destination_id
                )
                  ? current.slack_destination_id
                  : (resolvedDestinationId ?? "")
            }
      );
    } catch {
      if (generation.current === requestGeneration) setSlackDestinations([]);
    } finally {
      if (generation.current === requestGeneration) setSlackDestinationsLoaded(true);
    }
  }

  useEffect(() => {
    let isActive = true;

    async function loadWeeklyReports(): Promise<void> {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const channels = await listProjectWeeklyReportChannels(projectId, channelLimit);
        if (!isActive) {
          return;
        }

        const nextEmailDraft = buildEmailDraft(
          channels.find((channel) => channel.channel === "email") ?? null
        );
        setEmailDraft(nextEmailDraft);
        setBaselineEmailDraft(nextEmailDraft);
        setSlackChannels(channels.filter((channel) => channel.channel === "slack"));
      } catch {
        if (!isActive) {
          return;
        }

        setErrorMessage("Could not load weekly report settings.");
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadWeeklyReports();
    void refreshSlackDestinations();

    return () => {
      isActive = false;
    };
  }, [projectId, channelLimit]);

  useEffect(() => {
    const slackConnectStatus = searchParams.get("slack_connect");
    if (slackConnectStatus === null) {
      return;
    }

    const nextPreferredDestinationId = searchParams.get("slack_destination_id");
    setPreferredSlackDestinationId(nextPreferredDestinationId);

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete("slack_connect");
    nextSearchParams.delete("slack_destination_id");
    setSearchParams(nextSearchParams, { replace: true });

    if (slackConnectStatus === "success") {
      setIsSlackDialogOpen(true);
      setSlackDraft((current) => current ?? buildSlackDraft(null, nextPreferredDestinationId));
      showSuccessToast("Slack channel connected successfully.");
      void refreshSlackDestinations(nextPreferredDestinationId);
      return;
    }

    if (slackConnectStatus === "cancelled") {
      showErrorToast("Slack connection was cancelled.");
      return;
    }

    showErrorToast("We could not connect Slack. Please try again.");
  }, [searchParams, setSearchParams]);

  const settingsDraft = emailDraft ?? buildDefaultEmailDraft();
  const recipients = normalizeRecipients(settingsDraft.recipients);
  const isEmailDirty =
    baselineEmailDraft !== null && !emailDraftsEqual(settingsDraft, baselineEmailDraft);
  const isEmailDisabled = isLoading || isSavingEmail || isDeletingEmail || !canEdit;
  const emailValidationMessage =
    (settingsDraft.is_enabled || isEmailDirty) && recipients.length === 0
      ? "Add at least one recipient before enabling weekly reports."
      : recipients.length > maxEmailRecipients
        ? "Use 3 or fewer recipients for weekly reports."
        : null;
  const isEmailSaveDisabled = isEmailDisabled || !isEmailDirty || emailValidationMessage !== null;

  async function handleSaveEmail(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isEmailSaveDisabled) {
      return;
    }

    const requestGeneration = generation.current;
    setIsSavingEmail(true);
    setErrorMessage(null);

    try {
      const payload = {
        config: { to: recipients },
        schedule: {
          day_of_week: settingsDraft.day_of_week,
          hour_of_day: settingsDraft.hour_of_day,
          timezone: settingsDraft.timezone
        },
        is_enabled: settingsDraft.is_enabled
      };
      const channel =
        settingsDraft.channel_id === null
          ? await createProjectWeeklyReportChannel({
              project_id: projectId,
              channel: "email",
              ...payload
            })
          : await updateProjectWeeklyReportChannel(settingsDraft.channel_id, payload);
      if (generation.current !== requestGeneration) return;
      const nextDraft = buildEmailDraft(channel);
      setEmailDraft(nextDraft);
      setBaselineEmailDraft(nextDraft);
      showSuccessToast("Email weekly report settings updated successfully.");
    } catch {
      if (generation.current !== requestGeneration) return;
      setErrorMessage("Could not save weekly report settings.");
      showErrorToast("Could not save weekly report settings.");
    } finally {
      if (generation.current === requestGeneration) setIsSavingEmail(false);
    }
  }

  async function handleDeleteEmail(): Promise<void> {
    if (!canEdit || settingsDraft.channel_id === null || isEmailDisabled) return;
    const requestGeneration = generation.current;
    setIsDeletingEmail(true);
    try {
      await deleteProjectWeeklyReportChannel(settingsDraft.channel_id);
      if (generation.current !== requestGeneration) return;
      const draft = buildDefaultEmailDraft();
      setEmailDraft(draft);
      setBaselineEmailDraft(draft);
      showSuccessToast("Email weekly report deleted successfully.");
    } catch {
      if (generation.current === requestGeneration)
        showErrorToast("Could not delete this email weekly report.");
    } finally {
      if (generation.current === requestGeneration) setIsDeletingEmail(false);
    }
  }

  function handleResetEmail(): void {
    if (baselineEmailDraft !== null) {
      setEmailDraft(baselineEmailDraft);
      setErrorMessage(null);
    }
  }

  function openCreateSlackDialog(): void {
    setSlackDraft(
      buildSlackDraft(
        null,
        resolveSlackDestinationSelection(slackDestinations, preferredSlackDestinationId)
      )
    );
    setIsSlackDialogOpen(true);
  }

  function openEditSlackDialog(channel: WeeklyReportChannelRecord): void {
    setSlackDraft(
      buildSlackDraft(
        channel,
        resolveSlackDestinationSelection(slackDestinations, preferredSlackDestinationId)
      )
    );
    setIsSlackDialogOpen(true);
  }

  function handleSlackDialogOpenChange(nextOpen: boolean): void {
    setIsSlackDialogOpen(nextOpen);
    if (!nextOpen) {
      setSlackDraft(null);
    }
  }

  async function handleConnectSlack(): Promise<void> {
    const requestGeneration = generation.current;
    try {
      setIsConnectingSlack(true);
      const installUrl = await getSlackInstallUrl(projectId, `/projects/${projectId}/settings`);
      if (generation.current !== requestGeneration) return;
      window.location.assign(installUrl);
    } catch {
      if (generation.current !== requestGeneration) return;
      setIsConnectingSlack(false);
      showErrorToast("Could not start the Slack connect flow.");
    }
  }

  async function handleTestSlackDestination(destinationId: string): Promise<void> {
    const requestGeneration = generation.current;
    try {
      setSlackTestDestinationId(destinationId);
      await testProjectSlackDestination(projectId, destinationId);
      if (generation.current !== requestGeneration) return;
      showSuccessToast("Slack test message sent successfully.");
    } catch (error) {
      if (generation.current !== requestGeneration) return;
      showErrorToast(getSlackDestinationErrorMessage(error, "test"));
    } finally {
      if (generation.current === requestGeneration) setSlackTestDestinationId(null);
    }
  }

  async function handleDeleteSlackDestination(destinationId: string): Promise<void> {
    const requestGeneration = generation.current;
    try {
      setSlackDeleteDestinationId(destinationId);
      await deleteProjectSlackDestination(projectId, destinationId);
      if (generation.current !== requestGeneration) return;
      const remainingDestinations = slackDestinations.filter(
        (destination) => destination.slack_destination_id !== destinationId
      );
      setSlackDestinations(remainingDestinations);
      const nextSelectedDestinationId =
        resolveSlackDestinationSelection(remainingDestinations, null) ?? "";
      setSlackDraft((current) =>
        current === null
          ? current
          : {
              ...current,
              slack_destination_id: nextSelectedDestinationId
            }
      );
      setPreferredSlackDestinationId(
        nextSelectedDestinationId.length > 0 ? nextSelectedDestinationId : null
      );
      showSuccessToast("Slack channel disconnected successfully.");
    } catch (error) {
      if (generation.current !== requestGeneration) return;
      showErrorToast(getSlackDestinationErrorMessage(error, "delete"));
    } finally {
      if (generation.current === requestGeneration) setSlackDeleteDestinationId(null);
    }
  }

  async function handleSaveSlackChannel(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (slackDraft === null) {
      return;
    }
    if (
      !canEdit ||
      (slackDraft.destination_mode === "connected" &&
        (!slackEnabled || slackDraft.slack_destination_id.length === 0))
    ) {
      showErrorToast("Connect Slack and choose a channel for this weekly report.");
      return;
    }

    const requestGeneration = generation.current;
    setIsSavingSlack(true);
    setErrorMessage(null);

    try {
      const payload = {
        config:
          slackDraft.destination_mode === "webhook"
            ? { webhook_url: slackDraft.webhook_url }
            : { slack_destination_id: slackDraft.slack_destination_id },
        schedule: {
          day_of_week: slackDraft.day_of_week,
          hour_of_day: slackDraft.hour_of_day,
          timezone: slackDraft.timezone
        },
        is_enabled: slackDraft.is_enabled
      };
      const channel =
        slackDraft.channel_id === null
          ? await createProjectWeeklyReportChannel({
              project_id: projectId,
              channel: "slack",
              ...payload
            })
          : await updateProjectWeeklyReportChannel(slackDraft.channel_id, payload);

      if (generation.current !== requestGeneration) return;
      setSlackChannels((current) => {
        const next = current.filter((entry) => entry.channel_id !== channel.channel_id);
        next.push(channel);
        return next.sort((left, right) => left.created_at.localeCompare(right.created_at));
      });
      setPreferredSlackDestinationId(slackDraft.slack_destination_id);
      setIsSlackDialogOpen(false);
      setSlackDraft(null);
      showSuccessToast(
        slackDraft.channel_id === null
          ? "Slack weekly report created successfully."
          : "Slack weekly report updated successfully."
      );
    } catch {
      if (generation.current !== requestGeneration) return;
      setErrorMessage("Could not save Slack weekly report settings.");
      showErrorToast("Could not save Slack weekly report settings.");
    } finally {
      if (generation.current === requestGeneration) setIsSavingSlack(false);
    }
  }

  async function handleDeleteSlackChannel(channelId: string): Promise<void> {
    if (!canEdit) return;
    const requestGeneration = generation.current;
    try {
      setSlackChannelToDelete(channelId);
      await deleteProjectWeeklyReportChannel(channelId);
      if (generation.current !== requestGeneration) return;
      setSlackChannels((current) => current.filter((channel) => channel.channel_id !== channelId));
      showSuccessToast("Slack weekly report deleted successfully.");
    } catch {
      if (generation.current !== requestGeneration) return;
      showErrorToast("Could not delete this Slack weekly report.");
    } finally {
      if (generation.current === requestGeneration) setSlackChannelToDelete(null);
    }
  }

  const showPausedSlackReportLoading =
    !slackEnabled && slackChannels.length > 0 && !slackDestinationsLoaded;

  return (
    <CollapsibleCard
      title="Weekly reports"
      description="Send a weekly summary for this project when there was reportable activity."
      contentClassName="flex flex-col gap-6"
    >
      <BoundedListLimit
        id="weekly-report-limit"
        label="Weekly report limit"
        value={channelLimit}
        onChange={setChannelLimit}
        disabled={isLoading || isSavingEmail || isSavingSlack}
      />
      {errorMessage === null ? null : (
        <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      {canEdit ? (
        <form className="flex flex-col gap-6" onSubmit={(event) => void handleSaveEmail(event)}>
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">Email summary</h3>
              <p className="text-sm text-muted-foreground">
                Keep the default project-wide email summary here. Email weekly reports support up to
                3 recipients.
              </p>
            </div>

            <WeeklyReportEmailFields
              value={settingsDraft}
              disabled={isEmailDisabled}
              onChange={setEmailDraft}
            />

            {emailValidationMessage === null ? null : (
              <p className="text-sm text-destructive">{emailValidationMessage}</p>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {settingsDraft.channel_id === null ? null : (
                <ResourceDeleteDialog
                  label="Delete email weekly report"
                  description="Remove the weekly email delivery for this project. You can create a new email report later."
                  disabled={isEmailDisabled}
                  onConfirm={() => void handleDeleteEmail()}
                />
              )}
              <Button
                type="button"
                variant="outline"
                disabled={!isEmailDirty || isSavingEmail}
                onClick={handleResetEmail}
              >
                <RotateCcwIcon data-icon="inline-start" />
                Reset
              </Button>
              <Button type="submit" disabled={isEmailSaveDisabled}>
                {isSavingEmail ? "Saving..." : "Save email weekly report"}
              </Button>
            </div>
          </div>
        </form>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <SummaryTile
            icon={MailIcon}
            label="Email report"
            value={settingsDraft.is_enabled ? "Enabled" : "Disabled"}
          />
          <SummaryTile
            icon={CalendarClockIcon}
            label="Email schedule"
            value={formatSchedule(settingsDraft)}
          />
        </div>
      )}

      <div className="border-t pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">Slack weekly reports</h3>
            <p className="text-sm text-muted-foreground">
              Add project-scoped Slack deliveries that reuse the same connected Slack channels as
              alert rules.
            </p>
          </div>
          {canEdit && slackEnabled && slackChannels.length > 0 ? (
            <Button type="button" onClick={openCreateSlackDialog}>
              <PlusIcon data-icon="inline-start" />
              Create Slack weekly report
            </Button>
          ) : null}
        </div>

        {!slackEnabled ? (
          <div className="mt-4 space-y-4">
            {showPausedSlackReportLoading ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                Loading connected Slack channels...
              </div>
            ) : (
              <>
                <CalloutCard
                  eyebrow="Team tier only"
                  title="Slack weekly reports are paused on the current plan"
                  description={
                    slackChannels.length > 0
                      ? "Saved Slack weekly reports are preserved and will resume after the owner upgrades back to Team."
                      : "Upgrade to Team to deliver weekly reports into connected Slack channels."
                  }
                  tone="warning"
                />
                <WeeklyReportSlackChannels
                  channels={slackChannels}
                  destinations={slackDestinations}
                  canEdit={canEdit}
                  canUpdate={false}
                  deletingId={slackChannelToDelete}
                  onEdit={openEditSlackDialog}
                  onDelete={(id) => void handleDeleteSlackChannel(id)}
                />
              </>
            )}
          </div>
        ) : isLoading ? (
          <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            Loading Slack weekly reports...
          </div>
        ) : slackChannels.length === 0 ? (
          <div className="mt-4">
            <ProjectResourceEmptyState
              icon={BellRingIcon}
              title="No Slack weekly reports yet"
              variant="outlined"
              description="Create a Slack weekly report when your team wants the weekly summary in a connected channel."
              {...(canEdit
                ? {
                    actionLabel: "Create Slack weekly report",
                    onAction: openCreateSlackDialog
                  }
                : {})}
            />
          </div>
        ) : (
          <div className="mt-4">
            <WeeklyReportSlackChannels
              channels={slackChannels}
              destinations={slackDestinations}
              canEdit={canEdit}
              canUpdate={slackEnabled}
              deletingId={slackChannelToDelete}
              onEdit={openEditSlackDialog}
              onDelete={(id) => void handleDeleteSlackChannel(id)}
            />
          </div>
        )}
      </div>

      <Dialog open={isSlackDialogOpen} onOpenChange={handleSlackDialogOpenChange}>
        {slackDraft === null ? null : (
          <DialogFormContent
            title={
              slackDraft.channel_id === null
                ? "Create Slack weekly report"
                : "Edit Slack weekly report"
            }
            description="Choose a connected Slack channel and schedule for this weekly project summary."
            footer={
              <Button
                type="submit"
                disabled={
                  isSavingSlack ||
                  !canEdit ||
                  (slackDraft.destination_mode === "connected"
                    ? !slackEnabled || slackDraft.slack_destination_id.length === 0
                    : slackDraft.webhook_url.trim().length === 0)
                }
              >
                {isSavingSlack
                  ? "Saving..."
                  : slackDraft.channel_id === null
                    ? "Create Slack weekly report"
                    : "Save Slack weekly report"}
              </Button>
            }
            onSubmit={(event) => void handleSaveSlackChannel(event)}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="weekly-slack-mode">Slack destination</FieldLabel>
                <Select
                  value={slackDraft.destination_mode}
                  onValueChange={(value) =>
                    setSlackDraft((current) =>
                      current === null
                        ? current
                        : { ...current, destination_mode: value as "connected" | "webhook" }
                    )
                  }
                  disabled={isSavingSlack}
                >
                  <SelectTrigger id="weekly-slack-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="connected" disabled={!slackEnabled}>
                        Connected channel
                      </SelectItem>
                      <SelectItem value="webhook">Direct webhook</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              {slackDraft.destination_mode === "webhook" ? (
                <Field>
                  <FieldLabel htmlFor="weekly-slack-webhook">Slack webhook URL</FieldLabel>
                  <Input
                    id="weekly-slack-webhook"
                    type="url"
                    required
                    maxLength={2000}
                    value={slackDraft.webhook_url}
                    disabled={isSavingSlack}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setSlackDraft((current) =>
                        current === null ? current : { ...current, webhook_url: value }
                      );
                    }}
                  />
                  <FieldDescription>
                    Uses the existing direct webhook delivery configuration.
                  </FieldDescription>
                </Field>
              ) : (
                <ConnectedSlackDestinationField
                  label="Slack channel"
                  description="Choose one of the Slack channels already connected for this organization, or connect Slack now."
                  slackDestinations={slackDestinations}
                  slackDestinationsLoaded={slackDestinationsLoaded}
                  selectedSlackDestinationId={slackDraft.slack_destination_id}
                  canManageIntegrations={canEdit}
                  isConnectingSlack={isConnectingSlack}
                  slackTestDestinationId={slackTestDestinationId}
                  slackDeleteDestinationId={slackDeleteDestinationId}
                  onSelectedSlackDestinationIdChange={(value) => {
                    setSlackDraft((current) =>
                      current === null ? current : { ...current, slack_destination_id: value }
                    );
                  }}
                  onConnectSlack={() => void handleConnectSlack()}
                  onTestSlackDestination={(destinationId) =>
                    void handleTestSlackDestination(destinationId)
                  }
                  onDeleteSlackDestination={(destinationId) =>
                    void handleDeleteSlackDestination(destinationId)
                  }
                  emptyManageText="Connect Slack once, choose a channel in Slack, and it will become available for weekly reports here."
                  emptyReadOnlyText="A project admin needs to connect Slack before this project can send Slack weekly reports."
                />
              )}

              <Field orientation="horizontal" className="items-center justify-between gap-4">
                <div className="flex flex-1 flex-col gap-1">
                  <FieldLabel
                    id="project-slack-weekly-report-enabled-label"
                    htmlFor="project-slack-weekly-report-enabled"
                  >
                    Enabled
                  </FieldLabel>
                  <FieldDescription>
                    Send this weekly report to Slack on the saved schedule.
                  </FieldDescription>
                </div>
                <Switch
                  id="project-slack-weekly-report-enabled"
                  aria-labelledby="project-slack-weekly-report-enabled-label"
                  checked={slackDraft.is_enabled}
                  disabled={isSavingSlack}
                  onCheckedChange={(checked) => {
                    setSlackDraft((current) =>
                      current === null ? current : { ...current, is_enabled: checked }
                    );
                  }}
                />
              </Field>

              <WeeklyReportScheduleFields
                id="project-slack-weekly-report"
                value={slackDraft}
                disabled={isSavingSlack}
                onChange={(schedule) =>
                  setSlackDraft((current) =>
                    current === null ? null : { ...current, ...schedule }
                  )
                }
              />
            </FieldGroup>
          </DialogFormContent>
        )}
      </Dialog>
    </CollapsibleCard>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value
}: {
  icon: typeof MailIcon;
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
