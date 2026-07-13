import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArchiveIcon,
  FunnelIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  ApiRequestError,
  archiveProjectAnalyticsSavedFunnel,
  createProjectAnalyticsSavedFunnel,
  listProjectAnalyticsSavedFunnels,
  updateProjectAnalyticsSavedFunnel,
  type AnalyticsSavedFunnel,
  type AnalyticsSavedFunnelCreate,
  type AnalyticsSavedFunnelStep
} from "../../lib/api.js";
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
import { Button } from "../ui/button.js";
import { Dialog } from "../ui/dialog.js";
import { Field, FieldGroup, FieldLabel } from "../ui/field.js";
import { Input } from "../ui/input.js";
import { Notice } from "../ui/notice.js";
import { Skeleton } from "../ui/skeleton.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table.js";
import { DialogFormContent } from "./dialog-form-content.js";
import { ProjectResourceEmptyState } from "./project-resource-empty-state.js";

interface ProjectAnalyticsSavedFunnelsSectionProps {
  projectId: string;
  canManage: boolean;
  maxSavedFunnels: number;
}

interface SavedFunnelDraft {
  funnel_key: string;
  display_name: string;
  steps: AnalyticsSavedFunnelStep[];
}

const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_.:-]*$/;
const MIN_STEPS = 2;
const MAX_STEPS = 20;

function emptyStep(): AnalyticsSavedFunnelStep {
  return { step_key: "", display_name: "" };
}

function createDraft(): SavedFunnelDraft {
  return { funnel_key: "", display_name: "", steps: [emptyStep(), emptyStep()] };
}

function editDraft(funnel: AnalyticsSavedFunnel): SavedFunnelDraft {
  return {
    funnel_key: funnel.funnel_key,
    display_name: funnel.display_name,
    steps: funnel.steps.map((step) => ({ ...step }))
  };
}

function normalizeDraft(draft: SavedFunnelDraft): AnalyticsSavedFunnelCreate {
  return {
    funnel_key: draft.funnel_key.trim(),
    display_name: draft.display_name.trim(),
    steps: draft.steps.map((step) => ({
      step_key: step.step_key.trim(),
      display_name: step.display_name.trim()
    }))
  };
}

function validateDraft(draft: SavedFunnelDraft): string | null {
  const normalized = normalizeDraft(draft);
  if (!KEY_PATTERN.test(normalized.funnel_key) || normalized.funnel_key.length > 120) {
    return "Funnel keys must start with a letter and use only letters, numbers, dots, colons, underscores, or hyphens.";
  }
  if (normalized.display_name.length === 0 || normalized.display_name.length > 120) {
    return "Funnel names must contain between 1 and 120 characters.";
  }
  if (normalized.steps.length < MIN_STEPS || normalized.steps.length > MAX_STEPS) {
    return `Saved funnels require between ${MIN_STEPS} and ${MAX_STEPS} ordered steps.`;
  }
  for (const step of normalized.steps) {
    if (!KEY_PATTERN.test(step.step_key) || step.step_key.length > 120) {
      return "Step keys must start with a letter and use only letters, numbers, dots, colons, underscores, or hyphens.";
    }
    if (step.display_name.length === 0 || step.display_name.length > 120) {
      return "Step names must contain between 1 and 120 characters.";
    }
  }
  if (new Set(normalized.steps.map((step) => step.step_key)).size !== normalized.steps.length) {
    return "Saved funnel step keys must be unique.";
  }
  return null;
}

export function ProjectAnalyticsSavedFunnelsSection({
  projectId,
  canManage,
  maxSavedFunnels
}: ProjectAnalyticsSavedFunnelsSectionProps): JSX.Element {
  const [funnels, setFunnels] = useState<AnalyticsSavedFunnel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [dialogMode, setDialogMode] = useState<"create" | AnalyticsSavedFunnel | null>(null);
  const [draft, setDraft] = useState<SavedFunnelDraft>(createDraft);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingArchive, setPendingArchive] = useState<AnalyticsSavedFunnel | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);

  useEffect(() => {
    let isActive = true;
    setIsLoading(true);
    setLoadError(null);
    void listProjectAnalyticsSavedFunnels(projectId)
      .then((nextFunnels) => {
        if (isActive) setFunnels(nextFunnels);
      })
      .catch(() => {
        if (isActive) setLoadError("Could not load saved funnels.");
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });
    return () => {
      isActive = false;
    };
  }, [loadAttempt, projectId]);

  function openCreateDialog(): void {
    setDraft(createDraft());
    setValidationError(null);
    setDialogMode("create");
  }

  function openEditDialog(funnel: AnalyticsSavedFunnel): void {
    setDraft(editDraft(funnel));
    setValidationError(null);
    setDialogMode(funnel);
  }

  function closeDialog(): void {
    setDialogMode(null);
    setValidationError(null);
  }

  function updateStep(index: number, update: Partial<AnalyticsSavedFunnelStep>): void {
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step, stepIndex) =>
        stepIndex === index ? { ...step, ...update } : step
      )
    }));
  }

  function moveStep(index: number, direction: -1 | 1): void {
    setDraft((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.steps.length) return current;
      const steps = [...current.steps];
      const currentStep = steps[index];
      const nextStep = steps[nextIndex];
      if (currentStep === undefined || nextStep === undefined) return current;
      steps[index] = nextStep;
      steps[nextIndex] = currentStep;
      return { ...current, steps };
    });
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canManage || dialogMode === null || isSaving) return;
    const nextValidationError = validateDraft(draft);
    setValidationError(nextValidationError);
    if (nextValidationError !== null) return;

    const normalized = normalizeDraft(draft);
    setIsSaving(true);
    try {
      if (dialogMode === "create") {
        const funnel = await createProjectAnalyticsSavedFunnel(projectId, normalized);
        setFunnels((current) => [...current, funnel]);
        showSuccessToast("Saved funnel created.");
      } else {
        const funnel = await updateProjectAnalyticsSavedFunnel(projectId, dialogMode.funnel_key, {
          display_name: normalized.display_name,
          steps: normalized.steps
        });
        setFunnels((current) =>
          current.map((item) => (item.funnel_key === funnel.funnel_key ? funnel : item))
        );
        showSuccessToast("Saved funnel updated.");
      }
      closeDialog();
    } catch (error) {
      setValidationError(savedFunnelErrorMessage(error));
      showErrorToast("Could not save the funnel definition.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleArchive(): Promise<void> {
    if (!canManage || pendingArchive === null || isArchiving) return;
    setIsArchiving(true);
    try {
      await archiveProjectAnalyticsSavedFunnel(projectId, pendingArchive.funnel_key);
      setFunnels((current) =>
        current.filter((funnel) => funnel.funnel_key !== pendingArchive.funnel_key)
      );
      setPendingArchive(null);
      showSuccessToast("Saved funnel archived.");
    } catch {
      showErrorToast("Could not archive the saved funnel.");
    } finally {
      setIsArchiving(false);
    }
  }

  const atLimit = funnels.length >= maxSavedFunnels;

  return (
    <section className="flex flex-col gap-4 border-t pt-6" aria-labelledby="saved-funnels-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 id="saved-funnels-heading" className="text-base font-medium">
            Saved funnels
          </h3>
          <p className="text-sm leading-normal text-muted-foreground">
            Define ordered product journeys for conversion and drop-off analysis.
          </p>
          <p className="text-xs text-muted-foreground">
            {isLoading
              ? "Loading active funnels"
              : `${funnels.length} of ${maxSavedFunnels} active funnels`}
          </p>
        </div>
        {canManage ? (
          <Button type="button" onClick={openCreateDialog} disabled={isLoading || atLimit}>
            <PlusIcon data-icon="inline-start" />
            Add funnel
          </Button>
        ) : null}
      </div>

      {atLimit && canManage && !isLoading ? (
        <Notice title="Saved funnel limit reached">
          Archive an active funnel or increase the project limit before creating another.
        </Notice>
      ) : null}

      {loadError === null ? null : (
        <Notice title="Saved funnels unavailable" tone="destructive">
          <div className="flex flex-col items-start gap-2">
            <p>{loadError}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
            >
              Retry saved funnels
            </Button>
          </div>
        </Notice>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-2" aria-label="Loading saved funnels">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : loadError === null && funnels.length === 0 ? (
        <ProjectResourceEmptyState
          icon={FunnelIcon}
          title="No saved funnels"
          variant="outlined"
          description={
            canManage
              ? "Add an ordered journey to make conversion analysis repeatable."
              : "This project has no active saved funnel definitions."
          }
        />
      ) : loadError === null ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Journey</TableHead>
              <TableHead className="text-right">Steps</TableHead>
              {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {funnels.map((funnel) => (
              <TableRow key={funnel.funnel_key}>
                <TableCell className="font-medium">{funnel.display_name}</TableCell>
                <TableCell className="font-mono text-xs">{funnel.funnel_key}</TableCell>
                <TableCell>{formatJourney(funnel.steps)}</TableCell>
                <TableCell className="text-right tabular-nums">{funnel.steps.length}</TableCell>
                {canManage ? (
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${funnel.display_name}`}
                        onClick={() => openEditDialog(funnel)}
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Archive ${funnel.display_name}`}
                        onClick={() => setPendingArchive(funnel)}
                      >
                        <ArchiveIcon />
                      </Button>
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      <Dialog
        open={dialogMode !== null}
        onOpenChange={(open) => {
          if (!open && !isSaving) closeDialog();
        }}
      >
        {dialogMode === null ? null : (
          <DialogFormContent
            title={dialogMode === "create" ? "Create saved funnel" : "Edit saved funnel"}
            description="Use stable semantic keys and arrange each step in the expected completion order."
            size="lg"
            onSubmit={(event) => void handleSave(event)}
            footer={
              <>
                <Button type="button" variant="outline" onClick={closeDialog} disabled={isSaving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving
                    ? "Saving..."
                    : dialogMode === "create"
                      ? "Create funnel"
                      : "Save changes"}
                </Button>
              </>
            }
          >
            {validationError === null ? null : (
              <Notice tone="destructive">{validationError}</Notice>
            )}
            <FieldGroup className="grid gap-5 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="analytics-saved-funnel-key">Funnel key</FieldLabel>
                <Input
                  id="analytics-saved-funnel-key"
                  value={draft.funnel_key}
                  maxLength={120}
                  disabled={isSaving || dialogMode !== "create"}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, funnel_key: event.currentTarget.value }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="analytics-saved-funnel-name">Funnel name</FieldLabel>
                <Input
                  id="analytics-saved-funnel-name"
                  value={draft.display_name}
                  maxLength={120}
                  disabled={isSaving}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, display_name: event.currentTarget.value }))
                  }
                />
              </Field>
            </FieldGroup>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Ordered steps</p>
                  <p className="text-xs text-muted-foreground">Between 2 and 20 unique steps.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isSaving || draft.steps.length >= MAX_STEPS}
                  onClick={() =>
                    setDraft((current) => ({ ...current, steps: [...current.steps, emptyStep()] }))
                  }
                >
                  <PlusIcon data-icon="inline-start" />
                  Add step
                </Button>
              </div>

              <div className="flex flex-col gap-3">
                {draft.steps.map((step, index) => (
                  <div
                    key={index}
                    className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
                  >
                    <Field>
                      <FieldLabel htmlFor={`analytics-saved-funnel-step-${index}-key`}>
                        Step {index + 1} key
                      </FieldLabel>
                      <Input
                        id={`analytics-saved-funnel-step-${index}-key`}
                        value={step.step_key}
                        maxLength={120}
                        disabled={isSaving}
                        onChange={(event) =>
                          updateStep(index, { step_key: event.currentTarget.value })
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`analytics-saved-funnel-step-${index}-name`}>
                        Step {index + 1} name
                      </FieldLabel>
                      <Input
                        id={`analytics-saved-funnel-step-${index}-name`}
                        value={step.display_name}
                        maxLength={120}
                        disabled={isSaving}
                        onChange={(event) =>
                          updateStep(index, { display_name: event.currentTarget.value })
                        }
                      />
                    </Field>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Move step ${index + 1} up`}
                        disabled={isSaving || index === 0}
                        onClick={() => moveStep(index, -1)}
                      >
                        <ArrowUpIcon />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Move step ${index + 1} down`}
                        disabled={isSaving || index === draft.steps.length - 1}
                        onClick={() => moveStep(index, 1)}
                      >
                        <ArrowDownIcon />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove step ${index + 1}`}
                        disabled={isSaving || draft.steps.length <= MIN_STEPS}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            steps: current.steps.filter((_, stepIndex) => stepIndex !== index)
                          }))
                        }
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </DialogFormContent>
        )}
      </Dialog>

      <AlertDialog
        open={pendingArchive !== null}
        onOpenChange={(open) => {
          if (!open && !isArchiving) setPendingArchive(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive saved funnel</AlertDialogTitle>
            <AlertDialogDescription>
              The active definition will be removed. Existing aggregate metrics and generated
              Analytics bundles remain available for their configured retention periods.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isArchiving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pendingArchive === null || isArchiving}
              onClick={(event) => {
                event.preventDefault();
                void handleArchive();
              }}
            >
              {isArchiving ? (
                "Archiving..."
              ) : (
                <>
                  <ArchiveIcon data-icon="inline-start" />
                  Archive funnel
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function formatJourney(steps: AnalyticsSavedFunnelStep[]): string {
  const first = steps[0]?.step_key;
  const last = steps.at(-1)?.step_key;
  return first === undefined || last === undefined ? "No steps" : `${first} to ${last}`;
}

function savedFunnelErrorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError)) return "Could not save the funnel definition.";
  if (error.code === "analytics_saved_funnel_limit_reached") {
    return "The active saved funnel limit has been reached.";
  }
  if (error.code === "analytics_saved_funnel_funnel_key_taken") {
    return "That funnel key is already in use.";
  }
  return "Could not save the funnel definition.";
}
