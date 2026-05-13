import { BellRingIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
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
  const [alerts, setAlerts] = useState<AlertRecord[] | null>(null);
  const showAlertsLoading = useDelayedVisibility(alerts === null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [channel, setChannel] = useState<AlertChannel>("email");
  const [conditionType, setConditionType] = useState<AlertConditionType>("new_incident");
  const [severityMin, setSeverityMin] = useState<"" | "low" | "medium" | "high" | "critical">("");
  const [emailRecipient, setEmailRecipient] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const channelOptions = project.organization_plan === "team" ? TEAM_ALERT_CHANNEL_OPTIONS : STANDARD_ALERT_CHANNEL_OPTIONS;

  useEffect(() => {
    void (async () => {
      const nextAlerts = await listProjectAlerts(projectId);
      setAlerts(nextAlerts);
    })();
  }, [projectId]);

  const resolvedProjectId = projectId;

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
  }

  function handleCreateOpenChange(nextOpen: boolean): void {
    setIsCreateOpen(nextOpen);

    if (nextOpen) {
      resetCreateForm();
    }
  }

  async function handleCreateAlert(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const config = buildAlertConfig({
      channel,
      emailRecipient: emailRecipient.trim(),
      destinationUrl: destinationUrl.trim()
    });

    if (config === null) {
      showErrorToast(channel === "email" ? "Enter a valid recipient email address." : "Add a destination URL for this alert channel.");
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
              footer={<Button type="submit">Create alert rule</Button>}
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
                      <TableCell className="font-medium">{formatAlertChannel(alert.channel)}</TableCell>
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
}): Record<string, unknown> | null {
  const { channel, emailRecipient, destinationUrl } = input;

  if (channel === "email") {
    return validateAlertRecipientEmail(emailRecipient) === undefined
      ? { to: emailRecipient }
      : null;
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
    return "Post matched alert notifications into a Slack channel via an incoming webhook.";
  }

  if (channel === "discord") {
    return "Post matched alert notifications into a Discord channel via a webhook URL.";
  }

  return "Send matched alert notifications to a single email recipient. Create additional alert rules if multiple people should receive email.";
}

export function getDestinationLabel(channel: AlertChannel): string {
  if (channel === "slack") {
    return "Slack webhook URL";
  }

  if (channel === "discord") {
    return "Discord webhook URL";
  }

  return "Webhook endpoint URL";
}

export function getDestinationDescription(channel: AlertChannel): string {
  if (channel === "slack") {
    return "Paste the Slack incoming webhook URL that should receive this alert rule.";
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
