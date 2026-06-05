import { LinkIcon } from "lucide-react";

import type { SlackDestinationRecord } from "../../lib/slack-api.js";
import { formatSlackDestinationLabel } from "../../lib/slack-destinations.js";
import { Button } from "../ui/button.js";
import { Field, FieldDescription, FieldLabel } from "../ui/field.js";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../ui/select.js";
import { Skeleton } from "../ui/skeleton.js";

export interface ConnectedSlackDestinationFieldProps {
  label: string;
  description: string;
  slackDestinations: SlackDestinationRecord[];
  slackDestinationsLoaded: boolean;
  selectedSlackDestinationId: string;
  canManageIntegrations: boolean;
  isConnectingSlack: boolean;
  slackTestDestinationId: string | null;
  slackDeleteDestinationId: string | null;
  onSelectedSlackDestinationIdChange: (value: string) => void;
  onConnectSlack: () => void;
  onTestSlackDestination: (destinationId: string) => void;
  onDeleteSlackDestination: (destinationId: string) => void;
  emptyManageText: string;
  emptyReadOnlyText: string;
}

export function ConnectedSlackDestinationField({
  label,
  description,
  slackDestinations,
  slackDestinationsLoaded,
  selectedSlackDestinationId,
  canManageIntegrations,
  isConnectingSlack,
  slackTestDestinationId,
  slackDeleteDestinationId,
  onSelectedSlackDestinationIdChange,
  onConnectSlack,
  onTestSlackDestination,
  onDeleteSlackDestination,
  emptyManageText,
  emptyReadOnlyText
}: ConnectedSlackDestinationFieldProps): JSX.Element {
  const selectedSlackDestination = slackDestinations.find(
    (destination) => destination.slack_destination_id === selectedSlackDestinationId
  ) ?? null;

  return (
    <Field>
      <FieldLabel id="connected-slack-destination-label" htmlFor="connected-slack-destination">
        {label}
      </FieldLabel>
      <FieldDescription>{description}</FieldDescription>
      {!slackDestinationsLoaded ? (
        <Skeleton className="h-10 w-full" />
      ) : slackDestinations.length > 0 ? (
        <div className="space-y-3">
          <Select value={selectedSlackDestinationId} onValueChange={onSelectedSlackDestinationIdChange}>
            <SelectTrigger
              id="connected-slack-destination"
              aria-labelledby="connected-slack-destination-label connected-slack-destination"
              className="w-full"
            >
              <SelectValue placeholder="Choose a Slack channel" />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectGroup>
                {slackDestinations.map((destination) => (
                  <SelectItem key={destination.slack_destination_id} value={destination.slack_destination_id}>
                    {formatSlackDestinationLabel(destination)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {selectedSlackDestination === null ? null : (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              Selected: {formatSlackDestinationLabel(selectedSlackDestination)}
            </div>
          )}
          {canManageIntegrations ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={onConnectSlack} disabled={isConnectingSlack}>
                <LinkIcon data-icon="inline-start" />
                {isConnectingSlack ? "Connecting Slack..." : "Connect Slack"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onTestSlackDestination(selectedSlackDestinationId)}
                disabled={
                  selectedSlackDestinationId.length === 0 ||
                  slackTestDestinationId === selectedSlackDestinationId ||
                  slackDeleteDestinationId === selectedSlackDestinationId
                }
              >
                {slackTestDestinationId === selectedSlackDestinationId ? "Sending test..." : "Send test message"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onDeleteSlackDestination(selectedSlackDestinationId)}
                disabled={
                  selectedSlackDestinationId.length === 0 ||
                  slackDeleteDestinationId === selectedSlackDestinationId ||
                  slackTestDestinationId === selectedSlackDestinationId
                }
              >
                {slackDeleteDestinationId === selectedSlackDestinationId ? "Disconnecting..." : "Disconnect channel"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3 rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          <p>{canManageIntegrations ? emptyManageText : emptyReadOnlyText}</p>
          {canManageIntegrations ? (
            <Button type="button" variant="secondary" size="sm" onClick={onConnectSlack} disabled={isConnectingSlack}>
              <LinkIcon data-icon="inline-start" />
              {isConnectingSlack ? "Connecting Slack..." : "Connect Slack"}
            </Button>
          ) : null}
        </div>
      )}
    </Field>
  );
}
