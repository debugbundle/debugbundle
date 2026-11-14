import { RouteIcon } from "lucide-react";
import { ResourceEmptyState } from "./resource-empty-state.js";
import { useState } from "react";
import { Link } from "react-router-dom";
import { listProjectAnalyticsJourneySamples } from "../../lib/api-analytics.js";
import { TableListFooter } from "./table-list-footer.js";
import { CursorPaginationControls } from "./cursor-pagination-controls.js";
import { useCursorPagination } from "../../lib/use-cursor-pagination.js";
import { inventoryTitle } from "../../lib/inventory-title.js";
import { Button } from "../ui/button.js";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/card.js";
import { Field, FieldLabel } from "../ui/field.js";
import { Input } from "../ui/input.js";
import { Notice } from "../ui/notice.js";
import { Table, TableHeader, TableBody, TableRow, TableCell, TableHead } from "../ui/table.js";
export function AnalyticsJourneySamplesCard({
  projectId,
  service,
  environment
}: {
  projectId: string;
  service?: string | undefined;
  environment?: string | undefined;
}): JSX.Element {
  const [tagDraft, setTagDraft] = useState("");
  const [tag, setTag] = useState("");
  const [limit, setLimit] = useState(20);
  const pagination = useCursorPagination(
    async (cursor) => {
      const result = await listProjectAnalyticsJourneySamples(projectId, {
        limit,
        ...(service === undefined ? {} : { service }),
        ...(environment === undefined ? {} : { environment }),
        ...(tag ? { tag } : {}),
        ...(cursor === null ? {} : { cursor })
      });
      return {
        items: result.samples,
        nextCursor: result.next_cursor,
        totalPages: result.total_pages,
        totalCount: result.total_count
      };
    },
    [projectId, service, environment, tag, limit]
  );
  const loading = pagination.isLoading;
  const error = pagination.hasError;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{inventoryTitle("Retained journey samples", pagination.totalCount)}</CardTitle>
        <CardDescription>
          Browse retained redacted samples by service, environment and tag. This inventory is
          independent of the aggregate time window and device filters; expired samples are omitted.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field>
          <FieldLabel htmlFor="analytics-sample-tag">Sample tag</FieldLabel>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              id="analytics-sample-tag"
              value={tagDraft}
              disabled={loading}
              maxLength={120}
              className="w-48 max-w-full"
              placeholder="e.g. loop"
              onChange={(event) => setTagDraft(event.currentTarget.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => {
                setTag(tagDraft.trim());
              }}
            >
              Apply sample tag
            </Button>
          </div>
        </Field>
        {loading ? (
          <p role="status">Loading journey samples...</p>
        ) : error ? (
          <Notice tone="warning">
            Journey samples are unavailable.{" "}
            <Button type="button" variant="outline" onClick={() => void pagination.refreshPage()}>
              Retry journey samples
            </Button>
          </Notice>
        ) : pagination.items?.length === 0 ? (
          <ResourceEmptyState
            icon={RouteIcon}
            title="No retained journey samples"
            description="No samples match this scope and tag filter. Sampling and retention can limit the journeys available here."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sample</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Environment</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead>Expires</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.items?.map((sample) => (
                <TableRow key={sample.sample_id}>
                  <TableCell>
                    {sample.has_artifact ? (
                      <Link
                        to={`/projects/${projectId}/analytics/journeys/${sample.sample_id}`}
                        aria-label={`Inspect sample ${sample.sample_id}`}
                        className="underline underline-offset-4"
                      >
                        {sample.sample_id}
                      </Link>
                    ) : (
                      `${sample.sample_id} (artifact unavailable)`
                    )}
                  </TableCell>
                  <TableCell>{sample.service ?? "Any"}</TableCell>
                  <TableCell>{sample.environment ?? "Any"}</TableCell>
                  <TableCell>{sample.analysis_tags.join(", ") || "None"}</TableCell>
                  <TableCell>{sample.last_seen_at}</TableCell>
                  <TableCell>{sample.expires_at}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <TableListFooter
        id="analytics-samples-page-size"
        ariaLabel="Retained journey samples rows per page"
        value={limit}
        onChange={setLimit}
        disabled={loading}
      >
        <CursorPaginationControls
          embedded
          page={pagination.page}
          totalPages={pagination.totalPages}
          hasNextPage={pagination.hasNextPage}
          isLoading={loading}
          onPreviousPage={pagination.goToPreviousPage}
          onNextPage={() => void pagination.goToNextPage()}
        />
      </TableListFooter>
    </Card>
  );
}
