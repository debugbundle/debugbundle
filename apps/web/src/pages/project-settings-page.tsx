import { PencilIcon, Settings2Icon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { DialogFormContent } from "../components/system/dialog-form-content.js";
import { ProjectColorTagPicker } from "../components/system/project-color-tag-picker.js";
import { ProjectCapturePolicyCard } from "../components/system/project-capture-policy-card.js";
import { ProjectCaptureRulesCard } from "../components/system/project-capture-rules-card.js";
import { ProjectImprovementSettingsCard } from "../components/system/project-improvement-settings-card.js";
import { ProjectAnalyticsSettingsCard } from "../components/system/project-analytics-settings-card.js";
import { ProjectWeeklyReportSettingsCard } from "../components/system/project-weekly-report-settings-card.js";
import type { ProjectContext } from "../components/system/project-layout.js";
import { getProjectEffectiveRole } from "../lib/project-access.js";
import { Button } from "../components/ui/button.js";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
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
import { Dialog } from "../components/ui/dialog.js";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../components/ui/field.js";
import { Input } from "../components/ui/input.js";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.js";
import {
  deleteProject,
  updateProject
} from "../lib/api.js";
import { showErrorToast, showSuccessToast } from "../lib/notify.js";
import { CUSTOM_PROJECT_ENVIRONMENT_VALUE, PROJECT_ENVIRONMENT_OPTIONS } from "../lib/project-form.js";

export function ProjectSettingsPage(): JSX.Element {
  const { project, onProjectUpdated } = useOutletContext<ProjectContext>();
  const navigate = useNavigate();
  const deleteConfirmationPhrase = `delete ${project.name}`;
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [name, setName] = useState(project.name);
  const [slug, setSlug] = useState(project.slug);
  const [environmentDefault, setEnvironmentDefault] = useState(project.environment_default);
  const [customEnvironmentDefault, setCustomEnvironmentDefault] = useState("");
  const [colorTag, setColorTag] = useState(project.color_tag);
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);
  const selectedProjectEnvironment = PROJECT_ENVIRONMENT_OPTIONS.some((option) => option.value === environmentDefault)
    ? environmentDefault
    : CUSTOM_PROJECT_ENVIRONMENT_VALUE;

  const effectiveRole = getProjectEffectiveRole(project);
  const canManageProject = effectiveRole === "owner" || effectiveRole === "admin";
  const canDeleteProject = effectiveRole === "owner";

  useEffect(() => {
    setName(project.name);
    setSlug(project.slug);
    setEnvironmentDefault(project.environment_default);
    setColorTag(project.color_tag);
    setCustomEnvironmentDefault(
      PROJECT_ENVIRONMENT_OPTIONS.some((option) => option.value === project.environment_default) ? "" : project.environment_default
    );
  }, [project]);

  useEffect(() => {
    if (!isDeleteDialogOpen) {
      setDeleteConfirmationInput("");
      setDeleteErrorMessage(null);
    }
  }, [isDeleteDialogOpen]);


  async function handleSaveChanges(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const updatedProject = await updateProject(project.project_id, {
        name,
        slug,
        environment_default: environmentDefault,
        color_tag: colorTag
      });
      onProjectUpdated(updatedProject);
      setIsEditOpen(false);
      showSuccessToast("Project updated successfully.");
    } catch (error) {
      if (error instanceof Error && error.message === "project_slug_taken") {
        setErrorMessage("That project slug is already in use in this workspace.");
      } else {
        setErrorMessage("Could not save project changes.");
        showErrorToast("Could not save project changes.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteProject(): Promise<void> {
    setIsDeleting(true);
    setDeleteErrorMessage(null);

    try {
      await deleteProject(project.project_id);
      setIsDeleteDialogOpen(false);
      showSuccessToast("Project deleted successfully.");
      void navigate("/projects", { replace: true });
    } catch {
      setDeleteErrorMessage("Could not delete this project.");
      showErrorToast("Could not delete this project.");
    } finally {
      setIsDeleting(false);
    }
  }

  const isDeleteConfirmationMatched = deleteConfirmationInput.trim() === deleteConfirmationPhrase;

  function handleProjectEnvironmentChange(value: string): void {
    if (value === CUSTOM_PROJECT_ENVIRONMENT_VALUE) {
      setEnvironmentDefault(customEnvironmentDefault);
      return;
    }

    setEnvironmentDefault(value);
  }

  function handleCustomProjectEnvironmentChange(value: string): void {
    setCustomEnvironmentDefault(value);
    setEnvironmentDefault(value);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
        <div className="space-y-4">
          <ProjectCapturePolicyCard projectId={project.project_id} organizationPlan={project.organization_plan} canEdit={canManageProject} />
          <ProjectCaptureRulesCard
            projectId={project.project_id}
            environmentDefault={project.environment_default}
            canEdit={canManageProject}
          />
          <ProjectImprovementSettingsCard
            projectId={project.project_id}
            organizationPlan={project.organization_plan}
            canEdit={canManageProject}
          />
          <ProjectAnalyticsSettingsCard
            projectId={project.project_id}
            organizationPlan={project.organization_plan}
            canEdit={canManageProject}
          />
          <ProjectWeeklyReportSettingsCard
            projectId={project.project_id}
            organizationPlan={project.organization_plan}
            canEdit={canManageProject}
          />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardAction>
                <Button type="button" variant="outline" size="sm" onClick={() => setIsEditOpen(true)} disabled={!canManageProject}>
                  <PencilIcon data-icon="inline-start" />
                  Edit project
                </Button>
              </CardAction>
              <CardTitle>Project details</CardTitle>
              <CardDescription>Current project identity and editable environment defaults used across setup guidance and project metadata.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailBlock label="Project name" value={project.name} />
                <DetailBlock label="Project slug" value={project.slug} />
                <DetailBlock label="Project default environment" value={project.environment_default} />
                <DetailBlock label="Created" value={formatDate(project.created_at)} />
                <DetailBlock label="Updated" value={formatDate(project.updated_at)} />
              </div>
            </CardContent>
          </Card>
        {effectiveRole === "member" ? null : (
        <Card className="border-destructive/25 bg-destructive/5">
          <CardHeader>
            <CardTitle>Destructive actions</CardTitle>
            <CardDescription>Keep destructive actions separate from routine project changes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-destructive/25 bg-background/70 p-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <Settings2Icon className="size-4" />
                Delete this project
              </div>
              <p className="mt-2 leading-6">
                Deleting a project removes its incidents, tokens, alerts, webhooks, and related debugging data for this workspace.
              </p>
            </div>
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
              <div className="flex justify-end">
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="destructive" disabled={!canDeleteProject || isDeleting}>
                    <Trash2Icon data-icon="inline-start" />
                    Delete project
                  </Button>
                </AlertDialogTrigger>
              </div>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete project</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently removes {project.name} and all project-scoped debugging history. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Type <span className="font-medium text-foreground">{deleteConfirmationPhrase}</span> to confirm.
                  </p>
                  <Field>
                    <FieldLabel htmlFor="delete-project-confirmation">Confirmation phrase</FieldLabel>
                    <Input
                      id="delete-project-confirmation"
                      value={deleteConfirmationInput}
                      onChange={(event) => setDeleteConfirmationInput(event.currentTarget.value)}
                      placeholder={deleteConfirmationPhrase}
                      autoComplete="off"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      disabled={isDeleting}
                    />
                  </Field>
                  {deleteErrorMessage === null ? null : <p className="text-sm text-destructive">{deleteErrorMessage}</p>}
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={() => void handleDeleteProject()} disabled={isDeleting || !isDeleteConfirmationMatched}>
                    {isDeleting ? "Deleting..." : "Delete project"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
        )}
        </div>
      </div>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogFormContent
          title="Edit project details"
          description="Update the name, slug, and editable environment default used in setup snippets and project metadata."
          size="lg"
          footer={
            <Button type="submit" disabled={isSaving || !canManageProject}>
              {isSaving ? "Saving..." : "Save changes"}
            </Button>
          }
          onSubmit={(event) => void handleSaveChanges(event)}
        >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="edit-project-name">Project name</FieldLabel>
                <Input id="edit-project-name" value={name} onChange={(event) => setName(event.currentTarget.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-project-slug">Project slug</FieldLabel>
                <Input id="edit-project-slug" value={slug} onChange={(event) => setSlug(event.currentTarget.value)} />
                <FieldDescription>Lowercase letters, numbers, and single dashes only.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>Color tag</FieldLabel>
                <FieldDescription>Optional visual identifier used when this project appears in shared tables.</FieldDescription>
                <ProjectColorTagPicker value={colorTag} onChange={setColorTag} disabled={!canManageProject || isSaving} />
              </Field>
              <Field>
                <FieldLabel id="edit-project-environment-default-label" htmlFor="edit-project-environment-default">Default environment</FieldLabel>
                <FieldDescription>Used as the initial environment in setup snippets and project defaults. You can change it later.</FieldDescription>
                <Select
                  value={selectedProjectEnvironment}
                  onValueChange={handleProjectEnvironmentChange}
                >
                  <SelectTrigger
                    id="edit-project-environment-default"
                    aria-labelledby="edit-project-environment-default-label edit-project-environment-default"
                    className="w-full"
                  >
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
                {selectedProjectEnvironment !== CUSTOM_PROJECT_ENVIRONMENT_VALUE ? null : (
                  <Input
                    id="edit-project-environment-default-custom"
                    aria-label="Custom environment"
                    value={customEnvironmentDefault}
                    onChange={(event) => handleCustomProjectEnvironmentChange(event.currentTarget.value)}
                    placeholder="preview"
                    required
                  />
                )}
              </Field>
            </FieldGroup>
            {errorMessage === null ? null : <p className="text-sm text-destructive">{errorMessage}</p>}
        </DialogFormContent>
      </Dialog>
    </div>
  );
}

function DetailBlock({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-lg border border-border/80 bg-background/60 p-4">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}
