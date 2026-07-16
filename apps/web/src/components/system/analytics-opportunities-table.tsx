import { Link } from "react-router-dom";

import type { AnalyticsOpportunityRecord } from "../../lib/api.js";
import { Badge } from "../ui/badge.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "../ui/table.js";
import { ProjectColorTagDot } from "./project-color-tag-dot.js";

const PERCENT_FORMAT = new Intl.NumberFormat(undefined, {
  style: "percent",
  maximumFractionDigits: 0
});
const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short"
});

export function AnalyticsOpportunitiesTable({
  opportunities,
  ariaLabel = "Analytics opportunities",
  showProject = true
}: {
  opportunities: AnalyticsOpportunityRecord[];
  ariaLabel?: string;
  showProject?: boolean;
}): JSX.Element {
  return (
    <Table aria-label={ariaLabel} className={showProject ? "min-w-[1180px]" : "min-w-[960px]"}>
      <TableHeader>
        <TableRow>
          <TableHead>Opportunity</TableHead>
          {showProject ? <TableHead>Project</TableHead> : null}
          <TableHead>Service</TableHead>
          <TableHead>Environment</TableHead>
          <TableHead>Kind</TableHead>
          <TableHead>Severity</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Bundle state</TableHead>
          <TableHead className="text-right">Confidence</TableHead>
          <TableHead className="text-right">Last detected</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {opportunities.map((opportunity) => (
          <TableRow key={opportunity.opportunity_id}>
            <TableCell className="max-w-80 whitespace-normal">
              <Link
                to={opportunityDetailPath(opportunity)}
                className="font-medium text-foreground hover:underline"
              >
                {opportunity.title}
              </Link>
              <p className="mt-1 text-xs text-muted-foreground whitespace-normal">
                {opportunity.summary}
              </p>
            </TableCell>
            {showProject ? (
              <TableCell>
                <Link
                  to={`/projects/${opportunity.project_id}/analytics`}
                  className="inline-flex items-center gap-2 hover:underline"
                >
                  <ProjectColorTagDot colorTag={opportunity.project_color_tag} />
                  {opportunity.project_name}
                </Link>
              </TableCell>
            ) : null}
            <TableCell>{opportunity.service ?? "All"}</TableCell>
            <TableCell>{opportunity.environment ?? "All"}</TableCell>
            <TableCell>{formatAnalyticsLabel(opportunity.kind)}</TableCell>
            <TableCell>
              <Badge variant={opportunity.severity === "high" ? "warning" : "outline"}>
                {formatAnalyticsLabel(opportunity.severity)}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge variant="outline">{formatAnalyticsLabel(opportunity.status)}</Badge>
            </TableCell>
            <TableCell>
              <Badge variant={analyticsBundleStateVariant(opportunity.bundle_status)}>
                {formatAnalyticsBundleState(opportunity.bundle_status)}
              </Badge>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {PERCENT_FORMAT.format(opportunity.confidence)}
            </TableCell>
            <TableCell className="text-right whitespace-nowrap">
              {formatAnalyticsDate(opportunity.last_detected_at)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function opportunityDetailPath(opportunity: AnalyticsOpportunityRecord): string {
  return `/projects/${opportunity.project_id}/analytics/opportunities/${opportunity.opportunity_id}`;
}

export function formatAnalyticsBundleState(
  value: AnalyticsOpportunityRecord["bundle_status"]
): string {
  if (value === "completed") return "Ready";
  return formatAnalyticsLabel(value);
}

export function analyticsBundleStateVariant(
  value: AnalyticsOpportunityRecord["bundle_status"]
): "default" | "destructive" | "outline" | "secondary" {
  if (value === "completed") return "default";
  if (value === "failed") return "destructive";
  if (value === "pending" || value === "running") return "secondary";
  return "outline";
}

export function formatAnalyticsLabel(value: string): string {
  return value
    .split("_")
    .map((part) => (part.length === 0 ? part : `${part[0]!.toUpperCase()}${part.slice(1)}`))
    .join(" ");
}

export function formatAnalyticsDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : DATE_FORMAT.format(date);
}
