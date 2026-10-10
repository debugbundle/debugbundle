import { useEffect, useRef, useState } from "react";
import type { AvailabilityCheckRecord, ProjectRecord } from "../../lib/api.js";
import {
  getPublicStatusOptions,
  getPublicStatusSettings,
  previewPublicStatus,
  savePublicStatusSettings
} from "../../lib/api-public-status.js";
import type {
  PublicStatusManagement,
  PublicStatusOptions,
  PublicStatusPage,
  PublicStatusSettings
} from "../../../../../packages/shared-types/src/public-status.js";
import { PublicStatusPageView } from "./public-status-view.js";
import { Button } from "../ui/button.js";
import { Switch } from "../ui/switch.js";
import { MultiSelect } from "./multi-select.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "../ui/dialog.js";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet
} from "../ui/field.js";
import { Input } from "../ui/input.js";
import { Notice } from "../ui/notice.js";
import { Skeleton } from "../ui/skeleton.js";
import { showSuccessToast } from "../../lib/notify.js";

import { DialogFormContent } from "./dialog-form-content.js";
import { ReadOnlyCopyInput } from "./read-only-copy-input.js";

type PublicStatusSettingsProps = {
  project: ProjectRecord;
  checks: AvailabilityCheckRecord[] | null;
};

export function PublicStatusSettingsDialog(props: PublicStatusSettingsProps): JSX.Element {
  const [open, setOpen] = useState(false);
  // Mount while open so reopening reads saved settings and discards unsaved drafts.
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          Public status page
        </Button>
      </DialogTrigger>
      {open ? <PublicStatusSettingsContent {...props} /> : null}
    </Dialog>
  );
}

function PublicStatusSettingsContent({ project, checks }: PublicStatusSettingsProps): JSX.Element {
  const [stored, setStored] = useState<PublicStatusManagement | null>(null);
  const [draft, setDraft] = useState<PublicStatusSettings | null>(null);
  const [options, setOptions] = useState<PublicStatusOptions>({ projects: [], next_cursor: null });
  const [operation, setOperation] = useState<"save" | "preview" | "options" | null>(null);
  const busy = operation !== null;
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PublicStatusPage | null>(null);
  const previewTrigger = useRef<HTMLButtonElement>(null);
  const alive = useRef(true);
  // Health polling changes result fields frequently; only membership/name edits need new choices.
  const anchorCheckRevision = JSON.stringify(checks?.map(({ check_id, name }) => [check_id, name]));
  useEffect(() => {
    let canceled = false;
    alive.current = true;
    void (async () => {
      try {
        const result = await getPublicStatusSettings(project.project_id);
        if (canceled) return;
        setStored(result);
        setDraft(result.settings);
        if (result.access_mode === "manage") {
          const choices = await getPublicStatusOptions(project.project_id);
          if (!canceled)
            setOptions((old) => ({
              ...choices,
              projects: [
                ...old.projects.filter((p) => p.project_id === project.project_id),
                ...choices.projects.filter((p) => p.project_id !== project.project_id)
              ]
            }));
        }
      } catch {
        if (!canceled) setError("Public status settings could not be loaded.");
      }
    })();
    return () => {
      canceled = true;
      alive.current = false;
    };
  }, [project.project_id]);
  useEffect(() => {
    if (stored?.access_mode !== "manage") return;
    let canceled = false;
    void getPublicStatusOptions(project.project_id, { check_project_id: project.project_id })
      .then((result) => {
        const anchor = result.projects[0];
        if (canceled || !anchor) return;
        setOptions((old) => ({
          ...old,
          projects: [anchor, ...old.projects.filter((p) => p.project_id !== project.project_id)]
        }));
        // Only a complete option list proves a selection was deleted. Preserve unloaded choices.
        if (!anchor.next_check_cursor)
          setDraft((value) =>
            value
              ? {
                  ...value,
                  projects: value.projects.map((p) =>
                    p.project_id === project.project_id
                      ? {
                          ...p,
                          check_ids: p.check_ids.filter((id) =>
                            anchor.checks.some((c) => c.check_id === id)
                          )
                        }
                      : p
                  )
                }
              : value
          );
      })
      .catch(() => {
        if (!canceled) setError("Health check choices could not be refreshed.");
      });
    return () => {
      canceled = true;
    };
  }, [project.project_id, stored?.access_mode, anchorCheckRevision]);
  async function save(): Promise<void> {
    if (!draft) return;
    setOperation("save");
    setError(null);
    setPreview(null);
    try {
      const result = await savePublicStatusSettings(project.project_id, draft);
      if (!alive.current) return;
      setStored(result);
      setDraft(result.settings);
      showSuccessToast("Public status settings saved.");
    } catch {
      if (alive.current)
        setError(
          "Could not save status settings. Check the title, project ownership, and selected checks."
        );
    } finally {
      if (alive.current) setOperation(null);
    }
  }
  async function showPreview(): Promise<void> {
    setOperation("preview");
    setError(null);
    setPreview(null);
    try {
      const result = await previewPublicStatus(project.project_id);
      if (alive.current) setPreview(result);
    } catch {
      if (alive.current) setError("The saved status page could not be previewed.");
    } finally {
      if (alive.current) setOperation(null);
    }
  }
  async function loadMore(): Promise<void> {
    if (!options.next_cursor) return;
    setOperation("options");
    setError(null);
    try {
      const result = await getPublicStatusOptions(project.project_id, {
        cursor: options.next_cursor
      });
      if (alive.current)
        setOptions((old) => ({
          projects: [
            ...old.projects,
            ...result.projects.filter(
              (p) => !old.projects.some((o) => o.project_id === p.project_id)
            )
          ],
          next_cursor: result.next_cursor
        }));
    } catch {
      if (alive.current) setError("More projects could not be loaded.");
    } finally {
      if (alive.current) setOperation(null);
    }
  }
  async function loadMoreChecks(projectId: string, cursor: string): Promise<void> {
    setOperation("options");
    setError(null);
    try {
      const result = await getPublicStatusOptions(project.project_id, {
        check_project_id: projectId,
        check_cursor: cursor
      });
      if (alive.current)
        setOptions((old) => ({
          ...old,
          projects: old.projects.map((p) =>
            p.project_id === projectId && result.projects[0]
              ? { ...result.projects[0], checks: [...p.checks, ...result.projects[0].checks] }
              : p
          )
        }));
    } catch {
      if (alive.current) setError("More checks could not be loaded.");
    } finally {
      if (alive.current) setOperation(null);
    }
  }
  function chooseProjects(projectIds: string[]): void {
    setDraft((value) =>
      value
        ? {
            ...value,
            projects: [
              value.projects[0]!,
              ...projectIds.map(
                (id) =>
                  value.projects.find((p) => p.project_id === id) ?? {
                    project_id: id,
                    check_ids: []
                  }
              )
            ]
          }
        : value
    );
  }
  function chooseChecks(projectId: string, checkIds: string[]): void {
    setDraft((value) =>
      value
        ? {
            ...value,
            projects: value.projects.map((p) =>
              p.project_id === projectId
                ? {
                    ...p,
                    check_ids: checkIds
                  }
                : p
            )
          }
        : value
    );
  }
  const choices = [
    options.projects.find((p) => p.project_id === project.project_id) ?? {
      project_id: project.project_id,
      name: project.name,
      checks: (checks ?? []).map((c) => ({ check_id: c.check_id, name: c.name })),
      next_check_cursor: null
    },
    ...options.projects.filter((p) => p.project_id !== project.project_id)
  ];
  const unreviewed =
    draft?.projects.some(
      (p) =>
        !choices.some(
          (choice) =>
            choice.project_id === p.project_id &&
            p.check_ids.every((id) => choice.checks.some((c) => c.check_id === id))
        )
    ) ?? false;
  const manage = stored?.access_mode === "manage";
  const selectedCount = draft?.projects.reduce((count, p) => count + p.check_ids.length, 0) ?? 0;
  return (
    <>
      <DialogFormContent
        title="Public status page"
        description="Share selected health checks using a public link."
        size="lg"
        onSubmit={(event) => {
          event.preventDefault();
          if (manage && !busy) void save();
        }}
        footer={
          draft && manage ? (
            <>
              <Button
                type="button"
                ref={previewTrigger}
                variant="outline"
                disabled={busy || !stored?.public_id}
                onClick={() => void showPreview()}
              >
                {operation === "preview" ? "Loading preview…" : "Preview saved page"}
              </Button>
              <Button
                type="submit"
                disabled={
                  busy ||
                  (draft.enabled && unreviewed) ||
                  draft.title.trim() === "" ||
                  (draft.enabled && !draft.projects.some((p) => p.check_ids.length > 0))
                }
              >
                {operation === "save" ? "Saving…" : "Save status settings"}
              </Button>
            </>
          ) : null
        }
      >
        {error ? (
          <Notice tone="warning" title="Status settings unavailable">
            {error}
          </Notice>
        ) : null}
        {!draft && !error ? <Skeleton className="h-20 w-full" /> : null}
        {draft && manage ? (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="public-status-title">Page status title</FieldLabel>
              <Input
                id="public-status-title"
                value={draft.title}
                maxLength={120}
                required
                disabled={busy}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="public-status-projects">Other projects</FieldLabel>
              <MultiSelect
                id="public-status-projects"
                label="Other projects"
                placeholder="Only this project"
                value={draft.projects.slice(1).map((p) => p.project_id)}
                options={choices
                  .filter((p) => p.project_id !== project.project_id)
                  .map((p) => ({
                    value: p.project_id,
                    label: p.name,
                    disabled:
                      draft.projects.length >= 50 &&
                      !draft.projects.some((selected) => selected.project_id === p.project_id)
                  }))}
                onValueChange={chooseProjects}
                disabled={busy}
                loadMore={
                  options.next_cursor
                    ? {
                        label: operation === "options" ? "Loading…" : "Load more projects",
                        onLoadMore: () => void loadMore()
                      }
                    : undefined
                }
              />
              {draft.projects.length >= 50 ? (
                <FieldDescription>
                  50-project limit reached. Remove a project to include another.
                </FieldDescription>
              ) : null}
            </Field>
            <FieldSet>
              <FieldLegend>Published checks</FieldLegend>
              <FieldDescription>
                Project and selected check names, plus 30-day availability, are public. New checks
                stay private.
              </FieldDescription>
              <FieldGroup className="gap-3">
                {choices
                  .filter((p) =>
                    draft.projects.some((selection) => selection.project_id === p.project_id)
                  )
                  .map((p) => {
                    const selected = draft.projects.find(
                      (selection) => selection.project_id === p.project_id
                    )!;
                    return (
                      <Field key={p.project_id}>
                        <FieldLabel htmlFor={`status-checks-${p.project_id}`}>{p.name}</FieldLabel>
                        <MultiSelect
                          id={`status-checks-${p.project_id}`}
                          label={`${p.name} checks`}
                          placeholder={
                            p.checks.length === 0 && !p.next_check_cursor
                              ? "No health checks"
                              : "Select checks"
                          }
                          value={selected.check_ids}
                          options={p.checks.map((c) => ({
                            value: c.check_id,
                            label: c.name,
                            disabled:
                              !selected.check_ids.includes(c.check_id) &&
                              (selected.check_ids.length >= 50 || selectedCount >= 500)
                          }))}
                          onValueChange={(ids) => chooseChecks(p.project_id, ids)}
                          disabled={busy}
                          loadMore={
                            p.next_check_cursor
                              ? {
                                  label:
                                    operation === "options"
                                      ? "Loading…"
                                      : `Load more ${p.name} checks`,
                                  onLoadMore: () =>
                                    void loadMoreChecks(p.project_id, p.next_check_cursor!)
                                }
                              : undefined
                          }
                        />
                        {selected.check_ids.length >= 50 ? (
                          <FieldDescription>
                            50-check limit reached for this project.
                          </FieldDescription>
                        ) : null}
                      </Field>
                    );
                  })}
              </FieldGroup>
              <FieldDescription>
                {selectedCount} {selectedCount === 1 ? "check" : "checks"} across{" "}
                {draft.projects.length} {draft.projects.length === 1 ? "project" : "projects"}
              </FieldDescription>
              {selectedCount >= 500 ? (
                <FieldDescription>
                  500-check limit reached. Remove a check to include another.
                </FieldDescription>
              ) : null}
            </FieldSet>
            <Field orientation="horizontal" className="justify-between">
              <FieldLabel htmlFor="public-status-enabled">Enable public page</FieldLabel>
              <Switch
                id="public-status-enabled"
                checked={draft.enabled}
                disabled={busy}
                onCheckedChange={(value) => setDraft({ ...draft, enabled: value })}
              />
            </Field>
            {draft.enabled && !draft.projects.some((p) => p.check_ids.length > 0) ? (
              <Notice tone="warning">Select at least one health check before publishing.</Notice>
            ) : null}
            {draft.enabled && unreviewed ? (
              <Notice tone="warning">
                Load remaining selected projects and checks to review them before publishing.
              </Notice>
            ) : null}
          </FieldGroup>
        ) : draft ? (
          <p className="text-sm text-muted-foreground">
            {stored?.settings.enabled
              ? "The project owner has published a status page."
              : "The project owner has not published a status page."}
          </p>
        ) : null}
        {stored?.settings.enabled && stored.public_url ? (
          <div className="flex flex-col gap-2">
            <ReadOnlyCopyInput
              id="public-status-link"
              label="Public status link"
              value={stored.public_url}
              copyLabel="Copy link"
              successMessage="Status link copied."
              errorMessage="Could not copy the link. Select and copy the URL in the input."
            />
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <a href={stored.public_url} target="_blank" rel="noopener noreferrer">
                  Open status page
                </a>
              </Button>
            </div>
          </div>
        ) : null}
      </DialogFormContent>
      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      >
        <DialogContent
          size="xl"
          className="flex max-h-[calc(100dvh-2rem)] flex-col"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            previewTrigger.current?.focus();
          }}
        >
          <DialogHeader className="shrink-0 pr-8">
            <DialogTitle className="break-words">
              {preview?.title ?? "Status page preview"}
            </DialogTitle>
            <DialogDescription>
              Saved public view. Unsaved edits are not included.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto overscroll-contain">
            {preview ? <PublicStatusPageView page={preview} /> : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
