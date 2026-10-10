import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { PublicStatusProject } from "../../../../../packages/shared-types/src/public-status.js";
import {
  formatHealthStatusLabel,
  formatStatusDayLabel,
  formatStatusUptime
} from "../../../../../packages/shared-types/src/availability-health.js";
import { cn } from "../../lib/utils.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip.js";

type Day = PublicStatusProject["days"][number];
type State = PublicStatusProject["current_state"];
export function HealthStatusProjectRow({
  project,
  expanded,
  onToggle,
  name,
  subtitle,
  action,
  checkDescriptions,
  showVerifiedAt = false
}: {
  project: PublicStatusProject;
  expanded: boolean;
  onToggle: () => void;
  name?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  checkDescriptions?: Record<string, string>;
  showVerifiedAt?: boolean;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-5">
        <div className="flex min-w-0 items-center gap-2 lg:max-w-sm lg:shrink-0">
          {project.checks.length > 1 ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`${expanded ? "Collapse" : "Expand"} ${project.name} checks`}
              aria-expanded={expanded}
              onClick={onToggle}
            >
              {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
            </Button>
          ) : null}
          <div className="min-w-0">
            <div>{name ?? project.name}</div>
            <p className="text-xs text-muted-foreground">
              {subtitle ??
                `${project.checks.length} health check${project.checks.length === 1 ? "" : "s"}`}
            </p>
            {showVerifiedAt ? <VerifiedAt value={project.last_verified_at} /> : null}
          </div>
        </div>
        <StatusHistoryStrip
          days={project.days}
          label={`${project.name} health history`}
          scope="project"
        />
        <div className="flex items-center justify-between gap-3 lg:shrink-0 lg:justify-end">
          <StatusBadge state={project.current_state} />
          <StatusUptime value={project.uptime_percentage} />
          {action}
        </div>
      </div>
      {expanded && project.checks.length > 1 ? (
        <div className="ml-0 flex flex-col gap-2 rounded-lg border border-border/80 bg-muted/20 p-3 sm:ml-9">
          {project.checks.map((check) => (
            <div
              key={check.key}
              className="flex flex-col gap-3 rounded-md px-1 py-2 lg:flex-row lg:items-center lg:gap-5"
            >
              <div className="min-w-0 lg:max-w-xs lg:shrink-0">
                <p className="truncate text-sm font-medium text-foreground">{check.name}</p>
                {checkDescriptions?.[check.key] ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {checkDescriptions[check.key]}
                  </p>
                ) : null}
                {showVerifiedAt ? <VerifiedAt value={check.last_verified_at} /> : null}
              </div>
              <StatusHistoryStrip
                days={check.days}
                label={`${check.name} health history`}
                compact
              />
              <div className="flex items-center justify-between gap-3 lg:shrink-0 lg:justify-end">
                <StatusBadge state={check.current_state} />
                <StatusUptime value={check.uptime_percentage} />
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
export function StatusHistoryStrip({
  days,
  label,
  compact = false,
  scope = "check"
}: {
  days: Day[];
  label: string;
  compact?: boolean;
  scope?: "check" | "project";
}): JSX.Element {
  return (
    <div className="min-w-0 w-full flex-1" role="group" aria-label={label}>
      <div className="flex min-w-0 w-full gap-0.5">
        {days.map((day) => (
          // Daily details are plain text. A hover corridor can suppress the next narrow day.
          <Tooltip key={day.day} disableHoverableContent>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={formatStatusDayLabel(day, scope)}
                className={cn(
                  "h-5 min-w-1 flex-1 rounded-[2px] border outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                  compact ? "sm:h-4" : "sm:h-5",
                  statusDayClassName(day)
                )}
              />
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6}>
              {formatStatusDayLabel(day, scope)}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
function StatusBadge({ state }: { state: State }): JSX.Element {
  const variant =
    state === "operational"
      ? "success"
      : state === "degraded"
        ? "warning"
        : state === "down"
          ? "destructive"
          : state === "paused"
            ? "secondary"
            : "outline";
  return <Badge variant={variant}>{formatHealthStatusLabel(state)}</Badge>;
}
function StatusUptime({ value }: { value: number | null }): JSX.Element {
  return (
    <div className="min-w-24 text-right">
      <p className="text-sm font-medium text-foreground">{formatStatusUptime(value)}</p>
      <p className="text-xs text-muted-foreground">30-day uptime</p>
    </div>
  );
}
function VerifiedAt({ value }: { value: string | null }): JSX.Element {
  return (
    <p className="text-xs text-muted-foreground">
      {value === null ? (
        "Awaiting verified data"
      ) : (
        <>
          Last verified <time dateTime={value}>{new Date(value).toLocaleString()}</time>
        </>
      )}
    </p>
  );
}
function statusDayClassName(day: Day): string {
  if (day.impact === "outage") return "border-destructive/80 bg-destructive";
  if (day.impact === "elevated") return "border-warning bg-warning";
  if (day.impact === "minor") return "border-warning/60 bg-warning/55";
  if (day.state === "operational") return "border-success/80 bg-success";
  if (day.state === "paused") return "border-border bg-muted";
  return "border-border/60 bg-muted/40";
}
