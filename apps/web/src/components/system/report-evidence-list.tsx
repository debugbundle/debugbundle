import { MetadataSeparator } from "./metadata-separator.js";
import type {
  ReportModelEvidence,
  ReportModelFacts
} from "../../../../../packages/smart-reports/src/model-evidence.js";
import { Badge } from "../ui/badge.js";

export function ReportEvidenceList({
  items,
  projects
}: {
  items: ReportModelEvidence[];
  projects: ReportModelFacts["projects"];
}): JSX.Element {
  return items.length ? (
    <ul className="flex flex-col divide-y">
      {items.map((item) => (
        <li key={item.ref} className="flex min-w-0 flex-col gap-2 py-3 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={item.severity === "critical" ? "destructive" : "outline"}>
              {item.severity}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {projects.find((project) => project.ref === item.project_ref)?.name}
              <MetadataSeparator />
              {item.status.replaceAll("_", " ")}
            </span>
          </div>
          <a
            className="min-w-0 break-words text-sm font-medium underline underline-offset-4"
            href={`#ref-${item.ref}`}
          >
            {item.title}
          </a>
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-sm text-muted-foreground">
      No selected evidence in this category. Check coverage before interpreting missing
      observations.
    </p>
  );
}

export function ReportReferences({ values }: { values: string[] }): JSX.Element {
  return (
    <span className="text-xs text-muted-foreground">
      {values.map((value, index) => (
        <span key={value}>
          {index ? <MetadataSeparator /> : " "}
          <a
            className="underline underline-offset-4"
            href={`#ref-${value}`}
            aria-label={`Evidence ${value}`}
          >
            {value}
          </a>
        </span>
      ))}
    </span>
  );
}
