import { PencilIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { CalloutCard } from "../components/system/callout-card.js";
import { DialogFormContent } from "../components/system/dialog-form-content.js";
import { GitHubMark } from "../components/system/github-mark.js";
import type { ProjectContext } from "../components/system/project-layout.js";
import { useSession } from "../lib/session.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { Dialog } from "../components/ui/dialog.js";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../components/ui/field.js";
import { Input } from "../components/ui/input.js";
import { Notice } from "../components/ui/notice.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table.js";
import { useDelayedVisibility } from "../lib/use-delayed-visibility.js";
import {
  createProjectGitHubRule,
  deleteProjectGitHubRule,
  getGitHubInstallUrl,
  getGitHubInstallation,
  getProjectGitHubRepo,
  listGitHubRepositories,
  listProjectGitHubDeliveries,
  listProjectGitHubRules,
  removeProjectGitHubRepo,
  retryProjectGitHubDelivery,
  setProjectGitHubRepo,
  updateProjectGitHubRule,
  type GitHubDispatchDeliveryRecord,
  type GitHubDispatchRuleRecord,
  type GitHubInstallationRecord,
  type GitHubRepositoryRecord,
  type ProjectGitHubRepoRecord
} from "../lib/api.js";
import { showErrorToast, showSuccessToast } from "../lib/notify.js";

interface GitHubSettingsState {
  installation: GitHubInstallationRecord | null;
  installUrl: string | null;
  installUrlLoadFailed: boolean;
  repositories: GitHubRepositoryRecord[];
  repo: ProjectGitHubRepoRecord | null;
  rules: GitHubDispatchRuleRecord[];
  deliveries: GitHubDispatchDeliveryRecord[];
}

async function loadOptionalGitHubInstallUrl(projectId: string): Promise<{ installUrl: string | null; installUrlLoadFailed: boolean }> {
  try {
    return {
      installUrl: await getGitHubInstallUrl(`/projects/${projectId}/github`),
      installUrlLoadFailed: false
    };
  } catch {
    return { installUrl: null, installUrlLoadFailed: true };
  }
}

function mapGitHubLoadErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message === "github_not_configured") {
    return "GitHub automation is not configured on the API yet. Set GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, and GITHUB_APP_WEBHOOK_SECRET before using this tab.";
  }

  return "Could not load GitHub automation settings.";
}

export function ProjectGitHubPage(): JSX.Element {
  const { project } = useOutletContext<ProjectContext>();
  const { session } = useSession();
  const [githubSettings, setGitHubSettings] = useState<GitHubSettingsState | null>(null);
  const [githubErrorMessage, setGitHubErrorMessage] = useState<string | null>(null);
  const showGitHubSettingsLoading = useDelayedVisibility(githubSettings === null && githubErrorMessage === null);
  const [retryingDeliveryId, setRetryingDeliveryId] = useState<string | null>(null);
  const [selectedRepositoryFullName, setSelectedRepositoryFullName] = useState("");
  const [isConnectingRepository, setIsConnectingRepository] = useState(false);
  const [isRemovingRepository, setIsRemovingRepository] = useState(false);
  const [isCreateRuleOpen, setIsCreateRuleOpen] = useState(false);
  const [ruleName, setRuleName] = useState("");
  const [ruleEventType, setRuleEventType] = useState("bundle.created");
  const [ruleEnvironments, setRuleEnvironments] = useState("production");
  const [ruleServices, setRuleServices] = useState("");
  const [ruleSeverityMin, setRuleSeverityMin] = useState("high");
  const [ruleIncidentStatus, setRuleIncidentStatus] = useState("new_or_reopened");
  const [ruleCooldownSeconds, setRuleCooldownSeconds] = useState("300");
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [activeRuleDeleteId, setActiveRuleDeleteId] = useState<string | null>(null);

  const canEditProject = session?.role === "owner";
  const githubAutomationEnabled = project.organization_plan !== "free";

  useEffect(() => {
    if (!isCreateRuleOpen) {
      setEditingRuleId(null);
      setRuleName("");
      setRuleEventType("bundle.created");
      setRuleEnvironments("production");
      setRuleServices("");
      setRuleSeverityMin("high");
      setRuleIncidentStatus("new_or_reopened");
      setRuleCooldownSeconds("300");
    }
  }, [isCreateRuleOpen]);

  useEffect(() => {
    if (!githubAutomationEnabled) {
      setGitHubSettings(null);
      setGitHubErrorMessage(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      setGitHubErrorMessage(null);
      setGitHubSettings(null);

      try {
        const installation = await getGitHubInstallation();

        if (installation === null) {
          const installUrlState = await loadOptionalGitHubInstallUrl(project.project_id);

          if (cancelled) {
            return;
          }

          setGitHubSettings({
            installation,
            ...installUrlState,
            repositories: [],
            repo: null,
            rules: [],
            deliveries: []
          });
          return;
        }

        const installUrlPromise =
          installation.status === "suspended" || installation.status === "removed"
            ? loadOptionalGitHubInstallUrl(project.project_id)
            : Promise.resolve({ installUrl: null, installUrlLoadFailed: false });
        const [repo, rules, deliveries] = await Promise.all([
          getProjectGitHubRepo(project.project_id),
          listProjectGitHubRules(project.project_id),
          listProjectGitHubDeliveries(project.project_id)
        ]);
        const repositories =
          installation !== null && installation.status === "active" ? await listGitHubRepositories() : [];
        const installUrlState = await installUrlPromise;

        if (cancelled) {
          return;
        }

        setGitHubSettings({ installation, ...installUrlState, repositories, repo, rules, deliveries });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setGitHubErrorMessage(mapGitHubLoadErrorMessage(error));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [githubAutomationEnabled, project.project_id]);

  useEffect(() => {
    if (githubSettings === null) {
      setSelectedRepositoryFullName("");
      return;
    }

    if (githubSettings.repo !== null) {
      setSelectedRepositoryFullName(`${githubSettings.repo.repo_owner}/${githubSettings.repo.repo_name}`);
      return;
    }

    setSelectedRepositoryFullName(githubSettings.repositories[0]?.full_name ?? "");
  }, [githubSettings]);

  async function handleRetryDelivery(deliveryId: string): Promise<void> {
    setRetryingDeliveryId(deliveryId);

    try {
      const delivery = await retryProjectGitHubDelivery(project.project_id, deliveryId);
      setGitHubSettings((current) => {
        if (current === null) {
          return current;
        }

        return {
          ...current,
          deliveries: current.deliveries.map((entry) => (entry.delivery_id === deliveryId ? delivery : entry))
        };
      });
      showSuccessToast("GitHub delivery retried successfully.");
    } catch {
      showErrorToast("Could not retry GitHub delivery.");
    } finally {
      setRetryingDeliveryId(null);
    }
  }

  async function handleConnectRepository(): Promise<void> {
    if (githubSettings === null || selectedRepositoryFullName.trim() === "") {
      return;
    }

    const [owner, repo] = selectedRepositoryFullName.split("/");
    if (owner === undefined || repo === undefined) {
      return;
    }

    setIsConnectingRepository(true);

    try {
      const nextRepo = await setProjectGitHubRepo(project.project_id, { owner, repo });
      const nextRules = await listProjectGitHubRules(project.project_id);
      setGitHubSettings((current) =>
        current === null
          ? current
          : {
              ...current,
              repo: nextRepo,
              rules: nextRules
            }
      );
      showSuccessToast("GitHub repository connected successfully.");
    } catch {
      showErrorToast("Could not connect the GitHub repository.");
    } finally {
      setIsConnectingRepository(false);
    }
  }

  async function handleRemoveRepository(): Promise<void> {
    setIsRemovingRepository(true);

    try {
      await removeProjectGitHubRepo(project.project_id);
      setGitHubSettings((current) => (current === null ? current : { ...current, repo: null, rules: [], deliveries: [] }));
      showSuccessToast("GitHub repository removed successfully.");
    } catch {
      showErrorToast("Could not remove the GitHub repository.");
    } finally {
      setIsRemovingRepository(false);
    }
  }

  async function handleCreateRule(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const cooldownSeconds = Number.parseInt(ruleCooldownSeconds, 10);
    if (Number.isNaN(cooldownSeconds)) {
      showErrorToast("Cooldown seconds must be a valid number.");
      return;
    }

    try {
      const payload = {
        name: ruleName,
        event_types: [ruleEventType],
        environments: splitCsvInput(ruleEnvironments),
        services: splitCsvInput(ruleServices),
        severity_min: ruleSeverityMin as GitHubDispatchRuleRecord["severity_min"],
        bundle_type: "failure" as const,
        incident_status: ruleIncidentStatus as GitHubDispatchRuleRecord["incident_status"],
        cooldown_seconds: cooldownSeconds,
        enabled: true
      };

      if (editingRuleId === null) {
        const createdRule = await createProjectGitHubRule(project.project_id, payload);
        setGitHubSettings((current) => (current === null ? current : { ...current, rules: [...current.rules, createdRule] }));
        showSuccessToast("GitHub dispatch rule created successfully.");
      } else {
        const updatedRule = await updateProjectGitHubRule(project.project_id, editingRuleId, payload);
        setGitHubSettings((current) =>
          current === null
            ? current
            : { ...current, rules: current.rules.map((rule) => (rule.rule_id === editingRuleId ? updatedRule : rule)) }
        );
        showSuccessToast("GitHub dispatch rule updated successfully.");
      }

      setIsCreateRuleOpen(false);
    } catch {
      showErrorToast(editingRuleId === null ? "Could not create the GitHub dispatch rule." : "Could not update the GitHub dispatch rule.");
    }
  }

  function handleStartCreateRule(): void {
    setEditingRuleId(null);
    setRuleName("");
    setRuleEventType("bundle.created");
    setRuleEnvironments("production");
    setRuleServices("");
    setRuleSeverityMin("high");
    setRuleIncidentStatus("new_or_reopened");
    setRuleCooldownSeconds("300");
    setIsCreateRuleOpen(true);
  }

  function handleStartEditRule(rule: GitHubDispatchRuleRecord): void {
    setEditingRuleId(rule.rule_id);
    setRuleName(rule.name);
    setRuleEventType(rule.event_types[0] ?? "bundle.created");
    setRuleEnvironments(rule.environments.join(", "));
    setRuleServices(rule.services.join(", "));
    setRuleSeverityMin(rule.severity_min ?? "high");
    setRuleIncidentStatus(rule.incident_status);
    setRuleCooldownSeconds(String(rule.cooldown_seconds));
    setIsCreateRuleOpen(true);
  }

  async function handleDeleteRule(ruleId: string): Promise<void> {
    setActiveRuleDeleteId(ruleId);

    try {
      await deleteProjectGitHubRule(project.project_id, ruleId);
      setGitHubSettings((current) =>
        current === null ? current : { ...current, rules: current.rules.filter((rule) => rule.rule_id !== ruleId) }
      );
      showSuccessToast("GitHub dispatch rule deleted successfully.");
    } catch {
      showErrorToast("Could not delete the GitHub dispatch rule.");
    } finally {
      setActiveRuleDeleteId(null);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>GitHub automation</CardTitle>
          <CardDescription>Connect a repository, manage dispatch rules, and inspect recent GitHub delivery attempts for this project.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!githubAutomationEnabled ? (
            <CalloutCard
              eyebrow="Paid plan"
              title="Upgrade to Solo or Team to connect GitHub automation"
              description="GitHub automation is available on paid plans. Upgrade before connecting a repository, creating dispatch rules, or retrying failed deliveries from this project."
              tone="neutral"
            >
              <div className="flex flex-wrap gap-2">
                <Button asChild type="button" variant="outline" size="sm">
                  <Link to="/billing">Open billing</Link>
                </Button>
              </div>
            </CalloutCard>
          ) : githubErrorMessage !== null ? (
            <CalloutCard
              eyebrow="Unavailable"
              title="GitHub automation settings could not be loaded"
              description={githubErrorMessage}
              tone="warning"
            />
          ) : githubSettings === null ? (
            showGitHubSettingsLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-28 w-full" />
              </div>
            ) : null
          ) : githubSettings.installation === null ? (
            <CalloutCard
              eyebrow="Setup required"
              title="Connect the GitHub App to start automation"
              description="No GitHub App installation is connected to this workspace yet. Complete the install flow, then return here to assign a repository and manage dispatch rules."
              tone="neutral"
            >
              {githubSettings.installUrl === null ? null : (
                <div className="flex flex-wrap gap-2">
                  <Button asChild type="button" variant="outline" size="sm">
                    <a href={githubSettings.installUrl} target="_blank" rel="noreferrer">
                      Install GitHub App
                    </a>
                  </Button>
                </div>
              )}
              {githubSettings.installUrlLoadFailed ? (
                <Notice tone="warning" title="GitHub install link unavailable">
                  The GitHub App install link could not be loaded. Refresh this tab after the API connection is restored.
                </Notice>
              ) : null}
            </CalloutCard>
          ) : (
            <>
              {githubSettings.installation?.status === "suspended" || githubSettings.installation?.status === "removed" ? (
                <CalloutCard
                  eyebrow="Connection lost"
                  title="GitHub connection lost"
                  description="Dispatches are paused until the installation is active again. Reconnect the GitHub App in the linked account before expecting new automation deliveries."
                  tone="warning"
                >
                  {githubSettings.installUrl === null ? null : (
                    <div className="flex flex-wrap gap-2">
                      <Button asChild type="button" variant="outline" size="sm">
                        <a href={githubSettings.installUrl} target="_blank" rel="noreferrer">
                          Reconnect GitHub App
                        </a>
                      </Button>
                    </div>
                  )}
                  {githubSettings.installUrlLoadFailed ? (
                    <Notice tone="warning" title="GitHub reconnect link unavailable">
                      The GitHub App reconnect link could not be loaded. Refresh this tab after the API connection is restored.
                    </Notice>
                  ) : null}
                </CalloutCard>
              ) : null}

              <div className="rounded-lg border border-border/80 bg-background/60 p-4">
                <div className="flex items-center gap-2 font-medium text-foreground">
                  <GitHubMark className="size-4" />
                  Connected repository
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {githubSettings.repo === null
                    ? "No GitHub repository is assigned to this project yet."
                    : `${githubSettings.repo.repo_owner}/${githubSettings.repo.repo_name}`}
                </p>
                {githubSettings.repo === null ? null : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="outline">{githubSettings.installation?.account_login ?? "GitHub"}</Badge>
                    <Badge variant="secondary">{githubSettings.repo.default_branch}</Badge>
                  </div>
                )}
                {!canEditProject ? null : (
                  <div className="mt-4 space-y-3">
                    <Field>
                      <FieldLabel htmlFor="github-repository-select">Available repositories</FieldLabel>
                      <select
                        id="github-repository-select"
                        className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        value={selectedRepositoryFullName}
                        onChange={(event) => setSelectedRepositoryFullName(event.currentTarget.value)}
                        disabled={githubSettings.repositories.length === 0 || isConnectingRepository || isRemovingRepository}
                      >
                        {githubSettings.repositories.map((repository) => (
                          <option key={repository.full_name} value={repository.full_name}>
                            {repository.full_name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={selectedRepositoryFullName.trim() === "" || isConnectingRepository || isRemovingRepository}
                        onClick={() => void handleConnectRepository()}
                      >
                        {isConnectingRepository ? "Connecting..." : "Connect repository"}
                      </Button>
                      {githubSettings.repo === null ? null : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isConnectingRepository || isRemovingRepository}
                          onClick={() => void handleRemoveRepository()}
                        >
                          {isRemovingRepository ? "Removing..." : "Remove repository"}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-border/80 bg-background/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Dispatch rules</p>
                    <p className="mt-1 text-sm text-muted-foreground">Rules currently attached to this project repository.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{githubSettings.rules.length}</Badge>
                    {!canEditProject || githubSettings.repo === null ? null : (
                      <Button type="button" size="sm" variant="outline" onClick={() => handleStartCreateRule()}>
                        <PlusIcon data-icon="inline-start" />
                        Create rule
                      </Button>
                    )}
                  </div>
                </div>
                {githubSettings.rules.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">No GitHub dispatch rules are configured yet.</p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {githubSettings.rules.map((rule) => (
                      <div key={rule.rule_id} className="rounded-md border border-border/80 bg-background px-3 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-foreground">{rule.name}</p>
                          <div className="flex items-center gap-2">
                            <Badge variant={rule.enabled ? "success" : "secondary"}>{rule.enabled ? "enabled" : "disabled"}</Badge>
                            {!canEditProject ? null : (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label={`Edit rule ${rule.name}`}
                                onClick={() => handleStartEditRule(rule)}
                              >
                                <PencilIcon data-icon="inline-start" />
                                Edit rule
                              </Button>
                            )}
                            {!canEditProject ? null : (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={activeRuleDeleteId === rule.rule_id}
                                aria-label={`Delete rule ${rule.name}`}
                                onClick={() => void handleDeleteRule(rule.rule_id)}
                              >
                                {activeRuleDeleteId === rule.rule_id ? "Deleting..." : "Delete rule"}
                              </Button>
                            )}
                          </div>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">{rule.event_types.join(", ")}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-border/80 bg-background/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Recent deliveries</p>
                    <p className="mt-1 text-sm text-muted-foreground">Latest GitHub dispatch attempts for this project.</p>
                  </div>
                </div>
                {githubSettings.deliveries.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">No GitHub delivery attempts yet.</p>
                ) : (
                  <div className="mt-3 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rule</TableHead>
                          <TableHead>Incident</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Error</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {githubSettings.deliveries.map((delivery) => (
                          <TableRow key={delivery.delivery_id}>
                            <TableCell className="font-medium">{delivery.rule_name}</TableCell>
                            <TableCell>{delivery.incident_title}</TableCell>
                            <TableCell>
                              <Badge variant={getGitHubDeliveryBadgeVariant(delivery.status)}>{delivery.status}</Badge>
                            </TableCell>
                            <TableCell>{delivery.last_error ?? "-"}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={retryingDeliveryId === delivery.delivery_id}
                                onClick={() => void handleRetryDelivery(delivery.delivery_id)}
                              >
                                {retryingDeliveryId === delivery.delivery_id ? "Retrying..." : "Retry delivery"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={isCreateRuleOpen} onOpenChange={setIsCreateRuleOpen}>
        <DialogFormContent
          title={editingRuleId === null ? "Create GitHub dispatch rule" : "Edit GitHub dispatch rule"}
          description={editingRuleId === null ? "Add a repository dispatch rule for this project." : "Update the repository dispatch rule for this project."}
          size="lg"
          footer={<Button type="submit">{editingRuleId === null ? "Create rule" : "Save rule"}</Button>}
          onSubmit={(event) => void handleCreateRule(event)}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="github-rule-name">Rule name</FieldLabel>
              <Input id="github-rule-name" value={ruleName} onChange={(event) => setRuleName(event.currentTarget.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="github-rule-event-type">Event type</FieldLabel>
              <select
                id="github-rule-event-type"
                className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                value={ruleEventType}
                onChange={(event) => setRuleEventType(event.currentTarget.value)}
              >
                <option value="bundle.created">bundle.created</option>
                <option value="bundle.reopened">bundle.reopened</option>
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="github-rule-environments">Environment list</FieldLabel>
              <Input id="github-rule-environments" value={ruleEnvironments} onChange={(event) => setRuleEnvironments(event.currentTarget.value)} />
              <FieldDescription>Comma-separated environments. Leave blank for all environments.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="github-rule-services">Service list</FieldLabel>
              <Input id="github-rule-services" value={ruleServices} onChange={(event) => setRuleServices(event.currentTarget.value)} />
              <FieldDescription>Comma-separated services. Leave blank for all services.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="github-rule-severity">Minimum severity</FieldLabel>
              <select
                id="github-rule-severity"
                className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                value={ruleSeverityMin}
                onChange={(event) => setRuleSeverityMin(event.currentTarget.value)}
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="critical">critical</option>
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="github-rule-incident-status">Incident state</FieldLabel>
              <select
                id="github-rule-incident-status"
                className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                value={ruleIncidentStatus}
                onChange={(event) => setRuleIncidentStatus(event.currentTarget.value)}
              >
                <option value="new_only">new_only</option>
                <option value="reopened_only">reopened_only</option>
                <option value="new_or_reopened">new_or_reopened</option>
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="github-rule-cooldown-seconds">Cooldown seconds</FieldLabel>
              <Input
                id="github-rule-cooldown-seconds"
                type="number"
                min={0}
                step={1}
                value={ruleCooldownSeconds}
                onChange={(event) => setRuleCooldownSeconds(event.currentTarget.value)}
              />
            </Field>
          </FieldGroup>
        </DialogFormContent>
      </Dialog>
    </>
  );
}

function splitCsvInput(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function getGitHubDeliveryBadgeVariant(
  status: GitHubDispatchDeliveryRecord["status"]
): "default" | "secondary" | "success" | "warning" | "destructive" {
  if (status === "delivered") {
    return "success";
  }

  if (status === "pending" || status === "retrying") {
    return "warning";
  }

  if (status === "failed") {
    return "destructive";
  }

  return "secondary";
}
