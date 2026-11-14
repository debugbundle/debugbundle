import { ScrollTextIcon } from "lucide-react";
import { ResourceEmptyState } from "./resource-empty-state.js";
import { useEffect, useState } from "react";
import { getIncidentContext, listIncidentLogs } from "../../lib/api-incident-evidence.js";
import { HighlightedCodeBlock } from "./highlighted-code-block.js";
import { TableListFooter } from "./table-list-footer.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/card.js";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../ui/field.js";
import { Input } from "../ui/input.js";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../ui/select.js";
import { Notice } from "../ui/notice.js";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious
} from "../ui/pagination.js";
import { Table, TableHeader, TableBody, TableRow, TableCell, TableHead } from "../ui/table.js";
import { EvidenceSection, IncidentEvidenceReader } from "./incident-evidence-reader.js";

// Loggers may use other names or casing; custom filtering preserves their exact stored level.
const logLevelOptions = [
  { value: "trace", label: "Trace", description: "Very detailed step-by-step diagnostics." },
  {
    value: "debug",
    label: "Debug",
    description: "Diagnostic details for investigating a problem."
  },
  { value: "info", label: "Info", description: "Routine application activity." },
  { value: "warn", label: "Warn", description: "Potential problems recorded as “warn”." },
  { value: "warning", label: "Warning", description: "Potential problems recorded as “warning”." },
  { value: "error", label: "Error", description: "Operations that failed." },
  { value: "fatal", label: "Fatal", description: "Severe failures such as an application crash." }
] as const;
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
            <IncidentEvidenceReader
              bundle={context.bundle.body}
              primaryDescription={context.primary_signal.description}
              {...(context.evidence_interpretation === undefined
                ? {}
                : { interpretation: context.evidence_interpretation })}
            />
            {context.suggested_next_checks.length === 0 ? null : (
              <ul className="list-disc pl-5">
                {context.suggested_next_checks.map((check) => (
                  <li key={check}>{check}</li>
                ))}
              </ul>
            )}
            <EvidenceSection title="full incident context">
              <HighlightedCodeBlock code={JSON.stringify(context, null, 2)} />
            </EvidenceSection>
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
  const [customLevel, setCustomLevel] = useState(false);
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
  const levelDescription = customLevel
    ? "Enter the exact level used by your logger, such as critical or notice."
    : (logLevelOptions.find((option) => option.value === level)?.description ??
      "Shows every retained record, including events without a log level.");
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
          <Select
            value={customLevel ? "custom" : level || "all"}
            disabled={loading}
            onValueChange={(next) => {
              if (next === "custom") {
                setCustomLevel(true);
                setLevelDraft(level);
                return;
              }
              setCustomLevel(false);
              setLevel(next === "all" ? "" : next);
              resetPage();
            }}
          >
            <SelectTrigger
              id="incident-log-level"
              className="w-full max-w-48"
              aria-describedby="incident-log-level-description"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All levels</SelectItem>
                {logLevelOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
                <SelectItem value="custom">Custom level…</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription id="incident-log-level-description">
            {levelDescription} Filters this table only by exact level; capture settings are
            unchanged.
          </FieldDescription>
        </Field>
        {customLevel && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (loading || levelDraft.trim().length === 0) return;
              setLevel(levelDraft.trim());
              resetPage();
            }}
          >
            <FieldGroup className="flex-row flex-wrap items-end gap-3">
              <Field className="max-w-48">
                <FieldLabel htmlFor="incident-custom-log-level">Custom log level</FieldLabel>
                <Input
                  id="incident-custom-log-level"
                  value={levelDraft}
                  onChange={(event) => setLevelDraft(event.currentTarget.value)}
                  disabled={loading}
                  aria-describedby="incident-log-level-description"
                />
              </Field>
              <Button
                type="submit"
                variant="outline"
                disabled={loading || levelDraft.trim().length === 0}
              >
                Apply custom log level
              </Button>
            </FieldGroup>
          </form>
        )}
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
          <ResourceEmptyState
            icon={ScrollTextIcon}
            title="No matching incident logs"
            description="No retained logs match these filters. Capture settings and retention can limit the evidence available here."
          />
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
      </CardContent>
      <TableListFooter
        id="incident-log-limit"
        ariaLabel="Log page limit"
        value={limit}
        disabled={loading}
        onChange={(value) => {
          setLimit(value);
          resetPage();
        }}
      >
        {(page > 0 || Boolean(records?.next_cursor)) && (
          <>
            <span className="text-sm text-muted-foreground whitespace-nowrap">Page {page + 1}</span>
            <Pagination
              aria-label="Incident log pages"
              className="mx-0 w-auto shrink-0 justify-end"
            >
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    compactOnMobile
                    type="button"
                    aria-label="Previous logs"
                    disabled={page === 0 || loading}
                    onClick={() => setPage((value) => value - 1)}
                  />
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    compactOnMobile
                    type="button"
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
          </>
        )}
      </TableListFooter>
    </Card>
  );
}
