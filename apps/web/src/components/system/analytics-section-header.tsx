import type { ReactNode } from "react";

import { cn } from "../../lib/utils.js";
import { TableRefreshButton } from "./table-refresh-button.js";

export function AnalyticsSectionHeader({
  title,
  description,
  isLoading,
  onRefresh,
  actions
}: {
  title: string;
  description: string;
  isLoading: boolean;
  onRefresh: () => Promise<void> | void;
  actions?: ReactNode;
}): JSX.Element {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
      <div className="min-w-0 space-y-1">
        <h2 className="text-lg font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div
        className={cn(
          "flex shrink-0 flex-wrap items-center justify-end gap-2",
          actions === undefined ? null : "col-span-2 sm:col-auto"
        )}
      >
        {actions}
        <TableRefreshButton isLoading={isLoading} onRefresh={onRefresh} mobileIconOnly />
      </div>
    </div>
  );
}
