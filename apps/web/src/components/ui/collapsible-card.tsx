import { ChevronRightIcon } from "lucide-react";
import * as React from "react";

import { cn } from "../../lib/utils.js";
import { Card, CardContent, CardHeader, CardTitle } from "./card.js";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./collapsible.js";

interface CollapsibleCardProps extends Omit<
  React.ComponentProps<typeof Collapsible>,
  "asChild" | "children" | "className"
> {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
  triggerClassName?: string;
  contentClassName?: string;
}

function CollapsibleCard({
  title,
  description,
  children,
  className,
  headerClassName,
  triggerClassName,
  contentClassName,
  ...props
}: CollapsibleCardProps) {
  const descriptionId = React.useId();

  return (
    <Collapsible asChild {...props}>
      <Card className={className}>
        <CardHeader className={cn("gap-0", headerClassName)}>
          <CardTitle aria-label={title}>
            <CollapsibleTrigger
              aria-label={title}
              aria-describedby={description === undefined ? undefined : descriptionId}
              className={cn(
                "group/collapsible-card-trigger -m-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-2 rounded-md p-2 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
                triggerClassName
              )}
            >
              <ChevronRightIcon
                aria-hidden="true"
                className="size-4 shrink-0 transition-transform duration-200 group-data-[state=open]/collapsible-card-trigger:rotate-90 motion-reduce:transition-none"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-base leading-snug font-medium">{title}</span>
                {description === undefined ? null : (
                  <span
                    id={descriptionId}
                    className="mt-1 block text-sm leading-5 font-normal text-muted-foreground"
                  >
                    {description}
                  </span>
                )}
              </span>
            </CollapsibleTrigger>
          </CardTitle>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className={contentClassName}>{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export { CollapsibleCard, type CollapsibleCardProps };
