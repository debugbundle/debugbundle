import {
  LinkIcon,
  PlusIcon,
  RotateCcwIcon,
  ShieldAlertIcon,
  ShieldOffIcon,
  Trash2Icon
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "../ui/card.js";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty.js";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../ui/field.js";
import { Input } from "../ui/input.js";
import { Skeleton } from "../ui/skeleton.js";
import { Switch } from "../ui/switch.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table.js";
import { Textarea } from "../ui/textarea.js";
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

const CAPTURE_RULES_PAGE_SIZE = 6;

interface ProjectCaptureRulesCardProps {
  projectId: string;
  canEdit: boolean;
}

interface RuleDraft {
  name: string;
  description: string;
  enabled: boolean;
  expires_at: string;
}

function buildDraft(rule: ProjectCaptureRule): RuleDraft {
  return {
    name: rule.name,
    description: rule.description ?? "",
    enabled: rule.enabled,
    expires_at: toDateTimeLocalInputValue(rule.expires_at)
  };
}

function draftsEqual(left: RuleDraft, right: RuleDraft): boolean {
  return (
    left.name === right.name &&
    left.description === right.description &&
    left.enabled === right.enabled &&
    left.expires_at === right.expires_at
  );
}

export function ProjectCaptureRulesCard({
  projectId,
  canEdit
}: ProjectCaptureRulesCardProps): JSX.Element {
  const [rulesResponse, setRulesResponse] = useState<ProjectCaptureRulesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editingRule, setEditingRule] = useState<ProjectCaptureRule | null>(null);
  const [draft, setDraft] = useState<RuleDraft | null>(null);
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

  async function loadRules(showRefreshing = false): Promise<void> {
    if (showRefreshing) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setErrorMessage(null);

    try {
      const response = await listProjectCaptureRules(projectId);
      setRulesResponse(response);
    } catch {
      setErrorMessage("Could not load capture rules.");
    } finally {
      if (showRefreshing) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
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
      showErrorToast("Could not create capture rule.");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleToggleEnabled(rule: ProjectCaptureRule): Promise<void> {
    setIsTogglingRuleId(rule.id);
    setErrorMessage(null);

    try {
      const updated = await updateProjectCaptureRule(projectId, rule.id, {
        enabled: !rule.enabled
      });
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
      showErrorToast("Could not update capture rule.");
    } finally {
      setIsTogglingRuleId(null);
    }
  }

  async function handleSaveRule(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (editingRule === null || editDraft === null || !isEditDirty) {
      return;
    }

    setIsSaving(true);

    try {
      const updated = await updateProjectCaptureRule(projectId, editingRule.id, {
        name: editDraft.name.trim(),
        description:
          editDraft.description.trim().length === 0 ? null : editDraft.description.trim(),
        enabled: editDraft.enabled,
        expires_at: parseDateTimeLocalValue(editDraft.expires_at)
      });
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
      showErrorToast("Could not save capture rule changes.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteRule(): Promise<void> {
    if (pendingDeleteRule === null) {
      return;
    }

    setIsDeletingRuleId(pendingDeleteRule.id);
    try {
      await deleteProjectCaptureRule(projectId, pendingDeleteRule.id);
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
      showErrorToast("Could not delete capture rule.");
    } finally {
      setIsDeletingRuleId(null);
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="gap-1">
          <CardTitle>Capture rules</CardTitle>
          <CardDescription>
            Review which noisy patterns are being demoted, sampled, or dropped before they keep
            reopening incidents.
          </CardDescription>
          {showPreviewOnly ? null : (
            <CardAction className="max-sm:col-span-full max-sm:col-start-1 max-sm:row-start-3 max-sm:row-span-1 max-sm:mt-3">
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
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
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
                          {formatMatcherSummary(rule)}
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
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={isTogglingRuleId === rule.id}
                              onClick={() => void handleToggleEnabled(rule)}
                            >
                              {rule.enabled ? "Pause" : "Enable"}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingRule(rule);
                                setDraft(buildDraft(rule));
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setPendingDeleteRule(rule)}
                            >
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <CursorPaginationControls
                page={rulesPage}
                hasNextPage={rulesPage < rulesPageCount}
                isLoading={isLoading || isRefreshing}
                onPreviousPage={() => setRulesPage((current) => Math.max(1, current - 1))}
                onNextPage={() => setRulesPage((current) => Math.min(rulesPageCount, current + 1))}
              />
            </div>
          )}
        </CardContent>
      </Card>

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
            description="Adjust the rule metadata, expiration, and whether it is actively applied."
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
                  disabled={!isEditDirty || isSaving || editDraft.name.trim().length === 0}
                >
                  {isSaving ? "Saving..." : "Save capture rule"}
                </Button>
              </>
            }
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="project-capture-rule-name">Rule name</FieldLabel>
                <Input
                  id="project-capture-rule-name"
                  value={editDraft.name}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setDraft((current) => ({ ...(current ?? editDraft), name: value }));
                  }}
                  disabled={isSaving}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="project-capture-rule-description">Description</FieldLabel>
                <Textarea
                  id="project-capture-rule-description"
                  value={editDraft.description}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setDraft((current) => ({ ...(current ?? editDraft), description: value }));
                  }}
                  disabled={isSaving}
                  rows={4}
                />
                <FieldDescription>
                  Keep this short and factual so future reviewers know why the rule exists.
                </FieldDescription>
              </Field>

              <Field orientation="horizontal" className="items-center justify-between gap-4">
                <div className="flex flex-1 flex-col gap-1">
                  <FieldLabel
                    id="project-capture-rule-enabled-label"
                    htmlFor="project-capture-rule-enabled"
                  >
                    Enabled
                  </FieldLabel>
                  <FieldDescription>
                    Disable a rule temporarily without deleting its definition or match history.
                  </FieldDescription>
                </div>
                <Switch
                  id="project-capture-rule-enabled"
                  aria-labelledby="project-capture-rule-enabled-label"
                  checked={editDraft.enabled}
                  disabled={isSaving}
                  onCheckedChange={(checked) => {
                    setDraft((current) => ({ ...(current ?? editDraft), enabled: checked }));
                  }}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="project-capture-rule-expires-at">Expires at</FieldLabel>
                <Input
                  id="project-capture-rule-expires-at"
                  type="datetime-local"
                  value={editDraft.expires_at}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setDraft((current) => ({ ...(current ?? editDraft), expires_at: value }));
                  }}
                  disabled={isSaving}
                />
                <FieldDescription>
                  Leave blank to keep the rule active until it is disabled or deleted.
                </FieldDescription>
              </Field>
            </FieldGroup>
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

function formatMatcherSummary(rule: ProjectCaptureRule): string {
  const parts: string[] = [];

  if (rule.matcher.event_types?.length) {
    parts.push(`events: ${rule.matcher.event_types.join(", ")}`);
  }
  if (rule.matcher.browser_event_kind !== undefined) {
    parts.push(`browser: ${rule.matcher.browser_event_kind}`);
  }
  if (rule.matcher.browser_event_opaque !== undefined) {
    parts.push(
      rule.matcher.browser_event_opaque ? "opaque browser event" : "non-opaque browser event"
    );
  }
  if (rule.matcher.runtime?.length) {
    parts.push(`runtime: ${rule.matcher.runtime.join(", ")}`);
  }
  if (rule.matcher.services?.length) {
    parts.push(`services: ${rule.matcher.services.join(", ")}`);
  }
  if (rule.matcher.environments?.length) {
    parts.push(`environments: ${rule.matcher.environments.join(", ")}`);
  }
  if (rule.matcher.client_kind !== undefined) {
    parts.push(`client: ${rule.matcher.client_kind}`);
  }
  if (rule.matcher.bot_family !== undefined) {
    parts.push(`bot: ${rule.matcher.bot_family}`);
  }
  if (rule.matcher.error_name !== undefined) {
    parts.push(`error: ${rule.matcher.error_name}`);
  }
  if (rule.matcher.message_equals !== undefined) {
    parts.push(`message: ${rule.matcher.message_equals}`);
  }
  if (rule.matcher.message_contains !== undefined) {
    parts.push(`message contains: ${rule.matcher.message_contains}`);
  }
  if (rule.matcher.resource_url !== undefined) {
    parts.push(`resource: ${formatUrlMatcher(rule.matcher.resource_url)}`);
  }
  if (rule.matcher.request_url !== undefined) {
    parts.push(`request: ${formatUrlMatcher(rule.matcher.request_url)}`);
  }
  if (rule.matcher.status_codes?.length) {
    parts.push(`status: ${rule.matcher.status_codes.join(", ")}`);
  }
  if (rule.matcher.first_party !== undefined) {
    parts.push(rule.matcher.first_party ? "first-party only" : "third-party allowed");
  }
  if (rule.matcher.fingerprint !== undefined) {
    parts.push(
      `fingerprint: ${rule.matcher.fingerprint.version}:${rule.matcher.fingerprint.value}`
    );
  }

  return parts.length === 0 ? "Custom matcher" : parts.join(" • ");
}

function formatUrlMatcher(
  matcher: NonNullable<ProjectCaptureRule["matcher"]["resource_url"]>
): string {
  const parts: string[] = [];
  if (matcher.host !== undefined) parts.push(matcher.host);
  if (matcher.host_suffix !== undefined) parts.push(`*.${matcher.host_suffix}`);
  if (matcher.path_equals !== undefined) parts.push(matcher.path_equals);
  if (matcher.path_prefix !== undefined) parts.push(`${matcher.path_prefix}*`);
  return parts.join(" ");
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

function parseDateTimeLocalValue(value: string): string | null {
  if (value.trim().length === 0) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}
