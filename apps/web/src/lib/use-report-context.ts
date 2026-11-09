import { useEffect, useRef } from "react";
/** Invalidate late report-action completions on navigation and account changes. */
export function useReportContext(key: string): { current: string | null } {
  const current = useRef<string | null>(key);
  current.current = key;
  useEffect(() => {
    current.current = key;
    return () => {
      current.current = null;
    };
  }, [key]);
  return current;
}
