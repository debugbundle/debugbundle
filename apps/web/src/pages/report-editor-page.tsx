import { hasBusinessEntitlement } from "../../../../packages/shared-types/src/tier-capabilities.js";
import { useReportContext } from "../lib/use-report-context.js";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  CreateReportDefinitionSchema,
  type CreateReportDefinition,
  type ReportDefinitionRecord
} from "../../../../packages/smart-reports/src/report-definition.js";
import { reportApi, reportScope, reportErrorMessage } from "../lib/report-api.js";
import { useSession } from "../lib/session.js";
import { usePendingAction } from "../lib/use-pending-action.js";
import { listProjects, type ProjectRecord } from "../lib/api.js";
import { listProjectMembers } from "../lib/project-sharing-api.js";
import { organizationApi } from "../lib/organization-api.js";
import { reportManageableProjects } from "../lib/report-access.js";
import { getDefaultTimezone } from "../lib/weekly-report-form.js";
import { ReportDefinitionFields } from "../components/system/report-definition-fields.js";
import { PageHeader } from "../components/system/page-header.js";
import { LoadErrorCallout } from "../components/system/load-error-callout.js";
import { PendingButton } from "../components/system/pending-button.js";
import { ResourceDeleteDialog } from "../components/system/resource-delete-dialog.js";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent
} from "../components/ui/card.js";
import { Button } from "../components/ui/button.js";
import { Notice } from "../components/ui/notice.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Field, FieldLabel, FieldDescription } from "../components/ui/field.js";
import { Checkbox } from "../components/ui/checkbox.js";
import type { MultiSelectOption } from "../components/system/multi-select.js";
function initial(recipientUserId?: string): CreateReportDefinition {
  return {
    name: "",
    cadence: "monthly",
    project_ids: [],
    recipient_user_ids: recipientUserId ? [recipientUserId] : [],
    privacy_mode: "full",
    source_collection_consent: false,
    schedule: { time: "09:00", timezone: getDefaultTimezone() },
    enabled: true
  };
}
function draft(record: ReportDefinitionRecord): CreateReportDefinition {
  return {
    name: record.name,
    cadence: record.cadence,
    project_ids: record.scope.map((item) => item.project_id),
    recipient_user_ids: record.recipient_user_ids,
    privacy_mode: record.privacy_mode,
    source_collection_consent: record.source_collection_consent,
    schedule: record.schedule,
    enabled: record.enabled,
    ...(record.weekly_overlap ? { weekly_overlap: record.weekly_overlap } : {})
  };
}
type Data = { key: string; projects: ProjectRecord[]; definition: ReportDefinitionRecord | null };
export function ReportEditorPage(): JSX.Element {
  const { definitionId } = useParams(),
    { session } = useSession(),
    navigate = useNavigate(),
    key = `${session?.user_id}:${session?.organization_id}:${definitionId ?? "new"}`,
    current = useReportContext(key);
  const [data, setData] = useState<Data | null>(null),
    [value, setValue] = useState(initial),
    [recipients, setRecipients] = useState<MultiSelectOption[]>([]),
    [recipientError, setRecipientError] = useState(false),
    [error, setError] = useState<string | null>(null),
    [loadError, setLoadError] = useState(false),
    [revision, setRevision] = useState(0),
    [resume, setResume] = useState(false),
    { pending, run } = usePendingAction(),
    requestId = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    setData(null);
    setValue(initial());
    setError(null);
    setLoadError(false);
    setResume(false);
    requestId.current = null;
    if (!session) return;
    void Promise.all([
      listProjects(),
      definitionId
        ? reportApi.definitions.get({ ...reportScope(session.organization_id), definitionId })
        : Promise.resolve(null)
    ])
      .then(([projects, definition]) => {
        if (active) {
          setData({ key, projects, definition });
          setValue(
            definition
              ? draft(definition)
              : initial(session.email_verified_at ? session.user_id : undefined)
          );
        }
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, [key, revision, definitionId, session?.organization_id]);
  const selected = value.project_ids.join(",");
  useEffect(() => {
    let active = true;
    setRecipients([]);
    setRecipientError(false);
    if (!session) return;
    const options = [{ value: session.user_id, label: session.email }];
    const load =
      session.role === "owner" || session.role === "admin"
        ? organizationApi.people(session.organization_id)
        : Promise.all(selected ? selected.split(",").map((id) => listProjectMembers(id)) : []).then(
            (groups) => groups.flat()
          );
    void load
      .then((people) => {
        if (active)
          setRecipients([
            ...new Map(
              [
                ...options,
                ...people.map((person) => ({ value: person.user_id, label: person.email }))
              ].map((option) => [option.value, option])
            ).values()
          ]);
      })
      .catch(() => {
        if (active) {
          setRecipients(options);
          setRecipientError(true);
        }
      });
    return () => {
      active = false;
    };
  }, [key, selected, session?.role, session?.user_id, session?.email, session?.organization_id]);
  const visible = data?.key === key ? data : null,
    projects = session && visible ? reportManageableProjects(visible.projects, session) : [],
    allowed =
      hasBusinessEntitlement(session?.organization_plan, session?.self_hosted) &&
      projects.length > 0 &&
      (!visible?.definition ||
        visible.definition.scope.every((item) =>
          projects.some((project) => project.project_id === item.project_id)
        ));
  const save = (event: FormEvent): void => {
    event.preventDefault();
    if (!session || !visible || !allowed) return;
    const context = key;
    void run(async () => {
      setError(null);
      const definition = CreateReportDefinitionSchema.safeParse({
        ...value,
        expected_organization_id: session.organization_id
      });
      if (!definition.success) {
        const issues = definition.error.issues;
        setError(
          issues.some((issue) => issue.message === "report_source_consent_required")
            ? "Agree to the bounded redacted source collection, or choose restricted mode."
            : issues.some((issue) => issue.path.includes("name"))
              ? "Enter a report name of up to 120 characters."
              : issues.some((issue) => issue.path.includes("project_ids"))
                ? "Select between one and ten different projects."
                : issues.some((issue) => issue.path.includes("recipient_user_ids"))
                  ? "Select at most ten different recipients."
                  : "Check the report settings and use a valid delivery time and IANA timezone."
        );
        return;
      }
      try {
        const scope = reportScope(session.organization_id);
        if (visible.definition)
          await reportApi.definitions.replace({
            ...scope,
            definitionId: visible.definition.id,
            definition: {
              ...definition.data,
              expected_version: visible.definition.version,
              resume_after_review: resume
            }
          });
        else {
          requestId.current ??= crypto.randomUUID();
          await reportApi.definitions.create({
            ...scope,
            requestId: requestId.current,
            definition: definition.data
          });
        }
        if (current.current === context) await navigate("/reports");
      } catch (reason) {
        if (current.current === context) setError(reportErrorMessage(reason));
      }
    });
  };
  const remove = (): void => {
    if (!visible?.definition || !session) return;
    const context = key;
    void run(async () => {
      setError(null);
      try {
        await reportApi.definitions.remove({
          ...reportScope(session.organization_id),
          definitionId: visible.definition!.id,
          expectedVersion: visible.definition!.version,
          expectedOrganizationId: session.organization_id
        });
        if (current.current === context) await navigate("/reports");
      } catch (reason) {
        if (current.current === context) setError(reportErrorMessage(reason));
      }
    });
  };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Choose projects, recipients, evidence and delivery. Changes apply to future reports. Switching to restricted evidence can permanently remove earlier full reports."
        actions={
          <Button asChild variant="outline">
            <Link to="/reports">All reports</Link>
          </Button>
        }
      />
      {loadError ? (
        <LoadErrorCallout
          title="Report settings could not be loaded"
          pending={false}
          onRetry={() => setRevision((item) => item + 1)}
        />
      ) : null}
      {!visible && !loadError ? <Skeleton className="h-48 w-full" /> : null}
      {visible && !allowed ? (
        <Notice tone="warning">
          Report editing requires Business and administration of every selected project. Existing
          archives remain subject to their own read access.
        </Notice>
      ) : null}
      {visible && allowed ? (
        <Card>
          <CardHeader>
            <CardTitle>{visible.definition ? "Edit report" : "New report"}</CardTitle>
            <CardDescription>
              Save these settings to reuse them. Full evidence is recommended and requires your
              consent.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-6" onSubmit={save}>
              <ReportDefinitionFields
                value={value}
                onChange={setValue}
                projects={projects.map((project) => ({
                  value: project.project_id,
                  label: project.name
                }))}
                recipients={recipients}
                disabled={pending}
              />
              {recipientError ? (
                <Notice tone="warning">
                  Some recipient choices could not be loaded. Existing selections are preserved; you
                  can retry by reloading the page.
                </Notice>
              ) : null}
              {visible.definition?.requires_owner_review ? (
                <Field orientation="horizontal">
                  <Checkbox
                    id="report-resume-review"
                    checked={resume}
                    disabled={pending || session?.role !== "owner"}
                    onCheckedChange={(checked) => setResume(checked === true)}
                  />
                  <div>
                    <FieldLabel htmlFor="report-resume-review">
                      I have reviewed the scope and authorise resuming
                    </FieldLabel>
                    <FieldDescription>
                      Only the current Owner can resume after a plan or access review.
                    </FieldDescription>
                  </div>
                </Field>
              ) : null}
              {error ? (
                <Notice tone="destructive" aria-label="Report settings error">
                  {error}
                </Notice>
              ) : null}
              <div className="flex flex-wrap items-center gap-3">
                <PendingButton type="submit" pending={pending} pendingLabel="Saving report">
                  Save report
                </PendingButton>
                {visible.definition ? (
                  <ResourceDeleteDialog
                    label="Delete definition"
                    description="This deletes the definition and all its retained report history, cancels pending work and delivery, and schedules private content removal. Delivered email cannot be recalled. Disable scheduling to retain archives instead."
                    disabled={pending}
                    onConfirm={remove}
                  />
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
