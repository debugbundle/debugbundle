#!/usr/bin/env python3
"""Record existing candidate bytes and receipts; never build or publish artifacts."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent.parent
SDK = {
    "python": ("2.1.0", ["dist/debugbundle_python-2.1.0*"], [
        "/tmp/debugbundle-zod4-python-schema-qualification2.log",
        "/tmp/debugbundle-zod4-python-wheel-installed.log",
        "/tmp/debugbundle-python-evidence-performance2.log"]),
    "php": ("2.1.0", ["smoke/dist/debugbundle-sdk-php-worktree.zip"], [
        "/tmp/debugbundle-zod4-php-schema-qualification2.log",
        "/tmp/debugbundle-zod4-php-zip-installed.log",
        "/tmp/debugbundle-php-evidence-performance1.log",
        "/tmp/debugbundle-php-evidence-performance85.log"]),
    "ruby": ("2.1.0", ["debugbundle-2.1.0.gem"], [
        "/tmp/debugbundle-zod4-ruby-schema-qualification2.log",
        "/tmp/debugbundle-ruby-evidence-final-frameworks.log",
        "/tmp/debugbundle-zod4-ruby-installed-matrix.log",
        "/tmp/debugbundle-ruby-evidence-comparison2.log"]),
    "java": ("3.1.0", ["debugbundle-*/target/debugbundle-*-3.1.0*.jar", "debugbundle-*/pom.xml", "pom.xml"], [
        "/tmp/debugbundle-zod4-java-wildfly.log",
        "/tmp/debugbundle-zod4-java-performance.log"]),
    "dotnet": ("2.1.0", ["artifacts/packages/*.2.1.0.nupkg", "artifacts/packages/*.2.1.0.snupkg"], [
        "/tmp/debugbundle-zod4-dotnet-schema-qualification.log",
        "/tmp/debugbundle-zod4-dotnet-final-installed-net10.log",
        "/tmp/debugbundle-zod4-dotnet-final-pack-net8.log",
        "/tmp/debugbundle-dotnet-evidence-performance2.log"]),
    "react-native": ("3.1.0", [".smoke/debugbundle-sdk-react-native-3.1.0.tgz"], [
        "/tmp/debugbundle-react-native-evidence-performance-final2.log",
        "/tmp/debugbundle-react-native-evidence-privacy-final-native.log",
        "/tmp/debugbundle-zod4-rn-package-managers.log",
        "/tmp/debugbundle-react-native-evidence-expo-ios.log"]),
}
EXCLUDED = {".tmp", ".smoke", ".build", "build", "target", "dist", "artifacts", "tmp", "vendor", "node_modules", "bin", "obj"}


def identity(path, relative_to=None):
    return {"path": str(path.relative_to(relative_to) if relative_to else path),
            "bytes": path.stat().st_size,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def source_inventory(repo):
    names = subprocess.check_output(["git", "-C", str(repo), "ls-files", "--cached", "--others", "--exclude-standard", "-z"]).decode().split("\0")
    sources = []
    for filename in sorted(set(names) - {""}):
        path = repo / filename
        if path.is_symlink() or not path.is_file() or EXCLUDED.intersection(path.relative_to(repo).parts):
            continue
        if path.name.startswith(".env") or path.suffix.lower() in {".pem", ".key", ".p12", ".jks", ".keystore"}:
            continue
        sources.append(identity(path, repo))
    return sources


def record(name):
    version, patterns, receipt_names = SDK[name]
    repo = ROOT / "sdks" / ("debugbundle-" + name)
    sources = source_inventory(repo)
    artifacts = sorted({path for pattern in patterns for path in repo.glob(pattern) if path.is_file() and not path.is_symlink()})
    if not artifacts or not sources:
        raise SystemExit(f"{name}: candidate source/artifacts missing; build and qualify first")
    receipts = [Path(value) for value in receipt_names]
    if name == "python":
        receipts += [Path(f"/tmp/debugbundle-zod4-python-installed-{version}.log")
                     for version in ["3.10", "3.11", "3.12", "3.13", "3.14"]]
    if name == "php":
        receipts += [Path("/tmp/debugbundle-zod4-php-coverage.log"), Path("/tmp/debugbundle-zod4-php-fpm.log")]
        receipts += [Path(f"/tmp/debugbundle-zod4-php-native-{version}.log")
                     for version in ["8.2", "8.3", "8.4", "8.5"]]
    if name == "dotnet":
        ci = ROOT / ".tmp/evidence-release/dotnet-ci.json"
        result = json.loads(ci.read_text())
        commit = subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], text=True).strip()
        expected_jobs = {f".NET {version}.0.x on {platform}-latest"
                         for version in [8, 10] for platform in ["ubuntu", "windows"]}
        successful_jobs = {job["name"] for job in result.get("jobs", []) if job["conclusion"] == "success"}
        if result.get("headSha") != commit or result.get("conclusion") != "success" or not expected_jobs <= successful_jobs:
            raise SystemExit("dotnet: successful Windows/Linux CI must match the current candidate commit")
        if subprocess.check_output(["git", "-C", str(repo), "status", "--porcelain", "--untracked-files=no"], text=True).strip():
            raise SystemExit("dotnet: working source differs from the CI-qualified commit")
        receipts.append(ci)
    if name == "java":
        receipts += sorted((repo / ".tmp/evidence-runtime").glob("*.log"))
    if name == "ruby":
        receipts += sorted((repo / "tmp/evidence-runtime").glob("installed-*.log"))
    android_runtime = False
    if name == "react-native":
        native_manifest = ROOT / "sdks/debugbundle-android/.tmp/evidence-artifact-manifest.json"
        native_artifacts = json.loads(native_manifest.read_text())["artifacts"] if native_manifest.is_file() else []
        for passed in sorted((ROOT / ".tmp/evidence-release/android-api37").glob("*/passed.json"), key=lambda path: path.stat().st_mtime, reverse=True):
            if json.loads(passed.read_text()).get("mode") != "react-native":
                continue
            inputs = json.loads((passed.parent / "inputs.json").read_text())
            rn_inputs = json.loads((passed.parent / "react-native-inputs.json").read_text())
            native_checked = {item["path"]: item["sha256"] for item in inputs["artifacts"]}
            if rn_inputs["archive"]["sha256"] != identity(artifacts[0])["sha256"] or not native_artifacts:
                continue
            if not all(native_checked.get("sdks/debugbundle-android/" + item["path"]) == item["sha256"] for item in native_artifacts):
                continue
            receipts += [passed.parent / filename for filename in ["inputs.json", "react-native-inputs.json", "runtime.txt", "instrumentation.txt", "passed.json"]]
            receipts.append(Path("/tmp/debugbundle-evidence-react-native-android-device3.log"))
            android_runtime = True
            break
    if any(not path.is_file() or path.stat().st_size == 0 for path in receipts):
        raise SystemExit(f"{name}: required qualification receipt missing")
    result = {
        "version": 1, "candidate_version": version,
        "source_state": "CI-qualified review commit" if name == "dotnet" else "local candidate",
        "base_commit": subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], text=True).strip(),
        "source_sha256": hashlib.sha256(json.dumps(sources, sort_keys=True, separators=(",", ":")).encode()).hexdigest(),
        "sources": sources, "artifacts": [identity(path, repo) for path in artifacts],
        "receipts": [identity(path) for path in receipts], "recorder": identity(Path(__file__).resolve(), ROOT),
        "qualification": "Byte inventory only; consult the execution ledger for receipt scope and open gates.",
        "remaining": ["whole-phase qualification and release handoff", "explicit publication authority"]
        + (["Android runtime and Hermes/device performance"] if name == "react-native" and not android_runtime else []),
    }
    output = ROOT / ".tmp/evidence-release" / (name + ".json")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + "\n")
    print(f"{name} {version}: {len(sources)} source inputs, {len(artifacts)} artifacts, {len(receipts)} receipts -> {output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sdk", choices=SDK, nargs="+")
    for selected in parser.parse_args().sdk:
        record(selected)
