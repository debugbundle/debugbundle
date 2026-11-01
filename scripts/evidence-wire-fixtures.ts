import { EvidenceCapabilityValues } from "../packages/shared-types/src/index.js";

type Json = Record<string, unknown>;
interface FrameFixture extends Json {
  function: string | null;
  file: string | null;
  line: number | null;
  column: number | null;
  classification: string;
}
interface NodeFixture extends Json {
  id: number;
  name: string;
  message: string;
  stack: string | null;
  trace_origin: string;
  parsing_status: string;
  frames: FrameFixture[];
  relationships: Array<{ kind: string; target_id: number }>;
}
interface GraphFixture extends Json {
  version: number;
  runtime: string;
  root_id: number;
  nodes: NodeFixture[];
  truncated: boolean;
  unavailable_reason: string | null;
}
interface EventFixture extends Json {
  event_id: string;
  event_type: string;
  payload: Json;
  correlation: Json;
  context?: Json;
}
// These constructors own every fixture. Deliberately malformed edits stay
// unknown at payload boundaries and are checked by the accepting schema before
// a corpus can be written; no unchecked dynamic input enters this helper.
function evidence(event: EventFixture): GraphFixture {
  return event.payload["exception_evidence"] as GraphFixture;
}
function resourceItems(event: EventFixture): Json[] {
  return (event.payload["resource_observations"] as { items: Json[] }).items;
}
export interface EvidenceWireFixture {
  id: string;
  valid: boolean;
  event: EventFixture;
}

const eventId = "11111111-1111-4111-8111-111111111111";
const failureRef = "22222222-2222-4222-8222-222222222222";
const scope = { kind: "operation", operation_id: "33333333-3333-4333-8333-333333333333" };
const ref = { version: 1, failure_ref: failureRef, scope };
const frame = {
  function: "run",
  file: "/app/jobs.rb",
  line: 42,
  column: null,
  classification: "unknown"
};
function node(id: number): NodeFixture {
  return {
    id,
    name: "Error",
    message: "fictional failure",
    stack: null,
    trace_origin: "runtime_reported",
    parsing_status: "parsed",
    frames: [structuredClone(frame)],
    relationships: []
  };
}
function graph(): GraphFixture {
  return {
    version: 1,
    runtime: "unknown",
    root_id: 0,
    nodes: [node(0)],
    truncated: false,
    unavailable_reason: null
  };
}
function envelope(type: string, payload: Json): EventFixture {
  return {
    schema_version: "2026-03-01",
    event_id: eventId,
    event_type: type,
    occurred_at: "2026-10-26T10:00:00.000Z",
    sdk_name: "qualification-fixture",
    sdk_version: "candidate",
    service: { name: "fixture-service", environment: "test" },
    correlation: { request_id: null, trace_id: null, session_id: null, user_id_hash: null },
    payload
  };
}
function error(): EventFixture {
  return envelope("frontend_exception", {
    name: "Error",
    message: "fictional failure",
    stack: "Error: fictional failure",
    browser: { name: "fixture", version: "1" },
    exception_evidence: graph()
  });
}
function recovery(): EventFixture {
  return envelope("diagnostic_context", {
    ...structuredClone(ref),
    kind: "recovery",
    attempt_id: "44444444-4444-4444-8444-444444444444",
    state: "attempt_completed"
  });
}
function backend(): EventFixture {
  return envelope("backend_exception", {
    name: "Error",
    message: "fictional failure",
    stack: "Error: fictional failure",
    handled: true,
    request: { method: "UNKNOWN", path: "/", query: {}, headers: {} },
    response: { status_code: 0 },
    runtime: { version: "fixture" },
    exception_evidence: graph()
  });
}
function resources(url: string | null = "https://cdn.example.test/asset.js"): Json {
  return {
    version: 1,
    items: [
      {
        kind: "timing",
        observed_at: "2026-10-26T10:00:00.000Z",
        source_url: url,
        availability: "unknown",
        response_status: null,
        duration_ms: null,
        transfer_size_bytes: null
      }
    ]
  };
}

/** Fictional, deterministic inputs shared by independent SDK validators. Expected
 * validity is frozen here and checked against the accepting Zod contract. */
export function evidenceWireFixtures(): EvidenceWireFixture[] {
  const cases: EvidenceWireFixture[] = [];
  const add = (id: string, event: EventFixture, valid = true): void => {
    cases.push({ id, event, valid });
  };
  const change = (
    id: string,
    update: (event: EventFixture) => void,
    valid = false,
    base: () => EventFixture = error
  ): void => {
    const event = base();
    update(event);
    add(id, event, valid);
  };
  add("native_graph", error());
  const pressure = envelope("error_suppressed", {
    fingerprint: "fictional-queue-pressure",
    suppressed_count: 50,
    window_seconds: 60,
    first_seen: "2026-10-26T10:00:00.000Z",
    last_seen: "2026-10-26T10:00:00.000Z",
    reason: "queue_pressure",
    level: "error"
  });
  add("installed_queue_pressure_aggregate", pressure);
  change(
    "legacy_error",
    (event) => {
      delete event.payload["exception_evidence"];
    },
    true,
    backend
  );
  change(
    "legacy_custom_reference",
    (event) => {
      event.context = { evidence_reference: { custom: "historic application data" } };
    },
    true
  );
  change(
    "generic_event_uuid_v7",
    (event) => {
      event.event_id = "11111111-1111-7111-8111-111111111111";
    },
    true
  );
  change(
    "nullable_frame_coordinates",
    (event) => {
      evidence(event).nodes[0]!.frames = [
        { ...frame, function: null, file: null, line: null, column: 0 }
      ];
    },
    true
  );
  change(
    "shared_child_dag",
    (event) => {
      const value = evidence(event);
      value.nodes.push(node(1), node(2));
      value.nodes[0]!.relationships = [
        { kind: "cause", target_id: 1 },
        { kind: "suppressed", target_id: 2 }
      ];
      value.nodes[1]!.relationships = [{ kind: "cause", target_id: 2 }];
    },
    true
  );
  change(
    "execution_and_reference",
    (event) => {
      event.context = { evidence_reference: structuredClone(ref) };
      event.payload["execution"] = {
        version: 1,
        kind: "job",
        name: "fixture.calculate",
        elapsed_ms: 10,
        limit_ms: null
      };
    },
    true,
    backend
  );
  change(
    "resource_unknown",
    (event) => {
      event.payload["resource_observations"] = resources();
    },
    true
  );
  change(
    "observed_without_status",
    (event) => {
      event.payload["resource_observations"] = resources();
      resourceItems(event)[0]!["availability"] = "observed";
    },
    true
  );
  change(
    "empty_userinfo_marker",
    (event) => {
      event.payload["resource_observations"] = resources("https://@cdn.example.test/asset.js");
    },
    true
  );
  change("closed_graph", (event) => {
    evidence(event)["unexpected"] = true;
  });
  change("unknown_runtime", (event) => {
    evidence(event).runtime = "custom";
  });
  change("invalid_coordinate", (event) => {
    evidence(event).nodes[0]!.frames[0]!.line = 0;
  });
  change("negative_column", (event) => {
    evidence(event).nodes[0]!.frames[0]!.column = -1;
  });
  change("utf8_node_name", (event) => {
    evidence(event).nodes[0]!.name = "é".repeat(129);
  });
  change("cycle", (event) => {
    evidence(event).nodes[0]!.relationships = [{ kind: "cause", target_id: 0 }];
  });
  change("orphan", (event) => {
    evidence(event).nodes.push(node(1));
  });
  change("duplicate_node_id", (event) => {
    evidence(event).nodes.push(node(0));
  });
  change("unknown_target", (event) => {
    evidence(event).nodes[0]!.relationships = [{ kind: "cause", target_id: 1 }];
  });
  change("too_many_causal_edges", (event) => {
    const value = evidence(event);
    value.nodes.push(node(1), node(2));
    value.nodes[0]!.relationships = [
      { kind: "cause", target_id: 1 },
      { kind: "context", target_id: 2 }
    ];
  });
  change("cause_depth", (event) => {
    const value = evidence(event);
    value.nodes = Array.from({ length: 6 }, (_, i) => ({
      ...node(i),
      relationships: i < 5 ? [{ kind: "cause", target_id: i + 1 }] : []
    }));
  });
  change("children_width", (event) => {
    const value = evidence(event);
    value.nodes = Array.from({ length: 7 }, (_, i) => node(i));
    value.nodes[0]!.relationships = value.nodes
      .slice(1)
      .map((child) => ({ kind: "aggregate", target_id: child.id }));
  });
  change("frame_count", (event) => {
    evidence(event).nodes[0]!.frames = Array.from({ length: 33 }, () => structuredClone(frame));
  });
  change("combined_optional_bytes", (event) => {
    const value = evidence(event);
    value.nodes = [0, 1].map((i) => ({
      ...node(i),
      stack: "x".repeat(16_000),
      message: "m".repeat(1500),
      relationships: i === 0 ? [{ kind: "cause", target_id: 1 }] : []
    }));
  });
  change("resource_empty", (event) => {
    event.payload["resource_observations"] = { version: 1, items: [] };
  });
  change("resource_zero_status", (event) => {
    event.payload["resource_observations"] = resources();
    resourceItems(event)[0]!["response_status"] = 0;
  });
  change("resource_credentials", (event) => {
    event.payload["resource_observations"] = resources(
      "https://user:password@cdn.example.test/asset.js"
    );
  });
  change("resource_query", (event) => {
    event.payload["resource_observations"] = resources(
      "https://cdn.example.test/asset.js?version=1"
    );
  });
  change(
    "unicode_relative_resource",
    (event) => {
      event.payload["resource_observations"] = resources("/élément.js");
    },
    true
  );
  change(
    "unicode_absolute_resource",
    (event) => {
      event.payload["resource_observations"] = resources("https://cdn.example.test/路径.js");
    },
    true
  );
  const csp = (): Json => ({
    version: 1,
    items: [
      {
        kind: "csp",
        observed_at: "2026-10-26T10:00:00.000Z",
        source_url: null,
        effective_directive: "script-src-elem",
        disposition: "report",
        document_status_code: 200
      }
    ]
  });
  change(
    "csp_observation",
    (event) => {
      event.payload["resource_observations"] = csp();
    },
    true
  );
  change("csp_directive_final_newline", (event) => {
    event.payload["resource_observations"] = csp();
    resourceItems(event)[0]!["effective_directive"] = "script-src\n";
  });
  for (const [field, value] of [
    ["effective_directive", "Script SRC"],
    ["disposition", "unknown"],
    ["document_status_code", 0],
    ["observed_at", "2026-02-30T10:00:00.000Z"],
    ["observed_at", "2026-10-26T24:00:00.000Z"]
  ] as const) {
    change(`invalid_csp_${field}_${String(value)}`, (event) => {
      event.payload["resource_observations"] = csp();
      resourceItems(event)[0]![field] = value;
    });
  }
  add("operation_recovery", recovery());
  change(
    "closed_recovery",
    (event) => {
      event.payload["data"] = {};
    },
    false,
    recovery
  );
  change(
    "reference_requires_v4",
    (event) => {
      event.payload["failure_ref"] = "22222222-2222-7222-8222-222222222222";
    },
    false,
    recovery
  );
  change(
    "invalid_recovery_state",
    (event) => {
      event.payload["state"] = "success";
    },
    false,
    recovery
  );
  const pageRecovery = (): EventFixture => {
    const event = recovery();
    event.payload["scope"] = { kind: "page", page_id: scope.operation_id };
    return event;
  };
  change("missing_page_session", () => {}, false, pageRecovery);
  change(
    "blank_page_session",
    (event) => {
      event.correlation["session_id"] = " ";
    },
    false,
    pageRecovery
  );
  change(
    "zero_page_session",
    (event) => {
      event.correlation["session_id"] = "0";
    },
    true,
    pageRecovery
  );
  add(
    "late_resource_observation",
    envelope("diagnostic_context", {
      ...structuredClone(ref),
      kind: "resource_observation",
      source_event_id: eventId,
      observations: resources()
    })
  );
  change("frontend_execution_is_not_supported", (event) => {
    event.payload["execution"] = {
      version: 1,
      kind: "job",
      name: null,
      elapsed_ms: null,
      limit_ms: null
    };
  });
  change(
    "backend_resources_are_not_supported",
    (event) => {
      event.payload["resource_observations"] = resources();
    },
    false,
    backend
  );
  change("log_graph_is_not_supported", (event) => {
    event.event_type = "log_event";
    event.payload = {
      level: "error",
      message: "fictional",
      attributes: {},
      exception_evidence: graph()
    };
  });
  change(
    "unicode_json_budget",
    (event) => {
      evidence(event).nodes = [0, 1, 2].map((id) => ({
        ...node(id),
        message: "Δ".repeat(800),
        stack: "é".repeat(2400),
        relationships: id < 2 ? [{ kind: "cause", target_id: id + 1 }] : []
      }));
    },
    true
  );
  change(
    "slash_json_budget",
    (event) => {
      evidence(event).nodes[0]!.frames = Array.from({ length: 12 }, () => ({
        ...frame,
        file: "/".repeat(1800)
      }));
    },
    true
  );
  change(
    "line_terminator_json_budget",
    (event) => {
      evidence(event).nodes = [0, 1, 2].map((id) => ({
        ...node(id),
        stack: "\u2028".repeat(3000),
        relationships: id < 2 ? [{ kind: "cause", target_id: id + 1 }] : []
      }));
    },
    true
  );
  change(
    "reference_requires_rfc_variant",
    (event) => {
      event.payload["failure_ref"] = "22222222-2222-4222-0222-222222222222";
    },
    false,
    recovery
  );
  for (const [label, elapsed] of [
    ["small_decimal", 1e-6],
    ["small_exponent", 1e-7],
    ["large_decimal", 1e20]
  ] as const) {
    const event = backend();
    const value = evidence(event);
    value.nodes = [node(0), node(1)];
    value.nodes[0]!.stack = "x".repeat(16000);
    value.nodes[0]!.relationships = [{ kind: "cause", target_id: 1 }];
    value.nodes[1]!.stack = "";
    event.payload["execution"] = {
      version: 1,
      kind: "job",
      name: null,
      elapsed_ms: elapsed,
      limit_ms: null
    };
    const initial = JSON.stringify({
      exception_evidence: value,
      execution: event.payload["execution"]
    }).length;
    value.nodes[1]!.stack = "x".repeat(32768 - initial);
    add(`numeric_budget_${label}`, event);
    const over = structuredClone(event);
    evidence(over).nodes[1]!.stack = (evidence(over).nodes[1]!.stack ?? "") + "x";
    add(`numeric_budget_${label}_over`, over, false);
  }
  return cases;
}

export const evidenceCapabilityFixtures = [
  {
    id: "full",
    input: { version: 1, features: [...EvidenceCapabilityValues] },
    features: [...EvidenceCapabilityValues]
  },
  { id: "missing", input: null, features: [] },
  { id: "unknown_version", input: { version: 2, features: ["recovery_v1"] }, features: [] },
  { id: "unknown_feature", input: { version: 1, features: ["custom"] }, features: [] },
  {
    id: "duplicate",
    input: { version: 1, features: ["recovery_v1", "recovery_v1"] },
    features: []
  },
  {
    id: "canonical_order",
    input: { version: 1, features: ["recovery_v1", "exception_evidence_v1"] },
    features: ["exception_evidence_v1", "recovery_v1"]
  }
];
