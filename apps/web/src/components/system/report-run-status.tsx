import type { ReportRunRecord } from "../../../../../packages/smart-reports/src/report-run.js";
import { reportRunPresentation } from "../../../../../packages/smart-reports/src/report-presentation.js";
import { Badge } from "../ui/badge.js";
import { useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip.js";

export function ReportRunStatus({
  run,
  description = "none"
}: {
  run: Pick<ReportRunRecord, "status" | "skip_reason">;
  description?: "none" | "tooltip";
}): JSX.Element {
  const state = reportRunPresentation(run);
  const [open, setOpen] = useState(false);
  const variant = state.tone === "info" ? "outline" : state.tone;
  if (description === "none") return <Badge variant={variant}>{state.label}</Badge>;
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <Badge asChild variant={variant} className="cursor-help">
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              setOpen((value) => !value);
            }}
          >
            {state.label}
          </button>
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" sideOffset={6}>
        {state.description}
      </TooltipContent>
    </Tooltip>
  );
}
