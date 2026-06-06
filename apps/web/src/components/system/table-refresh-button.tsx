import { RefreshCwIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "../../lib/utils.js";
import { Button } from "../ui/button.js";

const MINIMUM_SPIN_DURATION_MS = 1_000;

export function TableRefreshButton({
  isLoading,
  onRefresh,
  label = "Refresh",
  className,
  mobileIconOnly = false
}: {
  isLoading: boolean;
  onRefresh: () => Promise<void> | void;
  label?: string;
  className?: string;
  mobileIconOnly?: boolean;
}): JSX.Element {
  const [refreshStartedAt, setRefreshStartedAt] = useState<number | null>(null);
  const [isAwaitingRefresh, setIsAwaitingRefresh] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => () => clearSpinTimeout(timeoutRef), []);

  useEffect(() => {
    if (refreshStartedAt === null || isAwaitingRefresh || isLoading) {
      return;
    }

    const remainingDuration = MINIMUM_SPIN_DURATION_MS - (Date.now() - refreshStartedAt);

    if (remainingDuration <= 0) {
      setRefreshStartedAt(null);
      return;
    }

    clearSpinTimeout(timeoutRef);
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      setRefreshStartedAt(null);
    }, remainingDuration);

    return () => clearSpinTimeout(timeoutRef);
  }, [isAwaitingRefresh, isLoading, refreshStartedAt]);

  const isSpinning = refreshStartedAt !== null;

  async function handleRefreshClick(): Promise<void> {
    if (isLoading || isSpinning) {
      return;
    }

    clearSpinTimeout(timeoutRef);

    setRefreshStartedAt(Date.now());
    setIsAwaitingRefresh(true);

    try {
      await Promise.resolve(onRefresh());
    } finally {
      setIsAwaitingRefresh(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("gap-1.5", mobileIconOnly && "size-7 px-0 sm:w-auto sm:px-2.5", className)}
      disabled={isLoading || isSpinning}
      aria-busy={isSpinning}
      aria-label={label}
      onClick={() => void handleRefreshClick()}
    >
      <RefreshCwIcon className={cn("size-4", isSpinning && "animate-spin")} aria-hidden="true" />
      <span className={mobileIconOnly ? "sr-only sm:not-sr-only" : undefined}>{label}</span>
    </Button>
  );
}

function clearSpinTimeout(timeoutRef: React.MutableRefObject<number | null>): void {
  if (timeoutRef.current !== null) {
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }
}
