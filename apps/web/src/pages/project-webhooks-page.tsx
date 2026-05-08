import { ActivityIcon, PlusIcon, SendIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { DialogFormContent } from "../components/system/dialog-form-content.js";
import { PlaintextTokenReveal } from "../components/system/plaintext-token-reveal.js";
import { ProjectResourceEmptyState } from "../components/system/project-resource-empty-state.js";
import type { ProjectContext } from "../components/system/project-layout.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { Dialog, DialogTrigger } from "../components/ui/dialog.js";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../components/ui/field.js";
import { Input } from "../components/ui/input.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table.js";
import {
  createProjectWebhook,
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

const WEBHOOK_EVENT_GROUPS: Array<{
  title: string;
  description: string;
  events: Array<{ value: WebhookEventType; label: string }>;
}> = [
  {
    title: "Bundle lifecycle",
    description: "Track incident bundle creation, refreshes, reopen events, and resolution changes.",
    events: [
      { value: "bundle.created", label: "bundle.created" },
      { value: "bundle.updated", label: "bundle.updated" },
      { value: "bundle.reopened", label: "bundle.reopened" },
      { value: "bundle.resolved", label: "bundle.resolved" }
    ]
  },
  {
    title: "Verification",
    description: "React to delivery verification checks and downstream health monitoring.",
    events: [
      { value: "verification.passed", label: "verification.passed" },
      { value: "verification.failed", label: "verification.failed" }
    ]
  },
  {
    title: "Automation signals",
    description: "Use high-signal automation events for spike handling and improvement workflows.",
    events: [
      { value: "incident.spike_detected", label: "incident.spike_detected" },
      { value: "improvement_bundle.created", label: "improvement_bundle.created" }
    ]
  }
];

const SEVERITY_FILTER_OPTIONS: Array<{ value: "" | "low" | "medium" | "high" | "critical"; label: string }> = [
  { value: "", label: "Any severity" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" }
];

const BUNDLE_TYPE_FILTER_OPTIONS: Array<{ value: "failure" | "improvement"; label: string }> = [
  { value: "failure", label: "Failure bundles" },
  { value: "improvement", label: "Improvement bundles" }
];

const selectClassName =
  "flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

type DeliveryState = Record<string, WebhookDeliveryRecord[]>;

export function ProjectWebhooksPage(): JSX.Element {
  const { projectId } = useOutletContext<ProjectContext>();
  const [webhooks, setWebhooks] = useState<WebhookRecord[] | null>(null);
  const showWebhooksLoading = useDelayedVisibility(webhooks === null);
  const [deliveriesByWebhook, setDeliveriesByWebhook] = useState<DeliveryState>({});
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createdWebhook, setCreatedWebhook] = useState<CreatedWebhookRecord | null>(null);
  const [endpointUrl, setEndpointUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<WebhookEventType[]>(["bundle.created"]);
  const [environmentFilter, setEnvironmentFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [severityMin, setSeverityMin] = useState<"" | "low" | "medium" | "high" | "critical">("");
  const [selectedBundleTypes, setSelectedBundleTypes] = useState<Array<"failure" | "improvement">>([]);
  const [verificationScope, setVerificationScope] = useState<"all" | "verification_only" | "non_verification_only">("all");
  const [activeTestWebhookId, setActiveTestWebhookId] = useState<string | null>(null);

  useEffect(() => {
    void loadWebhooks(projectId, setWebhooks, setDeliveriesByWebhook);
  }, [projectId]);

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
      const rightTimestamp = right.delivery.last_attempted_at ?? right.delivery.next_attempt_at ?? "";

      return rightTimestamp.localeCompare(leftTimestamp);
    });

  async function handleCreateWebhook(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    try {
      const created = await createProjectWebhook({
        project_id: resolvedProjectId,
        url: endpointUrl.trim(),
        events: selectedEvents,
        filters: buildWebhookFilters({
          environmentFilter,
          serviceFilter,
          severityMin,
          selectedBundleTypes,
          verificationScope
        }),
        is_enabled: true
      });

      setCreatedWebhook(created);
      setWebhooks((current) => [...(current ?? []), { ...created, signing_secret: undefined }]);
      setDeliveriesByWebhook((current) => ({
        ...current,
        [created.webhook_id]: []
      }));
      resetCreateWebhookForm();
      showSuccessToast("Webhook created successfully.");
    } catch {
      showErrorToast("Could not create webhook.");
    }
  }

  function resetCreateWebhookForm(): void {
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
    setActiveTestWebhookId(webhookId);

    try {
      const delivery = await testProjectWebhook(webhookId);
      setDeliveriesByWebhook((current) => ({
        ...current,
        [webhookId]: [delivery, ...(current[webhookId] ?? [])].slice(0, 5)
      }));
      showSuccessToast("Test webhook sent successfully.");
    } catch {
      showErrorToast("Could not send test webhook.");
    } finally {
      setActiveTestWebhookId(null);
    }
  }

  function toggleEventSelection(eventType: WebhookEventType): void {
    setSelectedEvents((current) =>
      current.includes(eventType) ? current.filter((value) => value !== eventType) : [...current, eventType]
    );
  }

  function toggleBundleTypeSelection(bundleType: "failure" | "improvement"): void {
    setSelectedBundleTypes((current) =>
      current.includes(bundleType) ? current.filter((value) => value !== bundleType) : [...current, bundleType]
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div />
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button type="button">
              <PlusIcon data-icon="inline-start" />
              Create webhook
            </Button>
          </DialogTrigger>
            <DialogFormContent
              title="Create webhook"
              size="xl"
              footer={
                <Button type="submit" disabled={selectedEvents.length === 0 || endpointUrl.trim() === ""}>
                  Create webhook
                </Button>
              }
              onSubmit={(event) => void handleCreateWebhook(event)}
            >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="webhook-endpoint-url">Endpoint URL</FieldLabel>
                    <FieldDescription>DebugBundle signs every outgoing payload. Point this at the automation endpoint that should receive lifecycle events.</FieldDescription>
                    <Input
                      id="webhook-endpoint-url"
                      type="url"
                      value={endpointUrl}
                      onChange={(event) => setEndpointUrl(event.currentTarget.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Subscribed events</FieldLabel>
                    <FieldDescription>Choose the event families this endpoint should receive. Filters below narrow delivery further without changing the subscription list.</FieldDescription>
                    <div className="space-y-4 pt-1">
                      {WEBHOOK_EVENT_GROUPS.map((group) => (
                        <fieldset key={group.title} className="space-y-2">
                          <legend className="text-sm font-medium text-foreground">{group.title}</legend>
                          <p className="text-sm text-muted-foreground">{group.description}</p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {group.events.map((eventOption) => (
                              <label
                                key={eventOption.value}
                                className="grid grid-cols-[auto_1fr] items-center gap-3 rounded-md border border-border bg-background/70 px-3 py-2 text-sm"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedEvents.includes(eventOption.value)}
                                  onChange={() => toggleEventSelection(eventOption.value)}
                                />
                                <span className="min-w-0 break-all font-mono text-[11px] uppercase leading-5 tracking-[0.12em] sm:text-xs">
                                  {eventOption.label}
                                </span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      ))}
                    </div>
                  </Field>
                  <Field>
                    <FieldLabel>Optional filters</FieldLabel>
                    <FieldDescription>Leave filters empty to deliver every selected event. These match the environment and service metadata coming from the app that sends events into DebugBundle, not DebugBundle's own internal services.</FieldDescription>
                    <div className="grid gap-4 pt-1 md:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="webhook-filter-environment">Environments</FieldLabel>
                        <FieldDescription>Comma-separated app environment names, for example <span className="font-mono">production, staging</span>.</FieldDescription>
                        <Input
                          id="webhook-filter-environment"
                          value={environmentFilter}
                          onChange={(event) => setEnvironmentFilter(event.currentTarget.value)}
                          placeholder="production, staging"
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="webhook-filter-service">Services</FieldLabel>
                        <FieldDescription>Comma-separated app service names, for example <span className="font-mono">checkout-api, worker</span>.</FieldDescription>
                        <Input
                          id="webhook-filter-service"
                          value={serviceFilter}
                          onChange={(event) => setServiceFilter(event.currentTarget.value)}
                          placeholder="checkout-api, worker"
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="webhook-filter-severity">Minimum severity</FieldLabel>
                        <select
                          id="webhook-filter-severity"
                          className={selectClassName}
                          value={severityMin}
                          onChange={(event) => setSeverityMin(event.currentTarget.value as typeof severityMin)}
                        >
                          {SEVERITY_FILTER_OPTIONS.map((option) => (
                            <option key={option.value || "any"} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="webhook-filter-verification">Verification scope</FieldLabel>
                        <select
                          id="webhook-filter-verification"
                          className={selectClassName}
                          value={verificationScope}
                          onChange={(event) => setVerificationScope(event.currentTarget.value as typeof verificationScope)}
                        >
                          <option value="all">All matching events</option>
                          <option value="verification_only">Verification events only</option>
                          <option value="non_verification_only">Non-verification events only</option>
                        </select>
                      </Field>
                      <Field className="md:col-span-2">
                        <FieldLabel>Bundle type</FieldLabel>
                        <FieldDescription>Restrict delivery to failure bundles, improvement bundles, or both.</FieldDescription>
                        <div className="grid gap-2 pt-1 sm:grid-cols-2">
                          {BUNDLE_TYPE_FILTER_OPTIONS.map((bundleTypeOption) => (
                            <label
                              key={bundleTypeOption.value}
                              className="flex items-center gap-3 rounded-md border border-border bg-background/70 px-3 py-2 text-sm"
                            >
                              <input
                                type="checkbox"
                                checked={selectedBundleTypes.includes(bundleTypeOption.value)}
                                onChange={() => toggleBundleTypeSelection(bundleTypeOption.value)}
                              />
                              <span>{bundleTypeOption.label}</span>
                            </label>
                          ))}
                        </div>
                      </Field>
                    </div>
                  </Field>
                </FieldGroup>
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

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>Webhook endpoints</CardTitle>
            <CardDescription>Outbound endpoints and subscribed events for this project.</CardDescription>
          </CardHeader>
          <CardContent>
            {webhooks === null ? (
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
                        <Badge variant={webhook.is_enabled ? "success" : "secondary"}>{webhook.is_enabled ? "enabled" : "disabled"}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={activeTestWebhookId === webhook.webhook_id}
                          onClick={() => void handleSendTest(webhook.webhook_id)}
                        >
                          <SendIcon data-icon="inline-start" />
                          {activeTestWebhookId === webhook.webhook_id ? "Sending test..." : "Send test webhook"}
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
            {webhooks === null ? (
              showWebhooksLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : null
            ) : recentDeliveries.length === 0 ? (
              <ProjectResourceEmptyState
                icon={SendIcon}
                title="No delivery attempts yet"
                description="Send a test webhook to create the first delivery record."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Endpoint</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Attempts</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentDeliveries.map(({ webhook, delivery }) => (
                    <TableRow key={delivery.delivery_id}>
                      <TableCell className="font-medium">{webhook.url}</TableCell>
                      <TableCell>{delivery.event_type}</TableCell>
                      <TableCell>
                        <Badge variant={getDeliveryBadgeVariant(delivery.status)}>{delivery.status}</Badge>
                      </TableCell>
                      <TableCell>{delivery.attempt_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <div className="mt-5 rounded-lg border border-border/80 bg-background/60 p-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <ActivityIcon className="size-4" />
                Synthetic verification tests
              </div>
              <p className="mt-2 leading-6">
                The test action sends a signed <span className="font-mono">verification.passed</span> event through the real delivery pipeline so endpoint verification stays close to production behavior.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

async function loadWebhooks(
  projectId: string,
  setWebhooks: React.Dispatch<React.SetStateAction<WebhookRecord[] | null>>,
  setDeliveriesByWebhook: React.Dispatch<React.SetStateAction<DeliveryState>>
): Promise<void> {
  const nextWebhooks = await listProjectWebhooks(projectId);
  setWebhooks(nextWebhooks);

  if (nextWebhooks.length === 0) {
    setDeliveriesByWebhook({});
    return;
  }

  const deliveryEntries = await Promise.all(
    nextWebhooks.map(async (webhook) => {
      const deliveries = await listProjectWebhookDeliveries(webhook.webhook_id);
      return [webhook.webhook_id, deliveries] as const;
    })
  );

  setDeliveriesByWebhook(Object.fromEntries(deliveryEntries));
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