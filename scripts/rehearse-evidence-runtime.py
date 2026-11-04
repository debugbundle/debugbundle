#!/usr/bin/env python3
"""Build local images and rehearse an additive upgrade/rollback without publishing."""
import argparse
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import shutil
import subprocess
import tarfile
import time
import uuid

ROOT = Path(__file__).resolve().parent.parent
CLOUD = ROOT / ".local-repos/debugbundle-cloud/docker"
PREDECESSOR = "c991294ccad14ee5eb257daac38fc58a0cdc1451"
LABEL = "com.debugbundle.evidence-rehearsal"
FIXTURE = ROOT / "scripts/runtime-evidence-schema-fixture.mjs"


def run(args, **kwargs):
    return subprocess.run([str(arg) for arg in args], check=True, text=True, **kwargs)


def output(args):
    return run(args, stdout=subprocess.PIPE).stdout.strip()


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


def inventory(directory):
    return [{"path": str(path.relative_to(directory)), "sha256": sha(path)}
            for path in sorted(directory.rglob("*")) if path.is_file()]


def prepare(directory):
    directory.mkdir(parents=True, exist_ok=False)
    spec = importlib.util.spec_from_file_location("inventory", ROOT / "scripts/record-sdk-evidence-artifacts.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    candidate = directory / "candidate"
    candidate.mkdir()
    for item in module.source_inventory(ROOT):
        path = Path(item["path"])
        # Only git-owned regular source; never include ignored SDK/tool/cache/secret trees.
        if {".git", ".debugbundle", ".local-repos", "site", "sdks"}.intersection(path.parts):
            continue
        destination = candidate / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / path, destination)
    predecessor = directory / "predecessor"
    predecessor.mkdir()
    archive = subprocess.check_output(["git", "-C", str(ROOT), "archive", PREDECESSOR])
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        for member in tar.getmembers():
            relative = Path(member.name)
            if relative.is_absolute() or ".." in relative.parts or not member.isfile():
                continue
            if relative.name.startswith(".env") or {".debugbundle", ".local-repos", "site", "sdks"}.intersection(relative.parts):
                continue
            destination = predecessor / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(tar.extractfile(member).read())
            destination.chmod(member.mode)
    manifest = {"predecessor_commit": PREDECESSOR, "candidate_base_commit": output(["git", "-C", ROOT, "rev-parse", "HEAD"]), "contexts": {}}
    for kind in ("candidate", "predecessor"):
        context = directory / kind
        shutil.copy2(CLOUD / "hosted-runtime.Dockerfile", context / "Dockerfile.hosted-runtime")
        shutil.copy2(CLOUD / "hosted-runtime.dockerignore", context / ".dockerignore")
        sources = inventory(context)
        digest = hashlib.sha256(json.dumps(sources, sort_keys=True).encode()).hexdigest()
        manifest["contexts"][kind] = {"sources": sources, "sha256": digest,
            "version": json.loads((context / "package.json").read_text())["version"],
            "tag": f"debugbundle-evidence-runtime:{kind}-{digest[:16]}"}
    write(directory / "inputs.json", manifest)
    print(f"Prepared isolated runtime contexts: {directory}", flush=True)


def build(directory):
    manifest = json.loads((directory / "inputs.json").read_text())
    for kind, entry in manifest["contexts"].items():
        context = directory / kind
        if inventory(context) != entry["sources"]:
            raise SystemExit(f"{kind} context changed; prepare a new directory")
        with (directory / f"build-{kind}.log").open("w") as log:
            print(f"Building local {kind} {entry['version']} image", flush=True)
            run(["docker", "build", "--file", context / "Dockerfile.hosted-runtime",
                 # Historical evidence rehearsals must never label their older
                 # source as capable of the newer project-service contract.
                 "--build-arg", "PROJECT_SERVICE_RUNTIME_CONTRACT=" + ("" if kind == "predecessor" else "project-services-v1"),
                 "--label", f"com.debugbundle.candidate-source={entry['sha256']}",
                 "--tag", entry["tag"], context], stdout=log, stderr=subprocess.STDOUT)
        entry["image"] = json.loads(output(["docker", "image", "inspect", entry["tag"]]))[0]
        print(f"{kind}: {entry['image']['Id']}", flush=True)
    write(directory / "images.json", manifest)


def check(directory):
    manifest = json.loads((directory / "images.json").read_text())
    receipt = directory / ("check-" + uuid.uuid4().hex[:12])
    receipt.mkdir()
    identity = receipt.name
    network = "debugbundle-evidence-" + identity
    owned = []
    results = {"images": {kind: entry["image"]["Id"] for kind, entry in manifest["contexts"].items()},
               "fixture_sha256": sha(FIXTURE), "orchestrator_sha256": sha(Path(__file__)),
               "images_manifest_sha256": sha(directory / "images.json"), "platform": {}, "checks": []}
    for kind, entry in manifest["contexts"].items():
        image = json.loads(output(["docker", "image", "inspect", results["images"][kind]]))[0]
        assert image["Config"]["Labels"]["com.debugbundle.candidate-source"] == entry["sha256"]
        results["platform"][kind] = image["Os"] + "/" + image["Architecture"]
    env = {"DB_HOST": "postgres", "DB_USER": "debugbundle", "DB_PASSWORD": "fixture-only", "DB_NAME": "debugbundle",
           "DB_SSL_MODE": "disable", "REDIS_URL": "redis://redis:6379", "S3_ENDPOINT": "http://localstack:4566",
           "S3_BUCKET": "debugbundle-evidence-local", "AWS_ACCESS_KEY_ID": "test", "AWS_SECRET_ACCESS_KEY": "test",
           "AWS_REGION": "us-east-1", "AWS_EC2_METADATA_DISABLED": "true", "ANALYTICS_HASH_SECRET": "local-rehearsal-only",
           "DEBUGBUNDLE_PROBE_TRIGGER_SECRET": "local-rehearsal-only", "SELFHOST_MODE": "true", "WORKER_HEALTH_PORT": "3001",
           "WORKER_START_PAUSED": "0"}
    environment = [arg for key, value in env.items() for arg in ("-e", f"{key}={value}")]

    def remove(name):
        found = json.loads(output(["docker", "inspect", name]))[0]
        assert found["Config"]["Labels"].get(LABEL) == identity, "Refusing unowned container cleanup"
        run(["docker", "rm", "-f", "-v", name], stdout=subprocess.DEVNULL)
        owned.remove(name)

    def start(suffix, image, options=(), command=()):
        name = network + "-" + suffix
        run(["docker", "create", "--name", name, "--network", network, "--label", f"{LABEL}={identity}",
             "--memory", "2g", "--cpus", "2", *options, image, *command], stdout=subprocess.DEVNULL)
        owned.append(name)
        run(["docker", "start", name], stdout=subprocess.DEVNULL)
        return name

    def execute(kind, label, command, expected=0, fixture=False):
        options = list(environment)
        if fixture:
            options += ["--mount", f"type=bind,src={FIXTURE},dst=/workspace/scripts/runtime-evidence-schema-fixture.mjs,readonly"]
        name = start(label, results["images"][kind], options, command)
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            state = json.loads(output(["docker", "inspect", name]))[0]["State"]
            if not state["Running"]:
                break
            time.sleep(0.5)
        else:
            raise RuntimeError(f"Timed out: {label}")
        logs = subprocess.run(["docker", "logs", name], text=True, capture_output=True, check=True)
        value = logs.stdout + logs.stderr
        (receipt / f"{label}.log").write_text(value)
        assert state["ExitCode"] == expected, f"{label} exit={state['ExitCode']}: {value[-2000:]}"
        remove(name)
        results["checks"].append(label)
        print(f"Passed {label}", flush=True)
        return value

    def fixture(kind, mode, label=None):
        return execute(kind, label or f"{kind}-{mode}", ["node", "--import", "tsx", "scripts/runtime-evidence-schema-fixture.mjs", mode], fixture=True)

    def json_snapshot(value):
        return json.loads(value.splitlines()[-1])

    def wait_exec(name, command):
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            attempt = subprocess.run(["docker", "exec", name, *command], text=True, capture_output=True, timeout=15)
            if attempt.returncode == 0:
                return attempt.stdout
            time.sleep(1)
        raise RuntimeError(f"Container readiness failed: {name}: {attempt.stderr[-1000:]}")

    def runtime(kind, suffix):
        names = []
        for role, port in (("api", 3000), ("worker", 3001)):
            name = start(suffix + "-" + role, results["images"][kind], environment,
                         ["corepack", "pnpm", role + ":start"])
            names.append(name)
            ready = wait_exec(name, ["node", "-e", f"fetch('http://127.0.0.1:{port}/ready').then(async r=>{{console.log(await r.text());if(!r.ok)process.exit(1)}}).catch(()=>process.exit(1))"])
            if role == "worker":
                assert json.loads(ready)["processing_enabled"] is True
                assert json.loads(ready)["worker_job_protocol"] == "postgres-v1"
            (receipt / f"{suffix}-{role}-ready.json").write_text(ready)
        config = output(["docker", "exec", names[0], "node", "--input-type=module", "-e",
            "const r=await fetch('http://127.0.0.1:3000/v1/sdk/config?debugbundle_evidence=1',{headers:{authorization:'Bearer dbundle_proj_runtime-rehearsal-token'}});const body=await r.json();if(!r.ok)throw Error(JSON.stringify(body));console.log(JSON.stringify(body));"])
        body = json.loads(config)
        if kind == "candidate":
            assert body["evidence_capabilities"]["version"] == 1
            assert len(body["evidence_capabilities"]["features"]) == 4
        else:
            assert "evidence_capabilities" not in body
        (receipt / f"{suffix}-config.json").write_text(config)
        for name in names:
            logs = subprocess.run(["docker", "logs", name], text=True, capture_output=True, check=True)
            (receipt / f"{name}.log").write_text(logs.stdout + logs.stderr)
            remove(name)
        results["checks"].append(suffix + "-api-worker-ready-and-config")
        print(f"Passed {suffix} API/worker readiness and config", flush=True)

    run(["docker", "network", "create", "--internal", "--label", f"{LABEL}={identity}", network], stdout=subprocess.DEVNULL)
    try:
        postgres = start("postgres", "postgres:17", ["--network-alias", "postgres", "--tmpfs", "/var/lib/postgresql/data",
            "-e", "POSTGRES_USER=debugbundle", "-e", "POSTGRES_PASSWORD=fixture-only", "-e", "POSTGRES_DB=debugbundle"])
        wait_exec(postgres, ["pg_isready", "-U", "debugbundle"])
        redis = start("redis", "redis:7", ["--network-alias", "redis"], ["redis-server", "--save", "", "--appendonly", "no"])
        wait_exec(redis, ["redis-cli", "ping"])
        localstack = start("localstack", "localstack/localstack:4.14.0", ["--network-alias", "localstack", "-e", "SERVICES=s3", "-e", "EAGER_SERVICE_LOADING=1", "-e", "AWS_DEFAULT_REGION=us-east-1", "-e", "DISABLE_EVENTS=1"])
        wait_exec(localstack, ["awslocal", "s3api", "create-bucket", "--bucket", env["S3_BUCKET"]])
        execute("predecessor", "bootstrap-predecessor", ["corepack", "pnpm", "db:bootstrap"])
        baseline = json_snapshot(fixture("predecessor", "seed"))
        fixture("candidate", "missing")
        for role in ("api", "worker"):
            failed = execute("candidate", f"{role}-refuses-old-schema", ["corepack", "pnpm", role + ":start"], expected=1)
            # The production logger redacts error_message; the imported readiness
            # checks above assert the exact schema reason without weakening logging.
            assert role + "_startup_failed" in failed
        runtime("predecessor", "before-migration")
        expected_ids = ["202610260001_add_typed_evidence_context"]
        project_service_contract = manifest["contexts"]["candidate"]["image"]["Config"]["Labels"].get("com.debugbundle.project-service-contract") == "project-services-v1"
        if project_service_contract:
            expected_ids += ["202611030001_add_service_definitions", "202611030002_add_project_consolidation"]
        migrated = execute("candidate", "migrate-candidate", ["corepack", "pnpm", "db:migrate"])
        assert f"db_migrate_ok: applied={len(expected_ids)};" in migrated
        upgraded = json_snapshot(fixture("candidate", "snapshot"))
        for key in ("owner", "organization"):
            assert baseline[key] == upgraded[key], f"Existing {key} changed during migration"
        # The additive server-evaluation flag must retain the predecessor's
        # effective false default while every pre-existing project value stays.
        projects = [{key: value for key, value in row.items() if key != "capture_rules_require_server"} for row in upgraded["project"]]
        assert projects == baseline["project"], "Existing project changed during migration"
        if project_service_contract:
            assert all(row["capture_rules_require_server"] is False for row in upgraded["project"])
        policy = {key: value for key, value in upgraded["policies"][0].items() if key != "capture_diagnostic_context"}
        assert policy == baseline["policies"][0] and upgraded["policies"][0]["capture_diagnostic_context"] is None
        assert all(row in upgraded["columns"] for row in baseline["columns"]), "Predecessor column changed"
        assert all(row in upgraded["ledger"] for row in baseline["ledger"]), "Predecessor ledger changed"
        added = [row for row in upgraded["ledger"] if row not in baseline["ledger"]]
        assert [row["id"] for row in added] == expected_ids
        again = execute("candidate", "migration-repeat", ["corepack", "pnpm", "db:migrate"])
        assert "db_migrate_ok: applied=0;" in again
        assert json_snapshot(fixture("candidate", "snapshot", "repeat-snapshot")) == upgraded
        fixture("candidate", "evidence")
        runtime("candidate", "after-migration")
        fixture("predecessor", "ready")
        fixture("predecessor", "legacy-write")
        runtime("predecessor", "rollback-with-expanded-schema")
        fixture("candidate", "retained")
        runtime("candidate", "forward-again")
        results["checks"].append("existing-data-schema-ledger-and-new-evidence-preserved")
        results["migration"] = added[0]
        results["migrations"] = added
    finally:
        for name in reversed(owned.copy()):
            logs = subprocess.run(["docker", "logs", name], text=True, capture_output=True, check=True)
            (receipt / f"{name}.log").write_text(logs.stdout + logs.stderr)
            remove(name)
        found = json.loads(output(["docker", "network", "inspect", network]))[0]
        assert found["Labels"].get(LABEL) == identity and not found["Containers"]
        run(["docker", "network", "rm", network], stdout=subprocess.DEVNULL)
        write(receipt / "cleanup.json", {"owned_containers_removed": True, "owned_network_removed": True})
    results["receipts"] = inventory(receipt)
    write(receipt / "passed.json", results)
    print(f"Runtime upgrade/rollback rehearsal passed: {receipt}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["prepare", "build", "check"])
    parser.add_argument("--directory", default=str(ROOT / ".tmp/evidence-release/runtime"))
    args = parser.parse_args()
    directory = Path(args.directory).resolve()
    allowed = ROOT / ".tmp/evidence-release"
    # macOS may preserve different casing for two paths to the same checkout.
    # Compare existing ancestors by identity after resolving symlinks.
    if not allowed.is_dir() or not any(parent.exists() and parent.samefile(allowed) for parent in directory.parents):
        raise SystemExit("Rehearsal files must stay under .tmp/evidence-release")
    {"prepare": prepare, "build": build, "check": check}[args.command](directory)
