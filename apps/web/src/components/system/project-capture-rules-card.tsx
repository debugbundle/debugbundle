import { formatCaptureRuleMatcher } from "../../lib/capture-rule-copy.js";
import {
  LinkIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RotateCcwIcon,
  ShieldAlertIcon,
  ShieldOffIcon,
  Trash2Icon
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import {
  createProjectCaptureRule,
  deleteProjectCaptureRule,
  listProjectCaptureRules,
  updateProjectCaptureRule,
  type ProjectCaptureRule,
  type ProjectCaptureRulesResponse
} from "../../lib/capture-rules-api.js";
import { showErrorToast, showSuccessToast } from "../../lib/notify.js";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "../ui/alert-dialog.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { TableActionButton } from "./table-action-button.js";
import { CollapsibleCard } from "../ui/collapsible-card.js";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty.js";
import { Skeleton } from "../ui/skeleton.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table.js";
import {
  buildProjectCaptureRuleCreate,
  CaptureRuleCreateForm,
  createDefaultCaptureRuleCreateDraft,
  getCaptureRuleCreateDraftValidationError,
  type CaptureRuleCreateDraft
} from "./capture-rule-create-form.js";
import { CursorPaginationControls } from "./cursor-pagination-controls.js";
import { Dialog } from "../ui/dialog.js";
import { DialogFormContent } from "./dialog-form-content.js";
import { useProjectScopeOptions } from "./project-scope-controls.js";

const CAPTURE_RULES_PAGE_SIZE = 6;

interface ProjectCaptureRulesCardProps {
  projectId: string;
  environmentDefault: string;
  canEdit: boolean;
}

function buildDraft(rule: ProjectCaptureRule): CaptureRuleCreateDraft {
  return {
    ...createDefaultCaptureRuleCreateDraft(),
    name: rule.name,
    description: rule.description ?? "",
    enabled: rule.enabled,
    action: rule.action,
    sampleRatePercent: rule.sample_rate === null ? "25" : String(rule.sample_rate * 100),
    sampleEventClass: rule.sample_event_class ?? "preserve",
    expiresAt: toDateTimeLocalInputValue(rule.expires_at),
    advancedMatcherJson: JSON.stringify(rule.matcher, null, 2),
    matcherJsonOnly: true
  };
}
function draftsEqual(left: CaptureRuleCreateDraft, right: CaptureRuleCreateDraft): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function ProjectCaptureRulesCard({
  projectId,
  environmentDefault,
  canEdit
}: ProjectCaptureRulesCardProps): JSX.Element {
  const [rulesResponse, setRulesResponse] = useState<ProjectCaptureRulesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editingRule, setEditingRule] = useState<ProjectCaptureRule | null>(null);
  const [draft, setDraft] = useState<CaptureRuleCreateDraft | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDeleteRule, setPendingDeleteRule] = useState<ProjectCaptureRule | null>(null);
  const [isDeletingRuleId, setIsDeletingRuleId] = useState<string | null>(null);
  const [isTogglingRuleId, setIsTogglingRuleId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<CaptureRuleCreateDraft>(
    createDefaultCaptureRuleCreateDraft()
  );
  const [isCreating, setIsCreating] = useState(false);
  const [hasSubmittedCreate, setHasSubmittedCreate] = useState(false);
  const [rulesPage, setRulesPage] = useState(1);
  const scopeOptions = useProjectScopeOptions(projectId, environmentDefault);

  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
    setRulesResponse(null);
    setEditingRule(null);
    setDraft(null);
    setPendingDeleteRule(null);
    setIsSaving(false);
    setIsCreating(false);
    setIsDeletingRuleId(null);
    setIsTogglingRuleId(null);
    setIsCreateOpen(false);
    setCreateDraft(createDefaultCaptureRuleCreateDraft());
    return () => {
      generation.current += 1;
    };
  }, [projectId]);

  async function loadRules(showRefreshing = false): Promise<void> {
    const requestGeneration = generation.current;
    if (showRefreshing) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setErrorMessage(null);

    try {
      const response = await listProjectCaptureRules(projectId);
      if (generation.current !== requestGeneration) return;
      setRulesResponse(response);
    } catch {
      if (generation.current !== requestGeneration) return;
      setErrorMessage("Could not load capture rules.");
    } finally {
      if (generation.current === requestGeneration) {
        if (showRefreshing) {
          setIsRefreshing(false);
        } else {
          setIsLoading(false);
        }
      }
    }
  }

  useEffect(() => {
    setRulesPage(1);
    void loadRules();
  }, [projectId]);

  const showPreviewOnly = (rulesResponse?.access_mode ?? "manage") === "preview" || !canEdit;
  const sortedRules = useMemo(
    () =>
      [...(rulesResponse?.rules ?? [])].sort((left, right) => {
        if (left.enabled !== right.enabled) {
          return left.enabled ? -1 : 1;
        }

        return left.name.localeCompare(right.name);
      }),
    [rulesResponse]
  );
  const editDraft = draft ?? (editingRule === null ? null : buildDraft(editingRule));
  const isEditDirty =
    editingRule !== null && editDraft !== null
      ? !draftsEqual(editDraft, buildDraft(editingRule))
      : false;
  const editValidationError =
    editDraft === null ? null : getCaptureRuleCreateDraftValidationError(editDraft);
  const createValidationError = getCaptureRuleCreateDraftValidationError(createDraft);
  const rulesPageCount = Math.max(1, Math.ceil(sortedRules.length / CAPTURE_RULES_PAGE_SIZE));
  const visibleRules = useMemo(() => {
    const startIndex = (rulesPage - 1) * CAPTURE_RULES_PAGE_SIZE;
    return sortedRules.slice(startIndex, startIndex + CAPTURE_RULES_PAGE_SIZE);
  }, [rulesPage, sortedRules]);

  useEffect(() => {
    setRulesPage((current) => Math.min(current, rulesPageCount));
  }, [rulesPageCount]);

  async function handleCreateRule(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    const requestGeneration = generation.current;
    event.preventDefault();
    if (createValidationError !== null) {
      setHasSubmittedCreate(true);
      return;
    }

    setIsCreating(true);
    try {
      const created = await createProjectCaptureRule(
        projectId,
        buildProjectCaptureRuleCreate(createDraft)
      );
      if (generation.current !== requestGeneration) return;
      setRulesResponse((current) =>
        current === null
          ? current
          : {
              ...current,
              rules: [created, ...current.rules.filter((candidate) => candidate.id !== created.id)]
            }
      );
      setRulesPage(1);
      setCreateDraft(createDefaultCaptureRuleCreateDraft());
      setHasSubmittedCreate(false);
      setIsCreateOpen(false);
      showSuccessToast("Capture rule created successfully.");
    } catch {
      if (generation.current !== requestGeneration) return;
      showErrorToast("Could not create capture rule.");
    } finally {
      if (generation.current === requestGeneration) {
        setIsCreating(false);
      }
    }
  }

  async function handleToggleEnabled(rule: ProjectCaptureRule): Promise<void> {
    const requestGeneration = generation.current;
    setIsTogglingRuleId(rule.id);
    setErrorMessage(null);

    try {
      const updated = await updateProjectCaptureRule(projectId, rule.id, {
        enabled: !rule.enabled
      });
      if (generation.current !== requestGeneration) return;
      setRulesResponse((current) =>
        current === null
          ? current
          : {
              ...current,
              rules: current.rules.map((candidate) =>
                candidate.id === updated.id ? updated : candidate
              )
            }
      );
      showSuccessToast(
        rule.enabled ? "Capture rule paused successfully." : "Capture rule enabled successfully."
      );
    } catch {
      if (generation.current !== requestGeneration) return;
      showErrorToast("Could not update capture rule.");
    } finally {
      if (generation.current === requestGeneration) {
        setIsTogglingRuleId(null);
      }
    }
  }

  async function handleSaveRule(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    const requestGeneration = generation.current;
    event.preventDefault();
    if (
      editingRule === null ||
      editDraft === null ||
      !isEditDirty ||
      editValidationError !== null
    ) {
      return;
    }

    setIsSaving(true);

    try {
      const create = buildProjectCaptureRuleCreate(editDraft);
      const updated = await updateProjectCaptureRule(projectId, editingRule.id, {
        name: create.name,
        description: create.description ?? null,
        enabled: create.enabled ?? true,
        action: create.action,
        matcher: create.matcher,
        ...(create.action === "sample"
          ? {
              sample_rate:
                editDraft.sampleRatePercent === buildDraft(editingRule).sampleRatePercent &&
                editingRule.action === "sample"
                  ? editingRule.sample_rate
                  : (create.sample_rate ?? null),
              sample_event_class:
                editDraft.sampleEventClass === buildDraft(editingRule).sampleEventClass &&
                editingRule.action === "sample"
                  ? editingRule.sample_event_class
                  : (create.sample_event_class ?? null)
            }
          : {}),
        // The datetime-local control displays minutes; untouched expiry must retain exact stored seconds.
        ...(editDraft.expiresAt === buildDraft(editingRule).expiresAt
          ? {}
          : { expires_at: create.expires_at ?? null })
      });
      if (generation.current !== requestGeneration) return;
      setRulesResponse((current) =>
        current === null
          ? current
          : {
              ...current,
              rules: current.rules.map((candidate) =>
                candidate.id === updated.id ? updated : candidate
              )
            }
      );
      setEditingRule(null);
      setDraft(null);
      showSuccessToast("Capture rule updated successfully.");
    } catch {
      if (generation.current !== requestGeneration) return;
      showErrorToast("Could not save capture rule changes.");
    } finally {
      if (generation.current === requestGeneration) {
        setIsSaving(false);
      }
    }
  }

  async function handleDeleteRule(): Promise<void> {
    const requestGeneration = generation.current;
    if (pendingDeleteRule === null) {
      return;
    }

    setIsDeletingRuleId(pendingDeleteRule.id);
    try {
      await deleteProjectCaptureRule(projectId, pendingDeleteRule.id);
      if (generation.current !== requestGeneration) return;
      setRulesResponse((current) =>
        current === null
          ? current
          : {
              ...current,
              rules: current.rules.filter((candidate) => candidate.id !== pendingDeleteRule.id)
            }
      );
      setPendingDeleteRule(null);
      showSuccessToast("Capture rule deleted successfully.");
    } catch {
      if (generation.current !== requestGeneration) return;
      showErrorToast("Could not delete capture rule.");
    } finally {
      if (generation.current === requestGeneration) {
        setIsDeletingRuleId(null);
      }
    }
  }

  return (
    <>
      <CollapsibleCard
        title="Capture rules"
        description="Review which noisy patterns are being demoted, sampled, or dropped before they keep reopening incidents."
        contentClassName="space-y-6"
      >
        <div className="rounded-lg border border-border/80 bg-background/60 p-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <ShieldAlertIcon className="size-4" />
            Manage known browser noise
          </div>
          <p className="mt-2 leading-6">
            {showPreviewOnly
              ? "Members can review project capture rules here. Owners and admins create and manage these rules from incident detail pages and project settings."
              : "Create rules from noisy incident suggestions or define a manual rule here when you already know the exact structured condition to demote, sample, or drop."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {showPreviewOnly ? null : (
              <Button type="button" size="sm" onClick={() => setIsCreateOpen(true)}>
                <PlusIcon data-icon="inline-start" />
                Create rule
              </Button>
            )}
            <Button asChild type="button" variant="outline" size="sm">
              <Link to={`/projects/${projectId}/incidents`}>
                <LinkIcon data-icon="inline-start" />
                Review incidents
              </Link>
            </Button>
            {showPreviewOnly ? null : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isRefreshing}
                onClick={() => void loadRules(true)}
              >
                <RotateCcwIcon data-icon="inline-start" />
                {isRefreshing ? "Refreshing..." : "Refresh rules"}
              </Button>
            )}
          </div>
        </div>

        {errorMessage === null ? null : (
          <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : sortedRules.length === 0 ? (
          <Empty className="min-h-[11rem] justify-center border border-dashed border-border/80 bg-background/50">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ShieldOffIcon />
              </EmptyMedia>
              <EmptyTitle>No capture rules yet</EmptyTitle>
              <EmptyDescription>
                Create one from a recurring incident or define a manual matcher when the noisy
                pattern is already known.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rule</TableHead>
                  <TableHead>Matcher</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Matches</TableHead>
                  <TableHead>Last matched</TableHead>
                  {showPreviewOnly ? null : <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="align-top">
                      <div className="flex min-w-0 flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-foreground">{rule.name}</span>
                          <Badge variant={rule.enabled ? "success" : "outline"}>
                            {rule.enabled ? "enabled" : "disabled"}
                          </Badge>
                          {rule.expires_at === null ? null : (
                            <Badge variant="outline">expires {formatDate(rule.expires_at)}</Badge>
                          )}
                        </div>
                        {rule.description === null ? null : (
                          <p className="max-w-xl whitespace-normal text-sm leading-6 text-muted-foreground">
                            {rule.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="max-w-sm whitespace-normal break-words text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
                        {formatCaptureRuleMatcher(rule.matcher)}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <Badge variant={getActionVariant(rule.action)}>
                        {rule.action === "sample"
                          ? `sample ${formatSampleRate(rule.sample_rate)}`
                          : rule.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="align-top text-muted-foreground">
                      {rule.hit_count.toLocaleString()}
                    </TableCell>
                    <TableCell className="align-top text-muted-foreground">
                      {rule.last_matched_at === null ? "Never" : formatDate(rule.last_matched_at)}
                    </TableCell>
                    {showPreviewOnly ? null : (
                      <TableCell className="align-top text-right">
                        <div className="flex justify-end gap-2">
                          <TableActionButton
                            label={rule.enabled ? "Pause" : "Enable"}
                            icon={rule.enabled ? PauseIcon : PlayIcon}
                            disabled={isTogglingRuleId === rule.id}
                            onClick={() => void handleToggleEnabled(rule)}
                          />
                          <TableActionButton
                            label="Edit"
                            icon={PencilIcon}
                            onClick={() => {
                              setEditingRule(rule);
                              setDraft(buildDraft(rule));
                            }}
                          />
                          <TableActionButton
                            label="Delete"
                            icon={Trash2Icon}
                            onClick={() => setPendingDeleteRule(rule)}
                          />
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <CursorPaginationControls
              page={rulesPage}
              totalPages={rulesPageCount}
              hasNextPage={rulesPage < rulesPageCount}
              isLoading={isLoading || isRefreshing}
              onPreviousPage={() => setRulesPage((current) => Math.max(1, current - 1))}
              onNextPage={() => setRulesPage((current) => Math.min(rulesPageCount, current + 1))}
            />
          </div>
        )}
      </CollapsibleCard>

      <Dialog
        open={editingRule !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingRule(null);
            setDraft(null);
          }
        }}
      >
        {editingRule === null || editDraft === null ? null : (
          <DialogFormContent
            title="Edit capture rule"
            description="Update the matcher, action, sampling, expiration, and enabled state."
            size="lg"
            onSubmit={(event) => void handleSaveRule(event)}
            footer={
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDraft(buildDraft(editingRule));
                  }}
                  disabled={!isEditDirty || isSaving}
                >
                  Reset
                </Button>
                <Button
                  type="submit"
                  disabled={!isEditDirty || isSaving || editValidationError !== null}
                >
                  {isSaving ? "Saving..." : "Save capture rule"}
                </Button>
              </>
            }
          >
            <CaptureRuleCreateForm
              draft={editDraft}
              disabled={isSaving}
              serviceOptions={scopeOptions.services}
              environmentOptions={scopeOptions.environments}
              onDraftChange={setDraft}
            />
            {editValidationError === null ? null : (
              <p role="alert" className="text-sm text-destructive">
                {editValidationError}
              </p>
            )}
          </DialogFormContent>
        )}
      </Dialog>

      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCreateDraft(createDefaultCaptureRuleCreateDraft());
            setHasSubmittedCreate(false);
          }
          setIsCreateOpen(open);
        }}
      >
        <DialogFormContent
          title="Create capture rule"
          description="Define a targeted matcher for known noisy events. Narrow rules are safer than broad demote or drop rules."
          size="xl"
          onSubmit={(event) => void handleCreateRule(event)}
          footer={
            <>
              <Button
                type="button"
                variant="outline"
                disabled={isCreating}
                onClick={() => {
                  setCreateDraft(createDefaultCaptureRuleCreateDraft());
                  setHasSubmittedCreate(false);
                }}
              >
                Reset
              </Button>
              <Button type="submit" disabled={isCreating}>
                {isCreating ? "Creating..." : "Create rule"}
              </Button>
            </>
          }
        >
          {!hasSubmittedCreate || createValidationError === null ? null : (
            <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
              {createValidationError}
            </div>
          )}
          <CaptureRuleCreateForm
            draft={createDraft}
            disabled={isCreating}
            serviceOptions={scopeOptions.services}
            environmentOptions={scopeOptions.environments}
            onDraftChange={setCreateDraft}
          />
        </DialogFormContent>
      </Dialog>

      <AlertDialog
        open={pendingDeleteRule !== null}
        onOpenChange={(open) => (open ? undefined : setPendingDeleteRule(null))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete capture rule</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteRule === null
                ? "This permanently removes the selected capture rule."
                : `This permanently removes "${pendingDeleteRule.name}" from this project.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingRuleId !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pendingDeleteRule === null || isDeletingRuleId !== null}
              onClick={() => void handleDeleteRule()}
            >
              {isDeletingRuleId === null ? (
                <>
                  <Trash2Icon data-icon="inline-start" />
                  Delete rule
                </>
              ) : (
                "Deleting..."
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function getActionVariant(
  action: ProjectCaptureRule["action"]
): "secondary" | "warning" | "destructive" {
  switch (action) {
    case "demote":
      return "secondary";
    case "sample":
      return "warning";
    case "drop":
      return "destructive";
  }
}

function formatSampleRate(value: number | null): string {
  if (value === null) {
    return "";
  }

  return `${Math.round(value * 100)}%`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function toDateTimeLocalInputValue(value: string | null): string {
  if (value === null) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
