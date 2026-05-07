import { createHash } from "node:crypto";
import { mkdir as mkdirFromFs, readFile as readFileFromFs, rename as renameFromFs, writeFile as writeFileFromFs } from "node:fs/promises";
import { basename, join } from "node:path";

import { z } from "zod";

import { formatAcceptedLogFormats, parseAcceptedLogFormat, parseLogFile, type AcceptedLogFormat, type LogParseProfile } from "../../../packages/log-parser/src/index.js";
import { type EventEnvelope } from "../../../packages/shared-types/src/index.js";
import { PROFILE_FILE_PATH } from "./local-scaffold.js";
import { processCommand as defaultProcessCommand } from "./process-command.js";
import type { CliCommandResult } from "./token-commands.js";

type DirectoryMaker = (path: string, options: { recursive: true }) => Promise<void>;
type FileReader = (path: string) => Promise<string>;
type FileRenamer = (sourcePath: string, destinationPath: string) => Promise<void>;
type FileWriter = (path: string, content: string) => Promise<void>;

type IngestCommandInput = {
  filePath: string;
  format: string;
  json?: boolean;
};

type IngestCommandDependencies = {
  cwd?: () => string;
  mkdir?: DirectoryMaker;
  processCommand?: typeof defaultProcessCommand;
  readFile?: FileReader;
  rename?: FileRenamer;
  writeFile?: FileWriter;
};

export type ProjectProfile = LogParseProfile;

export type ProcessSummary = {
  status: string;
  processed: boolean;
  files_processed: number;
  events_processed: number;
  incidents_processed: number;
  services: Array<{ service: string; incidents: number }>;
  last_processed_event_file: string | null;
  message?: string;
};

export const LOCAL_EVENTS_DIRECTORY_PATH = ".debugbundle/local/events";

const ProfileSchema = z.object({
  project: z.object({
    name: z.string().min(1),
    repo_url: z.string()
  }),
  services: z.array(z.object({
    name: z.string().min(1),
    kind: z.enum(["frontend", "backend", "worker"]),
    runtime: z.string().min(1),
    framework: z.string().min(1)
  }))
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function slugify(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : "application";
}

export function buildEventFileName(events: EventEnvelope[], filePath: string): string {
  const lastOccurredAt = events.reduce((latest, event) => {
    const candidate = Date.parse(event.occurred_at);
    return Number.isFinite(candidate) && candidate > latest ? candidate : latest;
  }, 0);
  const digest = createHash("sha256")
    .update([filePath, ...events.map((event) => event.event_id)].join("\u0000"))
    .digest("hex")
    .slice(0, 8);
  return `${lastOccurredAt}-${digest}-${slugify(events[0]?.service.name ?? basename(filePath))}.events.json`;
}

function formatHumanOutput(summary: {
  format: AcceptedLogFormat;
  sourceFile: string;
  eventFile: string;
  eventsIngested: number;
  process: ProcessSummary;
}): string {
  return [
    `Ingested ${summary.eventsIngested} events from ${summary.sourceFile} using ${summary.format}.`,
    `Wrote local batch: ${summary.eventFile}`,
    `Processed ${summary.process.events_processed} events into ${summary.process.incidents_processed} incidents.`
  ].join("\n");
}

export async function readProfile(rootDirectory: string, readFile: FileReader): Promise<ProjectProfile> {
  const parsedProfile = ProfileSchema.safeParse(JSON.parse(await readFile(join(rootDirectory, PROFILE_FILE_PATH))));
  if (!parsedProfile.success) {
    throw new Error(`Invalid ${PROFILE_FILE_PATH}`);
  }

  return parsedProfile.data;
}

export async function ingestCommand(
  input: IngestCommandInput,
  dependencies: IngestCommandDependencies = {}
): Promise<CliCommandResult> {
  const parsedFormat = parseAcceptedLogFormat(input.format);
  if (parsedFormat === null) {
    return {
      exitCode: 4,
      output: `Unsupported --format value. Expected one of: ${formatAcceptedLogFormats()}.`
    };
  }

  const cwd = dependencies.cwd ?? (() => process.cwd());
  const mkdir = dependencies.mkdir ?? (async (path: string, options: { recursive: true }) => mkdirFromFs(path, options));
  const processLocalEvents = dependencies.processCommand ?? defaultProcessCommand;
  const readFile = dependencies.readFile ?? (async (path: string) => readFileFromFs(path, "utf8"));
  const rename = dependencies.rename ?? (async (sourcePath: string, destinationPath: string) => renameFromFs(sourcePath, destinationPath));
  const writeFile = dependencies.writeFile ?? (async (path: string, content: string) => writeFileFromFs(path, content, "utf8"));

  try {
    const rootDirectory = cwd();
    const profile = await readProfile(rootDirectory, readFile);
    const content = await readFile(input.filePath);
    const events = parseLogFile(content, {
      filePath: input.filePath,
      format: parsedFormat,
      profile
    });

    if (events.length === 0) {
      return {
        exitCode: 4,
        output: "No supported events were found in the input file."
      };
    }

    const eventDirectory = join(rootDirectory, LOCAL_EVENTS_DIRECTORY_PATH);
    const eventFile = buildEventFileName(events, input.filePath);
    const destinationPath = join(eventDirectory, eventFile);
    const temporaryPath = `${destinationPath}.tmp`;

    await mkdir(eventDirectory, { recursive: true });
    await writeFile(temporaryPath, `${JSON.stringify(events, null, 2)}\n`);
    await rename(temporaryPath, destinationPath);

    const processResult = dependencies.processCommand === undefined
      ? await processLocalEvents({ json: true }, { cwd })
      : await processLocalEvents({ json: true });
    if (processResult.exitCode !== 0) {
      return processResult;
    }

    const parsedProcess = JSON.parse(processResult.output) as ProcessSummary;
    const outputSummary = {
      status: "ok",
      source_file: input.filePath,
      format: parsedFormat,
      event_file: eventFile,
      events_ingested: events.length,
      process: parsedProcess
    };

    return {
      exitCode: 0,
      output: input.json === true ? JSON.stringify(outputSummary, null, 2) : formatHumanOutput({
        format: parsedFormat,
        sourceFile: input.filePath,
        eventFile,
        eventsIngested: events.length,
        process: parsedProcess
      })
    };
  } catch (error) {
    const message = isRecord(error) && typeof error["message"] === "string" ? error["message"] : "Failed to ingest log file.";
    return {
      exitCode: 1,
      output: message
    };
  }
}