import { PencilIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { CalloutCard } from "../components/system/callout-card.js";
import { DialogFormContent } from "../components/system/dialog-form-content.js";
import { GitHubMark } from "../components/system/github-mark.js";
import { PlanUpgradeCallout } from "../components/system/plan-upgrade-callout.js";
import {
  joinScopeValues,
  ProjectScopeMultiSelect,
  splitScopeValues,
  useProjectScopeOptions
} from "../components/system/project-scope-controls.js";
import type { ProjectContext } from "../components/system/project-layout.js";
import { getProjectEffectiveRole } from "../lib/project-access.js";
import { useSession } from "../lib/session.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { Dialog } from "../components/ui/dialog.js";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../components/ui/field.js";
import { Input } from "../components/ui/input.js";
import { Notice } from "../components/ui/notice.js";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.js";
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

type GitHubRuleEventType = "bundle.created" | "bundle.reopened" | "improvement_bundle.created";

const DEFAULT_GITHUB_RULE_EVENT_TYPE: GitHubRuleEventType = "bundle.created";

async function loadOptionalGitHubInstallUrl(projectId: string): Promise<{ installUrl: string | null; installUrlLoadFailed: boolean }> {
  try {
    return {
      installUrl: await getGitHubInstallUrl(`/projects/${projectId}/github`, projectId),
      installUrlLoadFailed: false
    };
  } catch {
    return { installUrl: null, installUrlLoadFailed: true };
  }
}

function mapGitHubLoadErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message === "github_not_configured") {
    return "GitHub automation is not configured on the API yet.";
  }

  return "Could not load GitHub automation settings.";
}

export function ProjectGitHubPage(): JSX.Element {
  const { project } = useOutletContext<ProjectContext>();
  const { session } = useSession();
  const [githubSettings, setGitHubSettings] = useState<GitHubSettingsState | null>(null);
  const [githubErrorMessage, setGitHubErrorMessage] = useState<string | null>(null);
  const showGitHubSettingsLoading = useDelayedVisibility(githubSettings === null && githubErrorMessage === null);
  const [githubSettingsReloadKey, setGitHubSettingsReloadKey] = useState(0);
  const [retryingDeliveryId, setRetryingDeliveryId] = useState<string | null>(null);
  const [selectedRepositoryFullName, setSelectedRepositoryFullName] = useState("");
  const [isConnectingRepository, setIsConnectingRepository] = useState(false);
  const [isRemovingRepository, setIsRemovingRepository] = useState(false);
  const [isCreateRuleOpen, setIsCreateRuleOpen] = useState(false);
  const [ruleName, setRuleName] = useState("");
  const [ruleEventType, setRuleEventType] = useState<GitHubRuleEventType>(DEFAULT_GITHUB_RULE_EVENT_TYPE);
  const [ruleEnvironments, setRuleEnvironments] = useState("production");
  const [ruleServices, setRuleServices] = useState("");
  const [ruleSeverityMin, setRuleSeverityMin] = useState("high");
  const [ruleIncidentStatus, setRuleIncidentStatus] = useState("new_or_reopened");
  const [ruleCooldownSeconds, setRuleCooldownSeconds] = useState("300");
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [activeRuleDeleteId, setActiveRuleDeleteId] = useState<string | null>(null);
  const scopeOptions = useProjectScopeOptions(project.project_id, project.environment_default);

  const effectiveRole = getProjectEffectiveRole(project);
  const canManageConnections = effectiveRole === "owner" || effectiveRole === "admin";
  const githubAutomationEnabled = project.organization_plan !== "free";
  const canManageGitHubAutomation = canManageConnections && githubAutomationEnabled;

  useEffect(() => {
    if (!isCreateRuleOpen) {
      setEditingRuleId(null);
      setRuleName("");
      setRuleEventType(DEFAULT_GITHUB_RULE_EVENT_TYPE);
      setRuleEnvironments("production");
      setRuleServices("");
      setRuleSeverityMin("high");
      setRuleIncidentStatus("new_or_reopened");
      setRuleCooldownSeconds("300");
    }
  }, [isCreateRuleOpen]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setGitHubErrorMessage(null);
      setGitHubSettings(null);

      try {
        const installation = await getGitHubInstallation(project.project_id);

        if (installation === null) {
          const installUrlState = canManageGitHubAutomation
            ? await loadOptionalGitHubInstallUrl(project.project_id)
            : { installUrl: null, installUrlLoadFailed: false };

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

        const installUrlPromise = canManageGitHubAutomation
          ? loadOptionalGitHubInstallUrl(project.project_id)
          : Promise.resolve({ installUrl: null, installUrlLoadFailed: false });
        const [repo, rules, deliveries] = await Promise.all([
          getProjectGitHubRepo(project.project_id),
          listProjectGitHubRules(project.project_id),
          listProjectGitHubDeliveries(project.project_id)
        ]);
        const repositories =
          canManageGitHubAutomation && installation.status === "active"
            ? await listGitHubRepositories(project.project_id)
            : [];
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
  }, [canManageGitHubAutomation, githubSettingsReloadKey, project.project_id]);

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

  function handleRefreshGitHubSettings(): void {
    setGitHubSettingsReloadKey((current) => current + 1);
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
      const isImprovementEvent = isImprovementGitHubRuleEventType(ruleEventType);
      const payload = {
        name: ruleName,
        event_types: [ruleEventType],
        environments: splitCsvInput(ruleEnvironments),
        services: splitCsvInput(ruleServices),
        severity_min: ruleSeverityMin as GitHubDispatchRuleRecord["severity_min"],
        bundle_type: getBundleTypeForGitHubRuleEventType(ruleEventType),
        incident_status: (isImprovementEvent ? "new_or_reopened" : ruleIncidentStatus) as GitHubDispatchRuleRecord["incident_status"],
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
    setRuleEventType(DEFAULT_GITHUB_RULE_EVENT_TYPE);
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
    setRuleEventType(normalizeGitHubRuleEventType(rule.event_types[0]));
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
          {githubErrorMessage !== null ? (
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
            githubAutomationEnabled ? (
              <CalloutCard
                eyebrow="Setup required"
                title="Connect the GitHub App to start automation"
                description="No GitHub App installation is connected to this workspace yet. Complete the install flow, then return here to assign a repository and manage dispatch rules."
                tone="neutral"
              >
                {!canManageGitHubAutomation || githubSettings.installUrl === null ? null : (
                  <div className="flex flex-wrap gap-2">
                    <Button asChild type="button" variant="outline" size="sm">
                      <a href={githubSettings.installUrl}>
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
              <PlanUpgradeCallout
                title="Upgrade to Solo or Team to connect GitHub automation"
                description="GitHub automation is available on paid plans. Upgrade before connecting a repository, creating dispatch rules, or retrying failed deliveries from this project."
              />
            )
          ) : (
            <>
              {!githubAutomationEnabled ? (
                <CalloutCard
                  eyebrow="Automation paused"
                  title="GitHub automation is paused while this project is on Free"
                  description="The connected installation, repository assignment, and dispatch rules are preserved. They will resume after the owner upgrades back to Solo or Team."
                  tone="warning"
                />
              ) : null}

              {githubSettings.installation?.status === "suspended" || githubSettings.installation?.status === "removed" ? (
                <CalloutCard
                  eyebrow="Connection lost"
                  title="GitHub connection lost"
                  description="Dispatches are paused until the installation is active again. Reconnect the GitHub App in the linked account before expecting new automation deliveries."
                  tone="warning"
                >
                  {!canManageGitHubAutomation || githubSettings.installUrl === null ? null : (
                    <div className="flex flex-wrap gap-2">
                      <Button asChild type="button" variant="outline" size="sm">
                        <a href={githubSettings.installUrl}>
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
                  Repository connected to this project
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
                {!canManageGitHubAutomation ? null : (
                  <div className="mt-4 space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Choose one repository from the repos currently granted to this GitHub App installation. To change
                      which repos appear here, update the installation in GitHub and then refresh this page.
                    </p>
                    <Field>
                      <FieldLabel id="github-repository-select-label" htmlFor="github-repository-select">
                        Repositories accessible to this GitHub App installation
                      </FieldLabel>
                      <Select
                        value={selectedRepositoryFullName}
                        onValueChange={setSelectedRepositoryFullName}
                        disabled={githubSettings.repositories.length === 0 || isConnectingRepository || isRemovingRepository}
                      >
                        <SelectTrigger
                          id="github-repository-select"
                          aria-labelledby="github-repository-select-label github-repository-select"
                          className="w-full"
                        >
                          <SelectValue placeholder="Choose a repository" />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          <SelectGroup>
                            {githubSettings.repositories.map((repository) => (
                              <SelectItem key={repository.full_name} value={repository.full_name}>
                                {repository.full_name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                    {githubSettings.repositories.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No repositories are currently available to this installation. Add one in GitHub, then refresh
                        this page.
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={selectedRepositoryFullName.trim() === "" || isConnectingRepository || isRemovingRepository}
                        onClick={() => void handleConnectRepository()}
                      >
                        {isConnectingRepository ? "Connecting..." : "Connect to this project"}
                      </Button>
                      {githubSettings.repo === null ? null : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isConnectingRepository || isRemovingRepository}
                          onClick={() => void handleRemoveRepository()}
                        >
                          {isRemovingRepository ? "Disconnecting..." : "Disconnect from this project"}
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isConnectingRepository || isRemovingRepository}
                        onClick={handleRefreshGitHubSettings}
                      >
                        Refresh list
                      </Button>
                      {githubSettings.installUrl === null ? null : (
                        <Button asChild type="button" variant="ghost" size="sm">
                          <a href={githubSettings.installUrl}>Manage repositories in GitHub</a>
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
                    {githubSettings.repo === null || !canManageGitHubAutomation ? null : (
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
                            {canManageGitHubAutomation && canManageGitHubRule(rule, session?.user_id, effectiveRole) ? (
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
                            ) : null}
                            {canManageGitHubAutomation && canManageGitHubRule(rule, session?.user_id, effectiveRole) ? (
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
                            ) : null}
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
                          <TableHead>Target</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Error</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {githubSettings.deliveries.map((delivery) => (
                          <TableRow key={delivery.delivery_id}>
                            <TableCell className="font-medium">{delivery.rule_name}</TableCell>
                            <TableCell>{delivery.target_title}</TableCell>
                            <TableCell>
                              <Badge variant={getGitHubDeliveryBadgeVariant(delivery.status)}>{delivery.status}</Badge>
                            </TableCell>
                            <TableCell>{delivery.last_error ?? "-"}</TableCell>
                            <TableCell className="text-right">
                              {githubAutomationEnabled &&
                              delivery.status === "failed" &&
                              canRetryGitHubDelivery(delivery, githubSettings.rules, session?.user_id, effectiveRole) ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={retryingDeliveryId === delivery.delivery_id}
                                  onClick={() => void handleRetryDelivery(delivery.delivery_id)}
                                >
                                  {retryingDeliveryId === delivery.delivery_id ? "Retrying..." : "Retry delivery"}
                                </Button>
                              ) : (
                                <span className="text-sm text-muted-foreground">-</span>
                              )}
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
              <FieldLabel id="github-rule-event-type-label" htmlFor="github-rule-event-type">Event type</FieldLabel>
              <Select
                value={ruleEventType}
                onValueChange={(value) => setRuleEventType(normalizeGitHubRuleEventType(value))}
              >
                <SelectTrigger id="github-rule-event-type" aria-labelledby="github-rule-event-type-label github-rule-event-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectGroup>
                    <SelectItem value="bundle.created">bundle.created</SelectItem>
                    <SelectItem value="bundle.reopened">bundle.reopened</SelectItem>
                    <SelectItem value="improvement_bundle.created">improvement_bundle.created</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="github-rule-environments">Environment list</FieldLabel>
              <ProjectScopeMultiSelect
                id="github-rule-environments"
                label="Environments"
                value={splitScopeValues(ruleEnvironments)}
                options={scopeOptions.environments}
                onValueChange={(values) => setRuleEnvironments(joinScopeValues(values))}
              />
              <FieldDescription>Leave empty for all environments.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="github-rule-services">Service list</FieldLabel>
              <ProjectScopeMultiSelect
                id="github-rule-services"
                label="Services"
                value={splitScopeValues(ruleServices)}
                options={scopeOptions.services}
                onValueChange={(values) => setRuleServices(joinScopeValues(values))}
              />
              <FieldDescription>Leave empty for all services.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel id="github-rule-severity-label" htmlFor="github-rule-severity">Minimum severity</FieldLabel>
              <Select
                value={ruleSeverityMin}
                onValueChange={setRuleSeverityMin}
              >
                <SelectTrigger id="github-rule-severity" aria-labelledby="github-rule-severity-label github-rule-severity" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectGroup>
                    <SelectItem value="low">low</SelectItem>
                    <SelectItem value="medium">medium</SelectItem>
                    <SelectItem value="high">high</SelectItem>
                    <SelectItem value="critical">critical</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            {isImprovementGitHubRuleEventType(ruleEventType) ? (
              <Field>
                <FieldLabel>Lifecycle state</FieldLabel>
                <FieldDescription>Hosted improvement bundle rules always use new_or_reopened.</FieldDescription>
              </Field>
            ) : (
              <Field>
                <FieldLabel id="github-rule-incident-status-label" htmlFor="github-rule-incident-status">Incident state</FieldLabel>
                <Select
                  value={ruleIncidentStatus}
                  onValueChange={setRuleIncidentStatus}
                >
                  <SelectTrigger
                    id="github-rule-incident-status"
                    aria-labelledby="github-rule-incident-status-label github-rule-incident-status"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectGroup>
                      <SelectItem value="new_only">new_only</SelectItem>
                      <SelectItem value="reopened_only">reopened_only</SelectItem>
                      <SelectItem value="new_or_reopened">new_or_reopened</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            )}
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

function normalizeGitHubRuleEventType(eventType: string | undefined): GitHubRuleEventType {
  if (eventType === "bundle.reopened" || eventType === "improvement_bundle.created") {
    return eventType;
  }

  return DEFAULT_GITHUB_RULE_EVENT_TYPE;
}

function isImprovementGitHubRuleEventType(eventType: GitHubRuleEventType): boolean {
  return eventType === "improvement_bundle.created";
}

function getBundleTypeForGitHubRuleEventType(eventType: GitHubRuleEventType): "failure" | "improvement" {
  return isImprovementGitHubRuleEventType(eventType) ? "improvement" : "failure";
}

function canManageGitHubRule(
  rule: GitHubDispatchRuleRecord,
  userId: string | undefined,
  effectiveRole: "owner" | "admin" | "member"
): boolean {
  return effectiveRole === "owner" || effectiveRole === "admin" || (userId !== undefined && rule.created_by_user_id === userId);
}

function canRetryGitHubDelivery(
  delivery: GitHubDispatchDeliveryRecord,
  rules: GitHubDispatchRuleRecord[],
  userId: string | undefined,
  effectiveRole: "owner" | "admin" | "member"
): boolean {
  const rule = rules.find((entry) => entry.rule_id === delivery.rule_id);
  return rule !== undefined && canManageGitHubRule(rule, userId, effectiveRole);
}

function getGitHubDeliveryBadgeVariant(
  status: GitHubDispatchDeliveryRecord["status"]
): "default" | "secondary" | "success" | "warning" | "destructive" {
  if (status === "delivered") {
    return "success";
  }

  if (status === "pending" || status === "retrying" || status === "skipped") {
    return "warning";
  }

  if (status === "failed") {
    return "destructive";
  }

  return "secondary";
}
