import { DailyNotificationScheduleFields } from "./daily-notification-schedule-fields.js";
import { PendingButton } from "./pending-button.js";
import { CollapsibleCard } from "../ui/collapsible-card.js";
import { useEffect, useId, useRef, useState } from "react";
import {
  NOTIFICATION_CHANNELS,
  NotificationUpdateSchema,
  resolveSettingsNotification,
  type NotificationAudience,
  type NotificationChannel,
  type NotificationPreferences,
  type NotificationSettingsResponse
} from "../../../../../packages/shared-types/src/notification-preferences.js";
import type { NotificationAction } from "../../../../../packages/alert-client/src/notification-preferences.js";
import { requestNotificationPreferences } from "../../lib/api-notification-preferences.js";
import { showSuccessToast } from "../../lib/notify.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.js";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../ui/field.js";
import { Separator } from "../ui/separator.js";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../ui/select.js";
import { NotificationPauseFields } from "./notification-pause-fields.js";

const channelLabels: Record<NotificationChannel, string> = {
  email: "Email",
  slack: "Slack",
  discord: "Discord",
  webhook: "Alert webhooks"
};
export function NotificationSettings({ projectId }: { projectId?: string }): JSX.Element {
  const [audience, setAudience] = useState<NotificationAudience>("personal");
  const id = useId();
  const description = projectId
    ? "Inherit account defaults or customize delivery for this project."
    : "Manage delivery across your projects, including projects added later.";
  const content = (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor={`${id}-audience`}>Who these settings affect</FieldLabel>
        <Select
          value={audience}
          onValueChange={(value) => setAudience(value as NotificationAudience)}
        >
          <SelectTrigger id={`${id}-audience`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="personal">My email</SelectItem>
              <SelectItem value="shared">Shared destinations — affects the team</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription>
          Personal settings affect only your email address. Shared settings affect configured
          destinations for everyone.
        </FieldDescription>
      </Field>
      <NotificationEditor
        key={`${projectId ?? "account"}:${audience}`}
        audience={audience}
        {...(projectId === undefined ? {} : { projectId })}
      />
    </FieldGroup>
  );
  return projectId ? (
    <CollapsibleCard title="Notifications" description={description} defaultOpen={false}>
      {content}
    </CollapsibleCard>
  ) : (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}

function NotificationEditor({
  audience,
  projectId
}: {
  audience: NotificationAudience;
  projectId?: string;
}): JSX.Element {
  const id = useId();
  const [data, setData] = useState<NotificationSettingsResponse | null>(null);
  const [draft, setDraft] = useState<NotificationPreferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [operation, setOperation] = useState<NotificationAction | null>(null);
  const saving = operation !== null;
  const [reload, setReload] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const active = useRef(false);
  const pending = useRef(false);
  const scope = { audience, ...(projectId === undefined ? {} : { projectId }) };
  useEffect(() => {
    active.current = true;
    let current = true;
    setError(null);
    void requestNotificationPreferences(
      { audience, ...(projectId === undefined ? {} : { projectId }) },
      "get"
    )
      .then((value) => {
        if (current) {
          setData(value);
          setDraft(value.settings);
        }
      })
      .catch(() => {
        if (current) setError("Could not load notification settings.");
      });
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => {
      current = false;
      active.current = false;
      clearInterval(interval);
    };
  }, [audience, projectId, reload]);
  async function apply(action: NotificationAction, body: unknown): Promise<void> {
    if (pending.current || data?.can_manage !== true) return;
    pending.current = true;
    setOperation(action);
    setError(null);
    try {
      const value = await requestNotificationPreferences(scope, action, body);
      if (!active.current) return;
      setData(value);
      setNow(new Date());
      // Pausing preserves unsaved mode/schedule drafts; saving replaces them with server validation.
      if (action === "update") setDraft(value.settings);
      showSuccessToast(
        action === "pause"
          ? "Notifications paused."
          : action === "resume"
            ? "Notifications resumed at this scope."
            : "Notification settings saved."
      );
    } catch {
      if (active.current)
        setError("Could not save notification settings. Your changes are still here; try again.");
    } finally {
      pending.current = false;
      if (active.current) setOperation(null);
    }
  }
  if (data === null || draft === null)
    return (
      <FieldGroup>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <Button variant="outline" onClick={() => setReload((value) => value + 1)}>
              Retry notification settings
            </Button>
          </>
        ) : (
          <p role="status">Loading notification settings…</p>
        )}
      </FieldGroup>
    );
  const channels = audience === "personal" ? (["email"] as const) : NOTIFICATION_CHANNELS;
  const disabled = saving || !data.can_manage;
  const schedule = draft.daily ?? data.account.daily ?? { time: "09:00", timezone: "UTC" };
  const daily =
    draft.channels.email === "daily" ||
    (draft.channels.email === "inherit" && data.account.channels.email === "daily");
  const validation = NotificationUpdateSchema.safeParse({
    channels: audience === "personal" ? { email: draft.channels.email } : draft.channels,
    daily: draft.daily
  });
  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (validation.success) void apply("update", validation.data);
        }}
      >
        <FieldGroup>
          {!data.can_manage && (
            <FieldDescription>
              Only the account owner or a project owner/admin can change shared delivery settings.
            </FieldDescription>
          )}
          {channels.map((channel) => {
            const policy = resolveSettingsNotification(data, channel, now);
            const paused = policy.reason === "account_paused" || policy.reason === "project_paused";
            return (
              <Field key={channel} data-disabled={disabled}>
                <FieldLabel htmlFor={`${id}-${channel}`}>
                  {channelLabels[channel]} delivery
                </FieldLabel>
                <Select
                  value={draft.channels[channel]}
                  disabled={disabled}
                  onValueChange={(value) =>
                    setDraft({
                      ...draft,
                      channels: {
                        ...draft.channels,
                        [channel]: value
                      } as NotificationPreferences["channels"]
                    })
                  }
                >
                  <SelectTrigger id={`${id}-${channel}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {projectId !== undefined && (
                        <SelectItem value="inherit">Use account default</SelectItem>
                      )}
                      <SelectItem value="immediate">Immediate</SelectItem>
                      {channel === "email" && <SelectItem value="daily">Daily digest</SelectItem>}
                      <SelectItem value="off">Off</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  <Badge variant="secondary">
                    {paused
                      ? "Paused"
                      : policy.mode === "daily"
                        ? "Daily digest"
                        : policy.mode === "off"
                          ? "Off"
                          : "Immediate"}
                  </Badge>{" "}
                  {paused
                    ? `${policy.reason === "account_paused" ? "Paused by account settings" : "Paused for this project"} ${policy.paused_until === null ? "until resumed" : `until ${new Date(policy.paused_until).toLocaleString()}`}.`
                    : policy.reason === "project_override"
                      ? "Project override is active."
                      : "Account default is active."}
                  {data.shared !== undefined &&
                    channel === "email" &&
                    " Shared destination restrictions also apply."}
                </FieldDescription>
                {channel === "email" && (
                  <FieldDescription>
                    Health-check outage emails bypass daily digests and are sent immediately. Off
                    disables them.
                  </FieldDescription>
                )}
              </Field>
            );
          })}
          {daily && (
            <>
              <DailyNotificationScheduleFields
                id={id}
                value={schedule}
                {...(projectId === undefined ? {} : { inherit: draft.daily === null })}
                disabled={disabled}
                invalid={!validation.success}
                onChange={(daily) => setDraft({ ...draft, daily })}
              />
              <FieldDescription>
                New or reopened incidents still unresolved at delivery are grouped by project. Empty
                digests are skipped.
              </FieldDescription>
            </>
          )}
          {error && <p role="alert">{error}</p>}
          <Field orientation="horizontal">
            <PendingButton
              type="submit"
              pending={operation === "update"}
              pendingLabel="Saving…"
              disabled={disabled || !validation.success}
            >
              Save notification settings
            </PendingButton>
          </Field>
        </FieldGroup>
      </form>
      <Separator />
      <FieldGroup>
        <NotificationPauseFields
          channels={channels}
          pendingAction={operation === "pause" || operation === "resume" ? operation : null}
          disabled={disabled}
          settings={data.settings}
          onPause={(body) => apply("pause", body)}
          onResume={(selected) => apply("resume", { channels: selected })}
        />
        <FieldDescription>
          Monitoring continues. Pauses also apply to optional weekly reports. Sign-in, security,
          billing and mandatory account notices remain enabled. Suppressed alerts are not replayed
          on resume.
        </FieldDescription>
      </FieldGroup>
    </>
  );
}
