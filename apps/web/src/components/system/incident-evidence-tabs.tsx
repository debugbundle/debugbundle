import { useEffect, useState } from "react";
import { getIncidentContext, listIncidentLogs } from "../../lib/api-incident-evidence.js";
import { HighlightedCodeBlock } from "./highlighted-code-block.js";
import { BoundedListLimit } from "./bounded-list-limit.js";
import { Badge } from "../ui/badge.js";
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
export function IncidentContextTab({ incidentId }: { incidentId: string }): JSX.Element {
  const [context, setContext] = useState<Awaited<ReturnType<typeof getIncidentContext>> | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    setContext(null);
    void getIncidentContext(incidentId).then(
      (result) => {
        if (active) {
          setContext(result);
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
  }, [incidentId, revision]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Incident context</CardTitle>
        <CardDescription>
          Primary signal, related artifacts, deployment, grouping, visibility and suggested next
          checks.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Button
          type="button"
          variant="outline"
          disabled={loading}
          onClick={() => setRevision((current) => current + 1)}
        >
          Refresh incident context
        </Button>
        {loading ? (
          <p role="status">Loading incident context...</p>
        ) : error ? (
          <Notice tone="warning">Incident context is unavailable.</Notice>
        ) : context === null ? null : (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge variant={context.bundle.status === "ready" ? "success" : "secondary"}>
                Bundle: {context.bundle.status}
              </Badge>
              <Badge variant={context.reproduction.status === "ready" ? "success" : "secondary"}>
                Reproduction: {context.reproduction.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{context.primary_signal.description}</p>
            {context.suggested_next_checks.length === 0 ? null : (
              <ul className="list-disc pl-5">
                {context.suggested_next_checks.map((check) => (
                  <li key={check}>{check}</li>
                ))}
              </ul>
            )}
            <HighlightedCodeBlock code={JSON.stringify(context, null, 2)} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
export function IncidentLogsTab({ incidentId }: { incidentId: string }): JSX.Element {
  const [records, setRecords] = useState<Awaited<ReturnType<typeof listIncidentLogs>> | null>(null);
  const [levelDraft, setLevelDraft] = useState("");
  const [level, setLevel] = useState("");
  const [limit, setLimit] = useState(20);
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    setRecords(null);
    void listIncidentLogs(incidentId, {
      limit,
      ...(level ? { level } : {}),
      ...(cursors[page] === undefined ? {} : { cursor: cursors[page] })
    }).then(
      (result) => {
        if (active) {
          setRecords(result);
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
  }, [incidentId, level, limit, cursors, page, revision]);
  function resetPage(): void {
    setCursors([undefined]);
    setPage(0);
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Incident logs</CardTitle>
        <CardDescription>
          Related event metadata, including sampled records. Log messages available in the Debug
          Bundle remain in that artifact.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field>
          <FieldLabel htmlFor="incident-log-level">Log level</FieldLabel>
          <div className="flex flex-wrap gap-3">
            <Input
              id="incident-log-level"
              placeholder="All levels"
              value={levelDraft}
              onChange={(event) => setLevelDraft(event.currentTarget.value)}
              disabled={loading}
            />
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => {
                setLevel(levelDraft.trim());
                resetPage();
              }}
            >
              Apply log level
            </Button>
          </div>
        </Field>
        <BoundedListLimit
          id="incident-log-limit"
          label="Log page limit"
          paginated
          value={limit}
          disabled={loading}
          onChange={(value) => {
            setLimit(value);
            resetPage();
          }}
        />
        {loading ? (
          <p role="status">Loading incident logs...</p>
        ) : error ? (
          <Notice tone="warning">
            Incident logs are unavailable.{" "}
            <Button
              type="button"
              variant="outline"
              onClick={() => setRevision((value) => value + 1)}
            >
              Retry incident logs
            </Button>
          </Notice>
        ) : records?.logs.length === 0 ? (
          <Notice>No matching incident logs.</Notice>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Occurred</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Sampling</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records?.logs.map((log) => (
                <TableRow key={log.event_id}>
                  <TableCell>{log.event_id}</TableCell>
                  <TableCell>{log.event_type}</TableCell>
                  <TableCell>{log.occurred_at}</TableCell>
                  <TableCell>{log.level ?? "Unknown"}</TableCell>
                  <TableCell>{log.is_sampled ? "Sampled" : "Full"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pagination aria-label="Incident log pages">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                aria-label="Previous logs"
                disabled={page === 0 || loading}
                onClick={() => setPage((value) => value - 1)}
              />
            </PaginationItem>
            <PaginationItem>
              <span>Page {page + 1}</span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                aria-label="Next logs"
                disabled={loading || error || !records?.next_cursor}
                onClick={() => {
                  const next = records?.next_cursor;
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
