import { reportPolicy } from "../../../../../packages/smart-reports/src/report-policy.js";
import { useReportContext } from "../../lib/use-report-context.js";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ReportDefinitionRecord } from "../../../../../packages/smart-reports/src/report-definition.js";
import { lastCompletedReportPeriod } from "../../../../../packages/smart-reports/src/report-period.js";
import type { ReportRunCommandSchema } from "../../../../../packages/smart-reports/src/report-run.js";
import type { z } from "zod";
import { reportApi, reportScope, reportErrorMessage } from "../../lib/report-api.js";
import { useSession } from "../../lib/session.js";
import { usePendingAction } from "../../lib/use-pending-action.js";
import { PendingButton } from "./pending-button.js";
import { Notice } from "../ui/notice.js";
import { Checkbox } from "../ui/checkbox.js";
import { Field, FieldLabel, FieldDescription } from "../ui/field.js";
import { Dialog, DialogTrigger, DialogClose } from "../ui/dialog.js";
import { DialogFormContent } from "./dialog-form-content.js";
import { Button } from "../ui/button.js";
import { reportPeriodLabel } from "../../../../../packages/smart-reports/src/report-presentation.js";

/** One stable command survives a lost acknowledgement; a successful request navigates to its run. */
export function ReportDefinitionActions({
  definition
}: {
  definition: ReportDefinitionRecord;
}): JSX.Element {
  const { session } = useSession(),
    navigate = useNavigate(),
    { pending, run } = usePendingAction(),
    [error, setError] = useState<string | null>(null),
    [send, setSend] = useState(false),
    [period, setPeriod] = useState(() =>
      lastCompletedReportPeriod(definition.cadence, new Date().toISOString())
    ),
    command = useRef<z.input<typeof ReportRunCommandSchema> | null>(null);
  const key = `${session?.user_id}:${session?.organization_id}:${definition.id}`,
    current = useReportContext(key);
  const generate = (): void => {
    void run(async () => {
      const context = key;
      setError(null);
      try {
        if (
          !command.current ||
          command.current.expected_version !== definition.version ||
          command.current.send_email !== send
        )
          command.current = {
            request_id: crypto.randomUUID(),
            definition_id: definition.id,
            expected_version: definition.version,
            period,
            send_email: send,
            expected_organization_id: definition.organization_id
          };
        const saved = await reportApi.runs.generate({
          ...reportScope(definition.organization_id),
          command: command.current
        });
        if (current.current === context)
          await navigate(`/reports/${saved.organization_id}/${saved.id}`);
      } catch (reason) {
        if (current.current === context) setError(reportErrorMessage(reason));
      }
    });
  };
  return (
    <Dialog
      onOpenChange={(open) => {
        if (open && !command.current)
          setPeriod(lastCompletedReportPeriod(definition.cadence, new Date().toISOString()));
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" disabled={pending}>
          Generate report
        </Button>
      </DialogTrigger>
      <DialogFormContent
        title="Generate report"
        description={definition.name}
        busy={pending}
        onSubmit={(event) => {
          event.preventDefault();
          generate();
        }}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="outline" type="button" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <PendingButton type="submit" pending={pending} pendingLabel="Queueing report">
              Generate report
            </PendingButton>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <p className="font-medium">{reportPeriodLabel(command.current?.period ?? period)}</p>
          <p className="text-sm text-muted-foreground">
            Uses one report from your workspace allowance.{" "}
            {reportPolicy(session?.organization_plan, session?.self_hosted ?? false).ai
              ? "AI definitions may send selected evidence for analysis; saved factual definitions stay factual."
              : "This factual report makes no AI request."}
          </p>
        </div>
        {definition.recipient_user_ids.length ? (
          <Field orientation="horizontal">
            <Checkbox
              id={`send-${definition.id}`}
              checked={send}
              disabled={pending}
              onCheckedChange={(value) => setSend(value === true)}
            />
            <div>
              <FieldLabel htmlFor={`send-${definition.id}`}>Email the saved recipients</FieldLabel>
              <FieldDescription>Current access is checked again before delivery.</FieldDescription>
            </div>
          </Field>
        ) : null}
        {error ? <Notice tone="destructive">{error}</Notice> : null}
      </DialogFormContent>
    </Dialog>
  );
}
