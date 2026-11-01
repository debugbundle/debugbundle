import type { BundleV1, EventEnvelope } from "../../shared-types/src/index.js";
import {
  ExceptionEvidenceV1Schema,
  type ExceptionEvidenceV1
} from "../../shared-types/src/exception-evidence.js";
import { truncateUtf8 as bounded } from "../../shared-types/src/evidence-bounds.js";
import type { BundleBuildContext } from "../../storage/src/bundle-types.js";
import { parseStackFrames } from "./stack-frames.js";

function evidenceRuntime(event: EventEnvelope): ExceptionEvidenceV1["runtime"] {
  const runtime = event.service.runtime?.slice(0, 128).toLowerCase() ?? "unknown";
  const aliases: Record<string, ExceptionEvidenceV1["runtime"]> = {
    node: "node",
    nodejs: "node",
    browser: "browser",
    java: "jvm",
    jvm: "jvm",
    php: "php",
    python: "python",
    ruby: "ruby",
    go: "go",
    dotnet: "dotnet",
    ".net": "dotnet",
    android: "android",
    swift: "swift",
    ios: "swift",
    react_native: "react_native",
    "react-native": "react_native"
  };
  if (event.sdk_name === "@debugbundle/sdk-react-native") return "react_native";
  return aliases[runtime] ?? "unknown";
}

/** Interpret retained text only. Runtime-native error graphs are inspected by their SDK, never here. */
export function buildErrorContext(
  incident: BundleBuildContext,
  primary: EventEnvelope | null
): NonNullable<BundleV1["context"]["error"]> | null {
  if (
    primary !== null &&
    primary.event_type !== "backend_exception" &&
    primary.event_type !== "frontend_exception"
  )
    return null;
  const envelope = primary;
  if (envelope === null) {
    if (
      !incident.source_event_types.some(
        (type) => type === "backend_exception" || type === "frontend_exception"
      )
    )
      return null;
    return {
      version: 1,
      name: incident.source_event_types.includes("frontend_exception")
        ? "frontend_exception"
        : "backend_exception",
      message: incident.title,
      stack: "unavailable",
      handled: false,
      top_frames: []
    };
  }
  const runtime = evidenceRuntime(envelope);
  const parsed = parseStackFrames(envelope.payload.stack, runtime);
  let graph = envelope.payload.exception_evidence;
  if (graph === undefined) {
    graph = {
      version: 1,
      runtime,
      root_id: 0,
      truncated: parsed.truncated,
      unavailable_reason: null,
      nodes: [
        {
          id: 0,
          name: bounded(envelope.payload.name, 256),
          message: bounded(envelope.payload.message, 2048),
          stack: bounded(envelope.payload.stack, 16 * 1024),
          trace_origin: "unknown",
          parsing_status: parsed.status,
          frames: [...parsed.frames],
          relationships: []
        }
      ]
    };
    if (envelope.payload.stack === "unavailable") {
      Object.assign(graph.nodes[0]!, {
        stack: null,
        trace_origin: "unavailable",
        parsing_status: "unavailable"
      });
      graph.unavailable_reason = "unknown";
    }
    if (graph.nodes[0]!.stack !== null && graph.nodes[0]!.stack !== envelope.payload.stack)
      graph.truncated = true;
    // Prefer useful bounded coordinates over duplicated stack text when the added
    // block reaches its total budget. The original stack stays in the legacy field.
    if (!ExceptionEvidenceV1Schema.safeParse(graph).success) {
      graph.nodes[0]!.stack = null;
      graph.truncated = true;
      graph.unavailable_reason = "budget_exceeded";
      while (
        graph.nodes[0]!.frames.length > 0 &&
        !ExceptionEvidenceV1Schema.safeParse(graph).success
      )
        graph.nodes[0]!.frames.pop();
    }
  }
  const validated = ExceptionEvidenceV1Schema.safeParse(graph);
  return {
    version: 1,
    name: envelope.payload.name,
    message: envelope.payload.message,
    stack: envelope.payload.stack,
    handled: envelope.event_type === "backend_exception" ? envelope.payload.handled : false,
    top_frames: parsed.lines
      .filter((_, index) => !["sdk", "framework"].includes(parsed.frames[index]!.classification))
      .slice(0, 3),
    ...(validated.success
      ? {
          exception_evidence: validated.data,
          exception_evidence_source:
            envelope.payload.exception_evidence === undefined
              ? ("retained_stack" as const)
              : ("sdk" as const)
        }
      : {})
  };
}
