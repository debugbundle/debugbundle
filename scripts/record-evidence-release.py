#!/usr/bin/env python3
"""Inventory existing core distributions and site export without rebuilding them."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("inventory", ROOT / "scripts/record-sdk-evidence-artifacts.py")
inventory = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventory)


def require_same(left, right):
    if not left.is_file() or not right.is_file() or left.read_bytes() != right.read_bytes():
        raise SystemExit(f"Qualified and retained artifact differ: {left} / {right}")


def runtime_receipts():
    directory = ROOT / ".tmp/evidence-release/runtime-zod4"
    images_path = directory / "images.json"
    images = json.loads(images_path.read_text())
    candidate = images["contexts"]["candidate"]
    def runtime_source(path):
        return path.startswith(("apps/", "packages/", "patches/")) or path in {
            "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.json",
            "scripts/bootstrap-storage.ts", "scripts/migrate-storage.ts"}
    expected = {item["path"]: item["sha256"] for item in candidate["sources"] if runtime_source(item["path"])}
    current = {item["path"]: item["sha256"] for item in inventory.source_inventory(ROOT) if runtime_source(item["path"])}
    if current != expected:
        raise SystemExit("Runtime source differs from the qualified image; rebuild and rehearse changed runtime inputs")
    for passed in sorted(directory.glob("check-*/passed.json"), key=lambda path: path.stat().st_mtime, reverse=True):
        proof = json.loads(passed.read_text())
        if proof["images_manifest_sha256"] != inventory.identity(images_path)["sha256"]:
            continue
        if any(proof["images"].get(kind) != entry["image"]["Id"] for kind, entry in images["contexts"].items()):
            continue
        if proof["fixture_sha256"] != inventory.identity(ROOT / "scripts/runtime-evidence-schema-fixture.mjs")["sha256"]:
            continue
        if proof["orchestrator_sha256"] != inventory.identity(ROOT / "scripts/rehearse-evidence-runtime.py")["sha256"]:
            continue
        if any(inventory.identity(passed.parent / item["path"])["sha256"] != item["sha256"] for item in proof["receipts"]):
            raise SystemExit("Runtime qualification receipt changed")
        return [str(directory / "inputs.json"), str(images_path), str(passed)]
    raise SystemExit("No matching complete runtime migration/rollback receipt")


def record(name, repo, artifacts, receipt_names, remaining):
    sources = inventory.source_inventory(repo)
    receipts = [Path(value) for value in receipt_names]
    if not sources or not artifacts or any(not path.is_file() or path.stat().st_size == 0 for path in artifacts + receipts):
        raise SystemExit(f"{name}: required source, artifact or receipt missing")
    value = {
        "version": 1,
        "candidate_version": json.loads((repo / "package.json").read_text())["version"],
        "source_state": inventory.source_state(repo, sources),
        "base_commit": subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], text=True).strip(),
        "source_sha256": hashlib.sha256(json.dumps(sources, sort_keys=True, separators=(",", ":")).encode()).hexdigest(),
        "sources": sources,
        "artifacts": [inventory.identity(path, repo) for path in artifacts],
        "receipts": [inventory.identity(path) for path in receipts],
        "recorders": [inventory.identity(Path(__file__).resolve(), ROOT), inventory.identity(Path(inventory.__file__), ROOT)],
        "qualification": "Byte inventory only; receipt scope and remaining gates are recorded in the release handoff.",
        "remaining": remaining,
    }
    output = ROOT / ".tmp/evidence-release" / f"{name}.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(value, indent=2) + "\n")
    print(f"{name} {value['candidate_version']}: {len(sources)} sources, {len(artifacts)} artifacts, {len(receipts)} receipts -> {output}")


if __name__ == "__main__":
    destination = ROOT / ".tmp/evidence-release/npm"
    for package, checked in [("cli", ".tmp/cli-runtime-package"), ("mcp", ".tmp/codex-plugin")]:
        version = json.loads((ROOT / "apps" / package / "package.json").read_text())["version"]
        filename = f"debugbundle-{package}-{version}.tgz"
        require_same(destination / filename, ROOT / checked / filename)
    artifacts = []
    for directory, package, manifest in [
        (destination, "debugbundle-cli", ROOT / "apps/cli/package.json"),
        (destination, "debugbundle-mcp", ROOT / "apps/mcp/package.json"),
        (destination, "debugbundle-openclaw-plugin", ROOT / "apps/openclaw-plugin/package.json"),
        (ROOT / ".tmp/apache-packages", "debugbundle-shared-types", ROOT / "packages/shared-types/package.json"),
        (ROOT / ".tmp/apache-packages", "debugbundle-redaction", ROOT / "packages/redaction/package.json"),
    ]:
        version = json.loads(manifest.read_text())["version"]
        artifacts.append(directory / f"{package}-{version}.tgz")
    record("core", ROOT, artifacts, [
        "/tmp/debugbundle-zod4-core-coverage5.log", "/tmp/debugbundle-zod4-core-integration2.log",
        "/tmp/debugbundle-zod4-core-lint.log", "/tmp/debugbundle-zod4-final-typecheck.log",
        "/tmp/debugbundle-zod4-shared-versions-green.log", "/tmp/debugbundle-zod4-schema-contracts7.log",
        "/tmp/debugbundle-zod4-core-distributions-build.log", "/tmp/debugbundle-zod4-cli-installed-runtimes.log",
        "/tmp/debugbundle-zod4-codex-installed-runtimes.log", "/tmp/debugbundle-zod4-browser-installed-chromium.log",
        "/tmp/debugbundle-zod4-js-final-qualification2.log", "/tmp/debugbundle-zod4-js-runtime-audit.log",
        "/tmp/debugbundle-zod4-final-native-fixtures-check.log",
    ] + runtime_receipts(), ["owner review before release train", "explicit publication/deployment authority",
        "hosted exact-source rollout and rollback verification", "post-publication MCP ecosystem pipeline"])
    site = ROOT / "site"
    record("site", site, sorted(path for path in (site / "out").rglob("*") if path.is_file() and not path.is_symlink()), [
        "/tmp/debugbundle-zod4-site-final-gates.log", "/tmp/debugbundle-zod4-site-final-export.log",
        "/tmp/debugbundle-zod4-core-distributions-build.log",
    ], ["owner review before release train", "explicit publication/deployment authority"])
