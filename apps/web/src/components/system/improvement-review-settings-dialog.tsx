import { useEffect, useState } from "react";
import {
  ReviewSettingsCommandSchema,
  reviewPolicy,
  type ReviewSettings
} from "../../../../../packages/smart-improvements/src/review-contract.js";
import { improvementReviewApi, improvementReviewError } from "../../lib/improvement-review-api.js";
import { reportScope } from "../../lib/report-api.js";
import { listProjects, type ProjectRecord, type SessionRecord } from "../../lib/api.js";
import { reportManageableProjects } from "../../lib/report-access.js";
import { usePendingAction } from "../../lib/use-pending-action.js";
import { useReportContext } from "../../lib/use-report-context.js";
import { showSuccessToast } from "../../lib/notify.js";
import { Dialog, DialogClose } from "../ui/dialog.js";
import { Field, FieldGroup, FieldLabel, FieldDescription } from "../ui/field.js";
import { Checkbox } from "../ui/checkbox.js";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group.js";
import { Notice } from "../ui/notice.js";
import { Button } from "../ui/button.js";
import { DialogFormContent } from "./dialog-form-content.js";
import { MultiSelect } from "./multi-select.js";
import { PendingButton } from "./pending-button.js";
export function ImprovementReviewSettingsDialog({
  open,
  onOpenChange,
  settings,
  session,
  onSaved
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: ReviewSettings;
  session: SessionRecord;
  onSaved: () => void;
}): JSX.Element {
  const [draft, setDraft] = useState(() => ({
    enabled: settings.enabled,
    project_ids: settings.scope.map((view) => view.project_id),
    privacy_mode: settings.privacy_mode,
    source_consent: settings.source_consent
  }));
  const [projects, setProjects] = useState<ProjectRecord[]>([]),
    [error, setError] = useState<string | null>(null),
    [loaded, setLoaded] = useState(false);
  const { pending, run } = usePendingAction(),
    policy = reviewPolicy(session.organization_plan, session.self_hosted);
  const contextKey = `${session.user_id}:${session.organization_id}:${session.role}:${session.organization_plan}:${Boolean(session.self_hosted)}`;
  const currentContext = useReportContext(contextKey);
  useEffect(() => {
    let active = true;
    if (open) {
      setDraft({
        enabled: settings.enabled,
        project_ids: settings.scope.map((view) => view.project_id),
        privacy_mode: settings.privacy_mode,
        source_consent: settings.source_consent
      });
      setError(null);
      setLoaded(false);
      void listProjects()
        .then(async (values) => {
          const managed = reportManageableProjects(values, session);
          const missing = settings.scope.filter(
            (view) => !managed.some((project) => project.project_id === view.project_id)
          );
          const retained = await Promise.allSettled(
            missing.map((view) => listProjects(view.project_id))
          );
          if (active) {
            setProjects([
              ...managed,
              ...retained.flatMap((result, index) => {
                const project =
                  result.status === "fulfilled"
                    ? reportManageableProjects(result.value, session)[0]
                    : undefined;
                return project ? [{ ...project, project_id: missing[index]!.project_id }] : [];
              })
            ]);
            setLoaded(true);
          }
        })
        .catch(() => {
          if (active) setError("Projects could not be loaded. Close and reopen to retry.");
        });
    }
    return () => {
      active = false;
    };
  }, [open, settings, session]);
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!pending) onOpenChange(value);
      }}
    >
      <DialogFormContent
        title="Weekly improvement reviews"
        description="Review the latest completed UTC week automatically each Monday at 09:00 UTC. Select the current projects once; future projects are never added automatically."
        busy={pending}
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            const command = ReviewSettingsCommandSchema.safeParse({
              ...draft,
              expected_version: settings.version,
              expected_organization_id: session.organization_id
            });
            if (!command.success) {
              setError(
                "Choose projects and agree to evidence processing before enabling weekly reviews."
              );
              return;
            }
            try {
              await improvementReviewApi.update({
                ...reportScope(session.organization_id),
                command: command.data
              });
              if (currentContext.current !== contextKey) return;
              showSuccessToast("Weekly review settings saved successfully.");
              onSaved();
              onOpenChange(false);
            } catch (reason) {
              if (currentContext.current === contextKey) setError(improvementReviewError(reason));
            }
          });
        }}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="outline" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <PendingButton
              type="submit"
              pending={pending}
              pendingLabel="Saving..."
              disabled={!loaded}
            >
              Save weekly reviews
            </PendingButton>
          </>
        }
      >
        {error ? (
          <Notice tone="destructive" title="Settings could not be saved">
            {error}
          </Notice>
        ) : null}
        <FieldGroup>
          <Field orientation="horizontal">
            <Checkbox
              id="weekly-review-enabled"
              checked={draft.enabled}
              disabled={pending || (!policy.available && !draft.enabled)}
              onCheckedChange={(value) => setDraft({ ...draft, enabled: value === true })}
            />
            <FieldLabel htmlFor="weekly-review-enabled">Enable weekly reviews</FieldLabel>
          </Field>
          <Field>
            <FieldLabel htmlFor="weekly-review-projects">Projects</FieldLabel>
            <MultiSelect
              id="weekly-review-projects"
              label="Projects"
              disabled={pending || !loaded}
              value={draft.project_ids}
              options={[
                ...projects.map((project) => ({
                  value: project.project_id,
                  label: project.name,
                  disabled:
                    !draft.project_ids.includes(project.project_id) &&
                    draft.project_ids.length >= policy.projects
                })),
                ...settings.scope
                  .filter(
                    (view) => !projects.some((project) => project.project_id === view.project_id)
                  )
                  .map((view, index) => ({
                    value: view.project_id,
                    label: `Previously selected project ${index + 1}`
                  }))
              ]}
              onValueChange={(project_ids) => setDraft({ ...draft, project_ids })}
            />
            <FieldDescription>
              Choose up to {policy.projects} projects. Existing per-project automatic-improvement
              opt-outs stay in force.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel id="weekly-review-privacy">Evidence</FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              aria-labelledby="weekly-review-privacy"
              value={draft.privacy_mode}
              disabled={pending}
              onValueChange={(privacy_mode) => {
                if (privacy_mode === "restricted" || privacy_mode === "full")
                  setDraft({ ...draft, privacy_mode });
              }}
            >
              <ToggleGroupItem value="restricted">Restricted</ToggleGroupItem>
              <ToggleGroupItem value="full">Full redacted</ToggleGroupItem>
            </ToggleGroup>
            <FieldDescription>
              Restricted uses generic source labels and omits captured narratives. Full includes
              bounded redacted titles and summaries. Raw logs, headers and request bodies are
              excluded. Project names remain visible in DebugBundle.
            </FieldDescription>
          </Field>
          <Field orientation="horizontal">
            <Checkbox
              id="weekly-review-consent"
              checked={draft.source_consent}
              disabled={pending}
              onCheckedChange={(value) => setDraft({ ...draft, source_consent: value === true })}
            />
            <FieldLabel htmlFor="weekly-review-consent">
              Allow the selected retained evidence and bounded derived capture diagnostics to be
              used for reviews and sent to the configured AI provider when qualified AI is
              available.
            </FieldLabel>
          </Field>
          <FieldDescription>
            Up to {policy.generations} paid reviews share a separate monthly pool. No useful new
            evidence means no provider call. Disabling the schedule preserves history; removing
            consent, projects or widening privacy restrictions removes affected saved content.
          </FieldDescription>
        </FieldGroup>
      </DialogFormContent>
    </Dialog>
  );
}
