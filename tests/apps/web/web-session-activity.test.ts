// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribeToSessionActivity } from "../../../apps/web/src/lib/session-activity.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function setup(renew = vi.fn().mockResolvedValue(undefined)) {
  vi.useFakeTimers();
  const listeners = new Map<string, EventListener>();
  vi.spyOn(document, "addEventListener").mockImplementation((name, listener) => {
    listeners.set(name, listener as EventListener);
  });
  vi.spyOn(window, "addEventListener").mockImplementation((name, listener) => {
    listeners.set(name, listener as EventListener);
  });
  const visible = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const focused = vi.spyOn(document, "hasFocus").mockReturnValue(true);
  const stop = subscribeToSessionActivity(renew);
  const emit = async (type: string, isTrusted = true) => {
    listeners.get(type)?.({ type, isTrusted } as Event);
    await Promise.resolve();
    await Promise.resolve();
  };
  return { renew, visible, focused, emit, stop };
}

describe("foreground session activity", () => {
  it("renews on trusted input or tab return, throttles bursts and never runs a keepalive timer", async () => {
    const { renew, emit, stop } = setup();
    expect(renew).not.toHaveBeenCalled();
    await emit("pointerdown");
    await emit("keydown");
    await emit("wheel");
    await emit("focus");
    expect(renew).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(renew).toHaveBeenCalledOnce();
    await emit("visibilitychange");
    expect(renew).toHaveBeenCalledTimes(2);
    stop();
    await vi.advanceTimersByTimeAsync(300_000);
    await emit("pointerdown");
    expect(renew).toHaveBeenCalledTimes(2);
  });
  it("ignores hidden, unfocused and synthetic events", async () => {
    const { renew, visible, focused, emit, stop } = setup();
    await emit("pointerdown", false);
    visible.mockReturnValue("hidden");
    await emit("focus");
    visible.mockReturnValue("visible");
    focused.mockReturnValue(false);
    await emit("keydown");
    expect(renew).not.toHaveBeenCalled();
    focused.mockReturnValue(true);
    await emit("focus");
    expect(renew).toHaveBeenCalledOnce();
    stop();
  });
  it("coalesces in-flight renewals and retries transient failures only on later activity", async () => {
    let reject!: (error: Error) => void;
    const renew = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, fail) => {
            reject = fail;
          })
      )
      .mockResolvedValue(undefined);
    const { emit, stop } = setup(renew);
    await emit("focus");
    await vi.advanceTimersByTimeAsync(600_000);
    await emit("keydown");
    expect(renew).toHaveBeenCalledOnce();
    reject(new Error("offline"));
    await Promise.resolve();
    await Promise.resolve();
    await emit("keydown");
    expect(renew).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(60_000);
    await emit("pointerdown");
    expect(renew).toHaveBeenCalledTimes(2);
    stop();
  });
});
