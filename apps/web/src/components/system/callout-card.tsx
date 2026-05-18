import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../lib/utils.js";
import { Badge } from "../ui/badge.js";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card.js";

type CalloutTone = "info" | "neutral" | "success" | "warning" | "destructive";

const toneMap: Record<CalloutTone, string> = {
  info: "border-info/25 bg-info/8",
  neutral: "border-border bg-muted/40",
  success: "border-success/25 bg-success/8",
  warning: "border-warning/30 bg-warning/12",
  destructive: "border-destructive/25 bg-destructive/8"
};

export interface CalloutCardProps extends HTMLAttributes<HTMLDivElement> {
  eyebrow: string;
  title: string;
  description: string;
  tone?: CalloutTone;
  titleAccessory?: ReactNode;
}

export function CalloutCard({
  className,
  eyebrow,
  title,
  description,
  tone = "info",
  titleAccessory,
  children,
  ...props
}: CalloutCardProps): JSX.Element {
  return (
    <Card data-tone={tone} className={cn(toneMap[tone], className)} {...props}>
      <CardHeader>
        <Badge
          variant={
            tone === "destructive"
              ? "destructive"
              : tone === "warning"
                ? "warning"
                : tone === "success"
                  ? "success"
                  : tone === "neutral"
                    ? "outline"
                    : "default"
          }
        >
          {eyebrow}
        </Badge>
        <div className="flex items-center gap-2">
          <CardTitle>{title}</CardTitle>
          {titleAccessory}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{description}</p>
        {children}
      </CardContent>
    </Card>
  );
}