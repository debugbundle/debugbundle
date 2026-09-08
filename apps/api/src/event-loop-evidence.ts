import { rename, writeFile } from "node:fs/promises";
import { monitorEventLoopDelay } from "node:perf_hooks";

export const API_EVENT_LOOP_EVIDENCE_PATH = "/tmp/debugbundle-openai-event-loop.json";

const DEFAULT_SAMPLE_INTERVAL_MS = 30_000;
const EVENT_LOOP_HISTOGRAM_RESOLUTION_MS = 20;

interface EventLoopHistogram {
  enable(): void;
  disable(): void;
  percentile(percentile: number): number;
}

interface ApiEventLoopEvidenceOptions {
  filePath?: string;
  sampleIntervalMs?: number;
  now?: () => Date;
  histogram?: EventLoopHistogram;
  setIntervalImpl?: (callback: () => void, delayMs: number) => NodeJS.Timeout;
  clearIntervalImpl?: (handle: NodeJS.Timeout) => void;
}

export interface ApiEventLoopEvidenceRecorder {
  writeSample(): Promise<void>;
  stop(): void;
}

export function startHostedMcpEventLoopEvidence(
  hostedMcpEnabled: boolean,
  start: () => ApiEventLoopEvidenceRecorder = startApiEventLoopEvidence
): ApiEventLoopEvidenceRecorder | undefined {
  return hostedMcpEnabled ? start() : undefined;
}

/**
 * Records one bounded operational measurement for the hosted capacity gate.
 * The file is local to the API container, contains no request or customer data,
 * and is overwritten atomically so it cannot become an unbounded log stream.
 */
export function startApiEventLoopEvidence(
  options: ApiEventLoopEvidenceOptions = {}
): ApiEventLoopEvidenceRecorder {
  const filePath = options.filePath ?? API_EVENT_LOOP_EVIDENCE_PATH;
  const sampleIntervalMs = options.sampleIntervalMs ?? DEFAULT_SAMPLE_INTERVAL_MS;
  const now = options.now ?? (() => new Date());
  const histogram =
    options.histogram ??
    monitorEventLoopDelay({
      resolution: EVENT_LOOP_HISTOGRAM_RESOLUTION_MS
    });
  const setIntervalImpl = options.setIntervalImpl ?? setInterval;
  const clearIntervalImpl = options.clearIntervalImpl ?? clearInterval;
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  let stopped = false;
  let pendingWrite: Promise<void> | undefined;

  histogram.enable();

  async function writeSample(): Promise<void> {
    if (stopped) {
      return;
    }
    if (pendingWrite !== undefined) {
      return pendingWrite;
    }

    const sample = {
      schema_version: "1.0.0",
      sampled_at: now().toISOString(),
      event_loop_lag_p95_ms: Number((histogram.percentile(95) / 1_000_000).toFixed(3))
    };
    const write = writeFile(temporaryPath, `${JSON.stringify(sample)}\n`, {
      encoding: "utf8",
      mode: 0o600
    })
      .then(async () => rename(temporaryPath, filePath))
      .finally(() => {
        pendingWrite = undefined;
      });
    pendingWrite = write;
    return write;
  }

  const interval = setIntervalImpl(() => {
    void writeSample().catch(() => undefined);
  }, sampleIntervalMs);
  interval.unref();

  return {
    writeSample,
    stop() {
      if (stopped) {
        return;
      }
      stopped = true;
      clearIntervalImpl(interval);
      histogram.disable();
    }
  };
}
