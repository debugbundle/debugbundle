import { PencilIcon } from "lucide-react";
import type { WeeklyReportChannelRecord } from "../../lib/api.js";
import type { SlackDestinationRecord } from "../../lib/slack-api.js";
import {
  formatSchedule,
  formatSlackWeeklyReportDestination
} from "../../lib/weekly-report-form.js";
import { ResourceDeleteDialog } from "./resource-delete-dialog.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
export function WeeklyReportSlackChannels({
  channels,
  destinations,
  canEdit,
  canUpdate,
  deletingId,
  onEdit,
  onDelete
}: {
  channels: WeeklyReportChannelRecord[];
  destinations: SlackDestinationRecord[];
  canEdit: boolean;
  canUpdate: boolean;
  deletingId: string | null;
  onEdit: (channel: WeeklyReportChannelRecord) => void;
  onDelete: (channelId: string) => void;
}): JSX.Element {
  return channels.length === 0 ? (
    <p className="text-sm text-muted-foreground">No Slack weekly reports configured.</p>
  ) : (
    <div className="flex flex-col gap-3">
      {channels.map((channel) => (
        <div
          key={channel.channel_id}
          className="rounded-lg border border-border/80 bg-background/60 px-4 py-3"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-foreground">
                  {formatSlackWeeklyReportDestination(channel, destinations)}
                </p>
                <Badge variant={channel.is_enabled ? "success" : "secondary"}>
                  {channel.is_enabled ? "enabled" : "disabled"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{formatSchedule(channel.schedule)}</p>
            </div>
            {canEdit ? (
              <div className="flex flex-wrap gap-2">
                {canUpdate ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(channel)}>
                    <PencilIcon data-icon="inline-start" />
                    Edit
                  </Button>
                ) : null}
                <ResourceDeleteDialog
                  variant="ghost"
                  label="Delete Slack weekly report"
                  description={`Remove ${formatSlackWeeklyReportDestination(channel, destinations)} from this project's weekly report deliveries. The Slack destination remains connected.`}
                  disabled={deletingId === channel.channel_id}
                  onConfirm={() => onDelete(channel.channel_id)}
                />
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
