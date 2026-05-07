import { ActivityIcon, BugIcon, InboxIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.js";
import { listProjects, type ProjectRecord } from "../../lib/api.js";

interface DashboardMetrics {
  monthlyBundleRequests: number;
  monthlyRawIngestedEvents: number;
  retainedBundles: number;
  monthlyAlertDeliveries: number;
}

function aggregateProjectMetrics(projects: ProjectRecord[]): DashboardMetrics {
  return projects.reduce<DashboardMetrics>(
    (totals, project) => ({
      monthlyBundleRequests: totals.monthlyBundleRequests + project.metrics.monthly_bundle_requests,
      monthlyRawIngestedEvents: totals.monthlyRawIngestedEvents + project.metrics.monthly_raw_ingested_events,
      retainedBundles: totals.retainedBundles + project.metrics.retained_bundles,
      monthlyAlertDeliveries: totals.monthlyAlertDeliveries + project.metrics.monthly_alert_deliveries
    }),
    {
      monthlyBundleRequests: 0,
      monthlyRawIngestedEvents: 0,
      retainedBundles: 0,
      monthlyAlertDeliveries: 0
    }
  );
}

export function SectionCards(): JSX.Element {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const projects = await listProjects();
        setMetrics(aggregateProjectMetrics(projects));
      } catch {
        setMetrics({
          monthlyBundleRequests: 0,
          monthlyRawIngestedEvents: 0,
          retainedBundles: 0,
          monthlyAlertDeliveries: 0
        });
      }
    })();
  }, []);

  const bundleRequests = metrics?.monthlyBundleRequests;
  const rawEvents = metrics?.monthlyRawIngestedEvents;
  const retainedBundles = metrics?.retainedBundles;
  const alertDeliveries = metrics?.monthlyAlertDeliveries;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardDescription>Bundle Requests</CardDescription>
          <BugIcon className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <CardTitle className="text-2xl tabular-nums">
            {bundleRequests !== undefined ? bundleRequests.toLocaleString() : "\u2014"}
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {bundleRequests !== undefined ? "This month across all projects" : "Loading\u2026"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardDescription>Ingested Events</CardDescription>
          <InboxIcon className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <CardTitle className="text-2xl tabular-nums">
            {rawEvents !== undefined ? rawEvents.toLocaleString() : "\u2014"}
          </CardTitle>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            {rawEvents !== undefined ? (
              <>
                {rawEvents > 0 ? (
                  <TrendingUpIcon className="size-3" />
                ) : (
                  <TrendingDownIcon className="size-3" />
                )}
                This month across all projects
              </>
            ) : (
              "Loading\u2026"
            )}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardDescription>Retained Bundles</CardDescription>
          <ActivityIcon className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <CardTitle className="text-2xl tabular-nums">
            {retainedBundles !== undefined ? retainedBundles.toLocaleString() : "\u2014"}
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {retainedBundles !== undefined ? "Current total across all projects" : "Loading\u2026"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardDescription>Alert Deliveries</CardDescription>
          <ActivityIcon className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <CardTitle className="text-2xl tabular-nums">
            {alertDeliveries !== undefined ? alertDeliveries.toLocaleString() : "\u2014"}
          </CardTitle>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            {alertDeliveries !== undefined ? (
              <>
                {alertDeliveries > 0 ? (
                  <TrendingUpIcon className="size-3" />
                ) : (
                  <TrendingDownIcon className="size-3" />
                )}
                This month across all projects
              </>
            ) : (
              "Loading\u2026"
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
