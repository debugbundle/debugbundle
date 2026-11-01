import { z } from "zod";
import { utf8String, withinUtf8Budget } from "./evidence-bounds.js";

export const EXCEPTION_EVIDENCE_LIMITS = {
  nodes: 8,
  depth: 4,
  children: 5,
  frames: 32,
  nameBytes: 256,
  functionBytes: 256,
  fileBytes: 2048,
  messageBytes: 2048,
  stackBytes: 16 * 1024,
  totalBytes: 32 * 1024
} as const;

const NodeIdSchema = z
  .number()
  .int()
  .min(0)
  .max(EXCEPTION_EVIDENCE_LIMITS.nodes - 1);

export const EvidenceFrameSchema = z
  .object({
    function: utf8String(EXCEPTION_EVIDENCE_LIMITS.functionBytes).nullable(),
    file: utf8String(EXCEPTION_EVIDENCE_LIMITS.fileBytes).nullable(),
    line: z.number().int().positive().nullable(),
    column: z.number().int().nonnegative().nullable(),
    classification: z.enum(["application", "framework", "sdk", "unknown"])
  })
  .strict();

const ExceptionNodeSchema = z
  .object({
    id: NodeIdSchema,
    name: utf8String(EXCEPTION_EVIDENCE_LIMITS.nameBytes),
    message: utf8String(EXCEPTION_EVIDENCE_LIMITS.messageBytes),
    stack: utf8String(EXCEPTION_EVIDENCE_LIMITS.stackBytes).nullable(),
    trace_origin: z.enum([
      "throw",
      "native_fatal",
      "capture",
      "runtime_reported",
      "unavailable",
      "unknown"
    ]),
    parsing_status: z.enum(["parsed", "partial", "unparsed", "unavailable", "truncated"]),
    frames: z.array(EvidenceFrameSchema).max(EXCEPTION_EVIDENCE_LIMITS.frames),
    relationships: z
      .array(
        z
          .object({
            kind: z.enum(["cause", "context", "aggregate", "suppressed"]),
            target_id: NodeIdSchema
          })
          .strict()
      )
      .max(EXCEPTION_EVIDENCE_LIMITS.children)
  })
  .strict();

const ExceptionEvidenceObjectSchema = z
  .object({
    version: z.literal(1),
    runtime: z.enum([
      "node",
      "browser",
      "python",
      "php",
      "jvm",
      "go",
      "ruby",
      "dotnet",
      "android",
      "swift",
      "react_native",
      "unknown"
    ]),
    root_id: NodeIdSchema,
    nodes: z.array(ExceptionNodeSchema).min(1).max(EXCEPTION_EVIDENCE_LIMITS.nodes),
    truncated: z.boolean(),
    unavailable_reason: z.enum(["unknown", "unsupported", "unsafe", "budget_exceeded"]).nullable()
  })
  .strict();

/** Flat node references bound validation work even for hostile JSON relationship graphs. */
export const ExceptionEvidenceV1Schema = ExceptionEvidenceObjectSchema.superRefine(
  (value, context) => {
    const reject = (message: string): void => {
      context.addIssue({ code: z.ZodIssueCode.custom, message });
    };
    // Zod refinements can run on dirty values. Never traverse an over-budget collection.
    if (value.nodes.length > EXCEPTION_EVIDENCE_LIMITS.nodes) return;
    const nodes = new Map(value.nodes.map((node) => [node.id, node]));
    if (nodes.size !== value.nodes.length || !nodes.has(value.root_id)) {
      reject("Exception graph requires unique IDs and an existing root");
      return;
    }
    for (const node of value.nodes) {
      if (
        node.relationships.length > EXCEPTION_EVIDENCE_LIMITS.children ||
        node.frames.length > EXCEPTION_EVIDENCE_LIMITS.frames
      )
        return;
      const edges = new Set<string>();
      let causalEdges = 0;
      for (const edge of node.relationships) {
        const key = `${edge.kind}:${edge.target_id}`;
        if (!nodes.has(edge.target_id) || edges.has(key)) {
          reject("Exception graph contains a missing target or repeated relationship");
          return;
        }
        edges.add(key);
        if (edge.kind === "cause" || edge.kind === "context") causalEdges++;
      }
      if (causalEdges > 1) {
        reject("Exception nodes permit only one causal relationship");
        return;
      }
    }

    const reached = new Set<number>();
    const active = new Set<number>();
    // Revisit shared children along each path so a shorter path cannot hide excess depth.
    const visit = (id: number, depth: number): boolean => {
      if (depth > EXCEPTION_EVIDENCE_LIMITS.depth || active.has(id)) return false;
      active.add(id);
      reached.add(id);
      for (const edge of nodes.get(id)!.relationships) {
        if (!visit(edge.target_id, depth + 1)) return false;
      }
      active.delete(id);
      return true;
    };
    if (!visit(value.root_id, 0) || reached.size !== nodes.size) {
      reject("Exception graph must be reachable, acyclic and within the depth budget");
      return;
    }

    // Cheap code-unit bounds precede encoding; invalid oversized strings must not
    // induce a large additional serialisation merely to report their invalidity.
    for (const node of value.nodes) {
      if (
        node.name.length > EXCEPTION_EVIDENCE_LIMITS.nameBytes ||
        node.message.length > EXCEPTION_EVIDENCE_LIMITS.messageBytes ||
        (node.stack?.length ?? 0) > EXCEPTION_EVIDENCE_LIMITS.stackBytes ||
        node.frames.some(
          (frame) =>
            (frame.function?.length ?? 0) > EXCEPTION_EVIDENCE_LIMITS.functionBytes ||
            (frame.file?.length ?? 0) > EXCEPTION_EVIDENCE_LIMITS.fileBytes
        )
      )
        return;
    }
    if (!withinUtf8Budget(JSON.stringify(value), EXCEPTION_EVIDENCE_LIMITS.totalBytes)) {
      reject("Exception evidence exceeds its total UTF-8 JSON byte budget");
    }
  }
);

export type EvidenceFrame = z.infer<typeof EvidenceFrameSchema>;
export type ExceptionEvidenceV1 = z.infer<typeof ExceptionEvidenceV1Schema>;
