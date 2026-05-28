export const APP_BUILD_STORAGE_KEY = "debugbundle:last-seen-app-build-id";
export const APP_VERSION_URL = "/version.json";
export const DEBUGBUNDLE_CHANGELOG_URL = "https://debugbundle.com/changelog/";

export interface AppVersionPayload {
  build_id: string;
}

interface BuildStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function getCurrentAppBuildId(): string {
  if (typeof __DEBUGBUNDLE_APP_BUILD_ID__ === "string" && __DEBUGBUNDLE_APP_BUILD_ID__.trim().length > 0) {
    return __DEBUGBUNDLE_APP_BUILD_ID__.trim();
  }

  return "development";
}

export function rememberCurrentAppBuild(input: {
  currentBuildId: string;
  storage: BuildStorage;
}): { previousBuildId: string | null; updatedSinceLastLoad: boolean } {
  const currentBuildId = input.currentBuildId.trim();
  if (currentBuildId.length === 0 || currentBuildId === "development") {
    return { previousBuildId: null, updatedSinceLastLoad: false };
  }

  const previousBuildId = input.storage.getItem(APP_BUILD_STORAGE_KEY);
  input.storage.setItem(APP_BUILD_STORAGE_KEY, currentBuildId);

  return {
    previousBuildId,
    updatedSinceLastLoad: previousBuildId !== null && previousBuildId !== currentBuildId
  };
}

export function isDifferentAppBuild(input: {
  currentBuildId: string;
  latestBuildId: string | null;
}): boolean {
  const currentBuildId = input.currentBuildId.trim();
  const latestBuildId = input.latestBuildId?.trim() ?? "";

  return (
    currentBuildId.length > 0 &&
    currentBuildId !== "development" &&
    latestBuildId.length > 0 &&
    latestBuildId !== currentBuildId
  );
}

export async function fetchLatestAppBuildId(input: {
  fetchImpl?: typeof fetch;
  versionUrl?: string;
  cacheBustValue?: string;
} = {}): Promise<string | null> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const versionUrl = input.versionUrl ?? APP_VERSION_URL;
  const separator = versionUrl.includes("?") ? "&" : "?";
  const cacheBustValue = input.cacheBustValue ?? Date.now().toString();
  const response = await fetchImpl(`${versionUrl}${separator}v=${encodeURIComponent(cacheBustValue)}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as Partial<AppVersionPayload>;
  return typeof payload.build_id === "string" && payload.build_id.trim().length > 0 ? payload.build_id.trim() : null;
}
