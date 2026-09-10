import assert from "node:assert/strict";
import { setImmediate as yieldLoop } from "node:timers/promises";
import { queryObjects } from "node:v8";

import {
  createWorkerShutdownState,
  delayUntilNextPollOrShutdown
} from "../apps/worker/src/worker-env.ts";

// Synthetic idle polls only: no worker jobs, providers, customer data, or live timers.
// Full GC/object counts distinguish retained reactions from ordinary heap allocation.
assert.equal(typeof globalThis.gc, "function", "run with node --expose-gc --import tsx");
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
const timers = new Map();
let nextTimer = 0;
globalThis.setTimeout = (callback) => {
  const id = ++nextTimer;
  timers.set(id, callback);
  return id;
};
globalThis.clearTimeout = (id) => timers.delete(id);

const shutdown = createWorkerShutdownState();
async function polls(count) {
  for (let index = 0; index < count; index++) {
    const waiting = delayUntilNextPollOrShutdown(250, shutdown);
    for (const [id, callback] of timers) {
      timers.delete(id);
      callback();
    }
    await waiting;
  }
  await yieldLoop();
}

function sample(label) {
  globalThis.gc();
  const promises = queryObjects(Promise, { format: "count" });
  globalThis.gc();
  const result = {
    label,
    promises,
    heap_used: process.memoryUsage().heapUsed,
    timers: timers.size
  };
  console.log(JSON.stringify(result));
  return result;
}

try {
  await polls(2000);
  const baseline = sample("warm");
  for (const label of ["100k", "200k"]) {
    await polls(100_000);
    const current = sample(label);
    assert.equal(current.timers, 0, "completed polls must release timers");
    assert.ok(
      current.promises - baseline.promises < 2048,
      "polls retain shutdown promise reactions"
    );
    assert.ok(current.heap_used - baseline.heap_used < 4 * 1024 * 1024, "polls retain excess heap");
  }

  const mainPoll = delayUntilNextPollOrShutdown(60_000, shutdown);
  const availabilityPoll = delayUntilNextPollOrShutdown(250, shutdown);
  shutdown.requestShutdown();
  await Promise.all([mainPoll, availabilityPoll]);
  assert.equal(timers.size, 0, "shutdown must clear both polling timers");
  await yieldLoop();
  sample("shutdown");
} finally {
  shutdown.requestShutdown();
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
}
