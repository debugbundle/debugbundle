import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listProjectAnalyticsJourneySamples } from "../../lib/api-analytics.js";
import { BoundedListLimit } from "./bounded-list-limit.js";
import { Button } from "../ui/button.js";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/card.js";
import { Field, FieldLabel } from "../ui/field.js";
import { Input } from "../ui/input.js";
import { Notice } from "../ui/notice.js";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious
} from "../ui/pagination.js";
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
  const [samples, setSamples] = useState<Awaited<
    ReturnType<typeof listProjectAnalyticsJourneySamples>
  > | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [tag, setTag] = useState("");
  const [limit, setLimit] = useState(20);
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  // The parent keys this inventory by scope, so cursors cannot carry into a different scope.
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    setSamples(null);
    void listProjectAnalyticsJourneySamples(projectId, {
      limit,
      ...(service === undefined ? {} : { service }),
      ...(environment === undefined ? {} : { environment }),
      ...(tag ? { tag } : {}),
      ...(cursors[page] === undefined ? {} : { cursor: cursors[page] })
    }).then(
      (result) => {
        if (active) {
          setSamples(result);
          setLoading(false);
        }
      },
      () => {
        if (active) {
          setError(true);
          setLoading(false);
        }
      }
    );
    return () => {
      active = false;
    };
  }, [projectId, service, environment, tag, limit, cursors, page, revision]);
  function resetPage(): void {
    setCursors([undefined]);
    setPage(0);
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Retained journey samples</CardTitle>
        <CardDescription>
          Browse retained redacted samples by service, environment and tag. This inventory is
          independent of the aggregate time window and device filters; expired samples are omitted.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field>
          <FieldLabel htmlFor="analytics-sample-tag">Sample tag</FieldLabel>
          <div className="flex flex-wrap gap-3">
            <Input
              id="analytics-sample-tag"
              value={tagDraft}
              disabled={loading}
              maxLength={120}
              onChange={(event) => setTagDraft(event.currentTarget.value)}
            />
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => {
                setTag(tagDraft.trim());
                resetPage();
              }}
            >
              Apply sample tag
            </Button>
          </div>
        </Field>
        <BoundedListLimit
          id="analytics-sample-limit"
          label="Sample page limit"
          paginated
          value={limit}
          disabled={loading}
          onChange={(value) => {
            setLimit(value);
            resetPage();
          }}
        />
        {loading ? (
          <p role="status">Loading journey samples...</p>
        ) : error ? (
          <Notice tone="warning">
            Journey samples are unavailable.{" "}
            <Button
              type="button"
              variant="outline"
              onClick={() => setRevision((value) => value + 1)}
            >
              Retry journey samples
            </Button>
          </Notice>
        ) : samples?.samples.length === 0 ? (
          <Notice>No retained journey samples for this scope.</Notice>
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
              {samples?.samples.map((sample) => (
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
        <Pagination aria-label="Journey sample pages">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                aria-label="Previous samples"
                disabled={page === 0 || loading}
                onClick={() => setPage((value) => value - 1)}
              />
            </PaginationItem>
            <PaginationItem>
              <span>Page {page + 1}</span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                aria-label="Next samples"
                disabled={loading || error || !samples?.next_cursor}
                onClick={() => {
                  const next = samples?.next_cursor;
                  if (!next) return;
                  setCursors((current) => [...current.slice(0, page + 1), next]);
                  setPage((value) => value + 1);
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </CardContent>
    </Card>
  );
}
