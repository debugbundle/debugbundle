import { BellRingIcon, LinkIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { getTierCapabilities } from "../../../../packages/shared-types/src/index.js";
import { DialogFormContent } from "../components/system/dialog-form-content.js";
import { ProjectResourceEmptyState } from "../components/system/project-resource-empty-state.js";
import type { ProjectContext } from "../components/system/project-layout.js";
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
} from "../components/ui/alert-dialog.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { Dialog, DialogTrigger } from "../components/ui/dialog.js";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../components/ui/field.js";
import { Input } from "../components/ui/input.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table.js";
import {
  createProjectAlert,
  deleteAlert,
  listProjectAlerts,
  type AlertChannel,
  type AlertConditionType,
  type AlertRecord
} from "../lib/api.js";
import { showErrorToast, showSuccessToast } from "../lib/notify.js";
import { useSession } from "../lib/session.js";
import {
  deleteProjectSlackDestination,
  getSlackInstallUrl,
  listProjectSlackDestinations,
  testProjectSlackDestination,
  type SlackDestinationRecord
} from "../lib/slack-api.js";
import { useDelayedVisibility } from "../lib/use-delayed-visibility.js";

type AlertChannelOption = {
  value: AlertChannel;
  label: string;
  disabled?: boolean;
};

const ALERT_CHANNEL_LABELS: Record<AlertChannel, string> = {
  email: "Email",
  slack: "Slack",
  discord: "Discord",
  webhook: "Alert webhook"
};

const TEAM_ALERT_CHANNEL_OPTIONS: AlertChannelOption[] = [
  { value: "email", label: ALERT_CHANNEL_LABELS["email"] },
  { value: "slack", label: ALERT_CHANNEL_LABELS["slack"] },
  { value: "webhook", label: ALERT_CHANNEL_LABELS["webhook"] }
];

const STANDARD_ALERT_CHANNEL_OPTIONS: AlertChannelOption[] = [
  { value: "email", label: ALERT_CHANNEL_LABELS["email"] },
  { value: "slack", label: `${ALERT_CHANNEL_LABELS["slack"]} (Team tier only)`, disabled: true },
  { value: "webhook", label: ALERT_CHANNEL_LABELS["webhook"] }
];

const ALERT_CONDITION_OPTIONS: Array<{ value: AlertConditionType; label: string }> = [
  { value: "new_incident", label: "New incident" },
  { value: "incident_regressed", label: "Incident regressed" },
  { value: "error_spike", label: "Error spike" },
  { value: "severity_threshold", label: "Severity threshold" },
  { value: "regression_after_deploy", label: "Regression after deploy" }
];

const SEVERITY_OPTIONS: Array<{ value: "" | "low" | "medium" | "high" | "critical"; label: string }> = [
  { value: "", label: "Any severity" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" }
];

export function ProjectAlertsPage(): JSX.Element {
  const { project, projectId } = useOutletContext<ProjectContext>();
  const { session } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const [alerts, setAlerts] = useState<AlertRecord[] | null>(null);
  const showAlertsLoading = useDelayedVisibility(alerts === null);
  const [slackDestinations, setSlackDestinations] = useState<SlackDestinationRecord[]>([]);
  const [slackDestinationsLoaded, setSlackDestinationsLoaded] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isConnectingSlack, setIsConnectingSlack] = useState(false);
  const [slackTestDestinationId, setSlackTestDestinationId] = useState<string | null>(null);
  const [slackDeleteDestinationId, setSlackDeleteDestinationId] = useState<string | null>(null);
  const [channel, setChannel] = useState<AlertChannel>("email");
  const [conditionType, setConditionType] = useState<AlertConditionType>("new_incident");
  const [severityMin, setSeverityMin] = useState<"" | "low" | "medium" | "high" | "critical">("");
  const [emailRecipient, setEmailRecipient] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [selectedSlackDestinationId, setSelectedSlackDestinationId] = useState("");
  const [preferredSlackDestinationId, setPreferredSlackDestinationId] = useState<string | null>(null);
  const slackEnabled = getTierCapabilities(project.organization_plan).slack_integration;
  const isOwner = session?.role === "owner";
  const channelOptions = slackEnabled ? TEAM_ALERT_CHANNEL_OPTIONS : STANDARD_ALERT_CHANNEL_OPTIONS;
  const selectedSlackDestination = slackDestinations.find(
    (destination) => destination.slack_destination_id === selectedSlackDestinationId
  ) ?? null;

  useEffect(() => {
    void (async () => {
      const nextAlerts = await listProjectAlerts(projectId);
      setAlerts(nextAlerts);
    })();
  }, [projectId]);

  const resolvedProjectId = projectId;

  async function refreshSlackDestinations(nextPreferredDestinationId: string | null = preferredSlackDestinationId): Promise<void> {
    if (!slackEnabled) {
      setSlackDestinations([]);
      setSlackDestinationsLoaded(true);
      return;
    }

    try {
      const destinations = await listProjectSlackDestinations(projectId);
      setSlackDestinations(destinations);
      const resolvedDestinationId = resolveSlackDestinationSelection(destinations, nextPreferredDestinationId);
      if (resolvedDestinationId !== null) {
        setSelectedSlackDestinationId(resolvedDestinationId);
      }
    } catch {
      setSlackDestinations([]);
    } finally {
      setSlackDestinationsLoaded(true);
    }
  }

  useEffect(() => {
    void refreshSlackDestinations();
  }, [projectId, slackEnabled]);

  useEffect(() => {
    if (channelOptions.some((option) => option.value === channel && option.disabled !== true)) {
      return;
    }

    setChannel(channelOptions.find((option) => option.disabled !== true)?.value ?? "email");
  }, [channel, channelOptions]);

  function resetCreateForm(nextChannel: AlertChannel = "email"): void {
    setChannel(nextChannel);
    setConditionType("new_incident");
    setSeverityMin("");
    setEmailRecipient(session?.email ?? "");
    setDestinationUrl("");
    setSelectedSlackDestinationId(resolveSlackDestinationSelection(slackDestinations, preferredSlackDestinationId) ?? "");
  }

  function handleCreateOpenChange(nextOpen: boolean): void {
    setIsCreateOpen(nextOpen);

    if (nextOpen) {
      resetCreateForm();
    }
  }

  useEffect(() => {
    if (!slackEnabled || channel !== "slack" || selectedSlackDestinationId.length > 0) {
      return;
    }

    const resolvedDestinationId = resolveSlackDestinationSelection(slackDestinations, preferredSlackDestinationId);
    if (resolvedDestinationId !== null) {
      setSelectedSlackDestinationId(resolvedDestinationId);
    }
  }, [channel, preferredSlackDestinationId, selectedSlackDestinationId, slackDestinations, slackEnabled]);

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
      resetCreateForm("slack");
      setIsCreateOpen(true);
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

  async function handleConnectSlack(): Promise<void> {
    try {
      setIsConnectingSlack(true);
      const installUrl = await getSlackInstallUrl(projectId, `/projects/${projectId}/alerts`);
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
      setSelectedSlackDestinationId(nextSelectedDestinationId);
      setPreferredSlackDestinationId(nextSelectedDestinationId.length > 0 ? nextSelectedDestinationId : null);
      showSuccessToast("Slack channel disconnected successfully.");
    } catch (error) {
      showErrorToast(getSlackDestinationErrorMessage(error, "delete"));
    } finally {
      setSlackDeleteDestinationId(null);
    }
  }

  async function handleCreateAlert(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const config = buildAlertConfig({
      channel,
      emailRecipient: emailRecipient.trim(),
      destinationUrl: destinationUrl.trim(),
      slackDestinationId: selectedSlackDestinationId
    });

    if (config === null) {
      showErrorToast(
        channel === "email"
          ? "Enter a valid recipient email address."
          : channel === "slack"
            ? "Connect Slack and choose a channel for this alert."
            : "Add a destination URL for this alert channel."
      );
      return;
    }

    const createPayload: {
      project_id: string;
      channel: AlertChannel;
      condition_type: AlertConditionType;
      severity_min?: "low" | "medium" | "high" | "critical";
      config: Record<string, unknown>;
      is_enabled: boolean;
    } = {
      project_id: resolvedProjectId,
      channel,
      condition_type: conditionType,
      config,
      is_enabled: true
    };

    if (severityMin !== "") {
      createPayload.severity_min = severityMin;
    }

    try {
      const created = await createProjectAlert(createPayload);

      setAlerts((current) => [...(current ?? []), created]);
      resetCreateForm();
      setIsCreateOpen(false);
      showSuccessToast("Alert rule created successfully.");
    } catch {
      showErrorToast("Could not create alert rule.");
    }
  }

  async function handleDeleteAlert(alertId: string): Promise<void> {
    try {
      await deleteAlert(alertId);
      setAlerts((current) => (current ?? []).filter((a) => a.alert_id !== alertId));
      showSuccessToast("Alert rule deleted successfully.");
    } catch {
      showErrorToast("Could not delete alert rule.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div />
        <Dialog open={isCreateOpen} onOpenChange={handleCreateOpenChange}>
          <DialogTrigger asChild>
            <Button type="button">
              <PlusIcon data-icon="inline-start" />
              Create alert rule
            </Button>
          </DialogTrigger>
            <DialogFormContent
              title="Create alert rule"
              description="Add a project-scoped delivery rule for incident lifecycle changes."
              footer={
                <Button
                  type="submit"
                  disabled={channel === "slack" && (!slackEnabled || selectedSlackDestinationId.length === 0)}
                >
                  Create alert rule
                </Button>
              }
              onSubmit={(event) => void handleCreateAlert(event)}
            >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="project-alert-channel">Channel</FieldLabel>
                    <select
                      id="project-alert-channel"
                      className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      value={channel}
                      onChange={(event) => setChannel(event.currentTarget.value as AlertChannel)}
                    >
                      {channelOptions.map((option) => (
                        <option key={option.value} value={option.value} disabled={option.disabled === true}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <FieldDescription>{describeAlertChannel(channel)}</FieldDescription>
                  </Field>
                  {channel === "email" ? (
                    <Field>
                      <FieldLabel htmlFor="project-alert-email-recipient">Recipient email</FieldLabel>
                      <FieldDescription>Send this alert to a single email address. Create additional alert rules if multiple people should receive it.</FieldDescription>
                      <Input
                        id="project-alert-email-recipient"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        placeholder={session?.email ?? "oncall@example.com"}
                        value={emailRecipient}
                        onChange={(event) => setEmailRecipient(event.currentTarget.value)}
                        required
                      />
                    </Field>
                  ) : channel === "slack" ? (
                    <Field>
                      <FieldLabel htmlFor="project-alert-slack-channel">{getDestinationLabel(channel)}</FieldLabel>
                      <FieldDescription>{getDestinationDescription(channel)}</FieldDescription>
                      {!slackDestinationsLoaded ? (
                        <Skeleton className="h-10 w-full" />
                      ) : slackDestinations.length > 0 ? (
                        <div className="space-y-3">
                          <select
                            id="project-alert-slack-channel"
                            className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                            value={selectedSlackDestinationId}
                            onChange={(event) => setSelectedSlackDestinationId(event.currentTarget.value)}
                            required
                          >
                            <option value="" disabled>
                              Choose a Slack channel
                            </option>
                            {slackDestinations.map((destination) => (
                              <option key={destination.slack_destination_id} value={destination.slack_destination_id}>
                                {formatSlackDestinationLabel(destination)}
                              </option>
                            ))}
                          </select>
                          {selectedSlackDestination !== null ? (
                            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                              Selected: {formatSlackDestinationLabel(selectedSlackDestination)}
                            </div>
                          ) : null}
                          {isOwner ? (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => void handleConnectSlack()}
                                disabled={isConnectingSlack}
                              >
                                <LinkIcon data-icon="inline-start" />
                                {isConnectingSlack ? "Connecting Slack..." : "Connect Slack"}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => void handleTestSlackDestination(selectedSlackDestinationId)}
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
                                onClick={() => void handleDeleteSlackDestination(selectedSlackDestinationId)}
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
                          <p>
                            {isOwner
                              ? "Connect Slack once, choose a channel in Slack, and it will become available for alert rules here."
                              : "An owner needs to connect Slack before this project can send Slack alerts."}
                          </p>
                          {isOwner ? (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => void handleConnectSlack()}
                              disabled={isConnectingSlack}
                            >
                              <LinkIcon data-icon="inline-start" />
                              {isConnectingSlack ? "Connecting Slack..." : "Connect Slack"}
                            </Button>
                          ) : null}
                        </div>
                      )}
                    </Field>
                  ) : (
                    <Field>
                      <FieldLabel htmlFor="project-alert-destination">{getDestinationLabel(channel)}</FieldLabel>
                      <FieldDescription>{getDestinationDescription(channel)}</FieldDescription>
                      <Input
                        id="project-alert-destination"
                        type="url"
                        inputMode="url"
                        placeholder="https://example.com/..."
                        value={destinationUrl}
                        onChange={(event) => setDestinationUrl(event.currentTarget.value)}
                        required
                      />
                    </Field>
                  )}
                  <Field>
                    <FieldLabel htmlFor="project-alert-condition">Condition</FieldLabel>
                    <select
                      id="project-alert-condition"
                      className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      value={conditionType}
                      onChange={(event) => setConditionType(event.currentTarget.value as AlertConditionType)}
                    >
                      {ALERT_CONDITION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="project-alert-severity">Minimum severity</FieldLabel>
                    <FieldDescription>Leave unset to deliver for all severities matching the selected condition.</FieldDescription>
                    <select
                      id="project-alert-severity"
                      className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      value={severityMin}
                      onChange={(event) => setSeverityMin(event.currentTarget.value as typeof severityMin)}
                    >
                      {SEVERITY_OPTIONS.map((option) => (
                        <option key={option.value || "any"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </FieldGroup>
            </DialogFormContent>
          </Dialog>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>Alert rules</CardTitle>
            <CardDescription>Rules for sending incident events to external channels.</CardDescription>
          </CardHeader>
          <CardContent>
            {alerts === null ? (
              showAlertsLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : null
            ) : alerts.length === 0 ? (
              <ProjectResourceEmptyState
                icon={BellRingIcon}
                title="No alert rules yet"
                description="Create a rule to send incident events where your team will see them."
                actionLabel="Create alert rule"
                onAction={() => setIsCreateOpen(true)}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Channel</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead>Minimum severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alerts.map((alert) => (
                    <TableRow key={alert.alert_id}>
                      <TableCell className="font-medium">
                        {formatAlertChannelWithDestination(alert, slackDestinations)}
                      </TableCell>
                      <TableCell>{formatAlertCondition(alert.condition_type)}</TableCell>
                      <TableCell>{alert.severity_min === null ? "Any" : formatSeverity(alert.severity_min)}</TableCell>
                      <TableCell>
                        <Badge variant={alert.is_enabled ? "success" : "secondary"}>{alert.is_enabled ? "enabled" : "disabled"}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button type="button" variant="ghost" size="sm">
                              <Trash2Icon className="size-4" />
                              Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete alert rule</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently remove this alert rule. Incident lifecycle events will no longer be delivered through this channel.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => void handleDeleteAlert(alert.alert_id)}>Delete alert</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alert rule guidance</CardTitle>
            <CardDescription>Use a small set of clear rules with specific conditions and destinations.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border/80 bg-background/60 p-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <BellRingIcon className="size-4" />
                Getting started
              </div>
              <p className="mt-2 leading-6">
                Start with the key incident events and add more rules only when they map to a clear response path.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function formatAlertChannel(channel: AlertChannel): string {
  return ALERT_CHANNEL_LABELS[channel] ?? channel;
}

export function formatAlertChannelWithDestination(
  alert: AlertRecord,
  slackDestinations: SlackDestinationRecord[]
): string {
  if (alert.channel !== "slack") {
    return formatAlertChannel(alert.channel);
  }

  const slackDestinationId = alert.config["slack_destination_id"];
  if (typeof slackDestinationId !== "string") {
    return "Slack";
  }

  const destination = slackDestinations.find((entry) => entry.slack_destination_id === slackDestinationId);
  if (destination === undefined) {
    return "Slack (channel unavailable)";
  }

  return `Slack - ${formatSlackDestinationLabel(destination)}`;
}

export function formatAlertCondition(conditionType: AlertConditionType): string {
  return ALERT_CONDITION_OPTIONS.find((option) => option.value === conditionType)?.label ?? conditionType;
}

export function formatSeverity(severity: "low" | "medium" | "high" | "critical"): string {
  return SEVERITY_OPTIONS.find((option) => option.value === severity)?.label ?? severity;
}

export function buildAlertConfig(input: {
  channel: AlertChannel;
  emailRecipient: string;
  destinationUrl: string;
  slackDestinationId: string;
}): Record<string, unknown> | null {
  const { channel, emailRecipient, destinationUrl, slackDestinationId } = input;

  if (channel === "email") {
    return validateAlertRecipientEmail(emailRecipient) === undefined
      ? { to: emailRecipient }
      : null;
  }

  if (channel === "slack") {
    return slackDestinationId.length > 0 ? { slack_destination_id: slackDestinationId } : null;
  }

  if (destinationUrl.length === 0) {
    return null;
  }

  if (channel === "webhook") {
    return {
      target_url: destinationUrl
    };
  }

  return {
    webhook_url: destinationUrl
  };
}

export function describeAlertChannel(channel: AlertChannel): string {
  if (channel === "webhook") {
    return "Send only matched alert notifications to a dedicated endpoint. This is separate from the Webhooks tab, which delivers signed lifecycle events.";
  }

  if (channel === "slack") {
    return "Deliver matched alert notifications into a connected Slack channel. Team tier owners can connect channels directly from this dialog.";
  }

  if (channel === "discord") {
    return "Post matched alert notifications into a Discord channel via a webhook URL.";
  }

  return "Send matched alert notifications to a single email recipient. Create additional alert rules if multiple people should receive email.";
}

export function getDestinationLabel(channel: AlertChannel): string {
  if (channel === "slack") {
    return "Slack channel";
  }

  if (channel === "discord") {
    return "Discord webhook URL";
  }

  return "Webhook endpoint URL";
}

export function getDestinationDescription(channel: AlertChannel): string {
  if (channel === "slack") {
    return "Choose one of the Slack channels already connected for this organization, or connect Slack now.";
  }

  if (channel === "discord") {
    return "Paste the Discord webhook URL that should receive this alert rule.";
  }

  return "Matched alert events will be POSTed to this URL. Use the Webhooks tab for signed lifecycle webhook fanout.";
}

export function validateAlertRecipientEmail(value: string): string | undefined {
  if (value.length === 0) {
    return "Enter the email address that should receive this alert.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return "Enter a valid email address for this alert.";
  }

  return undefined;
}

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

function resolveSlackDestinationSelection(
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

function formatSlackDestinationLabel(destination: SlackDestinationRecord): string {
  const teamLabel = destination.slack_team_name ?? destination.slack_team_id;
  const channelLabel = destination.slack_channel_name ?? destination.slack_channel_id;
  return `${teamLabel} - ${channelLabel}`;
}
