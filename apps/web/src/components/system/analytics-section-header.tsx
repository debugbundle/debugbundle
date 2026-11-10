import type { ReactNode } from "react";

import { cn } from "../../lib/utils.js";
import { TableRefreshButton } from "./table-refresh-button.js";

export function AnalyticsSectionHeader({
  title,
  headingId,
  description,
  isLoading,
  onRefresh,
  actions
}: {
  title: string;
  headingId?: string;
  description: string;
  isLoading: boolean;
  onRefresh: () => Promise<void> | void;
  actions?: ReactNode;
}): JSX.Element {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id={headingId} className="text-lg font-medium">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div
        className={cn(
          "flex shrink-0 flex-wrap items-center justify-end gap-2",
          actions === undefined ? null : "col-span-2 lg:col-auto"
        )}
      >
        <TableRefreshButton isLoading={isLoading} onRefresh={onRefresh} mobileIconOnly />
        {actions}
      </div>
    </div>
  );
}
