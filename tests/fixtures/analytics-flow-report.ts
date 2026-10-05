import type {
  AnalyticsFlowDefinition,
  AnalyticsFlowReport
} from "../../packages/shared-types/src/index.js";
export const flowDefinition: AnalyticsFlowDefinition = {
  id: "22222222-2222-4222-8222-222222222222",
  project_id: "11111111-1111-4111-8111-111111111111",
  flow_key: "reading",
  display_name: "Main site to blog",
  kind: "acquisition",
  timeout_minutes: 60,
  version: 1,
  archived_at: null,
  steps: [
    { step_key: "home", display_name: "Home", origin: "https://www.customer.test" },
    { step_key: "blog", display_name: "Blog", origin: "https://blog.customer.test" }
  ]
};
export const flowInput = {
  flow_key: flowDefinition.flow_key,
  display_name: flowDefinition.display_name,
  kind: flowDefinition.kind,
  timeout_minutes: flowDefinition.timeout_minutes,
  steps: flowDefinition.steps
};
export const flowReport: AnalyticsFlowReport = {
  flow: flowDefinition,
  window: {
    from: "2026-09-01T00:00:00.000Z",
    to: "2026-10-01T00:00:00.000Z",
    previous_from: "2026-08-02T00:00:00.000Z"
  },
  starts: 10,
  previous_starts: 8,
  completions: 4,
  steps: [
    {
      step_key: "home",
      display_name: "Home",
      reached: 10,
      previous_reached: 8,
      unlinked: 0,
      dropoff: 6,
      average_seconds: null
    },
    {
      step_key: "blog",
      display_name: "Blog",
      reached: 4,
      previous_reached: 3,
      unlinked: 2,
      dropoff: 0,
      average_seconds: 30
    }
  ],
  sources: [{ source: "newsletter", campaign: "launch", starts: 10, completions: 4 }],
  coverage: {
    observation: "explicit_integration_signals",
    incomplete: true,
    sources_truncated: false
  }
};
