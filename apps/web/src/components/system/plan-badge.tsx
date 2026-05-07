import { cn } from "../../lib/utils.js";

const labelByPlan = {
  free: "Free",
  solo: "Solo",
  team: "Team"
} as const;

const toneByPlan = {
  free: "border-border bg-muted text-muted-foreground",
  solo: "border-border bg-background text-foreground",
  team: "border-border bg-muted/70 text-foreground"
} as const;

export function PlanBadge({ plan }: { plan: "free" | "solo" | "team" }): JSX.Element {
  return (
    <span
      data-plan={plan}
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
        toneByPlan[plan]
      )}
    >
      {labelByPlan[plan]}
    </span>
  );
}