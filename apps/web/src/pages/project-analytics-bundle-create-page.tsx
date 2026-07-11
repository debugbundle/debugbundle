import { ArrowLeftIcon, LoaderCircleIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";

import {
  toAnalyticsDateEnd,
  toAnalyticsDateStart
} from "../components/system/workspace-analytics-filters.js";
import { Button } from "../components/ui/button.js";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet
} from "../components/ui/field.js";
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
import {
  ApiRequestError,
  createProjectAnalyticsBundle,
  listProjectIncidents,
  type AnalyticsBundleAnalysisKind,
  type IncidentRecord
} from "../lib/api.js";
import type { ProjectAnalyticsContext } from "./project-analytics-layout.js";

type TimeWindow = "7d" | "30d" | "90d" | "custom";
type FormField = "from" | "to" | "funnel" | "route" | "incident" | "deploy";

interface FormDraft {
  analysisKind: AnalyticsBundleAnalysisKind;
  timeWindow: TimeWindow;
  from: string;
  to: string;
  funnel: string;
  route: string;
  incidentId: string;
  deployId: string;
  service: string;
  environment: string;
}

const analysisKindOptions: Array<{ value: AnalyticsBundleAnalysisKind; label: string }> = [
  { value: "usage_summary", label: "Usage Summary" },
  { value: "route_health", label: "Route Health" },
  { value: "funnel_dropoff", label: "Funnel Dropoff" },
  { value: "journey_friction", label: "Journey Friction" },
  { value: "feature_usage", label: "Feature Usage" },
  { value: "incident_impact", label: "Incident Impact" },
  { value: "deploy_comparison", label: "Deploy Comparison" },
  { value: "conversion_path", label: "Conversion Path" }
];

const timeWindowOptions: Array<{ value: TimeWindow; label: string }> = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "custom", label: "Custom range" }
];

const routeContextKinds = new Set<AnalyticsBundleAnalysisKind>([
  "route_health",
  "journey_friction",
  "conversion_path"
]);

export function ProjectAnalyticsBundleCreatePage(): JSX.Element {
  const { projectId, query } = useOutletContext<ProjectAnalyticsContext>();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<FormDraft>(() => ({
    analysisKind: "usage_summary",
    timeWindow: query.last ?? "30d",
    from: "",
    to: "",
    funnel: "",
    route: "",
    incidentId: "",
    deployId: "",
    service: query.service ?? "",
    environment: query.environment ?? ""
  }));
  const [errors, setErrors] = useState<Partial<Record<FormField, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [incidents, setIncidents] = useState<IncidentRecord[] | null>(null);
  const [incidentsError, setIncidentsError] = useState(false);
  const [incidentsAttempt, setIncidentsAttempt] = useState(0);

  useEffect(() => {
    if (draft.analysisKind !== "incident_impact") return;
    let active = true;
    setIncidents(null);
    setIncidentsError(false);

    void listProjectIncidents(projectId, 100)
      .then((response) => {
        if (active) setIncidents(response.incidents);
      })
      .catch(() => {
        if (active) setIncidentsError(true);
      });

    return () => {
      active = false;
    };
  }, [draft.analysisKind, incidentsAttempt, projectId]);

  function update<K extends keyof FormDraft>(key: K, value: FormDraft[K]): void {
    setDraft((current) => ({ ...current, [key]: value }));
    setSubmitError(null);
    if (key in errors) {
      setErrors((current) => {
        const next = { ...current };
        delete next[key as FormField];
        return next;
      });
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submittingRef.current) return;
    const nextErrors = validateDraft(draft);
    setErrors(nextErrors);
    setSubmitError(null);
    if (Object.keys(nextErrors).length > 0) return;

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const result = await createProjectAnalyticsBundle(projectId, buildCreateInput(draft));
      const pendingId =
        "status" in result.bundle && result.bundle.status === "pending"
          ? result.bundle.bundle_generation_id
          : null;
      const generationId = result.generationId ?? pendingId;
      if (generationId !== null) {
        void navigate(`/projects/${projectId}/analytics/bundles/${generationId}`);
        return;
      }
      if ("status" in result.bundle && result.bundle.status === "failed") {
        setSubmitError(`Generation failed: ${formatErrorCode(result.bundle.reason)}`);
        return;
      }
      void navigate(`/projects/${projectId}/analytics/bundles`);
    } catch (error) {
      setSubmitError(formatCreateError(error));
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  const showsRoute = routeContextKinds.has(draft.analysisKind);
  const showsIncident = draft.analysisKind === "incident_impact";

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to={`/projects/${projectId}/analytics/bundles`}>
            <ArrowLeftIcon data-icon="inline-start" />
            Back to AnalyticsBundles
          </Link>
        </Button>
      </div>

      <header className="flex max-w-2xl flex-col gap-2">
        <h2 className="text-xl font-semibold">Generate AnalyticsBundle</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Create a deterministic analysis artifact from aggregate analytics and bounded journey
          evidence.
        </p>
      </header>

      {submitError === null ? null : (
        <Notice
          title={
            submitError === "analytics_quota_exceeded"
              ? "AnalyticsBundle limit reached"
              : "Could not generate AnalyticsBundle"
          }
          tone="destructive"
        >
          {submitError === "analytics_quota_exceeded"
            ? "The monthly AnalyticsBundle generation allowance is exhausted."
            : submitError}
        </Notice>
      )}

      <form className="flex flex-col gap-8" onSubmit={(event) => void submit(event)}>
        <FieldSet>
          <FieldLegend>Analysis</FieldLegend>
          <FieldGroup className="grid gap-5 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="analytics-bundle-kind">Analysis kind</FieldLabel>
              <Select
                value={draft.analysisKind}
                onValueChange={(value) =>
                  update("analysisKind", value as AnalyticsBundleAnalysisKind)
                }
              >
                <SelectTrigger id="analytics-bundle-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectGroup>
                    {analysisKindOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="analytics-bundle-window">Time window</FieldLabel>
              <Select
                value={draft.timeWindow}
                onValueChange={(value) => update("timeWindow", value as TimeWindow)}
              >
                <SelectTrigger id="analytics-bundle-window" className="w-full">
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
            {draft.timeWindow === "custom" ? (
              <>
                <DateField
                  id="analytics-bundle-from"
                  label="From"
                  value={draft.from}
                  max={draft.to || undefined}
                  error={errors.from}
                  onChange={(value) => update("from", value)}
                />
                <DateField
                  id="analytics-bundle-to"
                  label="To"
                  value={draft.to}
                  min={draft.from || undefined}
                  error={errors.to}
                  onChange={(value) => update("to", value)}
                />
              </>
            ) : null}
          </FieldGroup>
        </FieldSet>

        {draft.analysisKind === "funnel_dropoff" ? (
          <FieldSet>
            <FieldLegend>Funnel context</FieldLegend>
            <Field data-invalid={errors.funnel !== undefined || undefined}>
              <FieldLabel htmlFor="analytics-bundle-funnel">Funnel key</FieldLabel>
              <Input
                id="analytics-bundle-funnel"
                value={draft.funnel}
                maxLength={120}
                aria-invalid={errors.funnel !== undefined || undefined}
                onChange={(event) => update("funnel", event.currentTarget.value)}
              />
              {errors.funnel === undefined ? null : <FieldError>{errors.funnel}</FieldError>}
            </Field>
          </FieldSet>
        ) : null}

        {showsRoute ? (
          <FieldSet>
            <FieldLegend>Route context</FieldLegend>
            <Field data-invalid={errors.route !== undefined || undefined}>
              <FieldLabel htmlFor="analytics-bundle-route">Route</FieldLabel>
              <Input
                id="analytics-bundle-route"
                value={draft.route}
                maxLength={2048}
                placeholder="/checkout"
                aria-invalid={errors.route !== undefined || undefined}
                onChange={(event) => update("route", event.currentTarget.value)}
              />
              <FieldDescription>Optional normalized path without a query string.</FieldDescription>
              {errors.route === undefined ? null : <FieldError>{errors.route}</FieldError>}
            </Field>
          </FieldSet>
        ) : null}

        {showsIncident ? (
          <FieldSet>
            <FieldLegend>Incident context</FieldLegend>
            {incidentsError ? (
              <Notice title="Could not load project incidents" tone="destructive">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIncidentsAttempt((current) => current + 1)}
                >
                  <RefreshCwIcon data-icon="inline-start" />
                  Retry incidents
                </Button>
              </Notice>
            ) : (
              <Field data-invalid={errors.incident !== undefined || undefined}>
                <FieldLabel htmlFor="analytics-bundle-incident">Incident</FieldLabel>
                <Select
                  value={draft.incidentId}
                  disabled={incidents === null}
                  onValueChange={(value) => update("incidentId", value)}
                >
                  <SelectTrigger
                    id="analytics-bundle-incident"
                    className="w-full"
                    aria-invalid={errors.incident !== undefined || undefined}
                  >
                    <SelectValue
                      placeholder={incidents === null ? "Loading incidents" : "Select incident"}
                    />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectGroup>
                      {(incidents ?? []).map((incident) => (
                        <SelectItem key={incident.incident_id} value={incident.incident_id}>
                          {incident.title}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {incidents?.length === 0 ? (
                  <FieldDescription>
                    No accessible project incidents are available.
                  </FieldDescription>
                ) : null}
                {errors.incident === undefined ? null : <FieldError>{errors.incident}</FieldError>}
              </Field>
            )}
          </FieldSet>
        ) : null}

        {draft.analysisKind === "deploy_comparison" ? (
          <FieldSet>
            <FieldLegend>Deploy context</FieldLegend>
            <Field data-invalid={errors.deploy !== undefined || undefined}>
              <FieldLabel htmlFor="analytics-bundle-deploy">Deploy ID</FieldLabel>
              <Input
                id="analytics-bundle-deploy"
                value={draft.deployId}
                maxLength={120}
                aria-invalid={errors.deploy !== undefined || undefined}
                onChange={(event) => update("deployId", event.currentTarget.value)}
              />
              {errors.deploy === undefined ? null : <FieldError>{errors.deploy}</FieldError>}
            </Field>
          </FieldSet>
        ) : null}

        <FieldSet>
          <FieldLegend>Scope</FieldLegend>
          <FieldGroup className="grid gap-5 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="analytics-bundle-service">Service</FieldLabel>
              <Input
                id="analytics-bundle-service"
                value={draft.service}
                maxLength={120}
                placeholder="All services"
                onChange={(event) => update("service", event.currentTarget.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="analytics-bundle-environment">Environment</FieldLabel>
              <Input
                id="analytics-bundle-environment"
                value={draft.environment}
                maxLength={120}
                placeholder="All environments"
                onChange={(event) => update("environment", event.currentTarget.value)}
              />
            </Field>
          </FieldGroup>
        </FieldSet>

        <div className="flex flex-wrap items-center gap-2 border-t pt-5">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
            ) : null}
            Generate AnalyticsBundle
          </Button>
          <Button asChild type="button" variant="outline">
            <Link to={`/projects/${projectId}/analytics/bundles`}>Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}

function DateField({
  id,
  label,
  value,
  min,
  max,
  error,
  onChange
}: {
  id: string;
  label: string;
  value: string;
  min?: string | undefined;
  max?: string | undefined;
  error?: string | undefined;
  onChange: (value: string) => void;
}): JSX.Element {
  return (
    <Field data-invalid={error !== undefined || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="date"
        value={value}
        min={min}
        max={max}
        aria-invalid={error !== undefined || undefined}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {error === undefined ? null : <FieldError>{error}</FieldError>}
    </Field>
  );
}

function validateDraft(draft: FormDraft): Partial<Record<FormField, string>> {
  const errors: Partial<Record<FormField, string>> = {};
  if (draft.timeWindow === "custom") {
    if (draft.from.length === 0) errors.from = "Choose a start date.";
    if (draft.to.length === 0) errors.to = "Choose an end date.";
    if (draft.from.length > 0 && draft.to.length > 0 && draft.from > draft.to) {
      errors.from = "The start date must be before the end date.";
    }
  }
  if (draft.analysisKind === "funnel_dropoff" && draft.funnel.trim().length === 0) {
    errors.funnel = "Enter the funnel key to analyze.";
  }
  if (
    (draft.route.includes("?") || draft.route.includes("#")) &&
    routeContextKinds.has(draft.analysisKind)
  ) {
    errors.route = "Route must not contain query strings or fragments.";
  }
  if (draft.analysisKind === "incident_impact" && draft.incidentId.length === 0) {
    errors.incident = "Select an incident to analyze.";
  }
  if (draft.analysisKind === "deploy_comparison" && draft.deployId.trim().length === 0) {
    errors.deploy = "Enter the deploy ID to compare.";
  }
  return errors;
}

function buildCreateInput(draft: FormDraft): Parameters<typeof createProjectAnalyticsBundle>[1] {
  const service = draft.service.trim();
  const environment = draft.environment.trim();
  const funnel = draft.funnel.trim();
  const route = draft.route.trim();
  const deployId = draft.deployId.trim();
  return {
    analysisKind: draft.analysisKind,
    ...(draft.timeWindow === "custom"
      ? { from: toAnalyticsDateStart(draft.from)!, to: toAnalyticsDateEnd(draft.to)! }
      : { last: draft.timeWindow }),
    ...(funnel.length === 0 ? {} : { funnel }),
    ...(route.length === 0 ? {} : { route }),
    ...(draft.incidentId.length === 0 ? {} : { incidentId: draft.incidentId }),
    ...(deployId.length === 0 ? {} : { deployId }),
    ...(service.length === 0 ? {} : { service }),
    ...(environment.length === 0 ? {} : { environment })
  };
}

function formatCreateError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.code === "analytics_quota_exceeded") return error.code;
    if (error.code === "analytics_disabled") return "Analytics is disabled for this project.";
    if (error.code === "upgrade_required") return "This plan does not include AnalyticsBundles.";
    if (error.code === "incident_not_found")
      return "The selected incident is no longer accessible.";
    if (error.code === "invalid_body") return "The analysis request contains invalid values.";
    return formatErrorCode(error.code);
  }
  return "The generation request could not be completed.";
}

function formatErrorCode(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => `${part[0]!.toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
