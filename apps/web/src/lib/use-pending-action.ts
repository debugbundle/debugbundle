import { useCallback, useEffect, useRef, useState } from "react";

/** Lock immediately, including repeated form submits before React has rendered disabled controls. */
export function usePendingAction(): {
  pending: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
} {
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const run = useCallback(async (action: () => Promise<void>) => {
    if (locked.current || !active.current) return;
    locked.current = true;
    setPending(true);
    try {
      await action();
    } finally {
      locked.current = false;
      if (active.current) setPending(false);
    }
  }, []);
  return { pending, run };
}
