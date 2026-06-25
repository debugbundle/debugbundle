import { cn } from "../../lib/utils.js";
import { Button } from "../ui/button.js";

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
  description,
  actionLabel,
  actionAriaLabel,
  onAction
}: {
  label: string;
  used: number;
  limit: number;
  description: string;
  actionLabel?: string;
  actionAriaLabel?: string;
  onAction?: () => void;
}): JSX.Element {
  const percent = clampPercent(used, limit);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{label}</p>
            {actionLabel === undefined || onAction === undefined ? null : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={actionAriaLabel}
                onClick={onAction}
              >
                {actionLabel}
              </Button>
            )}
          </div>
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
