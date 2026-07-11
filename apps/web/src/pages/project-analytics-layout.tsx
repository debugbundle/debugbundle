import { Settings2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate, useOutletContext } from "react-router-dom";

import { CalloutCard } from "../components/system/callout-card.js";
import { PlanUpgradeCallout } from "../components/system/plan-upgrade-callout.js";
import type { ProjectContext } from "../components/system/project-layout.js";
import { Button } from "../components/ui/button.js";
import { Field, FieldGroup, FieldLabel } from "../components/ui/field.js";
import { Input } from "../components/ui/input.js";
import { Notice } from "../components/ui/notice.js";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../components/ui/select.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs.js";
import {
  getProjectAnalyticsSettings,
  type AnalyticsMetricsQuery,
  type ProjectAnalyticsSettingsResponse
} from "../lib/api.js";

interface AnalyticsFilters {
  last: "7d" | "30d" | "90d";
  service: string;
  environment: string;
}

export interface ProjectAnalyticsContext {
  projectId: string;
  query: AnalyticsMetricsQuery;
}

const analyticsSections = [
  { value: "overview", label: "Overview", suffix: "" },
  { value: "routes", label: "Routes", suffix: "/routes" },
  { value: "audiences", label: "Audiences", suffix: "/audiences" }
] as const;

const timeWindowOptions: Array<{ value: AnalyticsFilters["last"]; label: string }> = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" }
];

const defaultFilters: AnalyticsFilters = {
  last: "30d",
  service: "",
  environment: ""
};

export function ProjectAnalyticsLayout(): JSX.Element {
  const { project, projectId } = useOutletContext<ProjectContext>();
  const location = useLocation();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<ProjectAnalyticsSettingsResponse | null>(null);
  const [settingsError, setSettingsError] = useState(false);
  const [settingsAttempt, setSettingsAttempt] = useState(0);
  const [draftFilters, setDraftFilters] = useState(defaultFilters);
  const [filters, setFilters] = useState(defaultFilters);

  useEffect(() => {
    let active = true;
    setSettings(null);
    setSettingsError(false);

    void getProjectAnalyticsSettings(projectId)
      .then((response) => {
        if (active) setSettings(response);
      })
      .catch(() => {
        if (active) setSettingsError(true);
      });

    return () => {
      active = false;
    };
  }, [projectId, settingsAttempt]);

  const activeSection = location.pathname.endsWith("/routes")
    ? "routes"
    : location.pathname.endsWith("/audiences")
      ? "audiences"
      : "overview";
  const query: AnalyticsMetricsQuery = {
    last: filters.last,
    granularity: "day",
    limit: activeSection === "overview" ? 5 : 100,
    ...(filters.service.length === 0 ? {} : { service: filters.service }),
    ...(filters.environment.length === 0 ? {} : { environment: filters.environment })
  };

  function applyFilters(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFilters({
      last: draftFilters.last,
      service: draftFilters.service.trim(),
      environment: draftFilters.environment.trim()
    });
  }

  function changeSection(value: string): void {
    const section = analyticsSections.find((candidate) => candidate.value === value);
    if (section !== undefined) {
      void navigate(`/projects/${projectId}/analytics${section.suffix}`);
    }
  }

  if (settings === null) {
    if (!settingsError) return <ProjectAnalyticsLayoutSkeleton />;
    return (
      <Notice title="Analytics settings unavailable" tone="destructive">
        <div className="flex flex-col items-start gap-2">
          <p>Could not determine whether analytics is available for this project.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSettingsAttempt((attempt) => attempt + 1)}
          >
            Retry
          </Button>
        </div>
      </Notice>
    );
  }

  if (!settings.analytics_available) {
    return (
      <PlanUpgradeCallout
        title="Upgrade to Solo or Team to unlock product analytics"
        description="Product analytics capture, aggregate metrics, journey evidence, and AnalyticsBundles are available on paid plans."
      />
    );
  }

  if (!settings.settings.enabled) {
    return (
      <CalloutCard
        eyebrow="Analytics disabled"
        title="Analytics capture is off"
        description="Enable project analytics before aggregate usage and journey signals can appear here. Debug incident capture remains independent."
        tone="neutral"
      >
        <Button asChild type="button" variant="outline" size="sm">
          <Link to={`/projects/${projectId}/settings`}>
            <Settings2Icon data-icon="inline-start" />
            Open analytics settings
          </Link>
        </Button>
      </CalloutCard>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Tabs value={activeSection} onValueChange={changeSection}>
        <TabsList variant="line" aria-label="Analytics sections">
          {analyticsSections.map((section) => (
            <TabsTrigger key={section.value} value={section.value}>
              {section.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <form className="flex flex-col gap-4" onSubmit={applyFilters}>
        <FieldGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[12rem_1fr_1fr_auto] lg:items-end">
          <Field>
            <FieldLabel id="analytics-window-label" htmlFor="analytics-window">
              Time window
            </FieldLabel>
            <Select
              value={draftFilters.last}
              onValueChange={(last) =>
                setDraftFilters((current) => ({
                  ...current,
                  last: last as AnalyticsFilters["last"]
                }))
              }
            >
              <SelectTrigger
                id="analytics-window"
                aria-labelledby="analytics-window-label analytics-window"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectGroup>
                  {timeWindowOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="analytics-service">Service</FieldLabel>
            <Input
              id="analytics-service"
              value={draftFilters.service}
              placeholder="All services"
              maxLength={120}
              onChange={(event) =>
                setDraftFilters((current) => ({ ...current, service: event.target.value }))
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="analytics-environment">Environment</FieldLabel>
            <Input
              id="analytics-environment"
              value={draftFilters.environment}
              placeholder={project.environment_default}
              maxLength={120}
              onChange={(event) =>
                setDraftFilters((current) => ({ ...current, environment: event.target.value }))
              }
            />
          </Field>
          <Button type="submit" variant="outline">
            Apply filters
          </Button>
        </FieldGroup>
      </form>

      <Outlet context={{ projectId, query } satisfies ProjectAnalyticsContext} />
    </div>
  );
}

function ProjectAnalyticsLayoutSkeleton(): JSX.Element {
  return (
    <div className="flex flex-col gap-4" aria-label="Loading project analytics">
      <Skeleton className="h-8 w-72 max-w-full" />
      <Skeleton className="h-20 w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
    </div>
  );
}
