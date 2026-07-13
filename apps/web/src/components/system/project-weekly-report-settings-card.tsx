import { BellRingIcon, CalendarClockIcon, MailIcon, PencilIcon, PlusIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { getTierCapabilities } from "../../../../../packages/shared-types/src/index.js";
import { ConnectedSlackDestinationField } from "./connected-slack-destination-field.js";
import { DialogFormContent } from "./dialog-form-content.js";
import { CalloutCard } from "./callout-card.js";
import { ProjectResourceEmptyState } from "./project-resource-empty-state.js";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "../ui/alert-dialog.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.js";
import { Dialog } from "../ui/dialog.js";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../ui/field.js";
import { Input } from "../ui/input.js";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../ui/select.js";
import { Switch } from "../ui/switch.js";
import {
  createProjectWeeklyReportChannel,
  deleteProjectWeeklyReportChannel,
  listProjectWeeklyReportChannels,
  updateProjectWeeklyReportChannel,
  type WeeklyReportChannelRecord,
  type WeeklyReportDayOfWeek
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
  formatSlackDestinationLabel,
  getSlackDestinationErrorMessage,
  resolveSlackDestinationSelection
} from "../../lib/slack-destinations.js";

interface ProjectWeeklyReportSettingsCardProps {
  projectId: string;
  organizationPlan: "free" | "solo" | "team";
  canEdit: boolean;
}

interface EmailWeeklyReportDraft {
  channel_id: string | null;
  is_enabled: boolean;
  recipients: string;
  day_of_week: WeeklyReportDayOfWeek;
  hour_of_day: number;
  timezone: string;
}

interface SlackWeeklyReportDraft {
  channel_id: string | null;
  slack_destination_id: string;
  is_enabled: boolean;
  day_of_week: WeeklyReportDayOfWeek;
  hour_of_day: number;
  timezone: string;
}

const dayOptions: Array<{ value: WeeklyReportDayOfWeek; label: string }> = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" }
];

const hourOptions = Array.from({ length: 24 }, (_, hour) => ({
  value: String(hour),
  label: `${hour.toString().padStart(2, "0")}:00`
}));
const maxEmailRecipients = 3;

function getDefaultTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function buildDefaultEmailDraft(): EmailWeeklyReportDraft {
  return {
    channel_id: null,
    is_enabled: false,
    recipients: "",
    day_of_week: "monday",
    hour_of_day: 9,
    timezone: getDefaultTimezone()
  };
}

function readEmailRecipients(channel: WeeklyReportChannelRecord): string[] {
  const recipients = channel.config["to"];
  return Array.isArray(recipients) && recipients.every((recipient) => typeof recipient === "string") ? recipients : [];
}

function buildEmailDraft(channel: WeeklyReportChannelRecord | null): EmailWeeklyReportDraft {
  if (channel === null) {
    return buildDefaultEmailDraft();
  }

  return {
    channel_id: channel.channel_id,
    is_enabled: channel.is_enabled,
    recipients: readEmailRecipients(channel).join(", "),
    day_of_week: channel.schedule.day_of_week,
    hour_of_day: channel.schedule.hour_of_day,
    timezone: channel.schedule.timezone
  };
}

function buildSlackDraft(
  channel: WeeklyReportChannelRecord | null,
  fallbackDestinationId: string | null
): SlackWeeklyReportDraft {
  const selectedDestinationId =
    channel !== null && typeof channel.config["slack_destination_id"] === "string"
      ? channel.config["slack_destination_id"]
      : fallbackDestinationId ?? "";

  if (channel === null) {
    return {
      channel_id: null,
      slack_destination_id: selectedDestinationId,
      is_enabled: true,
      day_of_week: "monday",
      hour_of_day: 9,
      timezone: getDefaultTimezone()
    };
  }

  return {
    channel_id: channel.channel_id,
    slack_destination_id: selectedDestinationId,
    is_enabled: channel.is_enabled,
    day_of_week: channel.schedule.day_of_week,
    hour_of_day: channel.schedule.hour_of_day,
    timezone: channel.schedule.timezone
  };
}

function normalizeRecipients(value: string): string[] {
  return value
    .split(",")
    .map((recipient) => recipient.trim())
    .filter((recipient) => recipient.length > 0);
}

function emailDraftsEqual(left: EmailWeeklyReportDraft, right: EmailWeeklyReportDraft): boolean {
  return (
    left.channel_id === right.channel_id &&
    left.is_enabled === right.is_enabled &&
    left.recipients === right.recipients &&
    left.day_of_week === right.day_of_week &&
    left.hour_of_day === right.hour_of_day &&
    left.timezone === right.timezone
  );
}

function formatSchedule(
  schedule:
    | EmailWeeklyReportDraft
    | SlackWeeklyReportDraft
    | WeeklyReportChannelRecord["schedule"]
): string {
  const day = dayOptions.find((option) => option.value === schedule.day_of_week)?.label ?? schedule.day_of_week;
  return `${day} at ${schedule.hour_of_day.toString().padStart(2, "0")}:00 ${schedule.timezone}`;
}

function formatSlackWeeklyReportDestination(
  channel: WeeklyReportChannelRecord,
  slackDestinations: SlackDestinationRecord[]
): string {
  const slackDestinationId = channel.config["slack_destination_id"];
  if (typeof slackDestinationId !== "string") {
    return "Slack (channel unavailable)";
  }

  const destination = slackDestinations.find((entry) => entry.slack_destination_id === slackDestinationId);
  if (destination === undefined) {
    return "Slack (channel unavailable)";
  }

  return formatSlackDestinationLabel(destination);
}

export function ProjectWeeklyReportSettingsCard({
  projectId,
  organizationPlan,
  canEdit
}: ProjectWeeklyReportSettingsCardProps): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [emailDraft, setEmailDraft] = useState<EmailWeeklyReportDraft | null>(null);
  const [baselineEmailDraft, setBaselineEmailDraft] = useState<EmailWeeklyReportDraft | null>(null);
  const [slackChannels, setSlackChannels] = useState<WeeklyReportChannelRecord[]>([]);
  const [slackDestinations, setSlackDestinations] = useState<SlackDestinationRecord[]>([]);
  const [slackDestinationsLoaded, setSlackDestinationsLoaded] = useState(false);
  const [preferredSlackDestinationId, setPreferredSlackDestinationId] = useState<string | null>(null);
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

  async function refreshSlackDestinations(nextPreferredDestinationId: string | null = preferredSlackDestinationId): Promise<void> {
    try {
      const destinations = await listProjectSlackDestinations(projectId);
      setSlackDestinations(destinations);
      const resolvedDestinationId = resolveSlackDestinationSelection(destinations, nextPreferredDestinationId);
      setSlackDraft((current) =>
        current === null
          ? current
          : {
              ...current,
              slack_destination_id:
                current.slack_destination_id.length > 0 && destinations.some((destination) => destination.slack_destination_id === current.slack_destination_id)
                  ? current.slack_destination_id
                  : resolvedDestinationId ?? ""
            }
      );
    } catch {
      setSlackDestinations([]);
    } finally {
      setSlackDestinationsLoaded(true);
    }
  }

  useEffect(() => {
    let isActive = true;

    async function loadWeeklyReports(): Promise<void> {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const channels = await listProjectWeeklyReportChannels(projectId, 50);
        if (!isActive) {
          return;
        }

        const nextEmailDraft = buildEmailDraft(channels.find((channel) => channel.channel === "email") ?? null);
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
  }, [projectId]);

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
  const isEmailDirty = baselineEmailDraft !== null && !emailDraftsEqual(settingsDraft, baselineEmailDraft);
  const isEmailDisabled = isLoading || isSavingEmail || !canEdit;
  const emailValidationMessage =
    settingsDraft.is_enabled && recipients.length === 0
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
      const nextDraft = buildEmailDraft(channel);
      setEmailDraft(nextDraft);
      setBaselineEmailDraft(nextDraft);
      showSuccessToast("Email weekly report settings updated successfully.");
    } catch {
      setErrorMessage("Could not save weekly report settings.");
      showErrorToast("Could not save weekly report settings.");
    } finally {
      setIsSavingEmail(false);
    }
  }

  function handleResetEmail(): void {
    if (baselineEmailDraft !== null) {
      setEmailDraft(baselineEmailDraft);
      setErrorMessage(null);
    }
  }

  function openCreateSlackDialog(): void {
    setSlackDraft(buildSlackDraft(null, resolveSlackDestinationSelection(slackDestinations, preferredSlackDestinationId)));
    setIsSlackDialogOpen(true);
  }

  function openEditSlackDialog(channel: WeeklyReportChannelRecord): void {
    setSlackDraft(
      buildSlackDraft(channel, resolveSlackDestinationSelection(slackDestinations, preferredSlackDestinationId))
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
    try {
      setIsConnectingSlack(true);
      const installUrl = await getSlackInstallUrl(projectId, `/projects/${projectId}/settings`);
      window.location.assign(installUrl);
    } catch {
      setIsConnectingSlack(false);
      showErrorToast("Could not start the Slack connect flow.");
    }
  }

  async function handleTestSlackDestination(destinationId: string): Promise<void> {
    try {
      setSlackTestDestinationId(destinationId);
      await testProjectSlackDestination(projectId, destinationId);
      showSuccessToast("Slack test message sent successfully.");
    } catch (error) {
      showErrorToast(getSlackDestinationErrorMessage(error, "test"));
    } finally {
      setSlackTestDestinationId(null);
    }
  }

  async function handleDeleteSlackDestination(destinationId: string): Promise<void> {
    try {
      setSlackDeleteDestinationId(destinationId);
      await deleteProjectSlackDestination(projectId, destinationId);
      const remainingDestinations = slackDestinations.filter(
        (destination) => destination.slack_destination_id !== destinationId
      );
      setSlackDestinations(remainingDestinations);
      const nextSelectedDestinationId = resolveSlackDestinationSelection(remainingDestinations, null) ?? "";
      setSlackDraft((current) =>
        current === null
          ? current
          : {
              ...current,
              slack_destination_id: nextSelectedDestinationId
            }
      );
      setPreferredSlackDestinationId(nextSelectedDestinationId.length > 0 ? nextSelectedDestinationId : null);
      showSuccessToast("Slack channel disconnected successfully.");
    } catch (error) {
      showErrorToast(getSlackDestinationErrorMessage(error, "delete"));
    } finally {
      setSlackDeleteDestinationId(null);
    }
  }

  async function handleSaveSlackChannel(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (slackDraft === null) {
      return;
    }
    if (slackDraft.slack_destination_id.length === 0) {
      showErrorToast("Connect Slack and choose a channel for this weekly report.");
      return;
    }

    setIsSavingSlack(true);
    setErrorMessage(null);

    try {
      const payload = {
        config: { slack_destination_id: slackDraft.slack_destination_id },
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
      setErrorMessage("Could not save Slack weekly report settings.");
      showErrorToast("Could not save Slack weekly report settings.");
    } finally {
      setIsSavingSlack(false);
    }
  }

  async function handleDeleteSlackChannel(channelId: string): Promise<void> {
    try {
      setSlackChannelToDelete(channelId);
      await deleteProjectWeeklyReportChannel(channelId);
      setSlackChannels((current) => current.filter((channel) => channel.channel_id !== channelId));
      showSuccessToast("Slack weekly report deleted successfully.");
    } catch {
      showErrorToast("Could not delete this Slack weekly report.");
    } finally {
      setSlackChannelToDelete(null);
    }
  }

  const readOnlySlackChannels = slackChannels.length > 0 ? (
    <div className="space-y-3">
      {slackChannels.map((channel) => (
        <div key={channel.channel_id} className="rounded-lg border border-border/80 bg-background/60 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="font-medium text-foreground">{formatSlackWeeklyReportDestination(channel, slackDestinations)}</p>
              <p className="text-sm text-muted-foreground">{formatSchedule(channel.schedule)}</p>
            </div>
            <Badge variant={channel.is_enabled ? "success" : "secondary"}>
              {channel.is_enabled ? "enabled" : "disabled"}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  ) : (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
      No Slack weekly reports configured.
    </div>
  );
  const showPausedSlackReportLoading = !slackEnabled && slackChannels.length > 0 && !slackDestinationsLoaded;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekly reports</CardTitle>
        <CardDescription>Send a weekly summary for this project when there was reportable activity.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {errorMessage === null ? null : (
          <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">{errorMessage}</div>
        )}

        {canEdit ? (
          <form className="flex flex-col gap-6" onSubmit={(event) => void handleSaveEmail(event)}>
            <div className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">Email summary</h3>
                <p className="text-sm text-muted-foreground">
                  Keep the default project-wide email summary here. Email weekly reports support up to 3 recipients.
                </p>
              </div>

              <FieldGroup>
                <Field orientation="horizontal" className="items-center justify-between gap-4">
                  <div className="flex flex-1 flex-col gap-1">
                    <FieldLabel id="project-weekly-report-enabled-label" htmlFor="project-weekly-report-enabled">Enabled</FieldLabel>
                    <FieldDescription>Include this project in scheduled weekly email reports.</FieldDescription>
                  </div>
                  <Switch
                    id="project-weekly-report-enabled"
                    aria-labelledby="project-weekly-report-enabled-label"
                    checked={settingsDraft.is_enabled}
                    disabled={isEmailDisabled}
                    onCheckedChange={(checked) => {
                      setEmailDraft((current) => ({
                        ...(current ?? settingsDraft),
                        is_enabled: checked
                      }));
                    }}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="project-weekly-report-recipients">Recipients</FieldLabel>
                  <FieldDescription>Separate up to 3 email addresses with commas.</FieldDescription>
                  <Input
                    id="project-weekly-report-recipients"
                    value={settingsDraft.recipients}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setEmailDraft((current) => ({
                        ...(current ?? settingsDraft),
                        recipients: value
                      }));
                    }}
                    placeholder="owner@example.com, team@example.com"
                    autoComplete="email"
                    disabled={isEmailDisabled}
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-[1fr_0.75fr]">
                  <Field>
                    <FieldLabel id="project-weekly-report-day-label" htmlFor="project-weekly-report-day">Day</FieldLabel>
                    <Select
                      value={settingsDraft.day_of_week}
                      onValueChange={(value) => {
                        setEmailDraft((current) => ({
                          ...(current ?? settingsDraft),
                          day_of_week: value as WeeklyReportDayOfWeek
                        }));
                      }}
                      disabled={isEmailDisabled}
                    >
                      <SelectTrigger
                        id="project-weekly-report-day"
                        aria-labelledby="project-weekly-report-day-label project-weekly-report-day"
                        className="w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        <SelectGroup>
                          {dayOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field>
                    <FieldLabel id="project-weekly-report-hour-label" htmlFor="project-weekly-report-hour">Hour</FieldLabel>
                    <Select
                      value={String(settingsDraft.hour_of_day)}
                      onValueChange={(value) => {
                        setEmailDraft((current) => ({
                          ...(current ?? settingsDraft),
                          hour_of_day: Number.parseInt(value, 10)
                        }));
                      }}
                      disabled={isEmailDisabled}
                    >
                      <SelectTrigger
                        id="project-weekly-report-hour"
                        aria-labelledby="project-weekly-report-hour-label project-weekly-report-hour"
                        className="w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        <SelectGroup>
                          {hourOptions.map((option) => (
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
                  <FieldLabel htmlFor="project-weekly-report-timezone">Timezone</FieldLabel>
                  <Input
                    id="project-weekly-report-timezone"
                    value={settingsDraft.timezone}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setEmailDraft((current) => ({
                        ...(current ?? settingsDraft),
                        timezone: value
                      }));
                    }}
                    placeholder="UTC"
                    disabled={isEmailDisabled}
                  />
                  <FieldDescription>Use an IANA timezone such as UTC, Europe/Ljubljana, or America/New_York.</FieldDescription>
                </Field>
              </FieldGroup>

              {emailValidationMessage === null ? null : <p className="text-sm text-destructive">{emailValidationMessage}</p>}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" disabled={!isEmailDirty || isSavingEmail} onClick={handleResetEmail}>
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
            <SummaryTile icon={MailIcon} label="Email report" value={settingsDraft.is_enabled ? "Enabled" : "Disabled"} />
            <SummaryTile icon={CalendarClockIcon} label="Email schedule" value={formatSchedule(settingsDraft)} />
          </div>
        )}

        <div className="border-t pt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">Slack weekly reports</h3>
              <p className="text-sm text-muted-foreground">
                Add project-scoped Slack deliveries that reuse the same connected Slack channels as alert rules.
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
                  {readOnlySlackChannels}
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
            <div className="mt-4 space-y-3">
              {slackChannels.map((channel) => (
                <div key={channel.channel_id} className="rounded-lg border border-border/80 bg-background/60 px-4 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">{formatSlackWeeklyReportDestination(channel, slackDestinations)}</p>
                        <Badge variant={channel.is_enabled ? "success" : "secondary"}>
                          {channel.is_enabled ? "enabled" : "disabled"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{formatSchedule(channel.schedule)}</p>
                    </div>
                    {canEdit ? (
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => openEditSlackDialog(channel)}>
                          <PencilIcon data-icon="inline-start" />
                          Edit
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button type="button" variant="ghost" size="sm" disabled={slackChannelToDelete === channel.channel_id}>
                              <Trash2Icon data-icon="inline-start" />
                              Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Slack weekly report</AlertDialogTitle>
                              <AlertDialogDescription>
                                This removes this weekly Slack delivery for the project. It does not disconnect the underlying Slack destination.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => void handleDeleteSlackChannel(channel.channel_id)}>
                                Delete Slack weekly report
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <Dialog open={isSlackDialogOpen} onOpenChange={handleSlackDialogOpenChange}>
          {slackDraft === null ? null : (
            <DialogFormContent
              title={slackDraft.channel_id === null ? "Create Slack weekly report" : "Edit Slack weekly report"}
              description="Choose a connected Slack channel and schedule for this weekly project summary."
              footer={
                <Button type="submit" disabled={isSavingSlack || slackDraft.slack_destination_id.length === 0}>
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
                    setSlackDraft((current) => (current === null ? current : { ...current, slack_destination_id: value }));
                  }}
                  onConnectSlack={() => void handleConnectSlack()}
                  onTestSlackDestination={(destinationId) => void handleTestSlackDestination(destinationId)}
                  onDeleteSlackDestination={(destinationId) => void handleDeleteSlackDestination(destinationId)}
                  emptyManageText="Connect Slack once, choose a channel in Slack, and it will become available for weekly reports here."
                  emptyReadOnlyText="A project admin needs to connect Slack before this project can send Slack weekly reports."
                />

                <Field orientation="horizontal" className="items-center justify-between gap-4">
                  <div className="flex flex-1 flex-col gap-1">
                    <FieldLabel id="project-slack-weekly-report-enabled-label" htmlFor="project-slack-weekly-report-enabled">Enabled</FieldLabel>
                    <FieldDescription>Send this weekly report to Slack on the saved schedule.</FieldDescription>
                  </div>
                  <Switch
                    id="project-slack-weekly-report-enabled"
                    aria-labelledby="project-slack-weekly-report-enabled-label"
                    checked={slackDraft.is_enabled}
                    disabled={isSavingSlack}
                    onCheckedChange={(checked) => {
                      setSlackDraft((current) => (current === null ? current : { ...current, is_enabled: checked }));
                    }}
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-[1fr_0.75fr]">
                  <Field>
                    <FieldLabel id="project-slack-weekly-report-day-label" htmlFor="project-slack-weekly-report-day">Day</FieldLabel>
                    <Select
                      value={slackDraft.day_of_week}
                      onValueChange={(value) => {
                        setSlackDraft((current) =>
                          current === null ? current : { ...current, day_of_week: value as WeeklyReportDayOfWeek }
                        );
                      }}
                      disabled={isSavingSlack}
                    >
                      <SelectTrigger
                        id="project-slack-weekly-report-day"
                        aria-labelledby="project-slack-weekly-report-day-label project-slack-weekly-report-day"
                        className="w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        <SelectGroup>
                          {dayOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field>
                    <FieldLabel id="project-slack-weekly-report-hour-label" htmlFor="project-slack-weekly-report-hour">Hour</FieldLabel>
                    <Select
                      value={String(slackDraft.hour_of_day)}
                      onValueChange={(value) => {
                        setSlackDraft((current) =>
                          current === null ? current : { ...current, hour_of_day: Number.parseInt(value, 10) }
                        );
                      }}
                      disabled={isSavingSlack}
                    >
                      <SelectTrigger
                        id="project-slack-weekly-report-hour"
                        aria-labelledby="project-slack-weekly-report-hour-label project-slack-weekly-report-hour"
                        className="w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        <SelectGroup>
                          {hourOptions.map((option) => (
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
                  <FieldLabel htmlFor="project-slack-weekly-report-timezone">Timezone</FieldLabel>
                  <Input
                    id="project-slack-weekly-report-timezone"
                    value={slackDraft.timezone}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setSlackDraft((current) => (current === null ? current : { ...current, timezone: value }));
                    }}
                    placeholder="UTC"
                    disabled={isSavingSlack}
                  />
                  <FieldDescription>Use an IANA timezone such as UTC, Europe/Ljubljana, or America/New_York.</FieldDescription>
                </Field>
              </FieldGroup>
            </DialogFormContent>
          )}
        </Dialog>
      </CardContent>
    </Card>
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
