import { Link } from "react-router-dom";

import type { AnalyticsBundleGenerationRecord } from "../../lib/api.js";
import { Badge } from "../ui/badge.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table.js";
import { ProjectColorTagDot } from "./project-color-tag-dot.js";

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short"
});

export function AnalyticsBundlesTable({
  bundles,
  ariaLabel = "Analytics bundles",
  showProject = true
}: {
  bundles: AnalyticsBundleGenerationRecord[];
  ariaLabel?: string;
  showProject?: boolean;
}): JSX.Element {
  return (
    <Table aria-label={ariaLabel} className="min-w-[900px]">
      <TableHeader>
        <TableRow>
          <TableHead>Analysis</TableHead>
          {showProject ? <TableHead>Project</TableHead> : null}
          <TableHead>Service</TableHead>
          <TableHead>Environment</TableHead>
          <TableHead>State</TableHead>
          <TableHead>Related opportunity</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Completed</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {bundles.map((bundle) => {
          const scope = readBundleScope(bundle.analysis_spec);
          const detailPath = `/projects/${bundle.project_id}/analytics/bundles/${bundle.generation_id}`;
          return (
            <TableRow key={bundle.generation_id}>
              <TableCell>
                <Link to={detailPath} className="font-medium text-foreground hover:underline">
                  {formatAnalyticsLabel(bundle.analysis_kind)}
                </Link>
                {bundle.failure_reason === null ? null : (
                  <p className="mt-1 max-w-72 whitespace-normal text-xs text-muted-foreground">
                    {formatAnalyticsLabel(bundle.failure_reason)}
                  </p>
                )}
              </TableCell>
              {showProject ? (
                <TableCell>
                  <Link
                    to={`/projects/${bundle.project_id}/analytics/bundles`}
                    className="inline-flex items-center gap-2 hover:underline"
                  >
                    <ProjectColorTagDot colorTag={bundle.project_color_tag ?? null} />
                    {bundle.project_name ?? bundle.project_id}
                  </Link>
                </TableCell>
              ) : null}
              <TableCell>{scope.service ?? "All"}</TableCell>
              <TableCell>{scope.environment ?? "All"}</TableCell>
              <TableCell>
                <Badge variant={analyticsBundleStateVariant(bundle.status)}>
                  {bundle.status === "completed" ? "Ready" : formatAnalyticsLabel(bundle.status)}
                </Badge>
              </TableCell>
              <TableCell>
                {bundle.opportunity_id === null ? (
                  "None"
                ) : (
                  <Link
                    to={`/projects/${bundle.project_id}/analytics/opportunities/${bundle.opportunity_id}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    View opportunity
                  </Link>
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {formatAnalyticsDate(bundle.created_at)}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {bundle.completed_at === null
                  ? "Not completed"
                  : formatAnalyticsDate(bundle.completed_at)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function readBundleScope(analysisSpec: Record<string, unknown>): {
  service: string | null;
  environment: string | null;
} {
  const filters = analysisSpec["filters"];
  if (typeof filters !== "object" || filters === null || Array.isArray(filters)) {
    return { service: null, environment: null };
  }
  const record = filters as Record<string, unknown>;
  return {
    service: typeof record["service"] === "string" ? record["service"] : null,
    environment: typeof record["environment"] === "string" ? record["environment"] : null
  };
}

export function analyticsBundleStateVariant(
  value: AnalyticsBundleGenerationRecord["status"]
): "default" | "destructive" | "secondary" {
  if (value === "completed") return "default";
  if (value === "failed") return "destructive";
  return "secondary";
}

export function formatAnalyticsDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : DATE_FORMAT.format(date);
}

export function formatAnalyticsLabel(value: string): string {
  return value
    .split(/[._-]/u)
    .filter((part) => part.length > 0)
    .map((part) => `${part[0]!.toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
