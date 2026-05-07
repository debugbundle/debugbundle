import { readFile as readFileFromFs, stat as statFromFs, rename as renameFromFs, writeFile as writeFileFromFs, mkdir as mkdirFromFs } from "node:fs/promises";
import { join } from "node:path";

import { formatAcceptedLogFormats, parseAcceptedLogFormat, parseLogFile } from "../../../packages/log-parser/src/index.js";

import { readConnectionConfig } from "./connection-config.js";
import { buildEventFileName, LOCAL_EVENTS_DIRECTORY_PATH, readProfile, type ProcessSummary } from "./ingest-command.js";
import { processCommand as defaultProcessCommand } from "./process-command.js";
import type { CliCommandResult } from "./token-commands.js";

type DirectoryMaker = (path: string, options: { recursive: true }) => Promise<void>;
type FileReader = (path: string) => Promise<Buffer>;
type FileRenamer = (sourcePath: string, destinationPath: string) => Promise<void>;
type FileWriter = (path: string, content: string) => Promise<void>;
type StatReader = (path: string) => Promise<{ size: number }>;
type Sleeper = (milliseconds: number) => Promise<void>;

type WatchCommandInput = {
  logPath: string;
  format: string;
  cloud?: boolean;
  json?: boolean;
};

type WatchCommandDependencies = {
  cwd?: () => string;
  mkdir?: DirectoryMaker;
  pollIntervalMs?: number;
  processCommand?: typeof defaultProcessCommand;
  readFile?: FileReader;
  readEnv?: (name: string) => string | undefined;
  rename?: FileRenamer;
  sendEvents?: (input: { baseUrl: string; projectToken: string; events: Array<unknown> }) => Promise<{ accepted: number; rejected: number; errors: Array<{ index: number; reason: string }> }>;
  signal?: AbortSignal;
  sleep?: Sleeper;
  stat?: StatReader;
  writeFile?: FileWriter;
  fetchImpl?: typeof fetch;
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

async function sendEventsToApi(
  input: { baseUrl: string; projectToken: string; events: Array<unknown> },
  dependencies?: { fetchImpl?: typeof fetch }
): Promise<{ accepted: number; rejected: number; errors: Array<{ index: number; reason: string }> }> {
  const fetchImpl = dependencies?.fetchImpl ?? fetch;
  const response = await fetchImpl(`${normalizeBaseUrl(input.baseUrl)}/v1/events`, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${input.projectToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      events: input.events
    })
  });

  const body = JSON.parse(await response.text()) as {
    accepted: number;
    rejected: number;
    errors: Array<{ index: number; reason: string }>;
    error?: string;
  };
  if (response.status < 200 || response.status >= 300) {
    throw new Error(typeof body.error === "string" ? body.error : `watch_cloud_ingestion_failed:${response.status}`);
  }

  return {
    accepted: body.accepted,
    rejected: body.rejected,
    errors: body.errors
  };
}

function formatHumanOutput(summary: {
  format: string;
  logPath: string;
  eventsIngested: number;
  batchesHandled: number;
  actionLabel: string;
}): string {
  return [
    `Watched ${summary.logPath} using ${summary.format}.`,
    `Ingested ${summary.eventsIngested} events across ${summary.batchesHandled} batches.`,
    `${summary.actionLabel} ${summary.batchesHandled} time${summary.batchesHandled === 1 ? "" : "s"}.`
  ].join("\n");
}

export async function watchCommand(
  input: WatchCommandInput,
  dependencies: WatchCommandDependencies = {}
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
  const pollIntervalMs = dependencies.pollIntervalMs ?? 1000;
  const processLocalEvents = dependencies.processCommand ?? defaultProcessCommand;
  const readFile = dependencies.readFile ?? (async (path: string) => readFileFromFs(path));
  const readEnv = dependencies.readEnv ?? ((name: string) => process.env[name]);
  const rename = dependencies.rename ?? (async (sourcePath: string, destinationPath: string) => renameFromFs(sourcePath, destinationPath));
  const fetchDependencies = dependencies.fetchImpl === undefined ? undefined : { fetchImpl: dependencies.fetchImpl };
  const sendEvents = dependencies.sendEvents ?? ((requestInput: { baseUrl: string; projectToken: string; events: Array<unknown> }) => sendEventsToApi(requestInput, fetchDependencies));
  const signal = dependencies.signal;
  const sleep = dependencies.sleep ?? (async (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const stat = dependencies.stat ?? statFromFs;
  const writeFile = dependencies.writeFile ?? (async (path: string, content: string) => writeFileFromFs(path, content, "utf8"));

  try {
    const rootDirectory = cwd();
    const profile = await readProfile(rootDirectory, async (path) => (await readFile(path)).toString("utf8"));
    const eventDirectory = join(rootDirectory, LOCAL_EVENTS_DIRECTORY_PATH);
    const useCloudDelivery = input.cloud === true;
    const connectionConfig = useCloudDelivery ? await readConnectionConfig(rootDirectory, async (path) => (await readFile(path)).toString("utf8")) : null;
    const projectToken = useCloudDelivery ? readEnv("DEBUGBUNDLE_PROJECT_TOKEN") : undefined;
    const cloudBaseUrl = useCloudDelivery ? connectionConfig?.cloud_base_url ?? null : null;
    if (
      useCloudDelivery
      && (
        connectionConfig === null
        || connectionConfig.mode !== "connected"
        || cloudBaseUrl === null
        || connectionConfig.environments.production.delivery !== "cloud-enabled"
        || typeof projectToken !== "string"
        || projectToken.length === 0
      )
    ) {
      return {
        exitCode: 4,
        output: "Cloud watch requires a connected project with cloud delivery enabled and DEBUGBUNDLE_PROJECT_TOKEN set."
      };
    }

    let offset = (await stat(input.logPath)).size;
    let pendingChunk = "";
    let knownTail = "";
    let eventsIngested = 0;
    let batchesWritten = 0;
    let processRuns = 0;
    let lastEventFile: string | null = null;

    await mkdir(eventDirectory, { recursive: true });

    while (signal?.aborted !== true) {
      const currentSize = (await stat(input.logPath)).size;
      if (currentSize < offset) {
        offset = 0;
        pendingChunk = "";
        knownTail = "";
      }

      if (currentSize > offset) {
        const fileBuffer = await readFile(input.logPath);
        const comparableTailLength = Math.min(Buffer.byteLength(knownTail), offset);
        if (comparableTailLength > 0) {
          const previousTail = fileBuffer.subarray(offset - comparableTailLength, offset).toString("utf8");
          const expectedTail = Buffer.from(knownTail).subarray(Buffer.byteLength(knownTail) - comparableTailLength).toString("utf8");
          if (previousTail !== expectedTail) {
            offset = 0;
            pendingChunk = "";
          }
        }

        const appendedChunk = fileBuffer.subarray(offset).toString("utf8");
        offset = fileBuffer.length;
        knownTail = fileBuffer.subarray(Math.max(0, fileBuffer.length - 256)).toString("utf8");

        const combinedChunk = `${pendingChunk}${appendedChunk}`;
        const lastNewlineIndex = combinedChunk.lastIndexOf("\n");
        if (lastNewlineIndex >= 0) {
          const completeChunk = combinedChunk.slice(0, lastNewlineIndex + 1);
          pendingChunk = combinedChunk.slice(lastNewlineIndex + 1);

          const events = parseLogFile(completeChunk, {
            filePath: input.logPath,
            format: parsedFormat,
            profile
          });

          if (events.length > 0) {
            if (useCloudDelivery) {
              const result = await sendEvents({
                baseUrl: cloudBaseUrl as string,
                projectToken: projectToken as string,
                events
              });
              if (result.accepted < events.length || result.rejected > 0 || result.errors.length > 0) {
                return {
                  exitCode: 1,
                  output: "Cloud watch ingestion did not fully accept the appended batch."
                };
              }

              eventsIngested += events.length;
              batchesWritten += 1;
            } else {
              const eventFile = buildEventFileName(events, `${input.logPath}:${batchesWritten + 1}`);
              const destinationPath = join(eventDirectory, eventFile);
              const temporaryPath = `${destinationPath}.tmp`;

              await writeFile(temporaryPath, `${JSON.stringify(events, null, 2)}\n`);
              await rename(temporaryPath, destinationPath);

              const processResult = dependencies.processCommand === undefined
                ? await processLocalEvents({ json: true }, { cwd })
                : await processLocalEvents({ json: true });
              if (processResult.exitCode !== 0) {
                return processResult;
              }

              eventsIngested += events.length;
              batchesWritten += 1;
              processRuns += 1;
              lastEventFile = eventFile;
              JSON.parse(processResult.output) as ProcessSummary;
            }
          }
        } else {
          pendingChunk = combinedChunk;
        }
      }

      await sleep(pollIntervalMs);
    }

    const outputSummary = {
      status: "ok",
      mode: useCloudDelivery ? "cloud" : "local",
      log_path: input.logPath,
      format: parsedFormat,
      events_ingested: eventsIngested,
      ...(useCloudDelivery ? { batches_shipped: batchesWritten } : { batches_written: batchesWritten }),
      ...(useCloudDelivery ? {} : { process_runs: processRuns, last_event_file: lastEventFile }),
      stopped_by: "signal"
    };

    return {
      exitCode: 0,
      output: input.json === true ? JSON.stringify(outputSummary, null, 2) : formatHumanOutput({
        format: parsedFormat,
        logPath: input.logPath,
        eventsIngested,
        batchesHandled: batchesWritten,
        actionLabel: useCloudDelivery ? "Shipped cloud batches" : `Ran local processing`
      })
    };
  } catch (error) {
    return {
      exitCode: 1,
      output: error instanceof Error ? error.message : "Failed to watch log file."
    };
  }
}