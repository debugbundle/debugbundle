import type { LucideIcon } from "lucide-react";

import { Button } from "../ui/button.js";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "../ui/empty.js";

export interface ResourceEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  variant?: "default" | "outlined";
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
}

export function ResourceEmptyState({
  icon: Icon,
  title,
  description,
  variant = "default",
  actionLabel,
  onAction,
  actionDisabled = false
}: ResourceEmptyStateProps): JSX.Element {
  const hasAction = actionLabel !== undefined && onAction !== undefined;

  return (
    <Empty
      className={
        variant === "outlined"
          ? "min-h-[11rem] justify-center border border-dashed border-border/80 bg-background/50"
          : undefined
      }
    >
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {hasAction ? (
        <EmptyContent>
          <Button type="button" onClick={onAction} disabled={actionDisabled}>
            {actionLabel}
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
