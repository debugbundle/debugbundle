import { useEffect, useMemo, useState } from "react";
import type { AnalyticsFilterOptionsResponse } from "../../../../packages/shared-types/src/analytics-filter-options.js";
import {
  defaultAnalyticsFilters,
  analyticsQueryFromDraft,
  type AnalyticsFilterDraft
} from "../lib/analytics-filter-form.js";
import { getAnalyticsFilterOptions } from "../lib/analytics-filter-options-api.js";

export interface AnalyticsFilterChoices {
  status: "loading" | "unavailable" | "invalid" | "ready";
  data: AnalyticsFilterOptionsResponse | null;
  retry: () => void;
}

export function useAnalyticsFilterOptions(
  projectId: string,
  draft: AnalyticsFilterDraft,
  enabled: boolean
): AnalyticsFilterChoices {
  const { last, relative, from, to, service, environment, granularity } = draft;
  const context = useMemo(
    () =>
      analyticsQueryFromDraft({
        ...defaultAnalyticsFilters,
        last,
        relative,
        from,
        to,
        service,
        environment,
        granularity
      }).query,
    [last, relative, from, to, service, environment, granularity]
  );
  const key = JSON.stringify([projectId, context]);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    status: AnalyticsFilterChoices["status"];
    data: AnalyticsFilterOptionsResponse | null;
  }>({ key: "", status: "loading", data: null });
  useEffect(() => {
    if (!enabled || context === null) return;
    const controller = new AbortController();
    let active = true;
    setState({ key, status: "loading", data: null });
    void getAnalyticsFilterOptions(projectId, context, controller.signal)
      .then((data) => {
        if (active) setState({ key, status: "ready", data });
      })
      .catch(() => {
        if (active) setState({ key, status: "unavailable", data: null });
      });
    return () => {
      active = false;
      controller.abort();
    };
    // Dimension selection does not reload its own choices; opening or changing scope does.
  }, [projectId, context, key, enabled, attempt]);
  return {
    ...(context === null
      ? { status: "invalid" as const, data: null }
      : state.key === key
        ? state
        : { status: "loading" as const, data: null }),
    retry: () => setAttempt((current) => current + 1)
  };
}
