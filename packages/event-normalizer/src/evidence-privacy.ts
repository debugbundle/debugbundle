import { sanitizeBrowserStackUrls } from "../../redaction/src/browser-stack.js";
import type { ExceptionEvidenceV1 } from "../../shared-types/src/exception-evidence.js";

/** Operates on validated SDK-owned JSON, never native error objects or accessors. */
export function sanitizeExceptionEvidenceUrls(evidence: ExceptionEvidenceV1): ExceptionEvidenceV1 {
  return {
    ...evidence,
    nodes: evidence.nodes.map((node) => ({
      ...node,
      stack: node.stack === null ? null : sanitizeBrowserStackUrls(node.stack),
      frames: node.frames.map((frame) => ({
        ...frame,
        file: frame.file === null ? null : sanitizeBrowserStackUrls(frame.file)
      }))
    }))
  };
}

export { withoutOptionalExceptionEvidence as withoutAddedEvidence } from "../../shared-types/src/evidence-emission.js";
