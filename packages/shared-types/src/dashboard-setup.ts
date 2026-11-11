import { z } from "zod";

const preferencesSchema = z
  .object({
    version: z.literal(1),
    welcomeSeen: z.boolean(),
    sidebarHidden: z.boolean(),
    incidentReceived: z.boolean()
  })
  .strict();

export type DashboardSetupPreferences = z.infer<typeof preferencesSchema>;

/** Presentation preferences only. No credential, permission or account state is stored here. */
export function parseDashboardSetupPreferences(value: string | null): DashboardSetupPreferences {
  try {
    const result = preferencesSchema.safeParse(value === null ? null : JSON.parse(value));
    if (result.success) return result.data;
  } catch {
    /* Invalid or older browser preferences start a fresh display state. */
  }
  return { version: 1, welcomeSeen: false, sidebarHidden: false, incidentReceived: false };
}

export interface DashboardSetupFacts {
  accessToken: boolean | null;
  project: boolean | null;
  incident: boolean | null;
  analytics: boolean | null;
  analyticsProjectId: string | null;
  offerAnalytics: boolean;
  improvements: boolean | null;
  reports: boolean | null;
  offerImprovements: boolean;
  offerReports: boolean;
}

export interface DashboardSetupStep {
  id: "access-token" | "project" | "incident" | "analytics" | "improvements" | "reports";
  title: string;
  description: string;
  href: string;
  action: string;
  optional: boolean;
  status: "complete" | "pending" | "unavailable";
}

export function dashboardSetupProgress(facts: DashboardSetupFacts): {
  steps: DashboardSetupStep[];
  completed: number;
  total: number;
  ready: boolean;
  next: DashboardSetupStep | undefined;
} {
  const status = (value: boolean | null): DashboardSetupStep["status"] =>
    value === null ? "unavailable" : value ? "complete" : "pending";
  const steps: DashboardSetupStep[] = [
    {
      id: "access-token",
      title: "Create an Access token",
      description: "Give your agent the access it needs for your chosen projects.",
      href: "/access-tokens",
      action: "Open Access tokens",
      optional: false,
      status: status(facts.accessToken)
    },
    {
      id: "project",
      title: "Set up your first project",
      description: "Use the setup prompt with your agent, or open Projects to get started.",
      href: "/projects",
      action: "Open projects",
      optional: false,
      status: status(facts.project)
    },
    {
      id: "incident",
      title: "Receive your first incident",
      description: "Ask your agent to verify capture with a safe test from your app.",
      href: "/incidents",
      action: "Open incidents",
      optional: false,
      status: status(facts.incident)
    }
  ];
  if (facts.offerAnalytics)
    steps.push({
      id: "analytics",
      title: "Enable analytics in one project",
      description: "Review a project's analytics and privacy settings before enabling capture.",
      href:
        facts.analyticsProjectId === null
          ? "/projects"
          : `/projects/${facts.analyticsProjectId}/settings#analytics-settings`,
      action: facts.analyticsProjectId === null ? "Choose a project" : "Open analytics settings",
      optional: true,
      status: status(facts.analytics)
    });
  if (facts.offerImprovements)
    steps.push({
      id: "improvements",
      title: "Enable Smart Improvements",
      description: "Choose projects and review the evidence settings for weekly reviews.",
      href: "/improvements/reviews",
      action: "Review settings",
      optional: true,
      status: status(facts.improvements)
    });
  if (facts.offerReports)
    steps.push({
      id: "reports",
      title: "Set up Reports",
      description: "Choose your projects, recipients and a schedule available on your plan.",
      href: "/reports",
      action: "Open reports",
      optional: true,
      status: status(facts.reports)
    });
  const essential = steps.filter((step) => !step.optional);
  const completed = essential.filter((step) => step.status === "complete").length;
  return {
    steps,
    completed,
    total: essential.length,
    ready: completed === essential.length,
    next: essential.find((step) => step.status !== "complete")
  };
}

/** The dashboard hands off instructions, never browser sessions or token plaintext. */
export const DASHBOARD_SETUP_PROMPT = [
  "Help me set up DebugBundle for this application's repository.",
  "Read https://debugbundle.com/docs/quickstart and the relevant SDK guide first, then inspect the existing integration.",
  "Connect this app to my DebugBundle account and workspace, reusing the correct project and existing authorised connection where possible. Keep related services together.",
  "If you need authentication or additional setup permissions, explain the required step and wait for me. Keep credentials out of chat, source control and browser code.",
  "Verify capture with a safe test through the app's SDK, then show me the received incident and its debug bundle. Confirm before deploying or changing a live application.",
  "Finish with what is connected and any remaining steps. Propose optional analytics, Smart Improvements or Reports only where my plan allows them, and wait for my approval before enabling them."
].join("\n\n");
