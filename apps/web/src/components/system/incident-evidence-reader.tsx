import { useState, type ReactNode } from "react";
import {
  BundleV1Schema,
  interpretBundleEvidence,
  type EvidenceInterpretation
} from "../../../../../packages/shared-types/src/index.js";
import { CalloutCard } from "./callout-card.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "../ui/collapsible.js";
import { Table, TableHeader, TableBody, TableRow, TableCell, TableHead } from "../ui/table.js";
import { HighlightedCodeBlock } from "./highlighted-code-block.js";

export function EvidenceSection({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col gap-3">
      <CollapsibleTrigger asChild>
        <Button type="button" variant="outline" className="self-start">
          {open ? "Hide" : "Show"} {title}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}
function EvidenceTime({ label, value }: { label: string; value: string | null }): JSX.Element {
  const elapsed = value === null ? null : Date.now() - Date.parse(value);
  const age =
    elapsed === null
      ? "unknown"
      : elapsed < 0
        ? "timestamp is in the future"
        : elapsed < 60_000
          ? "less than a minute ago"
          : elapsed < 3_600_000
            ? `${Math.floor(elapsed / 60_000)} minutes ago`
            : elapsed < 86_400_000
              ? `${Math.floor(elapsed / 3_600_000)} hours ago`
              : `${Math.floor(elapsed / 86_400_000)} days ago`;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      {value === null ? (
        <span>Unknown</span>
      ) : (
        <time dateTime={value} title={value} className="break-all">
          {value}
        </time>
      )}
      <span className="text-sm text-muted-foreground">{age}</span>
    </div>
  );
}

/** Shared presentation for retained incident artifacts. Interpretation is the
 * same domain result exposed to ordinary API, CLI and MCP readers. */
export function IncidentEvidenceReader({
  bundle,
  interpretation,
  primaryDescription
}: {
  bundle: unknown;
  interpretation?: EvidenceInterpretation;
  primaryDescription: string;
}): JSX.Element {
  const evidence = interpretation ?? interpretBundleEvidence(bundle);
  const parsed = BundleV1Schema.safeParse(bundle),
    context = parsed.success ? parsed.data.context : null;
  const graph = context?.error?.exception_evidence,
    recovery = context?.recovery,
    resources = context?.resource_observations;
  return (
    <CalloutCard
      eyebrow={`Evidence: ${evidence.status}`}
      title={primaryDescription}
      description="Capture time belongs to the primary failure. Generating this artifact again does not create a new runtime measurement."
      tone={evidence.status === "observed" ? "neutral" : "warning"}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <EvidenceTime label="Captured" value={evidence.captured_at} />
        <EvidenceTime label="Artifact generated" value={evidence.generated_at} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">
          Retained inputs: {evidence.retained_event_count ?? "unknown"}
        </Badge>
        <Badge
          variant={
            evidence.recovery === "recovered"
              ? "success"
              : evidence.recovery === "conflicting"
                ? "warning"
                : "secondary"
          }
        >
          Recovery: {evidence.recovery}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">{evidence.importance}</p>
      <ul className="list-disc pl-5">
        {evidence.facts.map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
      </ul>
      <EvidenceSection title="cause and trace details">
        {graph === undefined ? (
          <p>Structured cause evidence is unknown for this retained artifact.</p>
        ) : (
          graph.nodes.map((node) => (
            <section
              key={node.id}
              className="flex min-w-0 flex-col gap-3"
              aria-label={`Exception ${node.id}: ${node.name}`}
            >
              <p className="break-words font-medium">
                {node.name}: {node.message}
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">Trace origin: {node.trace_origin}</Badge>
                <Badge variant="outline">Parsing: {node.parsing_status}</Badge>
              </div>
              {node.relationships.length === 0 ? null : (
                <p>
                  {node.relationships
                    .map(
                      (edge) =>
                        `${edge.kind}: ${graph.nodes.find((child) => child.id === edge.target_id)?.name ?? "unknown"} (exception ${edge.target_id})`
                    )
                    .join("; ")}
                </p>
              )}
              {node.frames.length === 0 ? (
                <p>No structured frame locations are available.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Location</TableHead>
                      <TableHead>Function</TableHead>
                      <TableHead>Ownership</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {node.frames.map((frame, index) => (
                      <TableRow key={index}>
                        <TableCell className="whitespace-normal break-all">
                          {frame.file ?? "Unknown file"}
                          {frame.line === null ? "" : `:${frame.line}`}
                          {frame.column === null ? "" : `:${frame.column}`}
                        </TableCell>
                        <TableCell className="whitespace-normal break-all">
                          {frame.function ?? "Unknown"}
                        </TableCell>
                        <TableCell>{frame.classification}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {node.stack === null ? null : (
                <EvidenceSection title={`retained stack for exception ${node.id}`}>
                  <HighlightedCodeBlock code={node.stack} />
                </EvidenceSection>
              )}
            </section>
          ))
        )}
        {graph?.truncated ? <p>Cause evidence was truncated to the collection budget.</p> : null}
        {graph?.unavailable_reason ? (
          <p>Collection limitation: {graph.unavailable_reason}</p>
        ) : null}
      </EvidenceSection>
      <EvidenceSection title="passive resource observations">
        <p>
          Timing and CSP observations are passive. Their association does not establish the cause;
          document status is separate from resource status.
        </p>
        {resources === undefined || resources.items.length === 0 ? (
          <p>No matching retained passive resource observations are available.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Observation</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resources.items.map(({ observation }, index) => (
                <TableRow key={index}>
                  <TableCell className="whitespace-normal">
                    {observation.kind === "csp"
                      ? `CSP ${observation.disposition}: ${observation.effective_directive}`
                      : `Timing: ${observation.availability}`}
                    <br />
                    <time dateTime={observation.observed_at}>{observation.observed_at}</time>
                  </TableCell>
                  <TableCell className="whitespace-normal break-all">
                    {observation.source_url ?? "Unknown"}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {observation.kind === "csp"
                      ? `Document HTTP ${observation.document_status_code ?? "unknown"}`
                      : `Resource HTTP ${observation.response_status ?? "unknown"}`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {evidence.possible_causes.map((cause) => (
          <p key={cause}>{cause}</p>
        ))}
      </EvidenceSection>
      <EvidenceSection title="recovery observations">
        <p>
          Only an explicit application recovery observation establishes recovery. HTTP completion
          alone leaves the outcome unknown.
        </p>
        {recovery === undefined || recovery.attempts.length === 0 ? (
          <p>No matching retained recovery attempts are available.</p>
        ) : (
          recovery.attempts.map((attempt, index) => (
            <section
              key={attempt.attempt_id}
              className="flex flex-col gap-3"
              aria-label={`Recovery attempt ${index + 1}`}
            >
              <p>
                Attempt {index + 1}: {attempt.outcome}
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Captured</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Attempt response</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attempt.observations.map((item) => (
                    <TableRow key={item.source_event_id}>
                      <TableCell className="whitespace-normal">
                        <time dateTime={item.occurred_at}>{item.occurred_at}</time>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {item.state.replaceAll("_", " ")}
                        {item.operation ? ` (${item.operation})` : ""}
                      </TableCell>
                      <TableCell>
                        {item.status_code === undefined ? "Unknown" : `HTTP ${item.status_code}`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          ))
        )}
        {recovery?.truncated ? (
          <p>Additional recovery observations exceeded the retained evidence limit.</p>
        ) : null}
      </EvidenceSection>
      {evidence.next_evidence.length ? (
        <section aria-label="Next evidence to collect" className="flex flex-col gap-2">
          <p className="font-medium">Next evidence to collect</p>
          <ul className="list-disc pl-5">
            {evidence.next_evidence.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </CalloutCard>
  );
}
