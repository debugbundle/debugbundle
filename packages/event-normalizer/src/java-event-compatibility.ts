const JAVA_SDK_NAME = "@debugbundle/sdk-java";
const LEGACY_MEMORY_KEYS = new Set(["max_bytes", "total_bytes", "free_bytes"]);

export type InstalledJavaCompatibility = "legacy_java_runtime_event";

function isRecord(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === "object" && candidate !== null && !Array.isArray(candidate);
}

function isNonNegativeFiniteNumber(candidate: unknown): candidate is number {
  return typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0;
}

function readLegacyRuntime(candidate: unknown): {
  runtime: Record<string, unknown>;
  memory: {
    max_bytes: number;
    total_bytes: number;
    free_bytes: number;
  };
  jvmName: string;
} | null {
  if (!isRecord(candidate)) {
    return null;
  }

  const memory = candidate["memory"];
  if (!isRecord(memory)) {
    return null;
  }
  const memoryKeys = Object.keys(memory);
  if (
    memoryKeys.length !== LEGACY_MEMORY_KEYS.size ||
    !memoryKeys.every((key) => LEGACY_MEMORY_KEYS.has(key))
  ) {
    return null;
  }

  const maxBytes = memory["max_bytes"];
  const totalBytes = memory["total_bytes"];
  const freeBytes = memory["free_bytes"];
  const jvmName = candidate["jvm_name"];
  const frameworkExtras = candidate["framework_extras"];
  if (
    !isNonNegativeFiniteNumber(maxBytes) ||
    !isNonNegativeFiniteNumber(totalBytes) ||
    !isNonNegativeFiniteNumber(freeBytes) ||
    maxBytes < totalBytes ||
    freeBytes > totalBytes ||
    typeof jvmName !== "string" ||
    jvmName.length === 0 ||
    (frameworkExtras !== undefined && frameworkExtras !== null && !isRecord(frameworkExtras))
  ) {
    return null;
  }

  return {
    runtime: candidate,
    memory: {
      max_bytes: maxBytes,
      total_bytes: totalBytes,
      free_bytes: freeBytes
    },
    jvmName
  };
}

/**
 * Identifies only the non-canonical runtime shape emitted by released Java SDKs.
 * Canonical Java events and all other SDK identities remain on the strict path.
 */
export function classifyInstalledJavaEventCompatibility(
  candidate: unknown
): InstalledJavaCompatibility | null {
  if (
    !isRecord(candidate) ||
    candidate["sdk_name"] !== JAVA_SDK_NAME ||
    candidate["event_type"] !== "backend_exception"
  ) {
    return null;
  }

  const payload = candidate["payload"];
  if (!isRecord(payload) || readLegacyRuntime(payload["runtime"]) === null) {
    return null;
  }
  return "legacy_java_runtime_event";
}

export function normalizeInstalledJavaEvent(candidate: unknown): unknown {
  if (classifyInstalledJavaEventCompatibility(candidate) === null || !isRecord(candidate)) {
    return candidate;
  }

  const payload = candidate["payload"] as Record<string, unknown>;
  const legacy = readLegacyRuntime(payload["runtime"]);
  if (legacy === null) {
    return candidate;
  }

  const existingExtras = isRecord(legacy.runtime["framework_extras"])
    ? legacy.runtime["framework_extras"]
    : {};
  const runtime = { ...legacy.runtime };
  runtime["memory"] = {
    rss: null,
    heap_total: legacy.memory.total_bytes,
    heap_used: legacy.memory.total_bytes - legacy.memory.free_bytes,
    external: null,
    peak: null
  };
  runtime["framework_extras"] = {
    ...existingExtras,
    jvm_name: legacy.jvmName,
    jvm_max_bytes: legacy.memory.max_bytes
  };
  delete runtime["jvm_name"];

  return {
    ...candidate,
    payload: {
      ...payload,
      runtime
    }
  };
}
