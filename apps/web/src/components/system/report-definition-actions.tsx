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
            period: lastCompletedReportPeriod(definition.cadence, new Date().toISOString()),
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
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Generate the latest complete UTC {definition.cadence} period. Each generation or
        regeneration uses one of the workspace’s forty monthly reports.
      </p>
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
            <FieldDescription>
              Off by default for manual generation. Current access is checked again before delivery.
            </FieldDescription>
          </div>
        </Field>
      ) : null}
      <div>
        <PendingButton pending={pending} pendingLabel="Queueing report" onClick={generate}>
          Generate report
        </PendingButton>
      </div>
      {error ? <Notice tone="destructive">{error}</Notice> : null}
    </div>
  );
}
