#!/bin/sh
set -eu
task_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
task_dir="$task_root/.tmp/swift-5.10"
task_swift=$(cat "$task_dir/compiler-paths.txt")
task_sdk=/Library/Developer/CommandLineTools/SDKs/MacOSX14.5.sdk
test -x "$task_swift"
test -d "$task_sdk"
task_artifact="$task_root/sdks/debugbundle-swift/.tmp/evidence-artifacts/debugbundle-swift-3.1.0-candidate.tar.gz"
test -f "$task_artifact"
task_run=$(mktemp -d "$task_dir/qualification.XXXXXX")
shasum -a 256 "$task_artifact" > "$task_run/artifact.sha256"
tar -xzf "$task_artifact" -C "$task_run"
task_source="$task_run/debugbundle-swift-3.1.0"
export PATH="$(dirname "$task_swift"):$PATH"
export SDKROOT="$task_sdk"
export CLANG_MODULE_CACHE_PATH="$task_run/clang-cache"
printf 'Swift floor receipt directory: %s\n' "$task_run"
"$task_swift" --version
if [ "${1:-tests}" = consumer ]; then
  "$task_swift" build --package-path "$task_source" --sdk "$task_sdk" \
    --scratch-path "$task_run/build" --cache-path "$task_run/cache" \
    --config-path "$task_run/config" --security-path "$task_run/security"
  DEBUGBUNDLE_SMOKE_EVENTS_FILE="$task_run/events.ndjson" DEBUGBUNDLE_SMOKE_PORT=18083 \
    node "$task_source/scripts/mock-ingestion.mjs" > "$task_run/ingestion.log" 2>&1 &
  task_server=$!
  trap 'kill "$task_server" 2>/dev/null || true; wait "$task_server" 2>/dev/null || true' EXIT INT TERM
  task_attempt=0
  until curl -fsS http://127.0.0.1:18083/health >/dev/null; do
    task_attempt=$((task_attempt + 1))
    test "$task_attempt" -lt 30
    sleep 1
  done
  DEBUGBUNDLE_SMOKE_ENDPOINT=http://127.0.0.1:18083/v1/events \
    "$task_swift" run --package-path "$task_source/smoke/spm-consumer" --sdk "$task_sdk" \
    --scratch-path "$task_run/consumer-build" --cache-path "$task_run/cache" \
    --config-path "$task_run/config" --security-path "$task_run/security" DebugBundleSpmSmoke
  test -s "$task_run/events.ndjson"
  printf 'Swift5.10 exact-source archive build and installed adapter/native HTTP consumer passed.\n'
  exit 0
fi
"$task_swift" test --package-path "$task_source" --sdk "$task_sdk" \
  --scratch-path "$task_run/build" --cache-path "$task_run/cache" \
  --config-path "$task_run/config" --security-path "$task_run/security" \
  > "$task_run/tests.log" 2>&1 || { tail -n 60 "$task_run/tests.log"; exit 1; }
tail -n 15 "$task_run/tests.log"
printf 'Swift5.10 exact-source archive tests passed.\n'
