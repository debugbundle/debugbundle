import { PlusIcon, RadarIcon } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";

import { DialogFormContent } from "../components/system/dialog-form-content.js";
import { CalloutCard } from "../components/system/callout-card.js";
import { PlaintextTokenReveal } from "../components/system/plaintext-token-reveal.js";
import { PlanUpgradeCallout } from "../components/system/plan-upgrade-callout.js";
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../components/ui/field.js";
import { Input } from "../components/ui/input.js";
import { Notice } from "../components/ui/notice.js";
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
  createProjectProbeActivation,
  deactivateProjectProbeActivation,
  isInvalidSessionError,
  listProjectProbeActivations,
  type CreatedProbeActivation,
  type ProbeActivationRecord
} from "../lib/api.js";
import { showErrorToast, showSuccessToast } from "../lib/notify.js";
import { useDelayedVisibility } from "../lib/use-delayed-visibility.js";

const DEFAULT_PASSIVE_TTL_SECONDS = "300";
const DEFAULT_TRIGGER_TTL_SECONDS = "86400";

export function ProjectProbesPage(): JSX.Element {
  const { project } = useOutletContext<ProjectContext>();
  const [activations, setActivations] = useState<ProbeActivationRecord[] | null>(null);
  const showActivationsLoading = useDelayedVisibility(activations === null);
  const [isActivateOpen, setIsActivateOpen] = useState(false);
  const [labelPattern, setLabelPattern] = useState("");
  const [service, setService] = useState("*");
  const [environment, setEnvironment] = useState(project.environment_default);
  const [ttlSeconds, setTtlSeconds] = useState(DEFAULT_PASSIVE_TTL_SECONDS);
  const [triggerTtlSeconds, setTriggerTtlSeconds] = useState(DEFAULT_TRIGGER_TTL_SECONDS);
  const [createdActivation, setCreatedActivation] = useState<CreatedProbeActivation | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);

  const remoteProbesEnabled = project.organization_plan !== "free";
  const hasPreservedActivations = (activations?.length ?? 0) > 0;
  const canSubmitActivation =
    labelPattern.trim() !== "" &&
    service.trim() !== "" &&
    environment.trim() !== "" &&
    isSecondsWithinRange(ttlSeconds, 60, 3600) &&
    isSecondsWithinRange(triggerTtlSeconds, 60, 86400);

  useEffect(() => {
    void loadActivations(project.project_id, setActivations, setLoadErrorMessage);
  }, [project.project_id]);

  async function handleActivateProbe(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!canSubmitActivation) {
      showErrorToast(
        "Enter a label pattern, scope, and valid TTL values before activating probes."
      );
      return;
    }

    try {
      const created = await createProjectProbeActivation(project.project_id, {
        label_pattern: labelPattern.trim(),
        service: service.trim(),
        environment: environment.trim(),
        ttl_seconds: Number.parseInt(ttlSeconds, 10),
        trigger_ttl_seconds: Number.parseInt(triggerTtlSeconds, 10)
      });

      setCreatedActivation(created);
      setActivations((current) => [created.activation, ...(current ?? [])]);
      resetActivationForm();
      showSuccessToast("Probe activated successfully.");
    } catch (error) {
      showErrorToast(getActivationErrorMessage(error));
    }
  }

  async function handleDeactivateProbe(activationId: string): Promise<void> {
    setDeactivatingId(activationId);

    try {
      await deactivateProjectProbeActivation(project.project_id, activationId);
      setActivations((current) =>
        (current ?? []).filter((activation) => activation.activation_id !== activationId)
      );
      showSuccessToast("Probe deactivated successfully.");
    } catch {
      showErrorToast("Could not deactivate the probe.");
    } finally {
      setDeactivatingId(null);
    }
  }

  function resetActivationForm(): void {
    setLabelPattern("");
    setService("*");
    setEnvironment(project.environment_default);
    setTtlSeconds(DEFAULT_PASSIVE_TTL_SECONDS);
    setTriggerTtlSeconds(DEFAULT_TRIGGER_TTL_SECONDS);
    setIsActivateOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div />
        {remoteProbesEnabled ? (
          <Dialog open={isActivateOpen} onOpenChange={setIsActivateOpen}>
            <DialogTrigger asChild>
              <Button type="button">
                <PlusIcon data-icon="inline-start" />
                Activate probe
              </Button>
            </DialogTrigger>
            <DialogFormContent
              title="Activate remote probe"
              description="Activate matching SDK probe labels for independent shipping. Always-on probe buffers continue working separately."
              footer={
                <Button type="submit" disabled={!canSubmitActivation}>
                  Activate probe
                </Button>
              }
              onSubmit={(formEvent) => void handleActivateProbe(formEvent)}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="probe-label-pattern">Label pattern</FieldLabel>
                  <FieldDescription>
                    Use an exact label, a prefix wildcard such as{" "}
                    <span className="font-mono">checkout.*</span>, or{" "}
                    <span className="font-mono">*</span> for every probe label.
                  </FieldDescription>
                  <Input
                    id="probe-label-pattern"
                    value={labelPattern}
                    onChange={(event) => setLabelPattern(event.currentTarget.value)}
                    placeholder="checkout.*"
                  />
                </Field>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="probe-service">Service</FieldLabel>
                    <FieldDescription>
                      Use * to match every service in this project.
                    </FieldDescription>
                    <Input
                      id="probe-service"
                      value={service}
                      onChange={(event) => setService(event.currentTarget.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="probe-environment">Environment</FieldLabel>
                    <FieldDescription>Use * to match every environment.</FieldDescription>
                    <Input
                      id="probe-environment"
                      value={environment}
                      onChange={(event) => setEnvironment(event.currentTarget.value)}
                    />
                  </Field>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="probe-ttl-seconds">
                      Passive activation TTL seconds
                    </FieldLabel>
                    <FieldDescription>
                      How long SDK config polling and ingestion responses advertise this activation.
                      Range: 60 to 3600.
                    </FieldDescription>
                    <Input
                      id="probe-ttl-seconds"
                      type="number"
                      min={60}
                      max={3600}
                      value={ttlSeconds}
                      onChange={(event) => setTtlSeconds(event.currentTarget.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="probe-trigger-ttl-seconds">
                      Trigger token TTL seconds
                    </FieldLabel>
                    <FieldDescription>
                      How long the one-time trigger token can be attached to a request or browser
                      URL. Range: 60 to 86400.
                    </FieldDescription>
                    <Input
                      id="probe-trigger-ttl-seconds"
                      type="number"
                      min={60}
                      max={86400}
                      value={triggerTtlSeconds}
                      onChange={(event) => setTriggerTtlSeconds(event.currentTarget.value)}
                    />
                  </Field>
                </div>
              </FieldGroup>
            </DialogFormContent>
          </Dialog>
        ) : null}
      </div>

      {createdActivation === null ? null : (
        <PlaintextTokenReveal
          value={createdActivation.trigger_token}
          title="Probe trigger token"
          description="This trigger token is shown once. Attach it as _debug_probe on a browser URL or as X-DebugBundle-Probe-Trigger on a backend request to activate matching probes for that request."
          regionLabel="Probe trigger token"
          copyLabel="Copy trigger token"
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Remote probes</CardTitle>
          <CardDescription>
            Activate, inspect, and stop probe directives for this project.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!remoteProbesEnabled && hasPreservedActivations ? (
            <div className="mb-4">
              <CalloutCard
                eyebrow="Remote probes paused"
                title="Saved remote probes will resume after an upgrade"
                description="This project is currently on Free, so standalone remote probe shipping is paused. The saved activations below are preserved and will start working again after the owner upgrades back to Solo or Team."
                tone="warning"
              />
            </div>
          ) : null}
          {!remoteProbesEnabled && activations !== null && activations.length === 0 ? (
            <PlanUpgradeCallout
              title="Upgrade to Solo or Team to activate remote probes"
              description="Always-on probe buffers work on every tier, but remote probe activation and trigger tokens are paid-tier features. Upgrade before activating probes from the web app, API, CLI, or MCP."
            />
          ) : loadErrorMessage !== null ? (
            <Notice tone="warning" title="Remote probes could not be loaded">
              {loadErrorMessage}
            </Notice>
          ) : activations === null ? (
            showActivationsLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : null
          ) : activations.length === 0 ? (
            <ProjectResourceEmptyState
              icon={RadarIcon}
              title="No active remote probes"
              description="Activate a label pattern when you need matching SDK probe calls to ship independently before the next error."
              actionLabel="Activate probe"
              onAction={() => setIsActivateOpen(true)}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label pattern</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Trigger valid until</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activations.map((activation) => (
                    <TableRow key={activation.activation_id}>
                      <TableCell className="font-mono text-xs">
                        {activation.label_pattern}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">
                            {formatScopeLabel("service", activation.service)}
                          </Badge>
                          <Badge variant="outline">
                            {formatScopeLabel("env", activation.environment)}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>{formatDateTime(activation.expires_at)}</TableCell>
                      <TableCell>{formatDateTime(activation.trigger_expires_at)}</TableCell>
                      <TableCell className="text-right">
                        {remoteProbesEnabled ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={deactivatingId === activation.activation_id}
                            onClick={() => void handleDeactivateProbe(activation.activation_id)}
                          >
                            {deactivatingId === activation.activation_id
                              ? "Deactivating..."
                              : "Deactivate"}
                          </Button>
                        ) : (
                          <Badge variant="outline">Upgrade required</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

async function loadActivations(
  projectId: string,
  setActivations: (activations: ProbeActivationRecord[] | null) => void,
  setLoadErrorMessage: (message: string | null) => void
): Promise<void> {
  try {
    setLoadErrorMessage(null);
    setActivations(null);
    const nextActivations = await listProjectProbeActivations(projectId);
    setActivations(nextActivations);
  } catch (error) {
    if (isInvalidSessionError(error)) {
      return;
    }

    setLoadErrorMessage(
      error instanceof Error && error.message === "upgrade_required"
        ? "Remote probe activation requires a Solo or Team plan."
        : "Refresh this page after the API connection is restored."
    );
    setActivations([]);
  }
}

function getActivationErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Could not activate the probe.";
  }

  switch (error.message) {
    case "upgrade_required":
      return "Upgrade to Solo or Team before activating remote probes.";
    case "monthly_quota_exceeded":
      return "The monthly remote activation allowance is exhausted.";
    case "concurrent_activation_limit":
      return "This project already has the maximum number of active remote probes.";
    case "invalid_payload":
      return "Check the label pattern, scope, and TTL values before trying again.";
    default:
      return "Could not activate the probe.";
  }
}

function isSecondsWithinRange(value: string, min: number, max: number): boolean {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max;
}

function formatScopeLabel(label: string, value: string): string {
  return `${label}: ${value === "*" ? "all" : value}`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}
