import { UsersIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";

import { AnalyticsSectionHeader } from "../components/system/analytics-section-header.js";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "../components/ui/empty.js";
import { Notice } from "../components/ui/notice.js";
import { Skeleton } from "../components/ui/skeleton.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "../components/ui/table.js";
import {
  getProjectAnalyticsDevices,
  getProjectAnalyticsReferrers,
  type AnalyticsMetricsSegment,
  type ProjectAnalyticsDeviceMetricsResponse,
  type ProjectAnalyticsReferrerMetricsResponse
} from "../lib/api.js";
import type { ProjectAnalyticsContext } from "./project-analytics-layout.js";

interface AudienceData {
  devices: ProjectAnalyticsDeviceMetricsResponse | null;
  referrers: ProjectAnalyticsReferrerMetricsResponse | null;
}

const INTEGER_FORMAT = new Intl.NumberFormat();

export function ProjectAnalyticsAudiencesPage(): JSX.Element {
  const { projectId, query } = useOutletContext<ProjectAnalyticsContext>();
  const [data, setData] = useState<AudienceData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const queryKey = JSON.stringify(query);

  useEffect(() => {
    let active = true;
    setIsLoading(true);

    void Promise.allSettled([
      getProjectAnalyticsDevices(projectId, query),
      getProjectAnalyticsReferrers(projectId, query)
    ])
      .then(([devicesResult, referrersResult]) => {
        if (!active) return;
        setData({
          devices: devicesResult.status === "fulfilled" ? devicesResult.value : null,
          referrers: referrersResult.status === "fulfilled" ? referrersResult.value : null
        });
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [attempt, projectId, queryKey]);

  const completeData =
    data?.devices !== null && data?.devices !== undefined && data.referrers !== null
      ? { devices: data.devices, referrers: data.referrers }
      : null;
  const isEmpty =
    completeData !== null &&
    audienceSegments(completeData).every((segments) => segments.length === 0);
  const isUnavailable = data !== null && data.devices === null && data.referrers === null;
  const isPartial = data !== null && (data.devices === null || data.referrers === null);

  return (
    <div className="flex flex-col gap-6">
      <AnalyticsSectionHeader
        title="Audience analytics"
        description="Understand devices, platforms, languages, acquisition sources, and campaigns."
        isLoading={isLoading}
        onRefresh={() => setAttempt((current) => current + 1)}
      />

      {isLoading && data === null ? <AudienceSkeleton /> : null}

      {isUnavailable ? (
        <Notice title="Could not load audience analytics" tone="destructive">
          Both audience metric reads are temporarily unavailable. Analytics capture continues; use
          refresh to try again.
        </Notice>
      ) : null}

      {isPartial ? (
        <Notice title="Some audience metrics are unavailable" tone="warning">
          Available audience aggregates remain visible. Refresh to retry the missing dimensions.
        </Notice>
      ) : null}

      {isEmpty ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersIcon />
            </EmptyMedia>
            <EmptyTitle>No audience activity in this window</EmptyTitle>
            <EmptyDescription>
              Audience dimensions appear after analytics capture receives eligible browser events.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {data !== null && !isEmpty && !isUnavailable ? (
        <div className="grid gap-6 xl:grid-cols-2">
          {data.devices === null ? (
            <UnavailableSection message="Device and platform metrics unavailable." />
          ) : (
            <>
              <AudienceSection title="Device types" segments={data.devices.device_types} />
              <AudienceSection title="Browsers" segments={data.devices.browsers} />
              <AudienceSection title="Operating systems" segments={data.devices.os} />
              <AudienceSection title="Languages" segments={data.devices.languages} />
            </>
          )}
          {data.referrers === null ? (
            <UnavailableSection message="Referrer and campaign metrics unavailable." />
          ) : (
            <>
              <AudienceSection title="Referrers" segments={data.referrers.referrers} />
              <AudienceSection title="UTM sources" segments={data.referrers.utm_sources} />
              <AudienceSection title="UTM mediums" segments={data.referrers.utm_mediums} />
              <AudienceSection title="UTM campaigns" segments={data.referrers.utm_campaigns} />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function audienceSegments(data: {
  devices: ProjectAnalyticsDeviceMetricsResponse;
  referrers: ProjectAnalyticsReferrerMetricsResponse;
}): AnalyticsMetricsSegment[][] {
  return [
    data.devices.device_types,
    data.devices.browsers,
    data.devices.os,
    data.devices.languages,
    data.referrers.referrers,
    data.referrers.utm_sources,
    data.referrers.utm_mediums,
    data.referrers.utm_campaigns
  ];
}

function AudienceSection({
  title,
  segments
}: {
  title: string;
  segments: AnalyticsMetricsSegment[];
}): JSX.Element {
  const headingId = `analytics-audience-${title.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <section className="flex min-w-0 flex-col gap-3" aria-labelledby={headingId}>
      <h3 id={headingId} className="text-base font-medium">
        {title}
      </h3>
      {segments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No data in this window.</p>
      ) : (
        <Table aria-label={title}>
          <TableHeader>
            <TableRow>
              <TableHead>Value</TableHead>
              <TableHead className="text-right">Sessions</TableHead>
              <TableHead className="text-right">Page views</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {segments.map((segment) => (
              <TableRow key={segment.value}>
                <TableCell className="max-w-64 truncate">{segment.value}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {INTEGER_FORMAT.format(segment.sessions)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {INTEGER_FORMAT.format(segment.pageviews)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

function UnavailableSection({ message }: { message: string }): JSX.Element {
  return <p className="text-sm text-muted-foreground">{message}</p>;
}

function AudienceSkeleton(): JSX.Element {
  return (
    <div className="grid gap-6 xl:grid-cols-2" aria-label="Loading audience analytics">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-44 w-full" />
      ))}
    </div>
  );
}
