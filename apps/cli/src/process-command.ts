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
  classifyEvent,
  fingerprint,
  inferMatchedFields,
  normalizeEvent,
  validateEvent
} from "../../../packages/event-normalizer/src/index.js";
import { buildBundle } from "../../../packages/bundle-engine/src/index.js";
import { buildReproduction } from "../../../packages/repro-engine/src/index.js";
import {
  BundleV1Schema,
  EventTypeValues,
  classifyRequestStatus,
  getRequestAnomalyThreshold,
  type CapturePreset,
  type EventClass,
  type EventEnvelope
} from "../../../packages/shared-types/src/index.js";
import type { BundleBuildContext, BuildBundleJob } from "../../../packages/storage/src/index.js";
import { isRecord } from "./cli-fs-helpers.js";
import type { CliCommandResult } from "./token-commands.js";

type DirectoryMaker = (path: string, options: { recursive: true }) => Promise<void>;
type DirectoryReader = (path: string) => Promise<string[]>;
type FileReader = (path: string) => Promise<string>;
type FileWriter = (path: string, content: string) => Promise<void>;
type StatReader = (path: string) => Promise<{ isDirectory(): boolean; isFile(): boolean }>;
type Severity = "low" | "medium" | "high" | "critical";

type ProcessCommandDependencies = {
  cwd?: () => string;
  mkdir?: DirectoryMaker;
  readFile?: FileReader;
  readdir?: DirectoryReader;
  stat?: StatReader;
  writeFile?: FileWriter;
};

export type ProcessSummary =
  | {
    status: "ok";
    processed: false;
    files_processed: number;
    events_processed: number;
    incidents_processed: number;
    services: Array<{ service: string; incidents: number }>;
    last_processed_event_file: string | null;
    message: string;
  }
  | {
    status: "ok";
    processed: true;
    files_processed: number;
    events_processed: number;
    incidents_processed: number;
    services: Array<{ service: string; incidents: number }>;
    last_processed_event_file: string;
    message?: undefined;
  };

type LocalIncidentState = {
  incident_id: string;
  source: "local";
  project_id: string;
  service_id: string;
  service_name: string;
  service_runtime: string | null;
  service_framework: string | null;
  environment: string;
  fingerprint: string;
  fingerprint_version: string;
  title: string;
  severity: Severity;
  status: "open" | "resolved";
  first_seen_at: string;
  last_seen_at: string;
  occurrence_count: number;
  source_event_id: string;
  source_occurred_at: string;
  source_event_types: EventEnvelope["event_type"][];
  matched_fields: string[];
  bundle_path: string;
  reproduction_path: string;
  generation_number: number;
  source_events: EventEnvelope[];
};

type LocalProcessingState = {
  version: 1;
  last_processed_event_file: string | null;
  incidents: Record<string, LocalIncidentState>;
};

type EventBatch = {
  fileName: string;
  events: EventEnvelope[];
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
const CLI_GENERATOR_VERSION = "cli-process-local-v1";
const CLI_SDK = {
  name: "debugbundle-cli",
  version: "0.1.0"
} as const;
const EVENT_TYPE_SET = new Set<string>(EventTypeValues);

function isEventType(value: unknown): value is EventEnvelope["event_type"] {
  return typeof value === "string" && EVENT_TYPE_SET.has(value);
}

function inferSeverity(
  event: EventEnvelope,
  capturePreset: CapturePreset,
  incidentKind: "immediate" | "request_anomaly" = "immediate"
): Severity {
  if (incidentKind === "request_anomaly") {
    return "medium";
  }

  if (event.event_type === "request_event") {
    return classifyRequestStatus({ responseStatus: event.payload.response_status, capturePreset }) === "incident_signal"
      ? "high"
      : "low";
  }

  if (event.event_type === "backend_exception" || event.event_type === "frontend_exception") {
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

function compareEventEnvelopes(left: EventEnvelope, right: EventEnvelope): number {
  const occurredAtComparison = left.occurred_at.localeCompare(right.occurred_at);
  if (occurredAtComparison !== 0) {
    return occurredAtComparison;
  }

  return left.event_id.localeCompare(right.event_id);
}

function classifyEnvelope(envelope: EventEnvelope, capturePreset: CapturePreset): EventClass {
  return classifyEvent(
    envelope.event_type,
    envelope.event_type === "log_event" ? envelope.payload.level : undefined,
    envelope.event_type === "probe_event" ? envelope.payload.activation_id : undefined,
    envelope.payload as Record<string, unknown>,
    capturePreset
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

  return aggregates.reduce<AggregatedIncident>((merged, aggregate) => {
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
  }, {
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
  });
}

function hashIdentifier(parts: string[], prefix: string, length: number): string {
  const digest = createHash("sha256").update(parts.join("\u0000")).digest("hex");
  return `${prefix}_${digest.slice(0, length)}`;
}

function deriveIncidentId(projectId: string, serviceName: string, environment: string, incidentFingerprint: string): string {
  return hashIdentifier([projectId, serviceName, environment, incidentFingerprint], "inc_local", 16);
}

function deriveServiceId(projectId: string, serviceName: string): string {
  return hashIdentifier([projectId, serviceName], "svc_local", 12);
}

function mergeMatchedFields(existingFields: string[], nextFields: Iterable<string>): string[] {
  return [...new Set([...existingFields, ...nextFields])].sort();
}

function mergeSourceEvents(existingEvents: EventEnvelope[], nextEvents: EventEnvelope[]): EventEnvelope[] {
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

function passesRequestAnomalyThreshold(events: EventEnvelope[], threshold: { minimum_occurrences_5m: number; minimum_ratio_5m_to_1h: number }): boolean {
  const occurrences5m = countOccurrencesInWindow(events, 5 * 60);
  const occurrences1h = countOccurrencesInWindow(events, 60 * 60);
  const baseline1hPer5m = occurrences1h / 12;
  const ratio = occurrences5m / Math.max(baseline1hPer5m, 1);

  return occurrences5m >= threshold.minimum_occurrences_5m && ratio >= threshold.minimum_ratio_5m_to_1h;
}

function collectRequestAnomalyAggregates(batches: EventBatch[], capturePreset: CapturePreset): AggregatedIncident[] {
  const grouped = new Map<string, AggregatedIncident>();

  for (const batch of batches) {
    for (const event of batch.events) {
      if (event.event_type !== "request_event" || classifyEnvelope(event, capturePreset) !== "context_signal") {
        continue;
      }

      const normalizedEvent = normalizeEvent(event);
      const responseStatus = normalizedEvent.http_status;
      const method = normalizedEvent.http_method;
      const routeTemplate = normalizedEvent.route_template;
      const threshold = getRequestAnomalyThreshold({ responseStatus, capturePreset });

      if (threshold === null || responseStatus === null || method === null || routeTemplate === null) {
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
      const incidentId = deriveIncidentId(projectId, event.service.name, event.service.environment, incidentFingerprint);
      const aggregate = grouped.get(incidentId) ?? {
        incidentId,
        projectId,
        serviceName: event.service.name,
        environment: event.service.environment,
        fingerprint: incidentFingerprint,
        matchedFields: new Set<string>(["request_anomaly", "route_template", "http_method", "http_status", "environment"]),
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

function buildBundleContext(incident: LocalIncidentState): BundleBuildContext {
  return {
    incident_id: incident.incident_id,
    project_id: incident.project_id,
    service_id: incident.service_id,
    service_name: incident.service_name,
    service_runtime: incident.service_runtime,
    service_framework: incident.service_framework,
    environment: incident.environment,
    fingerprint: incident.fingerprint,
    title: incident.title,
    severity: incident.severity,
    first_seen_at: incident.first_seen_at,
    last_seen_at: incident.last_seen_at,
    occurrence_count: incident.occurrence_count,
    source_event_types: [...incident.source_event_types]
  };
}

function requireProjectId(event: EventEnvelope): string {
  if (typeof event.project_id !== "string") {
    throw new Error(`Local event ${event.event_id} is missing project_id.`);
  }

  return event.project_id;
}

function formatServiceSummary(services: Array<{ service: string; incidents: number }>): string[] {
  return services.map(({ service, incidents }) => `- ${incidents} incident${incidents === 1 ? "" : "s"} in ${service}`);
}

function formatProcessOutput(summary: ProcessSummary): string {
  if (!summary.processed) {
    return summary.message;
  }

  return [
    `Processed ${summary.events_processed} events from ${summary.files_processed} files into ${summary.incidents_processed} incidents.`,
    ...formatServiceSummary(summary.services),
    `Last processed event file: ${summary.last_processed_event_file}`
  ].join("\n");
}

async function pathExists(path: string, stat: StatReader): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isRecord(error) && error["code"] === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function parseIncidentState(candidate: unknown): LocalIncidentState | null {
  if (!isRecord(candidate)) {
    return null;
  }

  if (candidate["source"] !== "local" || candidate["status"] !== "open" && candidate["status"] !== "resolved") {
    return null;
  }

  const sourceEvents = candidate["source_events"];
  if (!Array.isArray(sourceEvents)) {
    return null;
  }

  const validatedSourceEvents: EventEnvelope[] = [];
  for (const sourceEvent of sourceEvents) {
    const validated = validateEvent(sourceEvent);
    if (!validated.success) {
      return null;
    }
    validatedSourceEvents.push(validated.data);
  }

  const matchedFields = candidate["matched_fields"];
  const sourceEventTypes = candidate["source_event_types"];

  if (!Array.isArray(matchedFields) || !matchedFields.every((value) => typeof value === "string")) {
    return null;
  }

  if (!Array.isArray(sourceEventTypes) || !sourceEventTypes.every(isEventType)) {
    return null;
  }

  const severity = candidate["severity"];
  if (severity !== "low" && severity !== "medium" && severity !== "high" && severity !== "critical") {
    return null;
  }

  const status = candidate["status"];
  if (status !== "open" && status !== "resolved") {
    return null;
  }

  const requiredStringKeys = [
    "incident_id",
    "project_id",
    "service_id",
    "service_name",
    "environment",
    "fingerprint",
    "fingerprint_version",
    "title",
    "first_seen_at",
    "last_seen_at",
    "source_event_id",
    "source_occurred_at",
    "bundle_path",
    "reproduction_path"
  ] as const;

  for (const key of requiredStringKeys) {
    if (typeof candidate[key] !== "string") {
      return null;
    }
  }

  if (typeof candidate["occurrence_count"] !== "number" || typeof candidate["generation_number"] !== "number") {
    return null;
  }

  const serviceRuntime = candidate["service_runtime"];
  const serviceFramework = candidate["service_framework"];
  if (serviceRuntime !== null && typeof serviceRuntime !== "string") {
    return null;
  }
  if (serviceFramework !== null && typeof serviceFramework !== "string") {
    return null;
  }

  const incidentId = candidate["incident_id"] as string;
  const projectId = candidate["project_id"] as string;
  const serviceId = candidate["service_id"] as string;
  const serviceName = candidate["service_name"] as string;
  const environment = candidate["environment"] as string;
  const incidentFingerprint = candidate["fingerprint"] as string;
  const fingerprintVersion = candidate["fingerprint_version"] as string;
  const title = candidate["title"] as string;
  const firstSeenAt = candidate["first_seen_at"] as string;
  const lastSeenAt = candidate["last_seen_at"] as string;
  const occurrenceCount = candidate["occurrence_count"];
  const sourceEventId = candidate["source_event_id"] as string;
  const sourceOccurredAt = candidate["source_occurred_at"] as string;
  const bundlePath = candidate["bundle_path"] as string;
  const reproductionPath = candidate["reproduction_path"] as string;
  const generationNumber = candidate["generation_number"];
  const normalizedSourceEventTypes = [...sourceEventTypes].sort();

  return {
    incident_id: incidentId,
    source: "local",
    project_id: projectId,
    service_id: serviceId,
    service_name: serviceName,
    service_runtime: serviceRuntime,
    service_framework: serviceFramework,
    environment,
    fingerprint: incidentFingerprint,
    fingerprint_version: fingerprintVersion,
    title,
    severity,
    status,
    first_seen_at: firstSeenAt,
    last_seen_at: lastSeenAt,
    occurrence_count: occurrenceCount,
    source_event_id: sourceEventId,
    source_occurred_at: sourceOccurredAt,
    source_event_types: normalizedSourceEventTypes,
    matched_fields: [...matchedFields].sort(),
    bundle_path: bundlePath,
    reproduction_path: reproductionPath,
    generation_number: generationNumber,
    source_events: validatedSourceEvents.sort(compareEventEnvelopes)
  };
}

function parseState(rawState: string): LocalProcessingState | null {
  const parsed = JSON.parse(rawState) as unknown;
  if (!isRecord(parsed) || parsed["version"] !== 1) {
    return null;
  }

  const lastProcessedEventFile = parsed["last_processed_event_file"];
  if (lastProcessedEventFile !== null && typeof lastProcessedEventFile !== "string") {
    return null;
  }

  const incidents = parsed["incidents"];
  if (!isRecord(incidents)) {
    return null;
  }

  const parsedIncidents: Record<string, LocalIncidentState> = {};
  for (const [incidentId, incidentValue] of Object.entries(incidents).sort(([left], [right]) => left.localeCompare(right))) {
    const incident = parseIncidentState(incidentValue);
    if (incident === null || incident.incident_id !== incidentId) {
      return null;
    }

    parsedIncidents[incidentId] = incident;
  }

  return {
    version: 1,
    last_processed_event_file: lastProcessedEventFile,
    incidents: parsedIncidents
  };
}

async function readState(statePath: string, readFile: FileReader, stat: StatReader): Promise<LocalProcessingState | null> {
  if (!(await pathExists(statePath, stat))) {
    return null;
  }

  try {
    return parseState(await readFile(statePath));
  } catch {
    return null;
  }
}

async function readEventBatches(eventDirectoryPath: string, fileNames: string[], readFile: FileReader): Promise<EventBatch[]> {
  const batches: EventBatch[] = [];

  for (const fileName of fileNames) {
    const filePath = join(eventDirectoryPath, fileName);
    const parsed = JSON.parse(await readFile(filePath)) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error(`Invalid local event batch in ${join(LOCAL_EVENTS_DIRECTORY_PATH, fileName)}.`);
    }

    const validatedEvents: EventEnvelope[] = [];
    for (const eventCandidate of parsed) {
      const validated = validateEvent(eventCandidate);
      if (!validated.success) {
        const issue = validated.error.issues[0]?.message ?? "Unknown event validation error.";
        throw new Error(`Invalid local event in ${join(LOCAL_EVENTS_DIRECTORY_PATH, fileName)}: ${issue}`);
      }
      validatedEvents.push(validated.data);
    }

    batches.push({
      fileName,
      events: validatedEvents.sort(compareEventEnvelopes)
    });
  }

  return batches;
}

function buildNoNewEventsSummary(lastProcessedEventFile: string | null): ProcessSummary {
  return {
    status: "ok",
    processed: false,
    files_processed: 0,
    events_processed: 0,
    incidents_processed: 0,
    services: [],
    last_processed_event_file: lastProcessedEventFile,
    message: "No new events to process."
  };
}

function buildProcessedSummary(input: {
  filesProcessed: number;
  eventsProcessed: number;
  incidentsProcessed: number;
  services: Array<{ service: string; incidents: number }>;
  lastProcessedEventFile: string;
}): ProcessSummary {
  return {
    status: "ok",
    processed: true,
    files_processed: input.filesProcessed,
    events_processed: input.eventsProcessed,
    incidents_processed: input.incidentsProcessed,
    services: input.services,
    last_processed_event_file: input.lastProcessedEventFile
  };
}

function sortIncidentRecord(incident: LocalIncidentState): LocalIncidentState {
  return {
    ...incident,
    matched_fields: [...incident.matched_fields].sort(),
    source_event_types: [...incident.source_event_types].sort(),
    source_events: [...incident.source_events].sort(compareEventEnvelopes)
  };
}

function serializeState(state: LocalProcessingState): string {
  const incidents = Object.fromEntries(
    Object.entries(state.incidents)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([incidentId, incident]) => [incidentId, sortIncidentRecord(incident)])
  );

  return `${JSON.stringify({
    version: 1,
    last_processed_event_file: state.last_processed_event_file,
    incidents
  }, null, 2)}\n`;
}

export async function processCommand(
  input: { json?: boolean; preset?: CapturePreset },
  dependencies: ProcessCommandDependencies = {}
): Promise<CliCommandResult> {
  const cwd = dependencies.cwd ?? (() => process.cwd());
  const mkdir = dependencies.mkdir ?? mkdirFromFs;
  const readFile = dependencies.readFile ?? ((filePath: string) => readFileFromFs(filePath, "utf8"));
  const readdir = dependencies.readdir ?? readdirFromFs;
  const stat = dependencies.stat ?? statFromFs;
  const writeFile = dependencies.writeFile ?? ((filePath: string, content: string) => writeFileFromFs(filePath, content, "utf8"));
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

  const eventFileNames = await pathExists(eventsDirectoryPath, stat)
    ? (await readdir(eventsDirectoryPath)).filter((fileName) => fileName.endsWith(".events.json")).sort()
    : [];

  const lastProcessedEventFile = previousState?.last_processed_event_file ?? null;
  const newEventFileNames = lastProcessedEventFile === null
    ? eventFileNames
    : eventFileNames.filter((fileName) => fileName > lastProcessedEventFile);
  const processAllEventFiles = input.preset !== undefined;
  const targetEventFileNames = processAllEventFiles ? eventFileNames : newEventFileNames;

  if (targetEventFileNames.length === 0) {
    const summary = buildNoNewEventsSummary(previousState?.last_processed_event_file ?? eventFileNames.at(-1) ?? null);
    return {
      exitCode: 0,
      output: input.json === true ? JSON.stringify(summary) : formatProcessOutput(summary)
    };
  }

  const batches = await readEventBatches(eventsDirectoryPath, targetEventFileNames, readFile);
  const incidents = new Map<string, LocalIncidentState>(
    processAllEventFiles ? [] : Object.entries(previousState?.incidents ?? {})
  );
  const aggregates = new Map<string, AggregatedIncident>();
  const traceCorrelationGroups = new Map<string, { incidentIds: Set<string>; hasBackend: boolean; hasFrontend: boolean }>();
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
      const incidentId = deriveIncidentId(projectId, event.service.name, event.service.environment, incidentFingerprint);
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
        title: normalizedEvent.normalized_message,
        kind: "immediate",
        severity: inferSeverity(event, capturePreset)
      };

      for (const matchedField of inferMatchedFields(normalizedEvent)) {
        aggregate.matchedFields.add(matchedField);
      }

      aggregate.newEvents.push(event);
      aggregate.signalEventTypes.add(event.event_type);

      const traceId = getTraceId(event);
      if (traceId !== null) {
        aggregate.traceIds.add(traceId);
        const traceCorrelationGroup = traceCorrelationGroups.get(traceId) ?? {
          incidentIds: new Set<string>(),
          hasBackend: false,
          hasFrontend: false
        };

        traceCorrelationGroup.incidentIds.add(incidentId);
        traceCorrelationGroup.hasBackend ||= event.event_type === "backend_exception";
        traceCorrelationGroup.hasFrontend ||= event.event_type === "frontend_exception";
        traceCorrelationGroups.set(traceId, traceCorrelationGroup);
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

    const [nextRoot, absorbedRoot] = leftParent.localeCompare(rightParent) <= 0
      ? [leftParent, rightParent]
      : [rightParent, leftParent];
    aggregateParent.set(absorbedRoot, nextRoot);
  }

  for (const traceCorrelationGroup of traceCorrelationGroups.values()) {
    if (!traceCorrelationGroup.hasBackend || !traceCorrelationGroup.hasFrontend || traceCorrelationGroup.incidentIds.size < 2) {
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
  const requestAnomalyAggregates = input.preset === undefined ? [] : collectRequestAnomalyAggregates(batches, capturePreset);
  const finalizedAggregates = [...mergedAggregates, ...requestAnomalyAggregates].sort((left, right) => left.incidentId.localeCompare(right.incidentId));

  const services = new Map<string, number>();

  for (const aggregate of finalizedAggregates) {
    const incidentId = aggregate.incidentId;

    const existingIncidents = [...aggregate.mergedIncidentIds]
      .map((mergedIncidentId) => incidents.get(mergedIncidentId))
      .filter((incident): incident is LocalIncidentState => incident !== undefined);
    const existing = existingIncidents.find((incident) => incident.incident_id === incidentId) ?? existingIncidents[0];
    const existingSourceEvents = existingIncidents.flatMap((incident) => incident.source_events);
    const combinedSourceEvents = mergeSourceEvents(existingSourceEvents, aggregate.newEvents);
    const signalEvents = aggregate.kind === "request_anomaly"
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
    const severity = signalEvents
      .map((event) => inferSeverity(event, capturePreset, aggregate.kind))
      .sort((left, right) => severityRank(right) - severityRank(left))[0] ?? aggregate.severity;
    const generationNumber = signalEvents.length;
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
      fingerprint_version: FINGERPRINT_VERSION,
      title: aggregate.title,
      severity,
      status: existingIncidents.some((incidentState) => incidentState.status === "resolved") ? "open" : existing?.status ?? "open",
      first_seen_at: firstSignalEvent.occurred_at,
      last_seen_at: latestSignalEvent.occurred_at,
      occurrence_count: signalEvents.length,
      source_event_id: latestSignalEvent.event_id,
      source_occurred_at: latestSignalEvent.occurred_at,
      source_event_types: sourceEventTypes,
      matched_fields: mergeMatchedFields(existingIncidents.flatMap((incidentState) => incidentState.matched_fields), aggregate.matchedFields),
      bundle_path: bundlePath,
      reproduction_path: reproductionPath,
      generation_number: generationNumber,
      source_events: combinedSourceEvents
    };

    const jobTrigger: BuildBundleJob["trigger"] = existing?.status === "resolved" ? "regression_reopen" : "occurrence_threshold";
    const bundle = buildBundle({
      job: {
        trigger: jobTrigger
      },
      incident: buildBundleContext(incident),
      bundleMetadata: {
        generation_number: generationNumber,
        created_at: incident.first_seen_at,
        updated_at: incident.last_seen_at,
        source_event_id: incident.source_event_id,
        source_occurred_at: incident.source_occurred_at
      },
      sourceEnvelopes: combinedSourceEvents,
      probeDataItems: []
    });
    const reproduction = buildReproduction(bundle);
    const finalizedBundle = BundleV1Schema.parse({
      ...bundle,
      sdk: CLI_SDK,
      reproduction,
      links: {
        ...bundle.links,
        self: bundlePath,
        reproduction: reproductionPath
      },
      metadata: {
        ...bundle.metadata,
        created_at: incident.first_seen_at,
        updated_at: incident.last_seen_at,
        generator_version: CLI_GENERATOR_VERSION,
        generation_number: generationNumber
      }
    });

    await writeFile(join(rootDirectory, bundlePath), `${JSON.stringify(finalizedBundle, null, 2)}\n`);
    await writeFile(join(rootDirectory, reproductionPath), `${JSON.stringify(reproduction, null, 2)}\n`);

    for (const mergedIncidentId of aggregate.mergedIncidentIds) {
      if (mergedIncidentId !== incidentId) {
        incidents.delete(mergedIncidentId);
      }
    }

    incidents.set(incidentId, incident);
    services.set(incident.service_name, (services.get(incident.service_name) ?? 0) + 1);
  }

  const finalProcessedEventFile = targetEventFileNames[targetEventFileNames.length - 1] as string;
  const nextState: LocalProcessingState = {
    version: 1,
    last_processed_event_file: finalProcessedEventFile,
    incidents: Object.fromEntries([...incidents.entries()].sort(([left], [right]) => left.localeCompare(right)))
  };
  await writeFile(statePath, serializeState(nextState));

  const summary = buildProcessedSummary({
    filesProcessed: newEventFileNames.length,
    eventsProcessed,
    incidentsProcessed: finalizedAggregates.length,
    services: [...services.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([service, count]) => ({
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