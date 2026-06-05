import type { SlackDestinationRecord } from "./slack-api.js";

export function getSlackDestinationErrorMessage(error: unknown, action: "test" | "delete"): string {
  const code = error instanceof Error ? error.message : String(error);

  if (code === "slack_destination_in_use") {
    return "Disconnect any alert rules or weekly reports using this Slack channel before removing it.";
  }
  if (code === "slack_destination_unavailable" || code === "slack_destination_forbidden") {
    return action === "test"
      ? "This Slack channel looks unavailable. Reconnect Slack or choose a different channel."
      : "This Slack channel looks unavailable. Remove any rules using it first, then reconnect or choose a different channel.";
  }
  if (code === "slack_rate_limited") {
    return "Slack asked us to slow down. Wait a moment and try again.";
  }
  if (code === "upgrade_required") {
    return "Slack connected destinations are available on the Team plan.";
  }
  if (code === "forbidden") {
    return "Only organization owners can manage connected Slack channels.";
  }
  if (code === "slack_not_configured") {
    return "Slack is not configured yet for this environment.";
  }
  if (code === "slack_delivery_failed") {
    return "We could not deliver the Slack test message. Please try again.";
  }

  return action === "test"
    ? "We could not send the Slack test message."
    : "We could not disconnect this Slack channel.";
}

export function resolveSlackDestinationSelection(
  destinations: SlackDestinationRecord[],
  preferredDestinationId: string | null
): string | null {
  if (typeof preferredDestinationId === "string") {
    const matchingDestination = destinations.find((destination) => destination.slack_destination_id === preferredDestinationId);
    if (matchingDestination !== undefined) {
      return matchingDestination.slack_destination_id;
    }
  }

  return destinations[0]?.slack_destination_id ?? null;
}

export function formatSlackDestinationLabel(destination: SlackDestinationRecord): string {
  const teamLabel = destination.slack_team_name ?? destination.slack_team_id;
  const channelLabel = destination.slack_channel_name ?? destination.slack_channel_id;
  return `${teamLabel} - ${channelLabel}`;
}
