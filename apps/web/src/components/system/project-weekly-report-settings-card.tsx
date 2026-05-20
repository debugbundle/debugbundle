import { CalendarClockIcon, MailIcon, RotateCcwIcon } from "lucide-react";
import { useEffect, useState } from "react";

import {
  createProjectWeeklyReportChannel,
  listProjectWeeklyReportChannels,
  updateProjectWeeklyReportChannel,
  type WeeklyReportChannelRecord,
  type WeeklyReportDayOfWeek
} from "../../lib/api.js";
import { showErrorToast, showSuccessToast } from "../../lib/notify.js";
import { Button } from "../ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.js";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../ui/field.js";
import { Input } from "../ui/input.js";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../ui/select.js";
import { Switch } from "../ui/switch.js";

interface ProjectWeeklyReportSettingsCardProps {
  projectId: string;
  canEdit: boolean;
}

interface WeeklyReportDraft {
  channel_id: string | null;
  is_enabled: boolean;
  recipients: string;
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

function buildDefaultDraft(): WeeklyReportDraft {
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

function buildDraft(channel: WeeklyReportChannelRecord | null): WeeklyReportDraft {
  if (channel === null) {
    return buildDefaultDraft();
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

function normalizeRecipients(value: string): string[] {
  return value
    .split(",")
    .map((recipient) => recipient.trim())
    .filter((recipient) => recipient.length > 0);
}

function draftsEqual(left: WeeklyReportDraft, right: WeeklyReportDraft): boolean {
  return (
    left.channel_id === right.channel_id &&
    left.is_enabled === right.is_enabled &&
    left.recipients === right.recipients &&
    left.day_of_week === right.day_of_week &&
    left.hour_of_day === right.hour_of_day &&
    left.timezone === right.timezone
  );
}

function formatSchedule(draft: WeeklyReportDraft): string {
  const day = dayOptions.find((option) => option.value === draft.day_of_week)?.label ?? draft.day_of_week;
  return `${day} at ${draft.hour_of_day.toString().padStart(2, "0")}:00 ${draft.timezone}`;
}

export function ProjectWeeklyReportSettingsCard({ projectId, canEdit }: ProjectWeeklyReportSettingsCardProps): JSX.Element {
  const [draft, setDraft] = useState<WeeklyReportDraft | null>(null);
  const [baselineDraft, setBaselineDraft] = useState<WeeklyReportDraft | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadWeeklyReportChannel(): Promise<void> {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const channels = await listProjectWeeklyReportChannels(projectId, 50);
        if (!isActive) {
          return;
        }

        const emailChannel = channels.find((channel) => channel.channel === "email") ?? null;
        const nextDraft = buildDraft(emailChannel);
        setDraft(nextDraft);
        setBaselineDraft(nextDraft);
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

    void loadWeeklyReportChannel();

    return () => {
      isActive = false;
    };
  }, [projectId]);

  const settingsDraft = draft ?? buildDefaultDraft();
  const recipients = normalizeRecipients(settingsDraft.recipients);
  const isDirty = baselineDraft !== null && !draftsEqual(settingsDraft, baselineDraft);
  const isDisabled = isLoading || isSaving || !canEdit;
  const validationMessage =
    settingsDraft.is_enabled && recipients.length === 0
      ? "Add at least one recipient before enabling weekly reports."
      : recipients.length > maxEmailRecipients
        ? "Use 3 or fewer recipients for weekly reports."
        : null;
  const isSaveDisabled = isDisabled || !isDirty || validationMessage !== null;

  async function handleSave(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isSaveDisabled) {
      return;
    }

    setIsSaving(true);
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
      const nextDraft = buildDraft(channel);
      setDraft(nextDraft);
      setBaselineDraft(nextDraft);
      showSuccessToast("Weekly report settings updated successfully.");
    } catch {
      setErrorMessage("Could not save weekly report settings.");
      showErrorToast("Could not save weekly report settings.");
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
        <CardTitle>Weekly reports</CardTitle>
        <CardDescription>Send a weekly email summary for this project when there was reportable activity.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {errorMessage === null ? null : (
          <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">{errorMessage}</div>
        )}

        {canEdit ? (
          <form className="flex flex-col gap-6" onSubmit={(event) => void handleSave(event)}>
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
                  disabled={isDisabled}
                  onCheckedChange={(checked) => {
                    setDraft((current) => ({
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
	                    setDraft((current) => ({
	                      ...(current ?? settingsDraft),
	                      recipients: value
	                    }));
	                  }}
	                  placeholder="owner@example.com, team@example.com"
                  autoComplete="email"
                  disabled={isDisabled}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-[1fr_0.75fr]">
                <Field>
                  <FieldLabel id="project-weekly-report-day-label" htmlFor="project-weekly-report-day">Day</FieldLabel>
                  <Select
                    value={settingsDraft.day_of_week}
                    onValueChange={(value) => {
                      setDraft((current) => ({
                        ...(current ?? settingsDraft),
                        day_of_week: value as WeeklyReportDayOfWeek
                      }));
                    }}
                    disabled={isDisabled}
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
                      setDraft((current) => ({
                        ...(current ?? settingsDraft),
                        hour_of_day: Number.parseInt(value, 10)
                      }));
                    }}
                    disabled={isDisabled}
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
	                    setDraft((current) => ({
	                      ...(current ?? settingsDraft),
	                      timezone: value
	                    }));
	                  }}
	                  placeholder="UTC"
                  disabled={isDisabled}
                />
                <FieldDescription>Use an IANA timezone such as UTC, Europe/Ljubljana, or America/New_York.</FieldDescription>
              </Field>
            </FieldGroup>

            {validationMessage === null ? null : <p className="text-sm text-destructive">{validationMessage}</p>}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={isSaveDisabled}>
                {isSaving ? "Saving..." : "Save weekly report"}
              </Button>
              <Button type="button" variant="outline" disabled={!isDirty || isSaving} onClick={handleReset}>
                <RotateCcwIcon data-icon="inline-start" />
                Reset
              </Button>
            </div>
          </form>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <SummaryTile icon={MailIcon} label="Email report" value={settingsDraft.is_enabled ? "Enabled" : "Disabled"} />
            <SummaryTile icon={CalendarClockIcon} label="Schedule" value={formatSchedule(settingsDraft)} />
          </div>
        )}
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
