import type { HTMLAttributes } from "react";

import { cn } from "../../lib/utils.js";

export interface PageHeaderProps extends HTMLAttributes<HTMLDivElement> {
  description?: string;
  actions?: React.ReactNode;
}

export function PageHeader({
  className,
  description,
  actions,
  ...props
}: PageHeaderProps): JSX.Element | null {
  const hasDescription = typeof description === "string" && description.trim().length > 0;

  if (!hasDescription && actions === undefined) {
    return null;
  }

  return (
    <div
      data-slot="page-header"
      className={cn(
        "flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between",
        className
      )}
      {...props}
    >
      {!hasDescription ? null : (
        <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
      )}
      {actions === undefined ? null : (
        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:ml-auto lg:justify-end">
          {actions}
        </div>
      )}
    </div>
  );
}
