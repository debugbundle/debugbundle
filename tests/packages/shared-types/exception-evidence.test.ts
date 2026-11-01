import { describe, expect, it, vi } from "vitest";
import {
  ExceptionEvidenceV1Schema,
  type ExceptionEvidenceV1
} from "../../../packages/shared-types/src/exception-evidence.js";

function evidence(): ExceptionEvidenceV1 {
  return {
    version: 1,
    runtime: "browser",
    root_id: 0,
    nodes: [node(0)],
    truncated: false,
    unavailable_reason: null
  };
}

function node(id: number): ExceptionEvidenceV1["nodes"][number] {
  return {
    id,
    name: "TypeError",
    message: "Resource operation failed",
    stack: "render@https://static.example.test/app.js:12:3",
    trace_origin: "throw",
    parsing_status: "parsed",
    frames: [
      {
        function: "render",
        file: "https://static.example.test/app.js",
        line: 12,
        column: 3,
        classification: "application"
      }
    ],
    relationships: []
  };
}

describe("structured exception evidence", () => {
  it("loads legacy shared interfaces and validates evidence without a global encoder", async () => {
    vi.resetModules();
    vi.stubGlobal("TextEncoder", undefined);
    try {
      const shared = await import("../../../packages/shared-types/src/index.js");
      expect(shared.EventTypeValues).toContain("backend_exception");
      expect(shared.ExceptionEvidenceV1Schema.parse(evidence())).toEqual(evidence());
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });

  it("preserves a closed, versioned block without changing its text", () => {
    const input = evidence();
    expect(ExceptionEvidenceV1Schema.parse(input)).toEqual(input);
  });

  it.each(["cause", "context", "aggregate", "suppressed"] as const)(
    "represents %s as a relationship, preserving the outer exception",
    (kind) => {
      const input = evidence();
      input.nodes.push(node(1));
      input.nodes[0]!.relationships.push({ kind, target_id: 1 });
      expect(ExceptionEvidenceV1Schema.parse(input)).toEqual(input);
    }
  );

  it("accepts shared children without inventing a linear root cause", () => {
    const input = evidence();
    input.nodes.push(node(1), node(2));
    input.nodes[0]!.relationships = [
      { kind: "aggregate", target_id: 1 },
      { kind: "aggregate", target_id: 2 }
    ];
    input.nodes[1]!.relationships = [{ kind: "cause", target_id: 2 }];
    expect(ExceptionEvidenceV1Schema.safeParse(input).success).toBe(true);
  });

  it("permits an honestly unavailable stack", () => {
    const input = evidence();
    Object.assign(input.nodes[0]!, {
      stack: null,
      frames: [],
      trace_origin: "unavailable",
      parsing_status: "unavailable"
    });
    input.unavailable_reason = "unsafe";
    expect(ExceptionEvidenceV1Schema.safeParse(input).success).toBe(true);
  });

  it("counts UTF-8 bytes for added messages", () => {
    const input = evidence();
    input.nodes[0]!.message = "é".repeat(1024);
    expect(ExceptionEvidenceV1Schema.safeParse(input).success).toBe(true);
    input.nodes[0]!.message += "é";
    expect(ExceptionEvidenceV1Schema.safeParse(input).success).toBe(false);
  });

  it.each(["é", "€", "💡", "\ud800", "\udc00"])(
    "counts UTF-8 multibyte and replacement sequences: %s",
    (character) => {
      const input = evidence();
      const size = new TextEncoder().encode(character).length;
      input.nodes[0]!.message = character.repeat(Math.floor(2048 / size));
      expect(ExceptionEvidenceV1Schema.safeParse(input).success).toBe(true);
      input.nodes[0]!.message += character;
      expect(ExceptionEvidenceV1Schema.safeParse(input).success).toBe(false);
    }
  );

  it("counts serialized JSON overhead in the total UTF-8 budget", () => {
    const input = evidence();
    input.nodes[0]!.stack = "x".repeat(16 * 1024);
    input.nodes.push({ ...node(1), stack: "x".repeat(16 * 1024) });
    input.nodes[0]!.relationships = [{ kind: "cause", target_id: 1 }];
    expect(ExceptionEvidenceV1Schema.safeParse(input).success).toBe(false);
  });

  it("accepts the exact whole-block byte boundary and rejects one byte more", () => {
    const input = evidence();
    input.nodes.push(node(1));
    input.nodes[0]!.relationships = [{ kind: "cause", target_id: 1 }];
    input.nodes[0]!.stack = "x".repeat(16 * 1024);
    input.nodes[1]!.stack = "";
    const remaining = 32 * 1024 - new TextEncoder().encode(JSON.stringify(input)).length;
    input.nodes[1]!.stack = "x".repeat(remaining);
    expect(ExceptionEvidenceV1Schema.safeParse(input).success).toBe(true);
    input.nodes[1]!.stack += "x";
    expect(ExceptionEvidenceV1Schema.safeParse(input).success).toBe(false);
  });

  it("rejects excessive node count, width, frame count and depth", () => {
    const tooMany = evidence();
    tooMany.nodes = Array.from({ length: 9 }, (_, id) => node(id));
    expect(ExceptionEvidenceV1Schema.safeParse(tooMany).success).toBe(false);
    const wide = evidence();
    wide.nodes = Array.from({ length: 7 }, (_, id) => node(id));
    wide.nodes[0]!.relationships = wide.nodes.slice(1).map(({ id }) => ({
      kind: "aggregate",
      target_id: id
    }));
    expect(ExceptionEvidenceV1Schema.safeParse(wide).success).toBe(false);
    const frames = evidence();
    frames.nodes[0]!.frames = Array.from({ length: 33 }, () => ({ ...node(0).frames[0]! }));
    expect(ExceptionEvidenceV1Schema.safeParse(frames).success).toBe(false);
    const deep = evidence();
    deep.nodes = Array.from({ length: 5 }, (_, id) => ({
      ...node(id),
      relationships: id < 4 ? [{ kind: "cause", target_id: id + 1 }] : []
    }));
    expect(ExceptionEvidenceV1Schema.safeParse(deep).success).toBe(true);
    deep.nodes.push(node(5));
    deep.nodes[4]!.relationships.push({ kind: "cause", target_id: 5 });
    expect(ExceptionEvidenceV1Schema.safeParse(deep).success).toBe(false);
  });

  it.each([
    "missing-root",
    "duplicate-id",
    "missing-target",
    "unreachable",
    "self-cycle",
    "cycle",
    "duplicate-edge",
    "multiple-causes"
  ])("rejects a %s graph", (invalid) => {
    const input = evidence();
    input.nodes.push(node(1));
    input.nodes[0]!.relationships = [{ kind: "cause", target_id: 1 }];
    switch (invalid) {
      case "missing-root":
        input.root_id = 7;
        break;
      case "duplicate-id":
        input.nodes[1]!.id = 0;
        break;
      case "missing-target":
        input.nodes[0]!.relationships[0]!.target_id = 7;
        break;
      case "unreachable":
        input.nodes[0]!.relationships = [];
        break;
      case "self-cycle":
        input.nodes[1]!.relationships = [{ kind: "cause", target_id: 1 }];
        break;
      case "cycle":
        input.nodes[1]!.relationships = [{ kind: "cause", target_id: 0 }];
        break;
      case "duplicate-edge":
        input.nodes[0]!.relationships.push({ kind: "cause", target_id: 1 });
        break;
      case "multiple-causes":
        input.nodes[0]!.relationships.push({ kind: "context", target_id: 1 });
        break;
    }
    expect(ExceptionEvidenceV1Schema.safeParse(input).success).toBe(false);
  });

  it.each([
    (input: Record<string, unknown>) => {
      input["version"] = 2;
    },
    (input: Record<string, unknown>) => {
      input["customer_data"] = {};
    },
    (input: Record<string, unknown>) => {
      input["runtime"] = "made_up";
    },
    (input: Record<string, unknown>) => {
      input["nodes"] = [];
    }
  ])("rejects unknown versions/fields/runtimes and empty graphs", (mutate) => {
    const input = evidence() as unknown as Record<string, unknown>;
    mutate(input);
    expect(ExceptionEvidenceV1Schema.safeParse(input).success).toBe(false);
  });

  it("rejects captured arguments and invalid frame coordinates", () => {
    const input = evidence();
    expect(
      ExceptionEvidenceV1Schema.safeParse({
        ...input,
        nodes: [{ ...input.nodes[0], arguments: ["private"] }]
      }).success
    ).toBe(false);
    input.nodes[0]!.frames[0]!.line = 0;
    expect(ExceptionEvidenceV1Schema.safeParse(input).success).toBe(false);
    input.nodes[0]!.frames[0]!.line = 1;
    input.nodes[0]!.frames[0]!.column = -1;
    expect(ExceptionEvidenceV1Schema.safeParse(input).success).toBe(false);
  });

  it.each(["name", "message", "stack", "function", "file"] as const)(
    "enforces both character and UTF-8 limits on %s",
    (field) => {
      const input = evidence();
      const limit = { name: 256, message: 2048, stack: 16384, function: 256, file: 2048 }[field];
      const target =
        field === "function" || field === "file" ? input.nodes[0]!.frames[0]! : input.nodes[0]!;
      Object.assign(target, { [field]: "x".repeat(limit) });
      expect(ExceptionEvidenceV1Schema.safeParse(input).success).toBe(true);
      Object.assign(target, { [field]: "é".repeat(limit) });
      expect(ExceptionEvidenceV1Schema.safeParse(input).success).toBe(false);
      Object.assign(target, { [field]: "x".repeat(limit + 1) });
      expect(ExceptionEvidenceV1Schema.safeParse(input).success).toBe(false);
    }
  );

  it("checks the longest shared-child path rather than the first visited path", () => {
    const input = evidence();
    input.nodes = Array.from({ length: 6 }, (_, id) => node(id));
    input.nodes[0]!.relationships = [
      { kind: "aggregate", target_id: 5 },
      { kind: "aggregate", target_id: 1 }
    ];
    for (let id = 1; id < 5; id++) {
      input.nodes[id]!.relationships = [{ kind: "cause", target_id: id + 1 }];
    }
    expect(ExceptionEvidenceV1Schema.safeParse(input).success).toBe(false);
  });

  it("retains unparsed text without requiring a fabricated frame", () => {
    const input = evidence();
    input.nodes[0]!.stack = "Unknown runtime's sanitised diagnostic line";
    input.nodes[0]!.frames = [];
    input.nodes[0]!.trace_origin = "runtime_reported";
    input.nodes[0]!.parsing_status = "unparsed";
    expect(ExceptionEvidenceV1Schema.parse(input)).toEqual(input);
  });

  it("accepts eight reachable nodes and five children within the fixed work limits", () => {
    const input = evidence();
    input.nodes = Array.from({ length: 8 }, (_, id) => node(id));
    input.nodes[0]!.relationships = [1, 2, 3, 4, 5].map((target_id) => ({
      kind: "aggregate",
      target_id
    }));
    input.nodes[1]!.relationships = [6, 7].map((target_id) => ({ kind: "suppressed", target_id }));
    input.nodes[0]!.frames = Array.from({ length: 32 }, () => ({ ...node(0).frames[0]! }));
    expect(ExceptionEvidenceV1Schema.safeParse(input).success).toBe(true);
  });

  it("rejects unknown nested fields rather than accepting argument/local snapshots", () => {
    const input = evidence();
    expect(
      ExceptionEvidenceV1Schema.safeParse({
        ...input,
        nodes: [{ ...node(0), frames: [{ ...node(0).frames[0], locals: {} }] }]
      }).success
    ).toBe(false);
    expect(
      ExceptionEvidenceV1Schema.safeParse({
        ...input,
        nodes: [{ ...node(0), relationships: [{ kind: "cause", target_id: 0, data: {} }] }]
      }).success
    ).toBe(false);
  });
});
