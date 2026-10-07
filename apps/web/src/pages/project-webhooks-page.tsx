import { BoundedListLimit } from "../components/system/bounded-list-limit.js";
import { useSession } from "../lib/session.js";
import { getProjectEffectiveRole } from "../lib/project-access.js";
import { TableActionButton } from "../components/system/table-action-button.js";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction
} from "../components/ui/alert-dialog.js";
import { WebhookEventTypeSchema } from "../../../../packages/webhook-client/src/index.js";
import { WebhookRuleFields } from "../components/system/webhook-rule-fields.js";
import { ActivityIcon, PlusIcon, SendIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { DialogFormContent } from "../components/system/dialog-form-content.js";
import { PlaintextTokenReveal } from "../components/system/plaintext-token-reveal.js";
import { ProjectResourceEmptyState } from "../components/system/project-resource-empty-state.js";
import type { ProjectContext } from "../components/system/project-layout.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "../components/ui/card.js";
import { Dialog, DialogTrigger } from "../components/ui/dialog.js";
import { Field, FieldLabel } from "../components/ui/field.js";
import { Notice } from "../components/ui/notice.js";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../components/ui/select.js";
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
  createProjectWebhook,
  updateProjectWebhook,
  deleteProjectWebhook,
  retryProjectWebhookDelivery,
  listProjectWebhookDeliveries,
  listProjectWebhooks,
  testProjectWebhook,
  type CreatedWebhookRecord,
  type WebhookDeliveryRecord,
  type WebhookEventType,
  type WebhookRecord
} from "../lib/api.js";
import { showErrorToast, showSuccessToast } from "../lib/notify.js";
import { useDelayedVisibility } from "../lib/use-delayed-visibility.js";

type DeliveryState = Record<string, WebhookDeliveryRecord[]>;

export function ProjectWebhooksPage(): JSX.Element {
  const { project, projectId } = useOutletContext<ProjectContext>();
  const { session } = useSession();
  const role = getProjectEffectiveRole(project);
  function canManage(webhook: WebhookRecord): boolean {
    return role === "owner" || role === "admin" || webhook.created_by_user_id === session?.user_id;
  }
  const projectGeneration = useRef(0);
  const [editingWebhook, setEditingWebhook] = useState<WebhookRecord | null>(null);
  const [pendingDelete, setPendingDelete] = useState<WebhookRecord | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeMutationId, setActiveMutationId] = useState<string | null>(null);
  const [testEvent, setTestEvent] = useState<WebhookEventType>("verification.passed");
  const [endpointLimit, setEndpointLimit] = useState(20);
  const [deliveryLimit, setDeliveryLimit] = useState(5);
  const [webhooks, setWebhooks] = useState<WebhookRecord[] | null>(null);
  const [webhooksError, setWebhooksError] = useState(false);
  const [deliveriesError, setDeliveriesError] = useState(false);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const [endpointRevision, setEndpointRevision] = useState(0);
  const [deliveryRevision, setDeliveryRevision] = useState(0);
  const showWebhooksLoading = useDelayedVisibility(webhooks === null && !webhooksError);
  const showDeliveriesLoading = useDelayedVisibility(
    (webhooks === null && !webhooksError) || deliveriesLoading
  );
  const [deliveriesByWebhook, setDeliveriesByWebhook] = useState<DeliveryState>({});
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createdWebhook, setCreatedWebhook] = useState<CreatedWebhookRecord | null>(null);
  const [endpointUrl, setEndpointUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<WebhookEventType[]>(["bundle.created"]);
  const [environmentFilter, setEnvironmentFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [severityMin, setSeverityMin] = useState<"" | "low" | "medium" | "high" | "critical">("");
  const [selectedBundleTypes, setSelectedBundleTypes] = useState<Array<"failure" | "improvement">>(
    []
  );
  const [verificationScope, setVerificationScope] = useState<
    "all" | "verification_only" | "non_verification_only"
  >("all");
  const [activeTestWebhookId, setActiveTestWebhookId] = useState<string | null>(null);

  useEffect(() => {
    projectGeneration.current += 1;
    resetCreateWebhookForm();
    setCreatedWebhook(null);
    setPendingDelete(null);
    setActiveMutationId(null);
    setActiveTestWebhookId(null);
    setIsSaving(false);
    return () => {
      projectGeneration.current += 1;
    };
  }, [projectId]);

  useEffect(() => {
    let active = true;
    setWebhooks(null);
    setWebhooksError(false);
    setDeliveriesByWebhook({});
    void listProjectWebhooks(projectId, endpointLimit).then(
      (records) => {
        if (active) {
          setDeliveriesLoading(records.length > 0);
          setWebhooks(records);
        }
      },
      () => {
        if (active) setWebhooksError(true);
      }
    );
    return () => {
      active = false;
    };
  }, [projectId, endpointRevision, endpointLimit]);

  useEffect(() => {
    let active = true;
    setDeliveriesError(false);
    setDeliveriesLoading(webhooks !== null && webhooks.length > 0);
    if (webhooks === null || webhooks.length === 0) return;
    // A failed history read must not hide working endpoint configuration or other histories.
    void Promise.allSettled(
      webhooks.map(
        async (webhook) =>
          [
            webhook.webhook_id,
            await listProjectWebhookDeliveries(webhook.webhook_id, projectId, deliveryLimit)
          ] as const
      )
    ).then((results) => {
      if (!active) return;
      const entries = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : []
      );
      setDeliveriesByWebhook(Object.fromEntries(entries));
      setDeliveriesError(results.some((result) => result.status === "rejected"));
      setDeliveriesLoading(false);
    });
    return () => {
      active = false;
    };
  }, [projectId, webhooks, deliveryRevision, deliveryLimit]);

  const resolvedProjectId = projectId;

  const recentDeliveries = (webhooks ?? [])
    .flatMap((webhook) =>
      (deliveriesByWebhook[webhook.webhook_id] ?? []).map((delivery) => ({
        webhook,
        delivery
      }))
    )
    .sort((left, right) => {
      const leftTimestamp = left.delivery.last_attempted_at ?? left.delivery.next_attempt_at ?? "";
      const rightTimestamp =
        right.delivery.last_attempted_at ?? right.delivery.next_attempt_at ?? "";

      return rightTimestamp.localeCompare(leftTimestamp);
    });

  async function handleCreateWebhook(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (isSaving) return;
    const generation = projectGeneration.current;
    setIsSaving(true);
    try {
      const filters = buildWebhookFilters({
        environmentFilter,
        serviceFilter,
        severityMin,
        selectedBundleTypes,
        verificationScope
      });
      // Keep explicit empty arrays and false-valued filters on an unchanged edit.
      const previousFilters = editingWebhook?.filters;
      if (previousFilters?.environment?.length === 0 && environmentFilter === "")
        filters.environment = [];
      if (previousFilters?.service?.length === 0 && serviceFilter === "") filters.service = [];
      if (previousFilters?.bundle_type?.length === 0 && selectedBundleTypes.length === 0)
        filters.bundle_type = [];
      const payload = {
        url: endpointUrl.trim(),
        events: selectedEvents,
        filters,
        is_enabled: enabled
      };
      if (editingWebhook !== null) {
        const updated = await updateProjectWebhook(
          editingWebhook.webhook_id,
          resolvedProjectId,
          payload
        );
        if (generation !== projectGeneration.current) return;
        setWebhooks((current) =>
          (current ?? []).map((record) =>
            record.webhook_id === updated.webhook_id ? updated : record
          )
        );
        resetCreateWebhookForm();
        showSuccessToast("Webhook updated successfully.");
        return;
      }
      const { signing_secret, ...created } = await createProjectWebhook({
        project_id: resolvedProjectId,
        ...payload
      });
      if (generation !== projectGeneration.current) return;
      setCreatedWebhook(signing_secret === undefined ? null : { ...created, signing_secret });
      setWebhooks((current) => [...(current ?? []), created]);
      setDeliveriesByWebhook((current) => ({
        ...current,
        [created.webhook_id]: []
      }));
      resetCreateWebhookForm();
      showSuccessToast("Webhook created successfully.");
    } catch {
      if (generation !== projectGeneration.current) return;
      showErrorToast(
        editingWebhook === null ? "Could not create webhook." : "Could not update webhook."
      );
    } finally {
      if (generation === projectGeneration.current) setIsSaving(false);
    }
  }

  function resetCreateWebhookForm(): void {
    setEditingWebhook(null);
    setEnabled(true);
    setEndpointUrl("");
    setSelectedEvents(["bundle.created"]);
    setEnvironmentFilter("");
    setServiceFilter("");
    setSeverityMin("");
    setSelectedBundleTypes([]);
    setVerificationScope("all");
    setIsCreateOpen(false);
  }

  async function handleSendTest(webhookId: string): Promise<void> {
    if (activeTestWebhookId !== null) return;
    const generation = projectGeneration.current;
    setActiveTestWebhookId(webhookId);

    try {
      const delivery = await testProjectWebhook(webhookId, resolvedProjectId, testEvent);
      if (generation !== projectGeneration.current) return;
      setDeliveriesByWebhook((current) => ({
        ...current,
        [webhookId]: [delivery, ...(current[webhookId] ?? [])].slice(0, deliveryLimit)
      }));
      showSuccessToast("Test webhook sent successfully.");
    } catch {
      if (generation === projectGeneration.current) showErrorToast("Could not send test webhook.");
    } finally {
      if (generation === projectGeneration.current) setActiveTestWebhookId(null);
    }
  }

  function startEdit(webhook: WebhookRecord): void {
    setEditingWebhook(webhook);
    setEndpointUrl(webhook.url);
    setSelectedEvents(webhook.events);
    setEnabled(webhook.is_enabled);
    setEnvironmentFilter((webhook.filters.environment ?? []).join(", "));
    setServiceFilter((webhook.filters.service ?? []).join(", "));
    setSeverityMin(webhook.filters.severity_min ?? "");
    setSelectedBundleTypes(webhook.filters.bundle_type ?? []);
    setVerificationScope(
      webhook.filters.verification === undefined
        ? "all"
        : webhook.filters.verification
          ? "verification_only"
          : "non_verification_only"
    );
    setIsCreateOpen(true);
  }
  async function removeEndpoint(): Promise<void> {
    if (pendingDelete === null || activeMutationId !== null) return;
    const generation = projectGeneration.current;
    setActiveMutationId(pendingDelete.webhook_id);
    try {
      await deleteProjectWebhook(pendingDelete.webhook_id, projectId);
      if (generation !== projectGeneration.current) return;
      setWebhooks((current) =>
        (current ?? []).filter((record) => record.webhook_id !== pendingDelete.webhook_id)
      );
      setPendingDelete(null);
      showSuccessToast("Webhook deleted successfully.");
    } catch {
      if (generation === projectGeneration.current) showErrorToast("Could not delete webhook.");
    } finally {
      if (generation === projectGeneration.current) setActiveMutationId(null);
    }
  }
  async function retryDelivery(webhookId: string, deliveryId: string): Promise<void> {
    if (activeMutationId !== null) return;
    const generation = projectGeneration.current;
    setActiveMutationId(deliveryId);
    try {
      await retryProjectWebhookDelivery(webhookId, deliveryId, projectId);
      if (generation !== projectGeneration.current) return;
      setDeliveryRevision((value) => value + 1);
      showSuccessToast("Webhook delivery queued for retry.");
    } catch {
      if (generation === projectGeneration.current)
        showErrorToast("Could not retry webhook delivery.");
    } finally {
      if (generation === projectGeneration.current) setActiveMutationId(null);
    }
  }
  function toggleEventSelection(eventType: WebhookEventType): void {
    setSelectedEvents((current) =>
      current.includes(eventType)
        ? current.filter((value) => value !== eventType)
        : [...current, eventType]
    );
  }

  function toggleBundleTypeSelection(bundleType: "failure" | "improvement"): void {
    setSelectedBundleTypes((current) =>
      current.includes(bundleType)
        ? current.filter((value) => value !== bundleType)
        : [...current, bundleType]
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div />
        <Dialog
          open={isCreateOpen}
          onOpenChange={(open) => {
            if (!open) resetCreateWebhookForm();
            else setIsCreateOpen(true);
          }}
        >
          <DialogTrigger asChild>
            <Button type="button">
              <PlusIcon data-icon="inline-start" />
              Create webhook
            </Button>
          </DialogTrigger>
          <DialogFormContent
            title={editingWebhook === null ? "Create webhook" : "Edit webhook"}
            size="xl"
            footer={
              <Button
                type="submit"
                disabled={isSaving || selectedEvents.length === 0 || endpointUrl.trim() === ""}
              >
                {isSaving
                  ? "Saving..."
                  : editingWebhook === null
                    ? "Create webhook"
                    : "Save webhook"}
              </Button>
            }
            onSubmit={(event) => void handleCreateWebhook(event)}
          >
            <WebhookRuleFields
              projectId={projectId}
              endpointUrl={endpointUrl}
              selectedEvents={selectedEvents}
              environmentFilter={environmentFilter}
              serviceFilter={serviceFilter}
              severityMin={severityMin}
              selectedBundleTypes={selectedBundleTypes}
              verificationScope={verificationScope}
              setEndpointUrl={setEndpointUrl}
              setEnvironmentFilter={setEnvironmentFilter}
              setServiceFilter={setServiceFilter}
              setSeverityMin={setSeverityMin}
              setVerificationScope={setVerificationScope}
              toggleEventSelection={toggleEventSelection}
              toggleBundleTypeSelection={toggleBundleTypeSelection}
              environmentDefault={project.environment_default}
              enabled={enabled}
              setEnabled={setEnabled}
            />
          </DialogFormContent>
        </Dialog>
      </div>

      {createdWebhook?.signing_secret === undefined ? null : (
        <PlaintextTokenReveal
          value={createdWebhook.signing_secret}
          title="New webhook signing secret"
          regionLabel="New webhook signing secret"
          description="This secret is shown once. Copy it now so the receiving endpoint can verify signatures."
        />
      )}

      <Field>
        <FieldLabel htmlFor="webhook-test-event">Test event</FieldLabel>
        <Select
          value={testEvent}
          onValueChange={(value) => setTestEvent(value as WebhookEventType)}
        >
          <SelectTrigger id="webhook-test-event" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {WebhookEventTypeSchema.options.map((event) => (
                <SelectItem key={event} value={event}>
                  {event}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>Webhook endpoints</CardTitle>
            <CardDescription>
              Outbound endpoints and subscribed events for this project.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BoundedListLimit
              id="webhook-endpoint-limit"
              label="Endpoint limit"
              value={endpointLimit}
              onChange={setEndpointLimit}
            />
            {webhooksError ? (
              <Notice title="Could not load webhook endpoints" tone="destructive">
                <p>Please try loading the endpoints again.</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setEndpointRevision((value) => value + 1)}
                >
                  Retry webhook endpoints
                </Button>
              </Notice>
            ) : webhooks === null ? (
              showWebhooksLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : null
            ) : webhooks.length === 0 ? (
              <ProjectResourceEmptyState
                icon={ActivityIcon}
                title="No webhook endpoints yet"
                description="Create a webhook to send lifecycle, verification, or automation events to another system."
                actionLabel="Create webhook"
                onAction={() => setIsCreateOpen(true)}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Endpoint</TableHead>
                    <TableHead>Events</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {webhooks.map((webhook) => (
                    <TableRow key={webhook.webhook_id}>
                      <TableCell className="font-medium">{webhook.url}</TableCell>
                      <TableCell>{webhook.events.join(", ")}</TableCell>
                      <TableCell>
                        <Badge variant={webhook.is_enabled ? "success" : "secondary"}>
                          {webhook.is_enabled ? "enabled" : "disabled"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {canManage(webhook) ? (
                          <div className="flex justify-end gap-2">
                            <TableActionButton
                              label="Edit webhook"
                              icon={PencilIcon}
                              disabled={activeMutationId === webhook.webhook_id}
                              onClick={() => startEdit(webhook)}
                            />
                            <TableActionButton
                              label="Delete webhook"
                              icon={Trash2Icon}
                              disabled={activeMutationId === webhook.webhook_id}
                              onClick={() => setPendingDelete(webhook)}
                            />
                          </div>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={activeTestWebhookId === webhook.webhook_id}
                          onClick={() => void handleSendTest(webhook.webhook_id)}
                        >
                          <SendIcon data-icon="inline-start" />
                          {activeTestWebhookId === webhook.webhook_id
                            ? "Sending test..."
                            : "Send test webhook"}
                        </Button>
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
            <CardTitle>Delivery status</CardTitle>
            <CardDescription>Recent delivery attempts for this project's webhooks.</CardDescription>
          </CardHeader>
          <CardContent>
            <BoundedListLimit
              id="webhook-delivery-limit"
              label="Delivery limit per endpoint"
              value={deliveryLimit}
              onChange={setDeliveryLimit}
            />
            {deliveriesError ? (
              <Notice title="Could not load webhook deliveries" tone="destructive">
                <p>
                  Some delivery history is unavailable. Your webhook endpoints remain available.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setDeliveryRevision((value) => value + 1)}
                >
                  Retry webhook deliveries
                </Button>
              </Notice>
            ) : null}
            {webhooksError ? (
              <p className="text-sm text-muted-foreground">
                Load webhook endpoints to view delivery history.
              </p>
            ) : webhooks === null || deliveriesLoading ? (
              showDeliveriesLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : null
            ) : recentDeliveries.length === 0 ? (
              deliveriesError ? null : (
                <ProjectResourceEmptyState
                  icon={SendIcon}
                  title="No delivery attempts yet"
                  description="Send a test webhook to create the first delivery record."
                />
              )
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Endpoint</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentDeliveries.map(({ webhook, delivery }) => (
                    <TableRow key={delivery.delivery_id}>
                      <TableCell className="font-medium">{webhook.url}</TableCell>
                      <TableCell>{delivery.event_type}</TableCell>
                      <TableCell>
                        <Badge variant={getDeliveryBadgeVariant(delivery.status)}>
                          {delivery.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{delivery.attempt_count}</TableCell>
                      <TableCell>
                        {canManage(webhook) &&
                        (delivery.status === "failed" || delivery.status === "disabled") ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={!webhook.is_enabled || activeMutationId !== null}
                            onClick={() =>
                              void retryDelivery(webhook.webhook_id, delivery.delivery_id)
                            }
                          >
                            Retry delivery
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <div className="mt-5 rounded-lg border border-border/80 bg-background/60 p-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <ActivityIcon className="size-4" />
                Synthetic webhook tests
              </div>
              <p className="mt-2 leading-6">
                The test action sends a signed <span className="font-mono">{testEvent}</span> event
                through the real delivery pipeline so endpoint verification stays close to
                production behavior.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && activeMutationId === null) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete webhook?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete {pendingDelete?.url}? This removes the endpoint and stops future deliveries.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={activeMutationId !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={activeMutationId !== null}
              onClick={(event) => {
                event.preventDefault();
                void removeEndpoint();
              }}
            >
              Delete endpoint
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function buildWebhookFilters(input: {
  environmentFilter: string;
  serviceFilter: string;
  severityMin: "" | "low" | "medium" | "high" | "critical";
  selectedBundleTypes: Array<"failure" | "improvement">;
  verificationScope: "all" | "verification_only" | "non_verification_only";
}): WebhookRecord["filters"] {
  const filters: WebhookRecord["filters"] = {};
  const environments = parseFilterList(input.environmentFilter);
  const services = parseFilterList(input.serviceFilter);

  if (environments.length > 0) {
    filters.environment = environments;
  }

  if (services.length > 0) {
    filters.service = services;
  }

  if (input.severityMin !== "") {
    filters.severity_min = input.severityMin;
  }

  if (input.selectedBundleTypes.length > 0) {
    filters.bundle_type = input.selectedBundleTypes;
  }

  if (input.verificationScope === "verification_only") {
    filters.verification = true;
  }

  if (input.verificationScope === "non_verification_only") {
    filters.verification = false;
  }

  return filters;
}

function parseFilterList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function getDeliveryBadgeVariant(
  status: WebhookDeliveryRecord["status"]
): "default" | "secondary" | "success" | "warning" | "destructive" {
  if (status === "delivered") {
    return "success";
  }

  if (status === "pending" || status === "retrying") {
    return "warning";
  }

  if (status === "failed" || status === "disabled") {
    return "destructive";
  }

  return "secondary";
}
