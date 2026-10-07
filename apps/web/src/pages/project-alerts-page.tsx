import { BoundedListLimit } from "../components/system/bounded-list-limit.js";
import {
  TEAM_ALERT_CHANNEL_OPTIONS,
  STANDARD_ALERT_CHANNEL_OPTIONS,
  ALERT_SEVERITY_LIFECYCLE_DEFAULT,
  SECONDS_PER_DAY,
  formatAlertChannelWithDestination,
  canManageAlertRule,
  formatAlertCondition,
  formatSeverityLifecycleScopeForAlert,
  formatSeverity,
  formatAlertCooldown,
  buildAlertRulePayload,
  getDefaultCooldownDays,
  getDestinationLabel,
  getDestinationDescription
} from "../lib/alert-form.js";
export * from "../lib/alert-form.js";
import { AlertGroupsCard } from "../components/system/alert-groups-card.js";
import { AlertDeliveryFields } from "../components/system/alert-delivery-fields.js";
import { AlertRuleFields } from "../components/system/alert-rule-fields.js";
import { durationFromSeconds } from "../lib/duration-form.js";
import { PlaintextTokenReveal } from "../components/system/plaintext-token-reveal.js";
import { BellRingIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { getTierCapabilities } from "../../../../packages/shared-types/src/index.js";
import { DialogFormContent } from "../components/system/dialog-form-content.js";
import { CalloutCard } from "../components/system/callout-card.js";
import { ConnectedSlackDestinationField } from "../components/system/connected-slack-destination-field.js";
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
import { TableActionButton } from "../components/system/table-action-button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "../components/ui/card.js";
import { Dialog, DialogTrigger } from "../components/ui/dialog.js";
import { Field, FieldDescription, FieldLabel } from "../components/ui/field.js";
import { Input } from "../components/ui/input.js";

import { Skeleton } from "../components/ui/skeleton.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "../components/ui/table.js";
import {
  createProjectAlert,
  deleteAlert,
  listProjectAlerts,
  updateProjectAlert,
  type AlertChannel,
  type AlertConditionType,
  type AlertSeverityLifecycleScope,
  type AlertRecord
} from "../lib/api.js";
import { showErrorToast, showSuccessToast } from "../lib/notify.js";
import { getProjectEffectiveRole } from "../lib/project-access.js";
import { useSession } from "../lib/session.js";
import {
  deleteProjectSlackDestination,
  getSlackInstallUrl,
  listProjectSlackDestinations,
  testProjectSlackDestination,
  type SlackDestinationRecord
} from "../lib/slack-api.js";
import {
  formatSlackDestinationLabel,
  getSlackDestinationErrorMessage,
  resolveSlackDestinationSelection
} from "../lib/slack-destinations.js";
import { useDelayedVisibility } from "../lib/use-delayed-visibility.js";

export function ProjectAlertsPage(): JSX.Element {
  const { project, projectId } = useOutletContext<ProjectContext>();
  const { session } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const [alerts, setAlerts] = useState<AlertRecord[] | null>(null);
  const [alertsError, setAlertsError] = useState(false);
  const [alertLimit, setAlertLimit] = useState(20);
  const [alertsRevision, setAlertsRevision] = useState(0);
  const projectGeneration = useRef(0);
  const showAlertsLoading = useDelayedVisibility(alerts === null && !alertsError);
  const [slackDestinations, setSlackDestinations] = useState<SlackDestinationRecord[]>([]);
  const [slackDestinationsLoaded, setSlackDestinationsLoaded] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isConnectingSlack, setIsConnectingSlack] = useState(false);
  const [slackTestDestinationId, setSlackTestDestinationId] = useState<string | null>(null);
  const [slackDeleteDestinationId, setSlackDeleteDestinationId] = useState<string | null>(null);
  const [editingAlertId, setEditingAlertId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [serviceId, setServiceId] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [digestWindow, setDigestWindow] = useState("");
  const [cooldownScope, setCooldownScope] = useState("");
  const [signingRequested, setSigningRequested] = useState(false);
  const [signingSecret, setSigningSecret] = useState<string | null>(null);
  const [slackDirect, setSlackDirect] = useState(false);
  const [channel, setChannel] = useState<AlertChannel>("email");
  const [conditionType, setConditionType] = useState<AlertConditionType>("new_incident");
  const [severityLifecycleScope, setSeverityLifecycleScope] = useState<AlertSeverityLifecycleScope>(
    ALERT_SEVERITY_LIFECYCLE_DEFAULT
  );
  const [severityMin, setSeverityMin] = useState<"" | "low" | "medium" | "high" | "critical">("");
  const [cooldown, setCooldown] = useState(() => durationFromSeconds(SECONDS_PER_DAY));
  const [isCooldownPristine, setIsCooldownPristine] = useState(true);
  const [emailRecipient, setEmailRecipient] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [selectedSlackDestinationId, setSelectedSlackDestinationId] = useState("");
  const [preferredSlackDestinationId, setPreferredSlackDestinationId] = useState<string | null>(
    null
  );
  const slackEnabled = getTierCapabilities(project.organization_plan).slack_integration;
  const effectiveRole = getProjectEffectiveRole(project);
  const canManageIntegrations = effectiveRole === "owner" || effectiveRole === "admin";
  const channelOptions = slackEnabled ? TEAM_ALERT_CHANNEL_OPTIONS : STANDARD_ALERT_CHANNEL_OPTIONS;
  useEffect(() => {
    let active = true;
    setAlerts(null);
    setAlertsError(false);
    void listProjectAlerts(projectId, alertLimit).then(
      (records) => {
        if (active) setAlerts(records);
      },
      () => {
        if (active) setAlertsError(true);
      }
    );
    return () => {
      active = false;
    };
  }, [projectId, alertsRevision, alertLimit]);
  useEffect(() => {
    projectGeneration.current += 1;
    setIsCreateOpen(false);
    setEditingAlertId(null);
    setSigningSecret(null);
    setSlackDestinations([]);
    setSlackDestinationsLoaded(false);
    setIsConnectingSlack(false);
    setSlackTestDestinationId(null);
    setSlackDeleteDestinationId(null);
    setIsSaving(false);
    return () => {
      projectGeneration.current += 1;
    };
  }, [projectId]);

  const resolvedProjectId = projectId;

  async function refreshSlackDestinations(
    nextPreferredDestinationId: string | null = preferredSlackDestinationId
  ): Promise<void> {
    const generation = projectGeneration.current;
    try {
      const destinations = await listProjectSlackDestinations(projectId);
      if (generation !== projectGeneration.current) return;
      setSlackDestinations(destinations);
      const resolvedDestinationId = resolveSlackDestinationSelection(
        destinations,
        nextPreferredDestinationId
      );
      if (resolvedDestinationId !== null) {
        setSelectedSlackDestinationId(resolvedDestinationId);
      }
    } catch {
      if (generation === projectGeneration.current) setSlackDestinations([]);
    } finally {
      if (generation === projectGeneration.current) setSlackDestinationsLoaded(true);
    }
  }

  useEffect(() => {
    void refreshSlackDestinations();
  }, [projectId, slackEnabled]);

  useEffect(() => {
    if (editingAlertId !== null) return;
    if (channelOptions.some((option) => option.value === channel && option.disabled !== true)) {
      return;
    }

    setChannel(channelOptions.find((option) => option.disabled !== true)?.value ?? "email");
  }, [channel, channelOptions, editingAlertId]);

  function resetAlertForm(nextChannel: AlertChannel = "email"): void {
    setChannel(nextChannel);
    setServiceId("");
    setEnabled(true);
    setDigestWindow("");
    setCooldownScope("");
    setSigningRequested(false);
    setSlackDirect(false);
    setConditionType("new_incident");
    setSeverityLifecycleScope(ALERT_SEVERITY_LIFECYCLE_DEFAULT);
    setSeverityMin("");
    setCooldown(durationFromSeconds(Number(getDefaultCooldownDays(nextChannel)) * SECONDS_PER_DAY));
    setIsCooldownPristine(true);
    setEmailRecipient(session?.email ?? "");
    setDestinationUrl("");
    setSelectedSlackDestinationId(
      resolveSlackDestinationSelection(slackDestinations, preferredSlackDestinationId) ?? ""
    );
  }

  function handleCreateOpenChange(nextOpen: boolean): void {
    setIsCreateOpen(nextOpen);

    if (nextOpen) {
      if (editingAlertId === null) {
        resetAlertForm();
      }
    } else {
      setEditingAlertId(null);
    }
  }

  useEffect(() => {
    if (!slackEnabled || channel !== "slack" || selectedSlackDestinationId.length > 0) {
      return;
    }

    const resolvedDestinationId = resolveSlackDestinationSelection(
      slackDestinations,
      preferredSlackDestinationId
    );
    if (resolvedDestinationId !== null) {
      setSelectedSlackDestinationId(resolvedDestinationId);
    }
  }, [
    channel,
    preferredSlackDestinationId,
    selectedSlackDestinationId,
    slackDestinations,
    slackEnabled
  ]);

  useEffect(() => {
    if (!isCooldownPristine) {
      return;
    }

    setCooldown(durationFromSeconds(Number(getDefaultCooldownDays(channel)) * SECONDS_PER_DAY));
  }, [channel, isCooldownPristine]);

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
      resetAlertForm("slack");
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
    const generation = projectGeneration.current;
    try {
      setIsConnectingSlack(true);
      const installUrl = await getSlackInstallUrl(projectId, `/projects/${projectId}/alerts`);
      if (generation !== projectGeneration.current) return;
      window.location.assign(installUrl);
    } catch {
      if (generation !== projectGeneration.current) return;
      setIsConnectingSlack(false);
      showErrorToast("Could not start the Slack connect flow.");
    }
  }

  async function handleTestSlackDestination(destinationId: string): Promise<void> {
    const generation = projectGeneration.current;
    try {
      setSlackTestDestinationId(destinationId);
      await testProjectSlackDestination(projectId, destinationId);
      if (generation !== projectGeneration.current) return;
      showSuccessToast("Slack test message sent successfully.");
    } catch (error) {
      if (generation !== projectGeneration.current) return;
      showErrorToast(getSlackDestinationErrorMessage(error, "test"));
    } finally {
      if (generation === projectGeneration.current) setSlackTestDestinationId(null);
    }
  }

  async function handleDeleteSlackDestination(destinationId: string): Promise<void> {
    const generation = projectGeneration.current;
    try {
      setSlackDeleteDestinationId(destinationId);
      await deleteProjectSlackDestination(projectId, destinationId);
      if (generation !== projectGeneration.current) return;
      const remainingDestinations = slackDestinations.filter(
        (destination) => destination.slack_destination_id !== destinationId
      );
      setSlackDestinations(remainingDestinations);
      const nextSelectedDestinationId =
        resolveSlackDestinationSelection(remainingDestinations, null) ?? "";
      setSelectedSlackDestinationId(nextSelectedDestinationId);
      setPreferredSlackDestinationId(
        nextSelectedDestinationId.length > 0 ? nextSelectedDestinationId : null
      );
      showSuccessToast("Slack channel disconnected successfully.");
    } catch (error) {
      if (generation !== projectGeneration.current) return;
      showErrorToast(getSlackDestinationErrorMessage(error, "delete"));
    } finally {
      if (generation === projectGeneration.current) setSlackDeleteDestinationId(null);
    }
  }

  function populateAlertForm(alert: AlertRecord): void {
    setChannel(alert.channel);
    setServiceId(alert.service_id ?? "");
    setEnabled(alert.is_enabled);
    setDigestWindow(
      typeof alert.config["aggregation_window_seconds"] === "number"
        ? String(alert.config["aggregation_window_seconds"])
        : ""
    );
    setCooldownScope(
      typeof alert.config["cooldown_scope"] === "string" ? alert.config["cooldown_scope"] : ""
    );
    setSigningRequested(false);
    setSlackDirect(alert.channel === "slack" && typeof alert.config["webhook_url"] === "string");
    setConditionType(alert.condition_type);
    setSeverityLifecycleScope(alert.severity_lifecycle_scope ?? ALERT_SEVERITY_LIFECYCLE_DEFAULT);
    setSeverityMin(alert.severity_min ?? "");
    setCooldown(durationFromSeconds(alert.cooldown_seconds));
    setIsCooldownPristine(false);

    if (alert.channel === "email") {
      const recipient = alert.config["to"];
      setEmailRecipient(typeof recipient === "string" ? recipient : "");
      setDestinationUrl("");
      setSelectedSlackDestinationId("");
      return;
    }

    if (alert.channel === "slack") {
      const slackDestinationId = alert.config["slack_destination_id"];
      setEmailRecipient("");
      setDestinationUrl(
        typeof alert.config["webhook_url"] === "string" ? alert.config["webhook_url"] : ""
      );
      setSelectedSlackDestinationId(
        typeof slackDestinationId === "string" ? slackDestinationId : ""
      );
      return;
    }

    const destinationKey = alert.channel === "webhook" ? "target_url" : "webhook_url";
    const configuredDestination = alert.config[destinationKey];
    setEmailRecipient("");
    setDestinationUrl(typeof configuredDestination === "string" ? configuredDestination : "");
    setSelectedSlackDestinationId("");
  }

  function openEditAlertDialog(alert: AlertRecord): void {
    setEditingAlertId(alert.alert_id);
    populateAlertForm(alert);
    setIsCreateOpen(true);
  }

  function buildAlertDraft(): ReturnType<typeof buildAlertRulePayload> | null {
    try {
      return buildAlertRulePayload({
        channel,
        conditionType,
        severityLifecycleScope,
        severityMin,
        cooldown,
        emailRecipient,
        destinationUrl,
        selectedSlackDestinationId,
        serviceId,
        enabled,
        digestWindow,
        cooldownScope,
        slackDirect,
        editing: editingAlertId !== null,
        previousConfig: alerts?.find(
          (alert) => alert.alert_id === editingAlertId && alert.channel === channel
        )?.config
      });
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : "Could not validate alert rule.");
      return null;
    }
  }

  async function handleCreateAlert(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isSaving) return;
    const draft = buildAlertDraft();
    if (draft === null) {
      return;
    }

    const { severity_min, service_id, ...createDraft } = draft;
    const createPayload: Parameters<typeof createProjectAlert>[0] = {
      project_id: resolvedProjectId,
      ...createDraft,
      ...(severity_min == null ? {} : { severity_min }),
      ...(service_id == null ? {} : { service_id }),
      is_enabled: enabled,
      ...(channel === "webhook" && signingRequested ? { signing: "hmac_sha256_v1" as const } : {})
    };

    const generation = projectGeneration.current;
    try {
      setIsSaving(true);
      const { signing_secret, ...created } = await createProjectAlert(createPayload);
      if (generation !== projectGeneration.current) return;
      setSigningSecret(signing_secret ?? null);

      setAlerts((current) => [...(current ?? []), created]);
      resetAlertForm();
      setIsCreateOpen(false);
      showSuccessToast("Alert rule created successfully.");
    } catch {
      if (generation === projectGeneration.current) showErrorToast("Could not create alert rule.");
    } finally {
      if (generation === projectGeneration.current) setIsSaving(false);
    }
  }

  async function handleUpdateAlert(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isSaving) return;

    if (editingAlertId === null) {
      return;
    }

    const draft = buildAlertDraft();
    if (draft === null) {
      return;
    }

    const generation = projectGeneration.current;
    try {
      setIsSaving(true);
      const { signing_secret, ...updated } = await updateProjectAlert(
        editingAlertId,
        resolvedProjectId,
        {
          ...draft,
          ...(channel === "webhook" && signingRequested
            ? { rotate_signing_secret: true as const }
            : {})
        }
      );
      if (generation !== projectGeneration.current) return;
      setSigningSecret(signing_secret ?? null);
      setAlerts((current) =>
        (current ?? []).map((alert) => (alert.alert_id === updated.alert_id ? updated : alert))
      );
      setIsCreateOpen(false);
      setEditingAlertId(null);
      showSuccessToast("Alert rule updated successfully.");
    } catch {
      if (generation === projectGeneration.current) showErrorToast("Could not update alert rule.");
    } finally {
      if (generation === projectGeneration.current) setIsSaving(false);
    }
  }

  async function handleDeleteAlert(alertId: string): Promise<void> {
    try {
      await deleteAlert(alertId, resolvedProjectId);
      setAlerts((current) => (current ?? []).filter((a) => a.alert_id !== alertId));
      showSuccessToast("Alert rule deleted successfully.");
    } catch {
      showErrorToast("Could not delete alert rule.");
    }
  }

  const destinationFields =
    channel === "email" ? (
      <Field>
        <FieldLabel htmlFor="project-alert-email-recipient">Recipient email</FieldLabel>
        <FieldDescription>
          Send this alert to a single email address. Create additional alert rules if multiple
          people should receive it.
        </FieldDescription>
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
    ) : channel === "slack" && !slackDirect ? (
      <ConnectedSlackDestinationField
        label={getDestinationLabel(channel)}
        description={getDestinationDescription(channel)}
        slackDestinations={slackDestinations}
        slackDestinationsLoaded={slackDestinationsLoaded}
        selectedSlackDestinationId={selectedSlackDestinationId}
        canManageIntegrations={canManageIntegrations}
        isConnectingSlack={isConnectingSlack}
        slackTestDestinationId={slackTestDestinationId}
        slackDeleteDestinationId={slackDeleteDestinationId}
        onSelectedSlackDestinationIdChange={setSelectedSlackDestinationId}
        onConnectSlack={() => void handleConnectSlack()}
        onTestSlackDestination={(destinationId) => void handleTestSlackDestination(destinationId)}
        onDeleteSlackDestination={(destinationId) =>
          void handleDeleteSlackDestination(destinationId)
        }
        emptyManageText="Connect Slack once, choose a channel in Slack, and it will become available for alert rules here."
        emptyReadOnlyText="A project admin needs to connect Slack before this project can send Slack alerts."
      />
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
    );

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
            title={editingAlertId === null ? "Create alert rule" : "Edit alert rule"}
            description={
              editingAlertId === null
                ? "Add a project-scoped delivery rule for incident lifecycle changes."
                : "Update this project-scoped delivery rule for incident lifecycle changes."
            }
            size="lg"
            footer={
              <Button
                type="submit"
                disabled={
                  isSaving ||
                  (channel === "slack" &&
                    !slackDirect &&
                    (!slackEnabled || selectedSlackDestinationId.length === 0))
                }
              >
                {isSaving
                  ? "Saving..."
                  : editingAlertId === null
                    ? "Create alert rule"
                    : "Save changes"}
              </Button>
            }
            onSubmit={(event) =>
              void (editingAlertId === null ? handleCreateAlert(event) : handleUpdateAlert(event))
            }
          >
            <AlertRuleFields
              channel={channel}
              setChannel={setChannel}
              channelOptions={channelOptions}
              conditionType={conditionType}
              setConditionType={setConditionType}
              severityLifecycleScope={severityLifecycleScope}
              setSeverityLifecycleScope={setSeverityLifecycleScope}
              severityMin={severityMin}
              setSeverityMin={setSeverityMin}
              cooldown={cooldown}
              onCooldownChange={(value) => {
                setCooldown(value);
                setIsCooldownPristine(false);
              }}
              destinationFields={destinationFields}
              advancedFields={
                <AlertDeliveryFields
                  projectId={projectId}
                  serviceId={serviceId}
                  setServiceId={setServiceId}
                  enabled={enabled}
                  setEnabled={setEnabled}
                  digestWindow={digestWindow}
                  setDigestWindow={setDigestWindow}
                  cooldownScope={cooldownScope}
                  setCooldownScope={setCooldownScope}
                  signingRequested={signingRequested}
                  setSigningRequested={setSigningRequested}
                  editingAlertId={editingAlertId}
                  channel={channel}
                />
              }
            />
          </DialogFormContent>
        </Dialog>
      </div>

      {signingSecret === null ? null : (
        <div className="flex flex-col gap-3">
          <PlaintextTokenReveal
            value={signingSecret}
            title="New alert signing secret"
            regionLabel="New alert signing secret"
            description="This verification key is shown once. Copy it into your receiver now."
          />
          <Button type="button" variant="outline" onClick={() => setSigningSecret(null)}>
            Dismiss secret
          </Button>
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>Alert rules</CardTitle>
            <CardDescription>
              Rules for sending incident events to external channels.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BoundedListLimit
              id="alert-rule-limit"
              label="Alert rule limit"
              value={alertLimit}
              onChange={setAlertLimit}
            />
            {alertsError ? (
              <div className="flex flex-col gap-3">
                <p role="alert" className="text-sm text-destructive">
                  Could not load alert rules.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAlertsRevision((current) => current + 1)}
                >
                  Retry alert rules
                </Button>
              </div>
            ) : alerts === null ? (
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
                    <TableHead>Notify on</TableHead>
                    <TableHead>Minimum severity</TableHead>
                    <TableHead>Cooldown</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alerts.map((alert) => (
                    <TableRow key={alert.alert_id}>
                      <TableCell className="font-medium">
                        {formatAlertChannelWithDestination(alert, slackDestinations)}
                      </TableCell>
                      <TableCell>{formatAlertCondition(alert.condition_type)}</TableCell>
                      <TableCell>{formatSeverityLifecycleScopeForAlert(alert)}</TableCell>
                      <TableCell>
                        {alert.severity_min === null ? "Any" : formatSeverity(alert.severity_min)}
                      </TableCell>
                      <TableCell>{formatAlertCooldown(alert.cooldown_seconds)}</TableCell>
                      <TableCell>
                        <Badge variant={alert.is_enabled ? "success" : "secondary"}>
                          {alert.is_enabled ? "enabled" : "disabled"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {canManageAlertRule(alert, session?.user_id, effectiveRole) ? (
                          <div className="flex items-center justify-end gap-1">
                            <TableActionButton
                              label="Edit"
                              icon={PencilIcon}
                              onClick={() => openEditAlertDialog(alert)}
                            />
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <TableActionButton label="Delete" icon={Trash2Icon} />
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete alert rule</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently remove this alert rule. Incident lifecycle
                                    events will no longer be delivered through this channel.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => void handleDeleteAlert(alert.alert_id)}
                                  >
                                    Delete alert
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Alert rule guidance</CardTitle>
              <CardDescription>
                Use a small set of clear rules with specific conditions and destinations.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-border/80 bg-background/60 p-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2 font-medium text-foreground">
                  <BellRingIcon className="size-4" />
                  Getting started
                </div>
                <p className="mt-2 leading-6">
                  Start with the key incident events and add more rules only when they map to a
                  clear response path.
                </p>
              </div>
            </CardContent>
          </Card>

          {!slackEnabled && slackDestinationsLoaded && slackDestinations.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Connected Slack destinations</CardTitle>
                <CardDescription>
                  Preserved Slack channel setup saved for this project organization.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <CalloutCard
                  eyebrow="Slack delivery paused"
                  title="Saved Slack channels will resume after an upgrade"
                  description="This project is currently on Free, so Slack alert delivery and channel management are paused. The connected destinations below are preserved and will become usable again after the owner upgrades back to Team."
                  tone="warning"
                />
                <div className="space-y-2">
                  {slackDestinations.map((destination) => (
                    <div
                      key={destination.slack_destination_id}
                      className="rounded-lg border border-border/80 bg-background/60 px-3 py-2"
                    >
                      <div className="font-medium text-foreground">
                        {formatSlackDestinationLabel(destination)}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        Saved destination ID: {destination.slack_destination_id}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
      <AlertGroupsCard key={projectId} projectId={projectId} />
    </div>
  );
}
