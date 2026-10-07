import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { CalloutCard } from "../components/system/callout-card.js";
import { BoundedTableTitle } from "../components/system/bounded-table-title.js";
import { DialogFormContent } from "../components/system/dialog-form-content.js";
import { GitHubMark } from "../components/system/github-mark.js";
import { PlanUpgradeCallout } from "../components/system/plan-upgrade-callout.js";
import { GitHubInstallationDisconnect } from "../components/system/github-installation-disconnect.js";
import { GitHubRulesPanel } from "../components/system/github-rules-panel.js";
import { GitHubRuleFields } from "../components/system/github-rule-fields.js";
import { githubRuleDraft, githubRulePayload } from "../lib/github-rule-form.js";
import type { ProjectContext } from "../components/system/project-layout.js";
import { getProjectEffectiveRole } from "../lib/project-access.js";
import { useSession } from "../lib/session.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "../components/ui/card.js";
import { Dialog } from "../components/ui/dialog.js";
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

const MAX_CLEARED_DELIVERY_IDS = 100;

function readClearedDeliveryIds(storageKey: string): string[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string").slice(-MAX_CLEARED_DELIVERY_IDS)
      : [];
  } catch {
    return [];
  }
}

async function loadOptionalGitHubInstallUrl(
  projectId: string
): Promise<{ installUrl: string | null; installUrlLoadFailed: boolean }> {
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
  const showGitHubSettingsLoading = useDelayedVisibility(
    githubSettings === null && githubErrorMessage === null
  );
  const [githubSettingsReloadKey, setGitHubSettingsReloadKey] = useState(0);
  const [retryingDeliveryId, setRetryingDeliveryId] = useState<string | null>(null);
  const [clearedDeliveryState, setClearedDeliveryState] = useState<{
    key: string | null;
    ids: string[];
  }>({ key: null, ids: [] });
  const [showClearedDeliveries, setShowClearedDeliveries] = useState(false);
  const [selectedRepositoryFullName, setSelectedRepositoryFullName] = useState("");
  const [isConnectingRepository, setIsConnectingRepository] = useState(false);
  const [isRemovingRepository, setIsRemovingRepository] = useState(false);
  const [isCreateRuleOpen, setIsCreateRuleOpen] = useState(false);
  const [ruleDraft, setRuleDraft] = useState(() => githubRuleDraft());
  const [isSavingRule, setIsSavingRule] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [activeRuleDeleteId, setActiveRuleDeleteId] = useState<string | null>(null);

  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
    setRetryingDeliveryId(null);
    setIsConnectingRepository(false);
    setIsRemovingRepository(false);
    setIsSavingRule(false);
    setActiveRuleDeleteId(null);
    setIsCreateRuleOpen(false);
    setRuleDraft(githubRuleDraft());
    return () => {
      generation.current += 1;
    };
  }, [project.project_id]);

  const effectiveRole = getProjectEffectiveRole(project);
  const canManageConnections = effectiveRole === "owner" || effectiveRole === "admin";
  const githubAutomationEnabled = project.organization_plan !== "free";
  const canManageGitHubAutomation = canManageConnections && githubAutomationEnabled;
  const clearedDeliveryStorageKey =
    session?.user_id === undefined
      ? null
      : `debugbundle:github-cleared-deliveries:${session.user_id}:${project.project_id}`;
  const clearedDeliveryIds =
    clearedDeliveryState.key === clearedDeliveryStorageKey ? clearedDeliveryState.ids : [];
  const clearedDeliveryIdSet = new Set(clearedDeliveryIds);
  const failedDeliveriesToClear =
    githubSettings?.deliveries.filter(
      (delivery) => delivery.status === "failed" && !clearedDeliveryIdSet.has(delivery.delivery_id)
    ) ?? [];
  const clearedDeliveriesOnPage =
    githubSettings?.deliveries.filter(
      (delivery) => delivery.status === "failed" && clearedDeliveryIdSet.has(delivery.delivery_id)
    ) ?? [];
  const visibleDeliveries =
    githubSettings?.deliveries.filter(
      (delivery) =>
        delivery.status !== "failed" ||
        showClearedDeliveries ||
        !clearedDeliveryIdSet.has(delivery.delivery_id)
    ) ?? [];

  useEffect(() => {
    setShowClearedDeliveries(false);
    setClearedDeliveryState({
      key: clearedDeliveryStorageKey,
      ids:
        clearedDeliveryStorageKey === null ? [] : readClearedDeliveryIds(clearedDeliveryStorageKey)
    });
  }, [clearedDeliveryStorageKey]);

  function saveClearedDeliveryIds(nextIds: string[]): boolean {
    if (clearedDeliveryStorageKey === null) return false;
    try {
      window.localStorage.setItem(clearedDeliveryStorageKey, JSON.stringify(nextIds));
      setClearedDeliveryState({ key: clearedDeliveryStorageKey, ids: nextIds });
      return true;
    } catch {
      showErrorToast("Could not save cleared deliveries in this browser.");
      return false;
    }
  }

  function handleClearFailedDeliveries(): void {
    if (clearedDeliveryStorageKey === null || failedDeliveriesToClear.length === 0) return;
    const currentIds = readClearedDeliveryIds(clearedDeliveryStorageKey);
    const nextIds = [
      ...new Set([
        ...currentIds,
        ...failedDeliveriesToClear.map((delivery) => delivery.delivery_id)
      ])
    ].slice(-MAX_CLEARED_DELIVERY_IDS);
    if (saveClearedDeliveryIds(nextIds)) setShowClearedDeliveries(false);
  }

  useEffect(() => {
    if (!isCreateRuleOpen) {
      setEditingRuleId(null);
      setRuleDraft(githubRuleDraft());
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

        setGitHubSettings({
          installation,
          ...installUrlState,
          repositories,
          repo,
          rules,
          deliveries
        });
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
      setSelectedRepositoryFullName(
        `${githubSettings.repo.repo_owner}/${githubSettings.repo.repo_name}`
      );
      return;
    }

    setSelectedRepositoryFullName(githubSettings.repositories[0]?.full_name ?? "");
  }, [githubSettings]);

  async function handleRetryDelivery(deliveryId: string): Promise<void> {
    const requestGeneration = generation.current;
    setRetryingDeliveryId(deliveryId);

    try {
      const delivery = await retryProjectGitHubDelivery(project.project_id, deliveryId);
      if (generation.current !== requestGeneration) return;
      setGitHubSettings((current) => {
        if (current === null) {
          return current;
        }

        return {
          ...current,
          deliveries: current.deliveries.map((entry) =>
            entry.delivery_id === deliveryId ? delivery : entry
          )
        };
      });
      if (clearedDeliveryStorageKey !== null) {
        saveClearedDeliveryIds(
          readClearedDeliveryIds(clearedDeliveryStorageKey).filter((id) => id !== deliveryId)
        );
      }
      showSuccessToast("GitHub delivery retried successfully.");
    } catch {
      if (generation.current !== requestGeneration) return;
      showErrorToast("Could not retry GitHub delivery.");
    } finally {
      if (generation.current === requestGeneration) setRetryingDeliveryId(null);
    }
  }

  function handleRefreshGitHubSettings(): void {
    setGitHubSettingsReloadKey((current) => current + 1);
  }

  async function handleConnectRepository(): Promise<void> {
    const requestGeneration = generation.current;
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
      if (generation.current !== requestGeneration) return;
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
      if (generation.current !== requestGeneration) return;
      showErrorToast("Could not connect the GitHub repository.");
    } finally {
      if (generation.current === requestGeneration) setIsConnectingRepository(false);
    }
  }

  async function handleRemoveRepository(): Promise<void> {
    const requestGeneration = generation.current;
    setIsRemovingRepository(true);

    try {
      await removeProjectGitHubRepo(project.project_id);
      if (generation.current !== requestGeneration) return;
      setGitHubSettings((current) =>
        current === null ? current : { ...current, repo: null, rules: [], deliveries: [] }
      );
      showSuccessToast("GitHub repository removed successfully.");
    } catch {
      if (generation.current !== requestGeneration) return;
      showErrorToast("Could not remove the GitHub repository.");
    } finally {
      if (generation.current === requestGeneration) setIsRemovingRepository(false);
    }
  }

  async function handleCreateRule(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    const requestGeneration = generation.current;
    event.preventDefault();

    if (isSavingRule) return;
    try {
      const payload = githubRulePayload(ruleDraft);
      setIsSavingRule(true);
      if (editingRuleId === null) {
        const createdRule = await createProjectGitHubRule(project.project_id, {
          ...payload,
          severity_min: payload.severity_min ?? "high",
          bundle_type: payload.bundle_type ?? "failure"
        });
        if (generation.current !== requestGeneration) return;
        setGitHubSettings((current) =>
          current === null ? current : { ...current, rules: [...current.rules, createdRule] }
        );
        showSuccessToast("GitHub dispatch rule created successfully.");
      } else {
        const updatedRule = await updateProjectGitHubRule(
          project.project_id,
          editingRuleId,
          payload
        );
        if (generation.current !== requestGeneration) return;
        setGitHubSettings((current) =>
          current === null
            ? current
            : {
                ...current,
                rules: current.rules.map((rule) =>
                  rule.rule_id === editingRuleId ? updatedRule : rule
                )
              }
        );
        showSuccessToast("GitHub dispatch rule updated successfully.");
      }

      setIsCreateRuleOpen(false);
    } catch (error) {
      if (generation.current !== requestGeneration) return;
      showErrorToast(
        error instanceof Error ? error.message : "Could not save the GitHub dispatch rule."
      );
    } finally {
      if (generation.current === requestGeneration) setIsSavingRule(false);
    }
  }

  function handleStartCreateRule(): void {
    setEditingRuleId(null);
    setRuleDraft(githubRuleDraft());
    setIsCreateRuleOpen(true);
  }

  function handleStartEditRule(rule: GitHubDispatchRuleRecord): void {
    setEditingRuleId(rule.rule_id);
    setRuleDraft(githubRuleDraft(rule));
    setIsCreateRuleOpen(true);
  }

  async function handleDeleteRule(ruleId: string): Promise<void> {
    const requestGeneration = generation.current;
    setActiveRuleDeleteId(ruleId);

    try {
      await deleteProjectGitHubRule(project.project_id, ruleId);
      if (generation.current !== requestGeneration) return;
      setGitHubSettings((current) =>
        current === null
          ? current
          : { ...current, rules: current.rules.filter((rule) => rule.rule_id !== ruleId) }
      );
      showSuccessToast("GitHub dispatch rule deleted successfully.");
    } catch {
      if (generation.current !== requestGeneration) return;
      showErrorToast("Could not delete the GitHub dispatch rule.");
    } finally {
      if (generation.current === requestGeneration) setActiveRuleDeleteId(null);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>GitHub automation</CardTitle>
          <CardDescription>
            Connect a repository, manage dispatch rules, and inspect recent GitHub delivery attempts
            for this project.
          </CardDescription>
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
                      <a href={githubSettings.installUrl}>Install GitHub App</a>
                    </Button>
                  </div>
                )}
                {githubSettings.installUrlLoadFailed ? (
                  <Notice tone="warning" title="GitHub install link unavailable">
                    The GitHub App install link could not be loaded. Refresh this tab after the API
                    connection is restored.
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

              {githubSettings.installation?.status === "suspended" ||
              githubSettings.installation?.status === "removed" ? (
                <CalloutCard
                  eyebrow="Connection lost"
                  title="GitHub connection lost"
                  description="Dispatches are paused until the installation is active again. Reconnect the GitHub App in the linked account before expecting new automation deliveries."
                  tone="warning"
                >
                  {!canManageGitHubAutomation || githubSettings.installUrl === null ? null : (
                    <div className="flex flex-wrap gap-2">
                      <Button asChild type="button" variant="outline" size="sm">
                        <a href={githubSettings.installUrl}>Reconnect GitHub App</a>
                      </Button>
                    </div>
                  )}
                  {githubSettings.installUrlLoadFailed ? (
                    <Notice tone="warning" title="GitHub reconnect link unavailable">
                      The GitHub App reconnect link could not be loaded. Refresh this tab after the
                      API connection is restored.
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
                    <Badge variant="outline">
                      {githubSettings.installation?.account_login ?? "GitHub"}
                    </Badge>
                    <Badge variant="secondary">{githubSettings.repo.default_branch}</Badge>
                  </div>
                )}
                {session?.role === "owner" &&
                session.organization_id === project.organization_id &&
                githubSettings.installation !== null ? (
                  <GitHubInstallationDisconnect
                    key={`${project.project_id}:${githubSettings.installation.id}`}
                    accountLogin={githubSettings.installation.account_login}
                    onDisconnected={() => setGitHubSettingsReloadKey((value) => value + 1)}
                  />
                ) : null}
                {!canManageConnections ? null : (
                  <div className="mt-4 space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Choose one repository from the repos currently granted to this GitHub App
                      installation. To change which repos appear here, update the installation in
                      GitHub and then refresh this page.
                    </p>
                    <Field>
                      <FieldLabel
                        id="github-repository-select-label"
                        htmlFor="github-repository-select"
                      >
                        Repositories accessible to this GitHub App installation
                      </FieldLabel>
                      <Select
                        value={selectedRepositoryFullName}
                        onValueChange={setSelectedRepositoryFullName}
                        disabled={
                          !githubAutomationEnabled ||
                          githubSettings.repositories.length === 0 ||
                          isConnectingRepository ||
                          isRemovingRepository
                        }
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
                        No repositories are currently available to this installation. Add one in
                        GitHub, then refresh this page.
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={
                          !githubAutomationEnabled ||
                          selectedRepositoryFullName.trim() === "" ||
                          isConnectingRepository ||
                          isRemovingRepository
                        }
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
                          {isRemovingRepository
                            ? "Disconnecting..."
                            : "Disconnect from this project"}
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

              <GitHubRulesPanel
                rules={githubSettings.rules}
                canCreate={githubSettings.repo !== null && githubAutomationEnabled}
                deletingRuleId={activeRuleDeleteId}
                canEdit={(rule) =>
                  githubAutomationEnabled &&
                  canManageGitHubRule(rule, session?.user_id, effectiveRole)
                }
                canDelete={(rule) => canManageGitHubRule(rule, session?.user_id, effectiveRole)}
                onCreate={handleStartCreateRule}
                onEdit={handleStartEditRule}
                onDelete={(id) => void handleDeleteRule(id)}
              />
              <div className="rounded-lg border border-border/80 bg-background/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Recent deliveries</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Latest GitHub dispatch attempts for this project.
                    </p>
                  </div>
                  {githubSettings.deliveries.some((delivery) => delivery.status === "failed") ? (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={
                          clearedDeliveryStorageKey === null || failedDeliveriesToClear.length === 0
                        }
                        onClick={handleClearFailedDeliveries}
                      >
                        Clear failed
                      </Button>
                      {clearedDeliveriesOnPage.length > 0 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowClearedDeliveries((current) => !current)}
                        >
                          {showClearedDeliveries
                            ? "Hide cleared"
                            : `Show cleared (${clearedDeliveriesOnPage.length})`}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {githubSettings.deliveries.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No GitHub delivery attempts yet.
                  </p>
                ) : visibleDeliveries.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    All recent failed deliveries are cleared from this view.
                  </p>
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
                        {visibleDeliveries.map((delivery) => (
                          <TableRow key={delivery.delivery_id}>
                            <TableCell className="font-medium">{delivery.rule_name}</TableCell>
                            <TableCell className="min-w-48 max-w-80 whitespace-normal">
                              <BoundedTableTitle title={delivery.target_title} />
                            </TableCell>
                            <TableCell>
                              <Badge variant={getGitHubDeliveryBadgeVariant(delivery.status)}>
                                {delivery.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{delivery.last_error ?? "-"}</TableCell>
                            <TableCell className="text-right">
                              {githubAutomationEnabled &&
                              delivery.status === "failed" &&
                              canRetryGitHubDelivery(
                                delivery,
                                githubSettings.rules,
                                session?.user_id,
                                effectiveRole
                              ) ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={retryingDeliveryId === delivery.delivery_id}
                                  onClick={() => void handleRetryDelivery(delivery.delivery_id)}
                                >
                                  {retryingDeliveryId === delivery.delivery_id
                                    ? "Retrying..."
                                    : "Retry delivery"}
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
          title={
            editingRuleId === null ? "Create GitHub dispatch rule" : "Edit GitHub dispatch rule"
          }
          description={
            editingRuleId === null
              ? "Add a repository dispatch rule for this project."
              : "Update the repository dispatch rule for this project."
          }
          size="lg"
          footer={
            <Button type="submit" disabled={isSavingRule}>
              {isSavingRule ? "Saving..." : editingRuleId === null ? "Create rule" : "Save rule"}
            </Button>
          }
          onSubmit={(event) => void handleCreateRule(event)}
        >
          <GitHubRuleFields
            projectId={project.project_id}
            environmentDefault={project.environment_default}
            value={ruleDraft}
            onChange={setRuleDraft}
          />
        </DialogFormContent>
      </Dialog>
    </>
  );
}

function canManageGitHubRule(
  rule: GitHubDispatchRuleRecord,
  userId: string | undefined,
  effectiveRole: "owner" | "admin" | "member"
): boolean {
  return (
    effectiveRole === "owner" ||
    effectiveRole === "admin" ||
    (userId !== undefined && rule.created_by_user_id === userId)
  );
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
