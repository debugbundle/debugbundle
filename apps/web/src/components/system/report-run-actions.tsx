import { hasBusinessEntitlement } from "../../../../../packages/shared-types/src/tier-capabilities.js";
import { useReportContext } from "../../lib/use-report-context.js";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ReportRunRecord } from "../../../../../packages/smart-reports/src/report-run.js";
import type { ReportRunCommandSchema } from "../../../../../packages/smart-reports/src/report-run.js";
import type { z } from "zod";
import { reportApi, reportScope, reportErrorMessage } from "../../lib/report-api.js";
import { useSession } from "../../lib/session.js";
import { usePendingAction } from "../../lib/use-pending-action.js";
import { PendingButton } from "./pending-button.js";
import { ResourceDeleteDialog } from "./resource-delete-dialog.js";
import { Button } from "../ui/button.js";
import { Notice } from "../ui/notice.js";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction
} from "../ui/alert-dialog.js";
export function ReportRunActions({
  record,
  canManage,
  onChanged
}: {
  record: ReportRunRecord;
  canManage: boolean;
  onChanged: () => void;
}): JSX.Element | null {
  const { session } = useSession(),
    navigate = useNavigate(),
    { pending, run } = usePendingAction(),
    [error, setError] = useState<string | null>(null),
    command = useRef<z.input<typeof ReportRunCommandSchema> | null>(null),
    key = `${session?.user_id}:${session?.organization_id}:${record.id}`,
    current = useReportContext(key);
  const mutate = (action: "cancel" | "delete" | "regenerate"): void => {
    if (!canManage) return;
    const context = key,
      scope = reportScope(record.organization_id);
    void run(async () => {
      setError(null);
      try {
        if (action === "cancel") {
          await reportApi.runs.cancel({
            ...scope,
            runId: record.id,
            expectedOrganizationId: record.organization_id
          });
          if (current.current === context) onChanged();
        } else if (action === "delete") {
          await reportApi.runs.remove({
            ...scope,
            runId: record.id,
            expectedOrganizationId: record.organization_id
          });
          if (current.current === context) await navigate("/reports");
        } else {
          if (!command.current) {
            const definition = await reportApi.definitions.get({
              ...scope,
              definitionId: record.definition_id
            });
            if (current.current !== context) return;
            command.current = {
              request_id: crypto.randomUUID(),
              definition_id: definition.id,
              expected_version: definition.version,
              period: record.period,
              regenerate_from_run_id: record.id,
              send_email: false,
              expected_organization_id: record.organization_id
            };
          }
          const next = await reportApi.runs.generate({ ...scope, command: command.current });
          if (current.current === context)
            await navigate(`/reports/${next.organization_id}/${next.id}`);
        }
      } catch (reason) {
        if (current.current === context) setError(reportErrorMessage(reason));
      }
    });
  };
  if (!canManage) return null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {["queued", "processing"].includes(record.status) ? (
          <PendingButton variant="outline" pending={pending} onClick={() => mutate("cancel")}>
            Cancel report
          </PendingButton>
        ) : null}
        {hasBusinessEntitlement(session?.organization_plan, session?.self_hosted) &&
        !["queued", "processing", "expired"].includes(record.status) ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={pending}>
                Regenerate report
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Regenerate report</AlertDialogTitle>
                <AlertDialogDescription>
                  This creates another report for the same completed UTC period using the current
                  definition’s scope and settings. It consumes another monthly generation and may
                  send the bounded evidence to AI. It does not email recipients automatically.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction disabled={pending} onClick={() => mutate("regenerate")}>
                  Generate another report
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
        <ResourceDeleteDialog
          label="Delete report"
          description="This removes the entire report, stops pending work and delivery, and schedules private content deletion. Already paid or uncertain AI costs remain accounted for. Delivered email cannot be recalled."
          disabled={pending}
          onConfirm={() => mutate("delete")}
        />
      </div>
      {error ? <Notice tone="destructive">{error}</Notice> : null}
    </div>
  );
}
