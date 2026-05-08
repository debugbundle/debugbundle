import { useEffect, useState } from "react";

const DEFAULT_DELAY_MS = 150;

export function useDelayedVisibility(isVisible: boolean, delayMs = DEFAULT_DELAY_MS): boolean {
  const [isDelayedVisible, setIsDelayedVisible] = useState(false);

  useEffect(() => {
    if (!isVisible) {
      setIsDelayedVisible(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsDelayedVisible(true);
    }, delayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [delayMs, isVisible]);

  return isDelayedVisible;
}