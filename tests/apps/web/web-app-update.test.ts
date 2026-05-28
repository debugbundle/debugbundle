import { describe, expect, it, vi } from "vitest";

import {
  APP_BUILD_STORAGE_KEY,
  fetchLatestAppBuildId,
  isDifferentAppBuild,
  rememberCurrentAppBuild
} from "../../../apps/web/src/lib/app-update.js";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("web app update detection", () => {
  it("records the current build without notifying on the first load", () => {
    const storage = new MemoryStorage();

    const result = rememberCurrentAppBuild({
      currentBuildId: "build-a",
      storage
    });

    expect(result).toEqual({ previousBuildId: null, updatedSinceLastLoad: false });
    expect(storage.getItem(APP_BUILD_STORAGE_KEY)).toBe("build-a");
  });

  it("detects a newly loaded build after a previous build was seen", () => {
    const storage = new MemoryStorage();
    storage.setItem(APP_BUILD_STORAGE_KEY, "build-a");

    const result = rememberCurrentAppBuild({
      currentBuildId: "build-b",
      storage
    });

    expect(result).toEqual({ previousBuildId: "build-a", updatedSinceLastLoad: true });
    expect(storage.getItem(APP_BUILD_STORAGE_KEY)).toBe("build-b");
  });

  it("ignores development builds for persisted update notifications", () => {
    const storage = new MemoryStorage();
    storage.setItem(APP_BUILD_STORAGE_KEY, "build-a");

    const result = rememberCurrentAppBuild({
      currentBuildId: "development",
      storage
    });

    expect(result).toEqual({ previousBuildId: null, updatedSinceLastLoad: false });
    expect(storage.getItem(APP_BUILD_STORAGE_KEY)).toBe("build-a");
  });

  it("detects when the remote version manifest is newer than the running build", () => {
    expect(isDifferentAppBuild({ currentBuildId: "build-a", latestBuildId: "build-b" })).toBe(true);
    expect(isDifferentAppBuild({ currentBuildId: "build-a", latestBuildId: "build-a" })).toBe(false);
    expect(isDifferentAppBuild({ currentBuildId: "development", latestBuildId: "build-b" })).toBe(false);
    expect(isDifferentAppBuild({ currentBuildId: "build-a", latestBuildId: null })).toBe(false);
  });

  it("fetches the latest build id with cache bypassing", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ build_id: "build-b" }), { status: 200 }));

    await expect(
      fetchLatestAppBuildId({
        fetchImpl: fetchMock,
        versionUrl: "/version.json",
        cacheBustValue: "test-cache-bust"
      })
    ).resolves.toBe("build-b");

    expect(fetchMock).toHaveBeenCalledWith("/version.json?v=test-cache-bust", { cache: "no-store" });
  });

  it("treats missing or invalid version manifests as unavailable", async () => {
    await expect(
      fetchLatestAppBuildId({
        fetchImpl: vi.fn(async () => new Response("not found", { status: 404 })),
        cacheBustValue: "test-cache-bust"
      })
    ).resolves.toBeNull();

    await expect(
      fetchLatestAppBuildId({
        fetchImpl: vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
        cacheBustValue: "test-cache-bust"
      })
    ).resolves.toBeNull();
  });
});
