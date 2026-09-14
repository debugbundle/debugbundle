import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpenAiAdmissionGate } from "../../../packages/mcp-core/src/openai-admission.js";

afterEach(() => vi.useRealTimers());
describe("bounded MCP admission", () => {
  it("absorbs a short parallel burst while never executing more than two calls", async () => {
    const gate = createOpenAiAdmissionGate({ concurrency: 2, perGrant: 2 });
    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        const release = await gate.acquire("grant");
        expect(release).not.toBeNull();
        peak = Math.max(peak, ++active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        release!();
      })
    );
    expect(peak).toBe(2);
    gate.close();
  });

  it("bounds a 10000-request burst, times out waiters, and recovers capacity", async () => {
    vi.useFakeTimers();
    const gate = createOpenAiAdmissionGate({ concurrency: 2, perGrant: 2 });
    const held = [await gate.acquire("grant"), await gate.acquire("grant")];
    const pending = Array.from({ length: 10_000 }, () => gate.acquire("grant"));
    await vi.advanceTimersByTimeAsync(1000);
    expect((await Promise.all(pending)).every((value) => value === null)).toBe(true);
    for (const release of held) release!();
    const release = await gate.acquire("grant");
    expect(release).not.toBeNull();
    release!();
    release!(); // cleanup is idempotent
    gate.close();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels queued requests and lets a different grant proceed", async () => {
    const gate = createOpenAiAdmissionGate({ concurrency: 2, perGrant: 1 });
    const release = await gate.acquire("first");
    const abort = new AbortController();
    const waiting = gate.acquire("first", abort.signal);
    const second = await gate.acquire("second");
    expect(second).not.toBeNull();
    abort.abort();
    expect(await waiting).toBeNull();
    release!();
    second!();
    gate.close();
    expect(await gate.acquire("closed")).toBeNull();
  });
});
