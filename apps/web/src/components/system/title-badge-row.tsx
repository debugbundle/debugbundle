import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../lib/utils.js";

interface TitleBadgeRowProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title: ReactNode;
  badges?: ReactNode;
  titleAccessory?: ReactNode;
  actions?: ReactNode;
}

export function TitleBadgeRow({
  title,
  badges,
  titleAccessory,
  actions,
  className,
  ...props
}: TitleBadgeRowProps): JSX.Element {
  return (
    <div
      data-slot="title-badge-row"
      className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}
      {...props}
    >
      <div className="flex min-w-0 max-w-full items-center gap-2">
        <div className="min-w-0 break-words">{title}</div>
        {titleAccessory}
      </div>
      {badges}
      {actions == null ? null : (
        <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
