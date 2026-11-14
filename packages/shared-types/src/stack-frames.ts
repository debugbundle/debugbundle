import { withinUtf8Budget } from "./evidence-bounds.js";
import type { EvidenceFrame } from "./exception-evidence.js";

export interface ParsedStack {
  frames: EvidenceFrame[];
  lines: string[];
  status: "parsed" | "partial" | "unparsed" | "truncated";
  truncated: boolean;
}

function coordinate(value: string | undefined): number | null {
  if (value === undefined) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}
function frame(
  file: string | null,
  line: string | undefined,
  column: string | undefined,
  name: string | null
): EvidenceFrame | null {
  const parsedLine = coordinate(line);
  if (line !== undefined && (parsedLine === null || parsedLine === 0)) return null;
  const parsedColumn = coordinate(column);
  if (column !== undefined && parsedColumn === null) return null;
  const safeFile = file === null ? null : file.slice(0, 2048);
  const fn = name?.trim().slice(0, 256) || null;
  if (
    (safeFile !== null && !withinUtf8Budget(safeFile, 2048)) ||
    (fn !== null && !withinUtf8Budget(fn, 256))
  )
    return null;
  const text = `${safeFile ?? ""} ${fn ?? ""}`;
  const classification =
    /node_modules[/\\]@debugbundle[/\\]|vendor[/\\]debugbundle[/\\]|wp-content\/plugins\/debugbundle\/|debugbundle-browser(?:-sdk)?(?:\.js|\/)|\bcom\.debugbundle\.sdk\.|\bDebugBundle\./i.test(
      text
    ) || /^debugbundle::/.test(fn ?? "")
      ? "sdk"
      : /(?:^|[/\\])(?:node_modules|vendor|site-packages|\.venv|gems)[/\\]|^node:|\b(?:java|javax|jdk|sun|kotlin|kotlinx)\./.test(
            text
          ) || /^(?:axum|actix_web|actix_http|tokio|tower)::/.test(fn ?? "")
        ? "framework"
        : safeFile !== null &&
            /(?:^|[/\\])(?:src|app|srv)[/\\]/.test(safeFile) &&
            !/^https?:\/\//.test(safeFile)
          ? "application"
          : "unknown";
  return { function: fn, file: safeFile, line: parsedLine, column: parsedColumn, classification };
}

function parseLine(text: string, previous: string, runtime: string): EvidenceFrame | null {
  let match: RegExpExecArray | null;
  // Rust's numbered symbol precedes its source line. Require a Rust source
  // suffix and numbered symbol so unknown v1 runtime tags stay unambiguous.
  if (
    (runtime === "rust" || runtime === "unknown") &&
    (match = /^at\s+(.+\.rs):(\d+)(?::(\d+))?$/.exec(text))
  ) {
    const symbol = /^\d+:\s+(.+)$/.exec(previous)?.[1];
    if (symbol) return frame(match[1]!, match[2], match[3], symbol);
  }
  // PHP frame arguments and Python source excerpts never enter structured fields.
  if ((match = /^#\d+\s+(.+?)\((\d+)\):\s*([^\r\n(]+)(?:\(|$)/.exec(text)))
    return frame(match[1]!, match[2], undefined, match[3]!);
  if ((match = /^File\s+"?(.+?)"?,\s+line\s+(\d+),\s+in\s+(.+)$/.exec(text)))
    return frame(match[1]!, match[2], undefined, match[3]!);
  if ((match = /^(.+?):(\d+):in\s+[`'](.+?)['`]?$/.exec(text)))
    return frame(match[1]!, match[2], undefined, match[3]!.replace(/['`]$/, ""));
  if ((match = /^at\s+(.+?)\(\)\s+in\s+(.+):line\s+(\d+)$/.exec(text)))
    return frame(match[2]!, match[3], undefined, match[1]!);
  if ((match = /^(.+?)\(\)\s+at\s+(.+):(\d+)$/.exec(text)))
    return frame(match[2]!, match[3], undefined, match[1]!);
  if ((match = /^(.+\.go):(\d+)(?:\s+\+0x[\da-f]+)?$/i.exec(text)))
    return frame(match[1]!, match[2], undefined, previous.match(/^([^()]+)\(/)?.[1] ?? null);
  if ((match = /^at\s+([^()]+)\((Native Method|Unknown Source)\)$/.exec(text)))
    return frame(null, undefined, undefined, match[1]!);
  if ((match = /^at\s+(.+?)\s*\((.+?):(\d+)(?::(\d+))?\)$/.exec(text)))
    return frame(match[2]!, match[3], match[4], match[1]!);
  if ((match = /^at\s+(.+?):(\d+)(?::(\d+))?$/.exec(text)))
    return frame(match[1]!, match[2], match[3], null);
  if ((match = /^(.*?)@(.+?):(\d+)(?::(\d+))?$/.exec(text)))
    return frame(match[2]!, match[3], match[4], match[1] || null);
  if (
    (runtime === "swift" || runtime === "unknown") &&
    (match = /^\d+\s+\S+\s+0x[\da-f]+\s+(.+?)\s+\+\s+\d+$/i.exec(text))
  )
    return frame(null, undefined, undefined, match[1]!);
  return null;
}

/** Presentation only. This parser must never feed fingerprint normalization or capture rules. */
export function parseNormalizedStackFrames(
  stack: string,
  runtime = "unknown",
  sanitizeLine: (line: string) => string = (line) => line
): ParsedStack {
  const input = stack.slice(0, 16 * 1024);
  const sourceLines = input.split(/\r?\n/, 129);
  const frames: EvidenceFrame[] = [];
  const lines: string[] = [];
  let truncated = input.length !== stack.length || sourceLines.length > 128;
  let partial = false;
  let previous = "";
  for (const source of sourceLines.slice(0, 128)) {
    if (frames.length >= 32) {
      truncated = true;
      break;
    }
    const text = sanitizeLine(source.slice(0, 2048).trim());
    if (source.length > 2048) truncated = true;
    const parsed = parseLine(text, previous, runtime);
    if (parsed !== null) {
      frames.push(parsed);
      lines.push(text);
    } else if (/^#\d+\s+\{main\}$/.test(text)) {
      /* PHP terminal marker has no source frame. */
    } else if (/^(?:at\s|#\d+\s|File\s)|@\S+:\d/.test(text)) partial = true;
    previous = text;
  }
  return {
    frames,
    lines,
    status: truncated
      ? "truncated"
      : frames.length === 0
        ? "unparsed"
        : partial
          ? "partial"
          : "parsed",
    truncated
  };
}

export function selectUsefulFrame(frames: readonly EvidenceFrame[]): EvidenceFrame | null {
  return (
    frames.find((item) => item.classification === "application") ??
    frames.find((item) => item.classification === "unknown") ??
    null
  );
}
