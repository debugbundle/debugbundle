import type * as React from "react";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import type { ProjectRecord } from "../../lib/api.js";
import { createProject } from "../../lib/api.js";
import { showErrorToast } from "../../lib/notify.js";
import { CUSTOM_PROJECT_ENVIRONMENT_VALUE, PROJECT_ENVIRONMENT_OPTIONS, slugifyProjectName } from "../../lib/project-form.js";
import { Button } from "../ui/button.js";
import { Dialog, DialogTrigger } from "../ui/dialog.js";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../ui/field.js";
import { Input } from "../ui/input.js";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../ui/select.js";
import { ProjectColorTagPicker } from "./project-color-tag-picker.js";
import { DialogFormContent } from "./dialog-form-content.js";

export interface CreateProjectDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCreated?: (project: ProjectRecord) => void | Promise<void>;
  trigger?: React.ReactNode;
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  onCreated,
  trigger
}: CreateProjectDialogProps): JSX.Element {
  const navigate = useNavigate();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  const [environmentDefault, setEnvironmentDefault] = useState("production");
  const [customEnvironmentDefault, setCustomEnvironmentDefault] = useState("");
  const [colorTag, setColorTag] = useState<ProjectRecord["color_tag"]>(null);

  const resolvedOpen = open ?? uncontrolledOpen;
  const selectedProjectEnvironment = PROJECT_ENVIRONMENT_OPTIONS.some((option) => option.value === environmentDefault)
    ? environmentDefault
    : CUSTOM_PROJECT_ENVIRONMENT_VALUE;

  function handleDialogOpenChange(nextOpen: boolean): void {
    onOpenChange?.(nextOpen);

    if (open === undefined) {
      setUncontrolledOpen(nextOpen);
    }
  }

  function resetForm(): void {
    setName("");
    setSlug("");
    setIsSlugManuallyEdited(false);
    setEnvironmentDefault("production");
    setCustomEnvironmentDefault("");
    setColorTag(null);
  }

  async function handleCreateProject(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    try {
      const created = await createProject({
        name,
        slug,
        environment_default: environmentDefault,
        color_tag: colorTag
      });
      await onCreated?.(created);
      resetForm();
      handleDialogOpenChange(false);
      void navigate(`/projects/${created.project_id}`);
    } catch {
      showErrorToast("Could not create project.");
    }
  }

  function handleProjectNameChange(value: string): void {
    setName(value);

    if (isSlugManuallyEdited) {
      return;
    }

    setSlug(slugifyProjectName(value));
  }

  function handleProjectSlugChange(value: string): void {
    setSlug(value);
    setIsSlugManuallyEdited(value !== slugifyProjectName(name));
  }

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
    <Dialog open={resolvedOpen} onOpenChange={handleDialogOpenChange}>
      {trigger === undefined ? null : <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogFormContent
        title="Create project"
        description="Add a new project in this workspace."
        size="lg"
        footer={
          <Button type="submit">
            <PlusIcon data-icon="inline-start" />
            Create project
          </Button>
        }
        onSubmit={(event) => void handleCreateProject(event)}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="project-name">Project name</FieldLabel>
            <Input id="project-name" value={name} onChange={(event) => handleProjectNameChange(event.currentTarget.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="project-slug">Project slug</FieldLabel>
            <Input
              id="project-slug"
              value={slug}
              onChange={(event) => handleProjectSlugChange(event.currentTarget.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </Field>
          <Field>
            <FieldLabel>Color tag</FieldLabel>
            <ProjectColorTagPicker value={colorTag} onChange={setColorTag} />
          </Field>
          <Field>
            <FieldLabel id="project-environment-default-label" htmlFor="project-environment-default">
              Default environment
            </FieldLabel>
            <FieldDescription>Used as the initial environment in setup snippets and project defaults.</FieldDescription>
            <Select value={selectedProjectEnvironment} onValueChange={handleProjectEnvironmentChange}>
              <SelectTrigger
                id="project-environment-default"
                aria-labelledby="project-environment-default-label project-environment-default"
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
                id="project-environment-default-custom"
                aria-label="Custom environment"
                value={customEnvironmentDefault}
                onChange={(event) => handleCustomProjectEnvironmentChange(event.currentTarget.value)}
                placeholder="preview"
                required
              />
            )}
          </Field>
        </FieldGroup>
      </DialogFormContent>
    </Dialog>
  );
}
