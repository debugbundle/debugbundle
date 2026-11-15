"""Generate language-neutral hook budget cases from the canonical evidence corpus."""

import argparse
import copy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def fixtures():
    corpus = json.loads((ROOT / "tests/fixtures/evidence/evidence-wire-cases.json").read_text())
    base = next(case["event"] for case in corpus["events"] if case["id"] == "combined_optional_bytes")
    original = copy.deepcopy(next(case["event"] for case in corpus["events"] if case["id"] == "legacy_error"))
    original["payload"]["message"] = "owner removed"
    cases = []
    for kind in ("frontend_exception", "backend_exception"):
        for limit in (32768, 32769):
            for reference in ("none", "typed", "legacy"):
                event = copy.deepcopy(base)
                event["event_type"] = kind
                event["payload"]["message"] = "owner replacement"
                event["context"] = {"owner_field": "preserved"}
                if kind == "backend_exception":
                    event["payload"].pop("browser")
                    event["payload"].update(handled=True, request={"method": "GET", "path": "/", "headers": {}, "query": {}},
                                            response={"status_code": 500}, runtime={"version": "fixture"})
                graph = event["payload"]["exception_evidence"]
                # Mix escaped text and multi-byte UTF-8, with a plain adjustable tail.
                graph["nodes"][0]["stack"] = "\né" * 4000
                graph["nodes"][1]["stack"] = ""
                additions = {"exception_evidence": graph}
                if reference == "typed":
                    event["context"]["evidence_reference"] = {"version": 1, "failure_ref": "11111111-1111-4111-8111-111111111111",
                        "scope": {"kind": "operation", "operation_id": "22222222-2222-4222-8222-222222222222"}}
                    additions["evidence_reference"] = event["context"]["evidence_reference"]
                elif reference == "legacy":
                    event["context"]["evidence_reference"] = {"customer_note": "preserved"}
                graph["nodes"][1]["stack"] = "x" * (limit - len(encode(additions)))
                assert len(encode(additions)) == limit
                assert len(encode(graph)) <= 32768  # Only the enclosing additions exceed.
                cases.append({"id": f"{kind}-{limit}-{reference}", "event": event,
                              "outcome": "keep" if limit == 32768 else "reduce", "bytes": limit})
    for field in ("primary", "graph"):
        event = copy.deepcopy(cases[0]["event"])
        if field == "primary":
            event["service"]["name"] = ""
        else:
            event["payload"]["exception_evidence"]["root_id"] = 99
            event["payload"]["exception_evidence"]["nodes"][1]["stack"] = "short"
        cases.append({"id": f"malformed-{field}", "event": event, "outcome": "fallback"})
    # Overflow is reducible only when the original optional structure is valid.
    oversized = next(case["event"] for case in cases if case["id"] == "frontend_exception-32769-none")
    for defect in ("primary", "root", "cycle", "unknown-field", "scalar", "string-limit", "wrong-kind", "graph-shape"):
        event = copy.deepcopy(oversized)
        graph = event["payload"]["exception_evidence"]
        if defect == "primary":
            event["service"]["name"] = ""
        elif defect == "root":
            graph["root_id"] = 7
        elif defect == "cycle":
            graph["nodes"][1]["relationships"] = [{"kind": "cause", "target_id": 0}]
        elif defect == "unknown-field":
            graph["nodes"][0]["unexpected"] = True
        elif defect == "scalar":
            graph["version"] = "1"
        elif defect == "string-limit":
            graph["nodes"][0]["stack"] = "x" * 16385
        elif defect == "wrong-kind":
            event["payload"]["execution"] = {"version": 1, "kind": "job", "name": None, "elapsed_ms": None, "limit_ms": None}
        else:
            event["payload"]["exception_evidence"] = [graph]
        cases.append({"id": f"malformed-{defect}-over", "event": event, "outcome": "fallback"})
    for kind, field, seed in (("backend_exception", "execution", "execution_and_reference"),
                              ("frontend_exception", "resource_observations", "resource_unknown")):
        for limit in (32768, 32769):
            event = copy.deepcopy(next(case["event"] for case in cases if case["id"] == f"{kind}-{limit}-typed"))
            event["payload"][field] = copy.deepcopy(next(case["event"]["payload"][field] for case in corpus["events"] if case["id"] == seed))
            additions = {name: event["payload"][name] for name in ("exception_evidence", field)}
            additions["evidence_reference"] = event["context"]["evidence_reference"]
            tail = event["payload"]["exception_evidence"]["nodes"][1]
            tail["stack"] = tail["stack"][:len(tail["stack"]) - (len(encode(additions)) - limit)]
            assert len(encode(additions)) == limit
            cases.append({"id": f"mixed-{field}-{limit}-typed", "event": event,
                          "outcome": "keep" if limit == 32768 else "reduce", "bytes": limit})
    return {"version": 1, "original": original, "cases": cases}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    directories = ["tests/fixtures/evidence", "sdks/debugbundle-js/tests/fixtures",
                   "sdks/debugbundle-go/internal/evidence/testdata", "sdks/debugbundle-python/tests/fixtures",
                   "sdks/debugbundle-php/tests/fixtures", "sdks/debugbundle-ruby/spec/fixtures",
                   "sdks/debugbundle-dotnet/tests/fixtures", "sdks/debugbundle-react-native/tests/fixtures",
                   "sdks/debugbundle-java/debugbundle-java-core/src/test/resources/evidence",
                   "sdks/debugbundle-android/debugbundle-android-core/src/test/resources/evidence",
                   "sdks/debugbundle-swift/Tests/DebugBundleTests/Fixtures",
                   "sdks/debugbundle-rust/tests/fixtures"]
    content = json.dumps(fixtures(), ensure_ascii=False, indent=2) + "\n"
    for directory in directories:
        target = ROOT / directory / "before-send-budget.json"
        if args.check:
            if not target.exists() or target.read_text() != content:
                raise SystemExit(f"Hook fixture drift: {target.relative_to(ROOT)}")
        else:
            target.write_text(content)
    print(f"Hook budget fixtures {'verified' if args.check else 'written'}: {len(directories)} copies, {len(fixtures()['cases'])} cases")


if __name__ == "__main__":
    main()
