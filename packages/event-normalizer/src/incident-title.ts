import type { EventEnvelope } from "../../shared-types/src/index.js";

const MAX_INCIDENT_TITLE_LENGTH = 180;
const SOURCE_POSITION = String.raw`:(?:\d+|\{dynamic\})(?::(?:\d+|\{dynamic\}))?`;
const PARENTHESIZED_SOURCE = String.raw`(?:[^()\r\n]{1,2048}\.[A-Za-z0-9]+|(?:https?|file|node):[^()\r\n]{1,2048})${SOURCE_POSITION}`;
const BARE_SOURCE = String.raw`(?:[^\s()]{1,2048}\.[A-Za-z0-9]+|(?:https?|file|node):[^\s()]{1,2048})${SOURCE_POSITION}`;
// Require a source location or a known runtime marker, not just prose containing "at".
const STACK_FRAME_START = new RegExp(
  String.raw`(?:^|\s|\\[rnt])at\s+(?:(?:async|new)\s+)?(?:(?:[^\s()]{1,2048}\s*)?\((?:${PARENTHESIZED_SOURCE}|Unknown Source|Native Method|native|<anonymous>)\)|${BARE_SOURCE}(?=\s|$))`
);

type IncidentTitleInput = {
  event_type: EventEnvelope["event_type"];
  normalized_message: string;
  incident_title?: string;
};

export function humanizeEventType(eventType: EventEnvelope["event_type"]): string {
  return eventType
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function isMachineGeneratedIncidentTitle(
  input: Pick<IncidentTitleInput, "event_type" | "normalized_message">
): boolean {
  const message = input.normalized_message.trim();
  return (
    message.length === 0 ||
    message.startsWith("[") ||
    message.startsWith("{") ||
    message === input.event_type
  );
}

function fallbackTitle(eventType: EventEnvelope["event_type"]): string {
  switch (eventType) {
    case "backend_exception":
      return "Backend exception";
    case "frontend_exception":
      return "Frontend exception";
    case "request_event":
      return "Request failure";
    case "log_event":
      return "Application log error";
    default:
      return humanizeEventType(eventType);
  }
}

/** Display titles stay short; normalized messages and fingerprints keep their complete evidence. */
export function deriveIncidentTitle(input: IncidentTitleInput): string {
  const candidate = (input.incident_title ?? input.normalized_message).replace(/\s+/g, " ").trim();
  const frame = STACK_FRAME_START.exec(candidate);
  let summaryEnd = frame?.index ?? candidate.length;
  // Walk backward once instead of backtracking over arbitrarily many escaped separators.
  if (frame !== null) {
    while (summaryEnd > 0) {
      if (candidate[summaryEnd - 1] === " ") summaryEnd -= 1;
      else if (candidate[summaryEnd - 2] === "\\" && /[rnt]/.test(candidate[summaryEnd - 1]!))
        summaryEnd -= 2;
      else break;
    }
  }
  const summary = candidate.slice(0, summaryEnd).trim();
  if (
    summary.length === 0 ||
    (input.incident_title === undefined &&
      isMachineGeneratedIncidentTitle({
        event_type: input.event_type,
        normalized_message: summary
      }))
  ) {
    return fallbackTitle(input.event_type);
  }

  const characters = Array.from(summary);
  if (characters.length <= MAX_INCIDENT_TITLE_LENGTH) {
    return summary;
  }

  const prefix = characters.slice(0, MAX_INCIDENT_TITLE_LENGTH - 1).join("");
  const lastSpace = prefix.lastIndexOf(" ");
  const bounded = lastSpace >= 80 ? prefix.slice(0, lastSpace) : prefix;
  return `${bounded.trimEnd()}…`;
}
