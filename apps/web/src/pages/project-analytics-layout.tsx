import { RotateCcwIcon, Settings2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate, useOutletContext } from "react-router-dom";

import { CalloutCard } from "../components/system/callout-card.js";
import {
  AnalyticsFilterPanel,
  AppliedAnalyticsFilterList,
  type AppliedAnalyticsFilter
} from "../components/system/analytics-filter-panel.js";
import {
  ProjectScopeSelect,
  useProjectScopeOptions
} from "../components/system/project-scope-controls.js";
import type { ProjectContext } from "../components/system/project-layout.js";
import { Button } from "../components/ui/button.js";
import { Field, FieldGroup, FieldLabel } from "../components/ui/field.js";
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
  environmentDefault: string;
  query: AnalyticsMetricsQuery;
}

const analyticsSections = [
  { value: "overview", label: "Overview", suffix: "" },
  { value: "routes", label: "Routes", suffix: "/routes" },
  { value: "funnels", label: "Funnels", suffix: "/funnels" },
  { value: "audiences", label: "Audiences", suffix: "/audiences" },
  { value: "journeys", label: "Journeys", suffix: "/journeys" },
  { value: "opportunities", label: "Opportunities", suffix: "/opportunities" },
  { value: "bundles", label: "Bundles", suffix: "/bundles" }
] as const;
type AnalyticsSection = (typeof analyticsSections)[number]["value"];

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
  const scopeOptions = useProjectScopeOptions(projectId, project.environment_default);

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

  const activeSection = resolveAnalyticsSection(location.pathname);
  const query: AnalyticsMetricsQuery = {
    last: filters.last,
    granularity: "day",
    limit: activeSection === "overview" ? 5 : 100,
    ...(filters.service.length === 0 ? {} : { service: filters.service }),
    ...(filters.environment.length === 0 ? {} : { environment: filters.environment })
  };

  function applyScopeFilters(): void {
    setFilters((current) => ({
      ...current,
      service: draftFilters.service.trim(),
      environment: draftFilters.environment.trim()
    }));
  }

  function changeTimeWindow(last: AnalyticsFilters["last"]): void {
    setDraftFilters((current) => ({ ...current, last }));
    setFilters((current) => ({ ...current, last }));
  }

  function resetScopeFilters(): void {
    setDraftFilters((current) => ({ ...current, service: "", environment: "" }));
    setFilters((current) => ({ ...current, service: "", environment: "" }));
  }

  function removeScopeFilter(key: "service" | "environment"): void {
    setDraftFilters((current) => ({ ...current, [key]: "" }));
    setFilters((current) => ({ ...current, [key]: "" }));
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
      <Notice title="Product analytics unavailable">
        Product analytics availability could not be resolved for this project.
      </Notice>
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

  const appliedFilters: AppliedAnalyticsFilter[] = [
    ...(filters.service.length === 0
      ? []
      : [
          {
            key: "service",
            label: `Service: ${filters.service}`,
            onRemove: () => removeScopeFilter("service")
          }
        ]),
    ...(filters.environment.length === 0
      ? []
      : [
          {
            key: "environment",
            label: `Environment: ${filters.environment}`,
            onRemove: () => removeScopeFilter("environment")
          }
        ])
  ];

  return (
    <div className="flex flex-col gap-6">
      <Tabs value={activeSection} onValueChange={changeSection}>
        <div className="overflow-x-auto overscroll-x-contain pb-1">
          <TabsList
            variant="line"
            aria-label="Analytics sections"
            className="min-w-max justify-start"
          >
            {analyticsSections.map((section) => (
              <TabsTrigger key={section.value} value={section.value} className="shrink-0 flex-none">
                {section.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {location.pathname.endsWith("/bundles/new") ? null : (
        <div
          role="group"
          aria-label="Project analytics filter controls"
          className="flex w-full min-w-0 flex-col gap-2"
        >
          <div
            role="group"
            aria-label="Primary project analytics filters"
            className="flex w-full flex-wrap items-end gap-2"
          >
            <Field className="w-full sm:w-48">
              <FieldLabel id="analytics-window-label" htmlFor="analytics-window">
                Time window
              </FieldLabel>
              <Select
                value={draftFilters.last}
                onValueChange={(last) => changeTimeWindow(last as AnalyticsFilters["last"])}
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
            <AnalyticsFilterPanel
              triggerLabel="More filters"
              title="More analytics filters"
              description="Limit analytics to a specific service or environment."
              activeFilterCount={appliedFilters.length}
              onApply={applyScopeFilters}
              onReset={resetScopeFilters}
              onDismiss={() => setDraftFilters(filters)}
            >
              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel htmlFor="analytics-service">Service</FieldLabel>
                  <ProjectScopeSelect
                    id="analytics-service"
                    label="Service"
                    value={draftFilters.service}
                    options={scopeOptions.services}
                    allLabel="All services"
                    onValueChange={(service) =>
                      setDraftFilters((current) => ({ ...current, service }))
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="analytics-environment">Environment</FieldLabel>
                  <ProjectScopeSelect
                    id="analytics-environment"
                    label="Environment"
                    value={draftFilters.environment}
                    options={scopeOptions.environments}
                    allLabel="All environments"
                    onValueChange={(environment) =>
                      setDraftFilters((current) => ({ ...current, environment }))
                    }
                  />
                </Field>
              </FieldGroup>
            </AnalyticsFilterPanel>
            {appliedFilters.length === 0 ? null : (
              <Button type="button" variant="outline" onClick={resetScopeFilters}>
                <RotateCcwIcon data-icon="inline-start" />
                Reset filters
              </Button>
            )}
          </div>
          <AppliedAnalyticsFilterList filters={appliedFilters} />
        </div>
      )}

      <Outlet
        context={
          {
            projectId,
            environmentDefault: project.environment_default,
            query
          } satisfies ProjectAnalyticsContext
        }
      />
    </div>
  );
}

function resolveAnalyticsSection(pathname: string): AnalyticsSection {
  if (pathname.endsWith("/routes")) return "routes";
  if (pathname.endsWith("/funnels")) return "funnels";
  if (pathname.endsWith("/audiences")) return "audiences";
  if (pathname.endsWith("/journeys")) return "journeys";
  if (pathname.endsWith("/opportunities")) return "opportunities";
  if (pathname.includes("/analytics/bundles")) return "bundles";
  return "overview";
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
