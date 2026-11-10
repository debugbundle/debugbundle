import {
  CheckCircle2Icon,
  CircleAlertIcon,
  InfoIcon,
  LoaderCircleIcon,
  TriangleAlertIcon
} from "lucide-react";
import type { HTMLAttributes } from "react";

import { cn } from "../../lib/utils.js";

type NoticeTone = "info" | "success" | "warning" | "destructive";

const neutralToneClasses = "border-border bg-muted/40 text-foreground";

const toneClasses: Record<NoticeTone, string> = {
  info: neutralToneClasses,
  success: neutralToneClasses,
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
  pending?: boolean;
}

export function Notice({
  children,
  className,
  title,
  tone = "info",
  pending = false,
  role,
  ...props
}: NoticeProps): JSX.Element {
  const Icon = pending ? LoaderCircleIcon : toneIcons[tone];

  return (
    <div
      data-slot="notice"
      data-tone={tone}
      role={role ?? (tone === "destructive" || tone === "warning" ? "alert" : "status")}
      className={cn(
        "flex items-start gap-3 rounded-lg border px-3 py-2.5",
        toneClasses[tone],
        className
      )}
      {...props}
    >
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          pending && "animate-spin motion-reduce:animate-none"
        )}
        aria-hidden="true"
      />
      <div className="flex min-w-0 flex-col gap-1">
        {title === undefined ? null : <p className="text-sm font-medium">{title}</p>}
        <div className="text-sm leading-normal text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}
