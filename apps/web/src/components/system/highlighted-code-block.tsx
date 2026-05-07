import type { ReactNode } from "react";

import { cn } from "../../lib/utils.js";

type HighlightedCodeBlockProps = {
  code: string;
  language?: "json" | "text";
  className?: string;
};

type JsonTokenType = "property" | "string" | "number" | "boolean" | "null" | "punctuation";

const jsonTokenPattern = /"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\btrue\b|\bfalse\b|\bnull\b|[{}\[\],:]/g;

const tokenClassName: Record<JsonTokenType, string> = {
  property: "text-foreground",
  string: "text-stone-700 dark:text-stone-300",
  number: "text-zinc-700 dark:text-zinc-300",
  boolean: "text-zinc-800 dark:text-zinc-200",
  null: "text-muted-foreground italic",
  punctuation: "text-muted-foreground"
};

export function HighlightedCodeBlock({ code, language = "json", className }: HighlightedCodeBlockProps): JSX.Element {
  return (
    <pre className={cn("max-h-[600px] overflow-auto rounded-xl border bg-muted/40 p-4 font-mono text-xs leading-6", className)}>
      <code>{language === "json" ? renderJsonCode(code) : code}</code>
    </pre>
  );
}

function renderJsonCode(code: string): ReactNode[] {
  const lines = code.split("\n");

  return lines.flatMap((line, lineIndex) => {
    const segments = renderJsonLine(line, lineIndex);

    if (lineIndex === lines.length - 1) {
      return segments;
    }

    return [...segments, <span key={`newline-${lineIndex}`}>{"\n"}</span>];
  });
}

function renderJsonLine(line: string, lineIndex: number): ReactNode[] {
  const segments: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of line.matchAll(jsonTokenPattern)) {
    const token = match[0];
    const start = match.index ?? 0;

    if (start > lastIndex) {
      segments.push(<span key={`text-${lineIndex}-${lastIndex}`}>{line.slice(lastIndex, start)}</span>);
    }

    const tokenType = classifyJsonToken(line, token, start);

    segments.push(
      <span key={`token-${lineIndex}-${start}`} data-token={tokenType} className={tokenClassName[tokenType]}>
        {token}
      </span>
    );

    lastIndex = start + token.length;
  }

  if (lastIndex < line.length) {
    segments.push(<span key={`tail-${lineIndex}-${lastIndex}`}>{line.slice(lastIndex)}</span>);
  }

  return segments;
}

function classifyJsonToken(line: string, token: string, start: number): JsonTokenType {
  if (token === "{" || token === "}" || token === "[" || token === "]" || token === "," || token === ":") {
    return "punctuation";
  }

  if (token === "true" || token === "false") {
    return "boolean";
  }

  if (token === "null") {
    return "null";
  }

  if (/^-?\d/.test(token)) {
    return "number";
  }

  if (/^\s*:/.test(line.slice(start + token.length))) {
    return "property";
  }

  return "string";
}