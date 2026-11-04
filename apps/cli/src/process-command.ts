import {
  formatProcessOutput,
  buildNoNewEventsSummary,
  buildProcessedSummary
} from "./local-processing-summary.js";
export type { ProcessSummary } from "./local-processing-summary.js";
import {
  pathExists,
  readState,
  readEventBatches,
  serializeState,
  type EventBatch
} from "./local-processing-files.js";
import {
  collectLocalDiagnosticContext,
  parseDiagnosticReceipts,
  serializeDiagnosticReceipts
} from "./local-diagnostic-context.js";
import {
  writeLocalBundleArtifacts,
  rebuildLocalDiagnosticArtifacts
} from "./local-bundle-artifacts.js";
import { createHash } from "node:crypto";
import {
  mkdir as mkdirFromFs,
  readFile as readFileFromFs,
  readdir as readdirFromFs,
  stat as statFromFs,
  writeFile as writeFileFromFs
} from "node:fs/promises";
import { join } from "node:path";

import {
  FINGERPRINT_VERSION,
  deriveIncidentTitle,
  fingerprintVersion,
  classifyEvent,
  fingerprint,
  inferMatchedFields,
  buildTraceCorrelationKey,
  sourceEventsMatchScope,
  normalizeEvent
} from "../../../packages/event-normalizer/src/index.js";
import {
  classifyRequestStatus,
  inferFrontendExceptionSeverity,
  getRequestAnomalyThreshold,
  isLowValueExternalProbeRequestFailure404,
  type CapturePreset,
  type EventClass,
  type EventEnvelope
} from "../../../packages/shared-types/src/index.js";
import type { BuildBundleJob } from "../../../packages/storage/src/index.js";
import {
  compareEventEnvelopes,
  type LocalIncidentState,
  type LocalProcessingState
} from "./local-processing-state.js";
import type { CliCommandResult } from "./token-commands.js";

type DirectoryMaker = (path: string, options: { recursive: true }) => Promise<void>;
type DirectoryReader = (path: string) => Promise<string[]>;
type FileReader = (path: string) => Promise<string>;
type FileWriter = (path: string, content: string) => Promise<void>;
type StatReader = (path: string) => Promise<{ isDirectory(): boolean; isFile(): boolean }>;
type Severity = "low" | "medium" | "high" | "critical";

type ProcessCommandDependencies = {
  cwd?: () => string;
  now?: () => Date;
  mkdir?: DirectoryMaker;
  readFile?: FileReader;
  readdir?: DirectoryReader;
  stat?: StatReader;
  writeFile?: FileWriter;
};

type AggregatedIncident = {
  incidentId: string;
  projectId: string;
  serviceName: string;
  environment: string;
  fingerprint: string;
  matchedFields: Set<string>;
  newEvents: EventEnvelope[];
  mergedIncidentIds: Set<string>;
  signalEventTypes: Set<EventEnvelope["event_type"]>;
  traceIds: Set<string>;
  title: string;
  kind: "immediate" | "request_anomaly";
  severity: Severity;
};

const LOCAL_EVENTS_DIRECTORY_PATH = ".debugbundle/local/events";
const LOCAL_STATE_FILE_PATH = ".debugbundle/local/state.json";
const LOCAL_BUNDLE_DIRECTORY_PATH = ".debugbundle/bundles/local";
const LOCAL_REPRODUCTION_DIRECTORY_PATH = ".debugbundle/bundles/local/reproductions";
function inferSeverity(
  event: EventEnvelope,
  capturePreset: CapturePreset,
  incidentKind: "immediate" | "request_anomaly" = "immediate"
): Severity {
  if (incidentKind === "request_anomaly") {
    return "medium";
  }

  if (event.event_type === "request_event") {
    return classifyRequestStatus({
      responseStatus: event.payload.response_status,
      capturePreset
    }) === "incident_signal"
      ? "high"
      : "low";
  }

  if (event.event_type === "frontend_exception") return inferFrontendExceptionSeverity(event);
  if (event.event_type === "backend_exception") {
    return "high";
  }

  if (event.event_type === "error_suppressed") {
    return "medium";
  }

  return "low";
}

function severityRank(severity: Severity): number {
  switch (severity) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
  }
}

function classifyEnvelope(envelope: EventEnvelope, capturePreset: CapturePreset): EventClass {
  return classifyEvent(
    envelope.event_type,
    envelope.event_type === "log_event" ? envelope.payload.level : undefined,
    envelope.event_type === "probe_event" ? envelope.payload.activation_id : undefined,
    envelope.payload as Record<string, unknown>,
    capturePreset,
    [],
    [],
    envelope.service.runtime
  );
}

function isIncidentSignalEnvelope(envelope: EventEnvelope, capturePreset: CapturePreset): boolean {
  return classifyEnvelope(envelope, capturePreset) === "incident_signal";
}

function getTraceId(envelope: EventEnvelope): string | null {
  return envelope.correlation?.trace_id ?? null;
}

function hasBackendSignal(aggregate: AggregatedIncident): boolean {
  return aggregate.signalEventTypes.has("backend_exception");
}

function selectCanonicalAggregate(aggregates: AggregatedIncident[]): AggregatedIncident {
  const sorted = [...aggregates].sort((left, right) => {
    const backendPriority = Number(hasBackendSignal(right)) - Number(hasBackendSignal(left));
    if (backendPriority !== 0) {
      return backendPriority;
    }

    return left.incidentId.localeCompare(right.incidentId);
  });

  return sorted[0] as AggregatedIncident;
}

function mergeAggregateGroup(aggregates: AggregatedIncident[]): AggregatedIncident {
  const canonicalAggregate = selectCanonicalAggregate(aggregates);

  return aggregates.reduce<AggregatedIncident>(
    (merged, aggregate) => {
      for (const matchedField of aggregate.matchedFields) {
        merged.matchedFields.add(matchedField);
      }

      for (const signalEventType of aggregate.signalEventTypes) {
        merged.signalEventTypes.add(signalEventType);
      }

      for (const traceId of aggregate.traceIds) {
        merged.traceIds.add(traceId);
      }

      merged.newEvents = mergeSourceEvents(merged.newEvents, aggregate.newEvents);
      for (const mergedIncidentId of aggregate.mergedIncidentIds) {
        merged.mergedIncidentIds.add(mergedIncidentId);
      }
      return merged;
    },
    {
      incidentId: canonicalAggregate.incidentId,
      projectId: canonicalAggregate.projectId,
      serviceName: canonicalAggregate.serviceName,
      environment: canonicalAggregate.environment,
      fingerprint: canonicalAggregate.fingerprint,
      matchedFields: new Set(canonicalAggregate.matchedFields),
      newEvents: [...canonicalAggregate.newEvents],
      mergedIncidentIds: new Set(canonicalAggregate.mergedIncidentIds),
      signalEventTypes: new Set(canonicalAggregate.signalEventTypes),
      traceIds: new Set(canonicalAggregate.traceIds),
      title: canonicalAggregate.title,
      kind: canonicalAggregate.kind,
      severity: canonicalAggregate.severity
    }
  );
}

function hashIdentifier(parts: string[], prefix: string, length: number): string {
  const digest = createHash("sha256").update(parts.join("\u0000")).digest("hex");
  return `${prefix}_${digest.slice(0, length)}`;
}

function deriveIncidentId(
  projectId: string,
  serviceName: string,
  environment: string,
  incidentFingerprint: string
): string {
  return hashIdentifier(
    [projectId, serviceName, environment, incidentFingerprint],
    "inc_local",
    16
  );
}

function deriveServiceId(projectId: string, serviceName: string): string {
  return hashIdentifier([projectId, serviceName], "svc_local", 12);
}

function mergeMatchedFields(existingFields: string[], nextFields: Iterable<string>): string[] {
  return [...new Set([...existingFields, ...nextFields])].sort();
}

function mergeSourceEvents(
  existingEvents: EventEnvelope[],
  nextEvents: EventEnvelope[]
): EventEnvelope[] {
  const merged = new Map<string, EventEnvelope>();

  for (const event of existingEvents) {
    merged.set(event.event_id, event);
  }

  for (const event of nextEvents) {
    merged.set(event.event_id, event);
  }

  return [...merged.values()].sort(compareEventEnvelopes);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

function buildRequestAnomalyFingerprint(input: {
  projectId: string;
  serviceName: string;
  environment: string;
  method: string;
  routeTemplate: string;
  responseStatus: number;
}): string {
  return createHash("sha256")
    .update(
      stableJson({
        kind: "request_status_anomaly",
        project_id: input.projectId,
        service_name: input.serviceName,
        environment: input.environment,
        method: input.method,
        route_template: input.routeTemplate,
        response_status: input.responseStatus
      })
    )
    .digest("hex");
}

function buildRequestAnomalyTitle(input: {
  method: string;
  routeTemplate: string;
  responseStatus: number;
}): string {
  return `Request anomaly: ${input.method} ${input.routeTemplate} returned ${input.responseStatus} repeatedly`;
}

function toUnixSeconds(occurredAt: string): number {
  return Math.floor(new Date(occurredAt).getTime() / 1000);
}

function countOccurrencesInWindow(events: EventEnvelope[], windowSeconds: number): number {
  const latestEvent = events.at(-1);
  if (latestEvent === undefined) {
    return 0;
  }

  const latestOccurredAt = toUnixSeconds(latestEvent.occurred_at);
  const lowerBound = latestOccurredAt - windowSeconds + 1;
  return events.filter((event) => {
    const occurredAt = toUnixSeconds(event.occurred_at);
    return occurredAt >= lowerBound && occurredAt <= latestOccurredAt;
  }).length;
}

function passesRequestAnomalyThreshold(
  events: EventEnvelope[],
  threshold: { minimum_occurrences_5m: number; minimum_ratio_5m_to_1h: number }
): boolean {
  const occurrences5m = countOccurrencesInWindow(events, 5 * 60);
  const occurrences1h = countOccurrencesInWindow(events, 60 * 60);
  const baseline1hPer5m = occurrences1h / 12;
  const ratio = occurrences5m / Math.max(baseline1hPer5m, 1);

  return (
    occurrences5m >= threshold.minimum_occurrences_5m && ratio >= threshold.minimum_ratio_5m_to_1h
  );
}

function collectRequestAnomalyAggregates(
  batches: EventBatch[],
  capturePreset: CapturePreset
): AggregatedIncident[] {
  const grouped = new Map<string, AggregatedIncident>();

  for (const batch of batches) {
    for (const event of batch.events) {
      if (
        event.event_type !== "request_event" ||
        classifyEnvelope(event, capturePreset) !== "context_signal"
      ) {
        continue;
      }

      const normalizedEvent = normalizeEvent(event);
      const responseStatus = normalizedEvent.http_status;
      const method = normalizedEvent.http_method;
      const routeTemplate = normalizedEvent.route_template;
      const threshold = getRequestAnomalyThreshold({ responseStatus, capturePreset });

      if (
        threshold === null ||
        responseStatus === null ||
        method === null ||
        routeTemplate === null
      ) {
        continue;
      }

      if (
        isLowValueExternalProbeRequestFailure404({
          httpMethod: method,
          requestPath: event.payload.path,
          routeTemplate,
          responseStatus,
          headers: event.payload.headers
        })
      ) {
        continue;
      }

      const projectId = requireProjectId(event);
      const incidentFingerprint = buildRequestAnomalyFingerprint({
        projectId,
        serviceName: event.service.name,
        environment: event.service.environment,
        method,
        routeTemplate,
        responseStatus
      });
      const incidentId = deriveIncidentId(
        projectId,
        event.service.name,
        event.service.environment,
        incidentFingerprint
      );
      const aggregate = grouped.get(incidentId) ?? {
        incidentId,
        projectId,
        serviceName: event.service.name,
        environment: event.service.environment,
        fingerprint: incidentFingerprint,
        matchedFields: new Set<string>([
          "request_anomaly",
          "route_template",
          "http_method",
          "http_status",
          "environment"
        ]),
        newEvents: [],
        mergedIncidentIds: new Set<string>([incidentId]),
        signalEventTypes: new Set<EventEnvelope["event_type"]>(["request_event"]),
        traceIds: new Set<string>(),
        title: buildRequestAnomalyTitle({ method, routeTemplate, responseStatus }),
        kind: "request_anomaly",
        severity: "medium"
      };

      aggregate.newEvents.push(event);
      grouped.set(incidentId, aggregate);
    }
  }

  return [...grouped.values()]
    .filter((aggregate) => {
      const latestEvent = aggregate.newEvents.at(-1);
      if (latestEvent === undefined || latestEvent.event_type !== "request_event") {
        return false;
      }

      const threshold = getRequestAnomalyThreshold({
        responseStatus: normalizeEvent(latestEvent).http_status,
        capturePreset
      });

      return threshold !== null && passesRequestAnomalyThreshold(aggregate.newEvents, threshold);
    })
    .sort((left, right) => left.incidentId.localeCompare(right.incidentId));
}

function requireProjectId(event: EventEnvelope): string {
  if (typeof event.project_id !== "string") {
    throw new Error(`Local event ${event.event_id} is missing project_id.`);
  }

  return event.project_id;
}

export async function processCommand(
  input: { json?: boolean; preset?: CapturePreset },
  dependencies: ProcessCommandDependencies = {}
): Promise<CliCommandResult> {
  const cwd = dependencies.cwd ?? (() => process.cwd());
  const mkdir = dependencies.mkdir ?? mkdirFromFs;
  const readFile =
    dependencies.readFile ?? ((filePath: string) => readFileFromFs(filePath, "utf8"));
  const readdir = dependencies.readdir ?? readdirFromFs;
  const stat = dependencies.stat ?? statFromFs;
  const writeFile =
    dependencies.writeFile ??
    ((filePath: string, content: string) => writeFileFromFs(filePath, content, "utf8"));
  const rootDirectory = cwd();
  const eventsDirectoryPath = join(rootDirectory, LOCAL_EVENTS_DIRECTORY_PATH);
  const statePath = join(rootDirectory, LOCAL_STATE_FILE_PATH);
  const bundleDirectoryPath = join(rootDirectory, LOCAL_BUNDLE_DIRECTORY_PATH);
  const reproductionDirectoryPath = join(rootDirectory, LOCAL_REPRODUCTION_DIRECTORY_PATH);
  const capturePreset = input.preset ?? "minimal";

  await mkdir(join(rootDirectory, ".debugbundle", "local"), { recursive: true });
  await mkdir(bundleDirectoryPath, { recursive: true });
  await mkdir(reproductionDirectoryPath, { recursive: true });

  const previousState = await readState(statePath, readFile, stat);
  const receivedAt = (dependencies.now ?? (() => new Date()))().toISOString();

  const eventFileNames = (await pathExists(eventsDirectoryPath, stat))
    ? (await readdir(eventsDirectoryPath))
        .filter((fileName) => fileName.endsWith(".events.json"))
        .sort()
    : [];

  const lastProcessedEventFile = previousState?.last_processed_event_file ?? null;
  const newEventFileNames =
    lastProcessedEventFile === null
      ? eventFileNames
      : eventFileNames.filter((fileName) => fileName > lastProcessedEventFile);
  const processAllEventFiles = input.preset !== undefined;
  if (
    !processAllEventFiles &&
    Object.values(previousState?.incidents ?? {}).some(
      (incident) =>
        !sourceEventsMatchScope({
          projectId: incident.project_id,
          environment: incident.environment,
          sourceEvents: incident.source_events
        })
    )
  ) {
    const failure = {
      error: "local_incident_scope_mismatch",
      message:
        "Retained local evidence crosses project or environment boundaries. Preserve the local store, then explicitly rebuild retained events with debugbundle process --preset <minimal|balanced|investigative>."
    };
    return { exitCode: 1, output: input.json === true ? JSON.stringify(failure) : failure.message };
  }
  const targetEventFileNames = processAllEventFiles ? eventFileNames : newEventFileNames;

  if (targetEventFileNames.length === 0) {
    const summary = buildNoNewEventsSummary(
      previousState?.last_processed_event_file ?? eventFileNames.at(-1) ?? null
    );
    return {
      exitCode: 0,
      output: input.json === true ? JSON.stringify(summary) : formatProcessOutput(summary)
    };
  }

  const batches = await readEventBatches(eventsDirectoryPath, targetEventFileNames, readFile);
  const diagnosticReceiptPath = join(rootDirectory, ".debugbundle/local/evidence-receipts.json");
  const ledger = (await pathExists(diagnosticReceiptPath, stat))
    ? parseDiagnosticReceipts(JSON.parse(await readFile(diagnosticReceiptPath)))
    : { diagnostic_receipts: {}, diagnostic_payload_hashes: {} };
  const receipts: Record<string, string> = ledger.diagnostic_receipts;
  for (const [id, at] of Object.entries(previousState?.diagnostic_receipts ?? {})) {
    if (receipts[id] === undefined || Date.parse(at) < Date.parse(receipts[id])) receipts[id] = at;
  }
  const diagnostics = collectLocalDiagnosticContext(
    {
      ...previousState,
      diagnostic_receipts: receipts,
      diagnostic_payload_hashes: {
        ...previousState?.diagnostic_payload_hashes,
        ...ledger.diagnostic_payload_hashes
      }
    },
    batches.flatMap((batch) => batch.events),
    receivedAt
  );
  // Receipt durability precedes artifact processing, including rejected context.
  // State loss or an interrupted rebuild cannot renew its time or payload identity.
  if (diagnostics.diagnostic_receipts) {
    await writeFile(diagnosticReceiptPath, serializeDiagnosticReceipts(diagnostics));
  }
  const incidents = new Map<string, LocalIncidentState>(
    processAllEventFiles ? [] : Object.entries(previousState?.incidents ?? {})
  );
  const aggregates = new Map<string, AggregatedIncident>();
  const traceCorrelationGroups = new Map<
    string,
    { incidentIds: Set<string>; hasBackend: boolean; hasFrontend: boolean }
  >();
  let eventsProcessed = 0;

  for (const batch of batches) {
    for (const event of batch.events) {
      eventsProcessed += 1;
      if (!isIncidentSignalEnvelope(event, capturePreset)) {
        continue;
      }

      const normalizedEvent = normalizeEvent(event);
      const incidentFingerprint = fingerprint(normalizedEvent);
      const projectId = requireProjectId(event);
      const incidentId = deriveIncidentId(
        projectId,
        event.service.name,
        event.service.environment,
        incidentFingerprint
      );
      const aggregate: AggregatedIncident = aggregates.get(incidentId) ?? {
        incidentId,
        projectId,
        serviceName: event.service.name,
        environment: event.service.environment,
        fingerprint: incidentFingerprint,
        matchedFields: new Set<string>(),
        newEvents: [],
        mergedIncidentIds: new Set<string>([incidentId]),
        signalEventTypes: new Set<EventEnvelope["event_type"]>(),
        traceIds: new Set<string>(),
        title: deriveIncidentTitle(normalizedEvent),
        kind: "immediate",
        severity: inferSeverity(event, capturePreset)
      };

      for (const matchedField of inferMatchedFields(normalizedEvent)) {
        aggregate.matchedFields.add(matchedField);
      }

      aggregate.newEvents.push(event);
      aggregate.signalEventTypes.add(event.event_type);

      const traceId = getTraceId(event);
      // A resource and an application exception may share a trace without sharing a failure.
      if (traceId !== null && normalizedEvent.resource_type === undefined) {
        aggregate.traceIds.add(traceId);
        const traceKey = buildTraceCorrelationKey(projectId, event.service.environment, traceId);
        const traceCorrelationGroup = traceCorrelationGroups.get(traceKey) ?? {
          incidentIds: new Set<string>(),
          hasBackend: false,
          hasFrontend: false
        };

        traceCorrelationGroup.incidentIds.add(incidentId);
        traceCorrelationGroup.hasBackend ||= event.event_type === "backend_exception";
        traceCorrelationGroup.hasFrontend ||= event.event_type === "frontend_exception";
        traceCorrelationGroups.set(traceKey, traceCorrelationGroup);
      }

      aggregates.set(incidentId, aggregate);
    }
  }

  const aggregateParent = new Map<string, string>();

  function ensureAggregateParent(incidentId: string): string {
    const existingParent = aggregateParent.get(incidentId);
    if (existingParent !== undefined) {
      if (existingParent === incidentId) {
        return existingParent;
      }

      const rootParent = ensureAggregateParent(existingParent);
      aggregateParent.set(incidentId, rootParent);
      return rootParent;
    }

    aggregateParent.set(incidentId, incidentId);
    return incidentId;
  }

  function unionAggregateParents(leftIncidentId: string, rightIncidentId: string): void {
    const leftParent = ensureAggregateParent(leftIncidentId);
    const rightParent = ensureAggregateParent(rightIncidentId);
    if (leftParent === rightParent) {
      return;
    }

    const [nextRoot, absorbedRoot] =
      leftParent.localeCompare(rightParent) <= 0
        ? [leftParent, rightParent]
        : [rightParent, leftParent];
    aggregateParent.set(absorbedRoot, nextRoot);
  }

  for (const traceCorrelationGroup of traceCorrelationGroups.values()) {
    if (
      !traceCorrelationGroup.hasBackend ||
      !traceCorrelationGroup.hasFrontend ||
      traceCorrelationGroup.incidentIds.size < 2
    ) {
      continue;
    }

    const incidentIds = [...traceCorrelationGroup.incidentIds].sort();
    const firstIncidentId = incidentIds[0];
    if (firstIncidentId === undefined) {
      continue;
    }

    for (const incidentId of incidentIds.slice(1)) {
      unionAggregateParents(firstIncidentId, incidentId);
    }
  }

  const mergedAggregatesByRoot = new Map<string, AggregatedIncident[]>();
  for (const [incidentId, aggregate] of aggregates.entries()) {
    const rootIncidentId = ensureAggregateParent(incidentId);
    const aggregateGroup = mergedAggregatesByRoot.get(rootIncidentId) ?? [];
    aggregateGroup.push(aggregate);
    mergedAggregatesByRoot.set(rootIncidentId, aggregateGroup);
  }

  const mergedAggregates = [...mergedAggregatesByRoot.values()]
    .map((aggregateGroup) => mergeAggregateGroup(aggregateGroup))
    .sort((left, right) => left.incidentId.localeCompare(right.incidentId));
  const requestAnomalyAggregates =
    input.preset === undefined ? [] : collectRequestAnomalyAggregates(batches, capturePreset);
  const finalizedAggregates = [...mergedAggregates, ...requestAnomalyAggregates].sort(
    (left, right) => left.incidentId.localeCompare(right.incidentId)
  );

  const services = new Map<string, number>();
  const writtenIncidents = new Set<string>();

  for (const aggregate of finalizedAggregates) {
    const incidentId = aggregate.incidentId;

    const existingIncidents = [...aggregate.mergedIncidentIds]
      .map((mergedIncidentId) => incidents.get(mergedIncidentId))
      .filter((incident): incident is LocalIncidentState => incident !== undefined);
    const existing =
      existingIncidents.find((incident) => incident.incident_id === incidentId) ??
      existingIncidents[0];
    const existingSourceEvents = existingIncidents.flatMap((incident) => incident.source_events);
    const combinedSourceEvents = mergeSourceEvents(existingSourceEvents, aggregate.newEvents);
    const signalEvents =
      aggregate.kind === "request_anomaly"
        ? combinedSourceEvents
        : combinedSourceEvents.filter((event) => isIncidentSignalEnvelope(event, capturePreset));
    if (signalEvents.length === 0) {
      continue;
    }

    const latestSignalEvent = signalEvents.at(-1);
    const firstSignalEvent = signalEvents[0];
    if (latestSignalEvent === undefined || firstSignalEvent === undefined) {
      continue;
    }

    const sourceEventTypes = [...new Set(signalEvents.map((event) => event.event_type))].sort();
    const severity =
      signalEvents
        .map((event) => inferSeverity(event, capturePreset, aggregate.kind))
        .sort((left, right) => severityRank(right) - severityRank(left))[0] ?? aggregate.severity;
    const generationNumber = Math.max(signalEvents.length, (existing?.generation_number ?? 0) + 1);
    const bundlePath = `${LOCAL_BUNDLE_DIRECTORY_PATH}/${incidentId}.bundle.json`;
    const reproductionPath = `${LOCAL_REPRODUCTION_DIRECTORY_PATH}/${incidentId}.reproduction.json`;
    const incident: LocalIncidentState = {
      incident_id: incidentId,
      source: "local",
      project_id: aggregate.projectId,
      service_id: deriveServiceId(aggregate.projectId, aggregate.serviceName),
      service_name: aggregate.serviceName,
      service_runtime: latestSignalEvent.service.runtime ?? existing?.service_runtime ?? null,
      service_framework: latestSignalEvent.service.framework ?? existing?.service_framework ?? null,
      environment: aggregate.environment,
      fingerprint: aggregate.fingerprint,
      fingerprint_version:
        aggregate.kind === "request_anomaly"
          ? FINGERPRINT_VERSION
          : fingerprintVersion(normalizeEvent(latestSignalEvent)),
      title: aggregate.title,
      severity,
      status: existingIncidents.some((incidentState) => incidentState.status === "resolved")
        ? "open"
        : (existing?.status ?? "open"),
      first_seen_at: firstSignalEvent.occurred_at,
      last_seen_at: latestSignalEvent.occurred_at,
      occurrence_count: signalEvents.length,
      source_event_id: latestSignalEvent.event_id,
      source_occurred_at: latestSignalEvent.occurred_at,
      source_event_types: sourceEventTypes,
      matched_fields: mergeMatchedFields(
        existingIncidents.flatMap((incidentState) => incidentState.matched_fields),
        aggregate.matchedFields
      ),
      bundle_path: bundlePath,
      reproduction_path: reproductionPath,
      generation_number: generationNumber,
      source_events: combinedSourceEvents,
      failure_event_ids: signalEvents.map((event) => event.event_id)
    };

    const jobTrigger: BuildBundleJob["trigger"] =
      existing?.status === "resolved" ? "regression_reopen" : "occurrence_threshold";
    await writeLocalBundleArtifacts({
      rootDirectory,
      incident,
      contexts: diagnostics.diagnostic_contexts ?? [],
      updatedAt: receivedAt,
      trigger: jobTrigger,
      writeFile,
      readFile
    });
    writtenIncidents.add(incidentId);

    for (const mergedIncidentId of aggregate.mergedIncidentIds) {
      if (mergedIncidentId !== incidentId) {
        incidents.delete(mergedIncidentId);
      }
    }

    incidents.set(incidentId, incident);
    services.set(incident.service_name, (services.get(incident.service_name) ?? 0) + 1);
  }

  for (const [id, incident] of incidents) {
    if (writtenIncidents.has(id)) continue;
    incidents.set(
      id,
      await rebuildLocalDiagnosticArtifacts({
        rootDirectory,
        incident,
        contexts: diagnostics.diagnostic_contexts ?? [],
        updatedAt: receivedAt,
        writeFile,
        readFile
      })
    );
  }

  const finalProcessedEventFile = targetEventFileNames[targetEventFileNames.length - 1] as string;
  const nextState: LocalProcessingState = {
    version: 1,
    last_processed_event_file: finalProcessedEventFile,
    ...diagnostics,
    incidents: Object.fromEntries(
      [...incidents.entries()].sort(([left], [right]) => left.localeCompare(right))
    )
  };
  await writeFile(statePath, serializeState(nextState));

  const summary = buildProcessedSummary({
    filesProcessed: newEventFileNames.length,
    eventsProcessed,
    incidentsProcessed: finalizedAggregates.length,
    services: [...services.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([service, count]) => ({
        service,
        incidents: count
      })),
    lastProcessedEventFile: finalProcessedEventFile
  });

  return {
    exitCode: 0,
    output: input.json === true ? JSON.stringify(summary) : formatProcessOutput(summary)
  };
}
