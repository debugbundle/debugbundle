import { cn } from "../../lib/utils.js";

function usageTone(used: number, limit: number): string {
  if (limit === 0) {
    return "bg-muted";
  }

  const ratio = used / limit;
  if (ratio >= 1) {
    return "bg-destructive";
  }
  if (ratio >= 0.8) {
    return "bg-warning";
  }

  return "bg-foreground/70";
}

function clampPercent(used: number, limit: number): number {
  if (limit <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
}

export function UsageMeter({
  label,
  used,
  limit,
  description
}: {
  label: string;
  used: number;
  limit: number;
  description: string;
}): JSX.Element {
  const percent = clampPercent(used, limit);

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <p className="text-sm font-medium">
          {used} of {limit}
        </p>
      </div>
      <div className="h-2 rounded-full bg-muted">
        <div
          className={cn("h-2 rounded-full transition-[width]", usageTone(used, limit))}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}