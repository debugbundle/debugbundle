import { sanitizeBrowserStackUrls } from "../../redaction/src/browser-stack.js";
import {
  parseNormalizedStackFrames,
  type ParsedStack
} from "../../shared-types/src/stack-frames.js";
export { selectUsefulFrame, type ParsedStack } from "../../shared-types/src/stack-frames.js";

/** Retained legacy text crosses the mandatory URL privacy boundary before
 * location interpretation. SDK snapshots use the same parser on protected text. */
export function parseStackFrames(stack: string, runtime = "unknown"): ParsedStack {
  return parseNormalizedStackFrames(stack, runtime, sanitizeBrowserStackUrls);
}
