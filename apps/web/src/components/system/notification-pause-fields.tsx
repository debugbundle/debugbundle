import { useId, useState } from "react";
import type {
  NotificationChannel,
  NotificationPreferences
} from "../../../../../packages/shared-types/src/notification-preferences.js";
import { PendingButton } from "./pending-button.js";
import { Checkbox } from "../ui/checkbox.js";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet
} from "../ui/field.js";
import { Input } from "../ui/input.js";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../ui/select.js";

export function NotificationPauseFields({
  channels,
  pendingAction = null,
  disabled,
  settings,
  onPause,
  onResume
}: {
  channels: readonly NotificationChannel[];
  disabled: boolean;
  pendingAction?: "pause" | "resume" | null;
  settings: NotificationPreferences;
  onPause: (body: {
    channels: NotificationChannel[];
    until: string | null;
    allow_health_checks: boolean;
  }) => Promise<void>;
  onResume: (channels: NotificationChannel[]) => Promise<void>;
}): JSX.Element {
  const id = useId();
  const [selected, setSelected] = useState<NotificationChannel[]>([...channels]);
  const [duration, setDuration] = useState("24h");
  const [until, setUntil] = useState("");
  const [health, setHealth] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function pause(): Promise<void> {
    const timestamp =
      duration === "custom"
        ? new Date(until).getTime()
        : Date.now() + (duration === "7d" ? 7 : 1) * 86400000;
    if (duration !== "forever" && (!Number.isFinite(timestamp) || timestamp <= Date.now())) {
      setError("Choose a future end time.");
      return;
    }
    setError(null);
    await onPause({
      channels: selected,
      until: duration === "forever" ? null : new Date(timestamp).toISOString(),
      allow_health_checks: health
    });
  }
  return (
    <FieldSet disabled={disabled}>
      <FieldLegend>Pause notifications</FieldLegend>
      <FieldGroup>
        <Field orientation="horizontal">
          <Checkbox
            id={`${id}-all`}
            checked={selected.length === channels.length}
            onCheckedChange={(checked) => setSelected(checked === true ? [...channels] : [])}
          />
          <FieldLabel htmlFor={`${id}-all`}>All channels in this scope</FieldLabel>
        </Field>
        {channels.length > 1 &&
          channels.map((channel) => (
            <Field key={channel} orientation="horizontal">
              <Checkbox
                id={`${id}-${channel}`}
                checked={selected.includes(channel)}
                onCheckedChange={(checked) =>
                  setSelected(
                    checked === true
                      ? [...selected, channel]
                      : selected.filter((value) => value !== channel)
                  )
                }
              />
              <FieldLabel htmlFor={`${id}-${channel}`}>
                {channel === "webhook"
                  ? "Alert webhooks"
                  : channel.charAt(0).toUpperCase() + channel.slice(1)}
              </FieldLabel>
            </Field>
          ))}
        <Field>
          <FieldLabel htmlFor={`${id}-duration`}>Pause for</FieldLabel>
          <Select value={duration} onValueChange={setDuration} disabled={disabled}>
            <SelectTrigger id={`${id}-duration`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="24h">24 hours</SelectItem>
                <SelectItem value="7d">1 week</SelectItem>
                <SelectItem value="forever">Until resumed</SelectItem>
                <SelectItem value="custom">Until a specific time</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        {duration === "custom" && (
          <Field data-invalid={error !== null}>
            <FieldLabel htmlFor={`${id}-until`}>Resume at (your device’s local time)</FieldLabel>
            <Input
              id={`${id}-until`}
              type="datetime-local"
              value={until}
              aria-invalid={error !== null}
              onChange={(event) => setUntil(event.currentTarget.value)}
            />
          </Field>
        )}
        <Field orientation="horizontal">
          <Checkbox
            id={`${id}-health`}
            checked={health}
            onCheckedChange={(checked) => setHealth(checked === true)}
          />
          <FieldLabel htmlFor={`${id}-health`}>Allow health-check alerts while paused</FieldLabel>
        </Field>
        <FieldDescription>
          Off channels stay off. Resuming a project does not override an account pause.
        </FieldDescription>
        {error && <p role="alert">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <PendingButton
            pending={pendingAction === "pause"}
            pendingLabel="Pausing…"
            type="button"
            variant="outline"
            disabled={disabled || selected.length === 0}
            onClick={() => void pause()}
          >
            Pause notifications
          </PendingButton>
          <PendingButton
            pending={pendingAction === "resume"}
            pendingLabel="Resuming…"
            type="button"
            variant="outline"
            disabled={
              disabled ||
              selected.length === 0 ||
              !selected.some((channel) => settings.pauses[channel] !== undefined)
            }
            onClick={() => void onResume(selected)}
          >
            Resume now
          </PendingButton>
        </div>
      </FieldGroup>
    </FieldSet>
  );
}
