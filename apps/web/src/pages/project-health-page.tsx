import { ActivityIcon, PencilIcon, PlusIcon, RotateCcwIcon, ShieldAlertIcon, Trash2Icon } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";

import { DialogFormContent } from "../components/system/dialog-form-content.js";
import { PlanUpgradeCallout } from "../components/system/plan-upgrade-callout.js";
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
import { Notice } from "../components/ui/notice.js";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Switch } from "../components/ui/switch.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table.js";
import {
  createProjectAvailabilityCheck,
  deleteProjectAvailabilityCheck,
  isInvalidSessionError,
  testProjectAvailabilityCheck,
  updateProjectAvailabilityCheck,
  type AvailabilityCheckDailyRollupRecord,
  type AvailabilityCheckLimits,
  type AvailabilityCheckRecord,
  type AvailabilityCheckResultRecord,
  type AvailabilityCheckTestResult
} from "../lib/api.js";
import { showErrorToast, showSuccessToast } from "../lib/notify.js";
import { getProjectEffectiveRole } from "../lib/project-access.js";
import { CUSTOM_PROJECT_ENVIRONMENT_VALUE, PROJECT_ENVIRONMENT_OPTIONS } from "../lib/project-form.js";
import { useDelayedVisibility } from "../lib/use-delayed-visibility.js";
import {
  availabilityResultVariant,
  availabilityStatusVariant,
  buildCheckDraft,
  dailyStateClassName,
  dailyStateVariant,
  formatDailyStateLabel,
  formatAvailabilityStatus,
  formatDateTime,
  formatDay,
  formatDowntime,
  formatPausedReason,
  getDefaultAvailabilityCheckIntervalSeconds,
  getHealthChecksAutoRefreshIntervalMs,
  hasPendingInitialHealthCheckResult,
  getAvailabilityErrorMessage,
  loadProjectAvailabilityCheckHistory,
  loadProjectAvailabilityChecks,
  PENDING_HEALTH_CHECK_REFRESH_INTERVAL_MS,
  refreshProjectAvailabilityChecks,
  type AvailabilityCheckFormState
} from "./project-health-page-utils.js";

const METHOD_OPTIONS: Array<{ value: "GET" | "HEAD"; label: string }> = [
  { value: "GET", label: "GET" },
  { value: "HEAD", label: "HEAD" }
];

const DEFAULT_FORM_STATE: AvailabilityCheckFormState = {
  name: "",
  url: "",
  method: "GET",
  expected_status_min: "200",
  expected_status_max: "399",
  timeout_ms: "5000",
  interval_seconds: String(getDefaultAvailabilityCheckIntervalSeconds(null)),
  failure_threshold: "3",
  recovery_threshold: "2",
  environment: "",
  service_name: "",
  enabled: true
};

type FormMode = "create" | "edit";

export function ProjectHealthPage(): JSX.Element {
  const { project, projectId } = useOutletContext<ProjectContext>();
  const [checks, setChecks] = useState<AvailabilityCheckRecord[] | null>(null);
  const [limits, setLimits] = useState<AvailabilityCheckLimits | null>(null);
  const [selectedCheckId, setSelectedCheckId] = useState<string | null>(null);
  const [results, setResults] = useState<AvailabilityCheckResultRecord[] | null>(null);
  const [rollups, setRollups] = useState<AvailabilityCheckDailyRollupRecord[] | null>(null);
  const showChecksLoading = useDelayedVisibility(checks === null);
  const showResultsLoading = useDelayedVisibility(results === null);
  const showRollupsLoading = useDelayedVisibility(rollups === null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("create");
  const [editingCheckId, setEditingCheckId] = useState<string | null>(null);
  const [customEnvironment, setCustomEnvironment] = useState("");
  const [formState, setFormState] = useState<AvailabilityCheckFormState>({
    ...DEFAULT_FORM_STATE,
    environment: project.environment_default
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<AvailabilityCheckTestResult | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [deletingCheckId, setDeletingCheckId] = useState<string | null>(null);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);

  const effectiveRole = getProjectEffectiveRole(project);
  const canManageChecks = effectiveRole === "owner" || effectiveRole === "admin";
  const selectedCheck = useMemo(
    () => (checks ?? []).find((check) => check.check_id === selectedCheckId) ?? null,
    [checks, selectedCheckId]
  );
  const hasPausedChecks = (checks ?? []).some((check) => check.status === "paused");
  const createDisabled =
    !canManageChecks ||
    limits === null ||
    (checks !== null && checks.length >= limits.max_checks_per_project);
  const defaultIntervalSeconds = getDefaultAvailabilityCheckIntervalSeconds(limits);
  const autoRefreshIntervalMs = getHealthChecksAutoRefreshIntervalMs(checks);
  const refreshIntervalMs = hasPendingInitialHealthCheckResult(checks)
    ? PENDING_HEALTH_CHECK_REFRESH_INTERVAL_MS
    : autoRefreshIntervalMs;
  const selectedEnvironmentOption = PROJECT_ENVIRONMENT_OPTIONS.some((option) => option.value === formState.environment)
    ? formState.environment
    : CUSTOM_PROJECT_ENVIRONMENT_VALUE;
  const testResultNotice =
    testMessage === null ? null : (
      <Notice tone={testResult?.result.status === "success" ? "success" : "warning"} title={testResult === null ? "Test failed" : "Latest test result"}>
        <div className="space-y-1">
          <p>{testMessage}</p>
          {testResult === null ? null : (
            <p className="font-mono text-xs">
              {testResult.result.status} • {testResult.result.http_status ?? "no-status"} • {testResult.result.duration_ms}ms
            </p>
          )}
        </div>
      </Notice>
    );

  useEffect(() => {
    void loadProjectAvailabilityChecks({ projectId, setChecks, setLimits, setLoadErrorMessage });
  }, [projectId]);

  useEffect(() => {
    if (checks === null) {
      return;
    }

    if (checks.length === 0) {
      setSelectedCheckId(null);
      return;
    }

    if (selectedCheckId === null || !checks.some((check) => check.check_id === selectedCheckId)) {
      setSelectedCheckId(checks[0]!.check_id);
    }
  }, [checks, selectedCheckId]);

  useEffect(() => {
    if (selectedCheckId === null) {
      setResults([]);
      setRollups([]);
      return;
    }

    setResults(null);
    setRollups(null);
    void loadProjectAvailabilityCheckHistory({ projectId, selectedCheckId, setResults, setRollups });
  }, [projectId, selectedCheckId]);

  useEffect(() => {
    if (refreshIntervalMs === null) {
      return;
    }

    let disposed = false;
    let timeoutId: number | null = null;

    const clearScheduledRefresh = (): void => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const scheduleNextRefresh = (): void => {
      clearScheduledRefresh();

      if (disposed || document.visibilityState !== "visible") {
        return;
      }

      timeoutId = window.setTimeout(() => {
        void runRefresh();
      }, refreshIntervalMs);
    };

    const runRefresh = async (): Promise<void> => {
      clearScheduledRefresh();

      try {
        const refreshState = await refreshProjectAvailabilityChecks({
          projectId,
          setChecks,
          setLimits,
          setLoadErrorMessage,
          preferredCheckId: selectedCheckId,
          setSelectedCheckId
        });

        if (refreshState.selectedCheckId !== null) {
          await loadProjectAvailabilityCheckHistory({
            projectId,
            selectedCheckId: refreshState.selectedCheckId,
            setResults,
            setRollups
          });
        }
      } catch (error) {
        if (!isInvalidSessionError(error)) {
          setLoadErrorMessage(getAvailabilityErrorMessage(error));
        }
      } finally {
        scheduleNextRefresh();
      }
    };

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === "visible") {
        void runRefresh();
        return;
      }

      clearScheduledRefresh();
    };

    scheduleNextRefresh();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      clearScheduledRefresh();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [projectId, refreshIntervalMs, selectedCheckId]);

  function resetForm(mode: FormMode, check?: AvailabilityCheckRecord): void {
    setFormMode(mode);
    setEditingCheckId(check?.check_id ?? null);
    setTestResult(null);
    setTestMessage(null);

    if (check === undefined) {
      const defaultEnvironment = project.environment_default;
      setCustomEnvironment(
        PROJECT_ENVIRONMENT_OPTIONS.some((option) => option.value === defaultEnvironment)
          ? ""
          : defaultEnvironment
      );
      setFormState({
        ...DEFAULT_FORM_STATE,
        interval_seconds: String(defaultIntervalSeconds),
        environment: defaultEnvironment
      });
      return;
    }

    setCustomEnvironment(
      PROJECT_ENVIRONMENT_OPTIONS.some((option) => option.value === check.environment)
        ? ""
        : check.environment
    );
    setFormState({
      name: check.name,
      url: check.url,
      method: check.method,
      expected_status_min: String(check.expected_status_min),
      expected_status_max: String(check.expected_status_max),
      timeout_ms: String(check.timeout_ms),
      interval_seconds: String(check.interval_seconds),
      failure_threshold: String(check.failure_threshold),
      recovery_threshold: String(check.recovery_threshold),
      environment: check.environment,
      service_name: check.service_name ?? "",
      enabled: check.enabled
    });
  }

  function handleEnvironmentChange(value: string): void {
    if (value === CUSTOM_PROJECT_ENVIRONMENT_VALUE) {
      setFormState((current) => ({ ...current, environment: customEnvironment }));
      return;
    }

    setFormState((current) => ({ ...current, environment: value }));
  }

  function handleCustomEnvironmentChange(value: string): void {
    setCustomEnvironment(value);
    setFormState((current) => ({ ...current, environment: value }));
  }

  function openCreateDialog(): void {
    resetForm("create");
    setIsFormOpen(true);
  }

  function openEditDialog(check: AvailabilityCheckRecord): void {
    resetForm("edit", check);
    setIsFormOpen(true);
  }

  function closeDialog(nextOpen: boolean): void {
    setIsFormOpen(nextOpen);
    if (!nextOpen) {
      setEditingCheckId(null);
      setTestResult(null);
      setTestMessage(null);
    }
  }

  async function handleSaveCheck(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const draft = buildCheckDraft(formState);
    if (draft === null) {
      showErrorToast("Complete the health check fields with valid numeric values before saving.");
      return;
    }

    setIsSubmitting(true);

    try {
      const saved =
        formMode === "create"
          ? await createProjectAvailabilityCheck(projectId, draft)
          : await updateProjectAvailabilityCheck(projectId, editingCheckId!, draft);

      await refreshProjectAvailabilityChecks({
        projectId,
        setChecks,
        setLimits,
        setLoadErrorMessage,
        preferredCheckId: saved.check_id,
        setSelectedCheckId
      });
      setIsFormOpen(false);
      showSuccessToast(
        formMode === "create" ? "Health check created successfully." : "Health check updated successfully."
      );
    } catch (error) {
      showErrorToast(getAvailabilityErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRunTest(): Promise<void> {
    const draft = buildCheckDraft(formState);
    if (draft === null) {
      showErrorToast("Complete the URL, status range, and timeout values before testing the endpoint.");
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    setTestMessage(null);

    try {
      const tested = await testProjectAvailabilityCheck(projectId, {
        url: draft.url,
        method: draft.method,
        expected_status_min: draft.expected_status_min,
        expected_status_max: draft.expected_status_max,
        timeout_ms: draft.timeout_ms
      });
      setTestResult(tested);
      setTestMessage(
        tested.result.status === "success"
          ? "The endpoint responded within the expected status range."
          : "The endpoint responded, but the result did not match the expected healthy state."
      );
    } catch (error) {
      setTestResult(null);
      setTestMessage(getAvailabilityErrorMessage(error));
    } finally {
      setIsTesting(false);
    }
  }

  async function handleDeleteCheck(checkId: string): Promise<void> {
    setDeletingCheckId(checkId);

    try {
      await deleteProjectAvailabilityCheck(projectId, checkId);
      await refreshProjectAvailabilityChecks({
        projectId,
        setChecks,
        setLimits,
        setLoadErrorMessage,
        preferredCheckId: null,
        setSelectedCheckId
      });
      showSuccessToast("Health check deleted successfully.");
    } catch (error) {
      showErrorToast(getAvailabilityErrorMessage(error));
    } finally {
      setDeletingCheckId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div />
        {canManageChecks ? (
          <Dialog open={isFormOpen} onOpenChange={closeDialog}>
            <DialogTrigger asChild>
              <Button type="button" onClick={openCreateDialog} disabled={createDisabled}>
                <PlusIcon data-icon="inline-start" />
                Create health check
              </Button>
            </DialogTrigger>
            <DialogFormContent
              title={formMode === "create" ? "Create health check" : "Edit health check"}
              description="Health checks poll a project-owned URL. When the failure threshold is crossed, DebugBundle opens a standard incident and reuses the same bundle and alert pipeline."
              size="lg"
              footer={
                <div className="flex w-full flex-col gap-3">
                  {testResultNotice}
                  <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <Button type="button" variant="outline" onClick={() => void handleRunTest()} disabled={isTesting || isSubmitting}>
                      <ActivityIcon data-icon="inline-start" />
                      {isTesting ? "Testing..." : "Test endpoint"}
                    </Button>
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting
                        ? formMode === "create"
                          ? "Creating..."
                          : "Saving..."
                        : formMode === "create"
                          ? "Create check"
                          : "Save changes"}
                    </Button>
                  </div>
                </div>
              }
              onSubmit={(submitEvent) => void handleSaveCheck(submitEvent)}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="health-check-name">Name</FieldLabel>
                  <FieldDescription>Use a short label that describes what this endpoint proves, such as API root or checkout health.</FieldDescription>
                  <Input
                    id="health-check-name"
                    value={formState.name}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setFormState((current) => ({ ...current, name: value }));
                    }}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="health-check-url">Check URL</FieldLabel>
                  <FieldDescription>Public HTTP or HTTPS endpoint that should respond from outside your network.</FieldDescription>
                  <Input
                    id="health-check-url"
                    type="url"
                    placeholder="https://app.example.com/health"
                    value={formState.url}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setFormState((current) => ({ ...current, url: value }));
                    }}
                  />
                </Field>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="health-check-method">Method</FieldLabel>
                    <Select value={formState.method} onValueChange={(value) => setFormState((current) => ({ ...current, method: value as "GET" | "HEAD" }))}>
                      <SelectTrigger id="health-check-method">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {METHOD_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="health-check-timeout">Timeout (ms)</FieldLabel>
                    <Input
                      id="health-check-timeout"
                      type="number"
                      min={500}
                      max={5000}
                      value={formState.timeout_ms}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setFormState((current) => ({ ...current, timeout_ms: value }));
                      }}
                    />
                  </Field>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="health-check-status-min">Expected status minimum</FieldLabel>
                    <Input
                      id="health-check-status-min"
                      type="number"
                      min={100}
                      max={599}
                      value={formState.expected_status_min}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setFormState((current) => ({ ...current, expected_status_min: value }));
                      }}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="health-check-status-max">Expected status maximum</FieldLabel>
                    <Input
                      id="health-check-status-max"
                      type="number"
                      min={100}
                      max={599}
                      value={formState.expected_status_max}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setFormState((current) => ({ ...current, expected_status_max: value }));
                      }}
                    />
                  </Field>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <Field>
                    <FieldLabel htmlFor="health-check-interval">Interval (seconds)</FieldLabel>
                    <Input
                      id="health-check-interval"
                      type="number"
                      min={limits?.min_interval_seconds ?? 30}
                      max={86400}
                      value={formState.interval_seconds}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setFormState((current) => ({ ...current, interval_seconds: value }));
                      }}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="health-check-failures">Failure threshold</FieldLabel>
                    <Input
                      id="health-check-failures"
                      type="number"
                      min={1}
                      max={10}
                      value={formState.failure_threshold}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setFormState((current) => ({ ...current, failure_threshold: value }));
                      }}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="health-check-recovery">Recovery threshold</FieldLabel>
                    <Input
                      id="health-check-recovery"
                      type="number"
                      min={1}
                      max={10}
                      value={formState.recovery_threshold}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setFormState((current) => ({ ...current, recovery_threshold: value }));
                      }}
                    />
                  </Field>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="health-check-environment">Environment label</FieldLabel>
                    <FieldDescription>Defaults to the project environment so incidents line up with the rest of the project.</FieldDescription>
                    <Select value={selectedEnvironmentOption} onValueChange={handleEnvironmentChange}>
                      <SelectTrigger id="health-check-environment" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        <SelectGroup>
                          {PROJECT_ENVIRONMENT_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {selectedEnvironmentOption !== CUSTOM_PROJECT_ENVIRONMENT_VALUE ? null : (
                      <Input
                        id="health-check-environment-custom"
                        aria-label="Custom environment"
                        value={customEnvironment}
                        onChange={(event) => handleCustomEnvironmentChange(event.currentTarget.value)}
                        placeholder="preview"
                        required
                      />
                    )}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="health-check-service">Service label</FieldLabel>
                    <FieldDescription>Optional service name to group uptime incidents with the same service filters.</FieldDescription>
                    <Input
                      id="health-check-service"
                      value={formState.service_name}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setFormState((current) => ({ ...current, service_name: value }));
                      }}
                    />
                  </Field>
                </div>
                <Field orientation="horizontal" className="items-center justify-between gap-4">
                  <div className="flex flex-1 flex-col gap-1">
                    <FieldLabel id="health-check-enabled-label" htmlFor="health-check-enabled">Enabled</FieldLabel>
                    <FieldDescription>Disabled checks stay saved but do not execute until you re-enable them.</FieldDescription>
                  </div>
                  <Switch
                    id="health-check-enabled"
                    aria-labelledby="health-check-enabled-label"
                    checked={formState.enabled}
                    onCheckedChange={(checked) => setFormState((current) => ({ ...current, enabled: Boolean(checked) }))}
                  />
                </Field>
              </FieldGroup>
            </DialogFormContent>
          </Dialog>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Health checks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadErrorMessage === null ? null : (
              <Notice tone="warning" title="Could not refresh health checks">
                {loadErrorMessage}
              </Notice>
            )}

            {hasPausedChecks ? (
              <PlanUpgradeCallout
                eyebrow="Plan limits"
                title="Some saved health checks are paused by the current plan"
                description="Paused checks stay visible for configuration and history, but execution stops when a downgrade pushes them past the plan's check-count or interval limits."
              />
            ) : null}

            {showChecksLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : checks !== null && checks.length === 0 ? (
              <ProjectResourceEmptyState
                icon={ShieldAlertIcon}
                title="No health checks yet"
                description="Create an external health check for this project to track uptime and automatically open incidents when the endpoint degrades or goes down."
                {...(canManageChecks
                  ? {
                      actionLabel: "Create health check",
                      onAction: openCreateDialog
                    }
                  : {})}
              />
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[820px] table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-44">Name</TableHead>
                      <TableHead className="w-32">Status</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead className="w-24">Interval</TableHead>
                      <TableHead className="w-32">Last check</TableHead>
                      <TableHead className="w-24 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(checks ?? []).map((check) => {
                      const isSelected = check.check_id === selectedCheckId;
                      return (
                        <TableRow
                          key={check.check_id}
                          data-state={isSelected ? "selected" : undefined}
                          className="cursor-pointer"
                          onClick={() => setSelectedCheckId(check.check_id)}
                        >
                          <TableCell className="w-44 max-w-44 whitespace-normal">
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="block max-w-full truncate font-medium text-foreground">{check.name}</span>
                                {!check.enabled ? <Badge variant="outline">Disabled</Badge> : null}
                                {check.linked_incident_id === null ? null : (
                                  <Badge variant="warning">
                                    <Link to={`/incidents/${check.linked_incident_id}`}>Open incident</Link>
                                  </Badge>
                                )}
                              </div>
                              <p className="truncate text-xs text-muted-foreground">
                                {check.environment}
                                {check.service_name === null ? "" : ` • ${check.service_name}`}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={availabilityStatusVariant(check.status)}>
                              {formatAvailabilityStatus(check.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            <div className="space-y-1">
                              <p className="break-all font-mono text-xs text-foreground">{check.method} {check.url}</p>
                              <p className="text-xs text-muted-foreground">
                                Healthy when {check.expected_status_min}-{check.expected_status_max}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {check.interval_seconds}s
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {check.last_checked_at === null ? "Never" : formatDateTime(check.last_checked_at)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {canManageChecks ? (
                                <Button type="button" variant="ghost" size="icon-sm" onClick={(event) => {
                                  event.stopPropagation();
                                  openEditDialog(check);
                                }}>
                                  <PencilIcon />
                                  <span className="sr-only">Edit</span>
                                </Button>
                              ) : null}
                              {canManageChecks ? (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon-sm"
                                      onClick={(event) => event.stopPropagation()}
                                      disabled={deletingCheckId === check.check_id}
                                    >
                                      <Trash2Icon />
                                      <span className="sr-only">Delete</span>
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete health check?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Delete {check.name} and stop future polling. Existing incidents and saved 30-day history remain until normal retention cleanup removes them.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => void handleDeleteCheck(check.check_id)}>
                                        Delete check
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Selected check</CardTitle>
            <CardDescription>Current state, thresholds, and the last observed execution for the check in focus.</CardDescription>
          </CardHeader>
          <CardContent>
            {selectedCheck === null ? (
              <ProjectResourceEmptyState
                icon={ActivityIcon}
                title="Select a health check"
                description="Pick a check from the table to inspect its recent uptime history."
              />
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={availabilityStatusVariant(selectedCheck.status)}>
                    {formatAvailabilityStatus(selectedCheck.status)}
                  </Badge>
                  <Badge variant="outline">{selectedCheck.method}</Badge>
                  {selectedCheck.paused_reason === null ? null : (
                    <Badge variant="warning">{formatPausedReason(selectedCheck.paused_reason)}</Badge>
                  )}
                </div>
                <DetailRow label="URL" value={selectedCheck.url} monospace />
                <DetailRow label="Healthy status range" value={`${selectedCheck.expected_status_min}-${selectedCheck.expected_status_max}`} />
                <DetailRow label="Failure threshold" value={`${selectedCheck.failure_threshold} consecutive failures`} />
                <DetailRow label="Recovery threshold" value={`${selectedCheck.recovery_threshold} consecutive successes`} />
                <DetailRow label="Last result" value={selectedCheck.last_result_status === null ? "No checks yet" : `${selectedCheck.last_result_status}${selectedCheck.last_result_http_status === null ? "" : ` (${selectedCheck.last_result_http_status})`}`} />
                <DetailRow label="Last duration" value={selectedCheck.last_result_duration_ms === null ? "No checks yet" : `${selectedCheck.last_result_duration_ms}ms`} />
                <DetailRow label="Next scheduled check" value={selectedCheck.next_check_at === null ? "Pending save" : formatDateTime(selectedCheck.next_check_at)} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Recent executions</CardTitle>
            <CardDescription>The latest raw health-check attempts for the selected endpoint.</CardDescription>
          </CardHeader>
          <CardContent>
            {selectedCheck === null ? (
              <ProjectResourceEmptyState
                icon={ActivityIcon}
                title="No check selected"
                description="Choose a health check to inspect its latest executions."
              />
            ) : showResultsLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : results !== null && results.length === 0 ? (
              <ProjectResourceEmptyState
                icon={ActivityIcon}
                title="No executions yet"
                description="This check has been saved, but DebugBundle has not recorded a completed poll yet."
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>HTTP</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Final URL</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(results ?? []).map((result) => (
                      <TableRow key={result.result_id}>
                        <TableCell>
                          <Badge variant={availabilityResultVariant(result.status)}>
                            {result.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{result.http_status ?? "none"}</TableCell>
                        <TableCell>{result.duration_ms}ms</TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatDateTime(result.started_at)}
                        </TableCell>
                        <TableCell className="max-w-80 truncate font-mono text-xs">
                          {result.final_url}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>30-day daily history</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedCheck === null ? (
              <ProjectResourceEmptyState
                icon={RotateCcwIcon}
                title="No check selected"
                description="Choose a health check to inspect its retained daily uptime history."
              />
            ) : showRollupsLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : rollups !== null && rollups.length === 0 ? (
              <ProjectResourceEmptyState
                icon={RotateCcwIcon}
                title="No daily history yet"
                description="Daily history appears after DebugBundle records completed checks for this endpoint."
              />
            ) : (
              <div className="space-y-3">
                {(rollups ?? []).map((rollup) => (
                  <div key={rollup.day} className="rounded-lg border border-border/80 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">{formatDay(rollup.day)}</p>
                        <p className="text-xs text-muted-foreground">
                          {rollup.total_checks} checks • {rollup.successful_checks} healthy • {rollup.failed_checks} failed
                        </p>
                      </div>
                      <Badge
                        variant={dailyStateVariant(rollup.state)}
                        className={dailyStateClassName(rollup, selectedCheck.failure_threshold)}
                      >
                        {formatDailyStateLabel(rollup, selectedCheck.failure_threshold)}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                      <p>Average duration: {rollup.avg_duration_ms === null ? "n/a" : `${rollup.avg_duration_ms}ms`}</p>
                      <p>Downtime estimate: {formatDowntime(rollup.downtime_seconds)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DetailRow(input: { label: string; value: string; monospace?: boolean }): JSX.Element {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{input.label}</p>
      <p className={input.monospace ? "break-all font-mono text-sm text-foreground" : "text-sm text-foreground"}>
        {input.value}
      </p>
    </div>
  );
}
