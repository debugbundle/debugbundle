import { join } from "node:path";
import { validateEvent } from "../../../packages/event-normalizer/src/index.js";
import { bindLocalProjectScope } from "../../../packages/event-normalizer/src/local-correlation-scope.js";
import { type EventEnvelope } from "../../../packages/shared-types/src/index.js";
import { isRecord } from "./cli-fs-helpers.js";
import {
  compareEventEnvelopes,
  parseState,
  type LocalIncidentState,
  type LocalProcessingState
} from "./local-processing-state.js";
type FileReader = (path: string) => Promise<string>;
type StatReader = (path: string) => Promise<{ isDirectory(): boolean; isFile(): boolean }>;
export type EventBatch = { fileName: string; events: EventEnvelope[] };
const LOCAL_EVENTS_DIRECTORY_PATH = ".debugbundle/local/events";
export async function pathExists(path: string, stat: StatReader): Promise<boolean> {
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

export async function readState(
  statePath: string,
  readFile: FileReader,
  stat: StatReader
): Promise<LocalProcessingState | null> {
  if (!(await pathExists(statePath, stat))) {
    return null;
  }

  try {
    return parseState(await readFile(statePath));
  } catch (error) {
    // Corrupt JSON retains the existing retained-event rebuild behavior. Filesystem
    // safety/read failures must never be mistaken for an empty store.
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

export async function readEventBatches(
  eventDirectoryPath: string,
  fileNames: string[],
  readFile: FileReader
): Promise<EventBatch[]> {
  const batches: EventBatch[] = [];

  for (const fileName of fileNames) {
    const filePath = join(eventDirectoryPath, fileName);
    const parsed = JSON.parse(await readFile(filePath)) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error(
        `Invalid local event batch in ${join(LOCAL_EVENTS_DIRECTORY_PATH, fileName)}.`
      );
    }

    const validatedEvents: EventEnvelope[] = [];
    for (const eventCandidate of parsed) {
      const validated = validateEvent(eventCandidate);
      if (!validated.success) {
        const issue = validated.error.issues[0]?.message ?? "Unknown event validation error.";
        throw new Error(
          `Invalid local event in ${join(LOCAL_EVENTS_DIRECTORY_PATH, fileName)}: ${issue}`
        );
      }
      validatedEvents.push(bindLocalProjectScope(validated.data));
    }

    batches.push({
      fileName,
      events: validatedEvents.sort(compareEventEnvelopes)
    });
  }

  return batches;
}

function sortIncidentRecord(incident: LocalIncidentState): LocalIncidentState {
  return {
    ...incident,
    matched_fields: [...incident.matched_fields].sort(),
    source_event_types: [...incident.source_event_types].sort(),
    source_events: [...incident.source_events].sort(compareEventEnvelopes)
  };
}

export function serializeState(state: LocalProcessingState): string {
  const incidents = Object.fromEntries(
    Object.entries(state.incidents)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([incidentId, incident]) => [incidentId, sortIncidentRecord(incident)])
  );

  return `${JSON.stringify(
    {
      version: 1,
      last_processed_event_file: state.last_processed_event_file,
      incidents,
      ...(state.diagnostic_contexts === undefined
        ? {}
        : {
            diagnostic_contexts: state.diagnostic_contexts,
            diagnostic_receipts: state.diagnostic_receipts,
            diagnostic_payload_hashes: state.diagnostic_payload_hashes
          })
    },
    null,
    2
  )}\n`;
}
