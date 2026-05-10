import { CheckCircle2Icon, CircleAlertIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";
import type { HTMLAttributes } from "react";

import { cn } from "../../lib/utils.js";

type NoticeTone = "info" | "success" | "warning" | "destructive";

const toneClasses: Record<NoticeTone, string> = {
  info: "border-info/20 bg-info/8 text-foreground",
  success: "border-success/20 bg-success/8 text-foreground",
  warning: "border-warning/30 bg-warning/12 text-foreground",
  destructive: "border-destructive/20 bg-destructive/8 text-foreground"
};

const toneIcons = {
  info: InfoIcon,
  success: CheckCircle2Icon,
  warning: TriangleAlertIcon,
  destructive: CircleAlertIcon
} as const;

export interface NoticeProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  tone?: NoticeTone;
}

export function Notice({
  children,
  className,
  title,
  tone = "info",
  role,
  ...props
}: NoticeProps): JSX.Element {
  const Icon = toneIcons[tone];

  return (
    <div
      data-slot="notice"
      data-tone={tone}
      role={role ?? (tone === "destructive" || tone === "warning" ? "alert" : "status")}
      className={cn("flex items-start gap-3 rounded-lg border px-3 py-2.5", toneClasses[tone], className)}
      {...props}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-1">
        {title === undefined ? null : <p className="text-sm font-medium">{title}</p>}
        <div className="text-sm leading-normal text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}