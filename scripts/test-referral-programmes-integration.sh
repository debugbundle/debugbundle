#!/bin/sh
set -eu

# This target owns only its randomly named tmpfs database and private network.
# It has no host ports, persistent volumes, application credentials or providers.
test_tmp=$(mktemp -d "${TMPDIR:-/tmp}/debugbundle-project-services.XXXXXXXX")
test_name=$(basename "$test_tmp" | tr '[:upper:]' '[:lower:]')
owned_network=0
owned_container=0
cleanup() {
  test_status=$?
  trap - EXIT INT TERM
  if [ "$owned_container" = "1" ]; then
    if [ "$(docker inspect --format '{{ index .Config.Labels "com.debugbundle.test-owner" }}' "$test_name" 2>/dev/null)" = "$test_name" ]; then
      docker rm -f "$test_name" >/dev/null 2>&1 || test_status=1
    else
      echo "Test container ownership changed; refusing cleanup." >&2
      test_status=1
    fi
  fi
  if [ "$owned_network" = "1" ]; then
    if [ "$(docker network inspect --format '{{ index .Labels "com.debugbundle.test-owner" }}' "$test_name" 2>/dev/null)" = "$test_name" ]; then
      docker network rm "$test_name" >/dev/null 2>&1 || test_status=1
    else
      echo "Test network ownership changed; refusing cleanup." >&2
      test_status=1
    fi
  fi
  rmdir "$test_tmp" || test_status=1
  exit "$test_status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
docker network create --internal --label "com.debugbundle.test-owner=$test_name" "$test_name" >/dev/null
owned_network=1
docker run --rm -d --name "$test_name" --network "$test_name" --network-alias postgres \
  --label "com.debugbundle.test-owner=$test_name" \
  --tmpfs /var/lib/postgresql/data -e POSTGRES_USER=debugbundle \
  -e POSTGRES_PASSWORD=debugbundle -e POSTGRES_DB=debugbundle postgres:16-alpine >/dev/null
owned_container=1
attempt=0
until docker exec "$test_name" pg_isready -U debugbundle >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then echo "Disposable referral database failed readiness" >&2; exit 1; fi
  sleep 1
done
docker run --rm --network "$test_name" -v "$PWD:/workspace" -w /workspace \
  -e CI=1 -e NO_COLOR=1 -e REFERRAL_COVERAGE="${REFERRAL_COVERAGE:-0}" \
  -e REFERRAL_COVERAGE_DIR="${REFERRAL_COVERAGE_DIR:-.tmp/referral-coverage}" \
  -e RUN_INTEGRATION=1 -e REFERRAL_DISPOSABLE_DATABASE=1 -e DB_HOST=postgres -e DB_USER=debugbundle \
  -e DB_PASSWORD=debugbundle -e DB_NAME=debugbundle \
  -e TEST_FILES="${TEST_FILES:-tests/integration/offer-*.integration.test.ts}" \
  node:24-alpine sh -lc 'if [ "$REFERRAL_COVERAGE" = "1" ]; then export VITEST_COVERAGE_SHARD=1 VITEST_COVERAGE_DIR="$REFERRAL_COVERAGE_DIR"; node_modules/.bin/vitest run $TEST_FILES --coverage --maxWorkers=1 --no-file-parallelism --reporter=dot; else node_modules/.bin/vitest run $TEST_FILES --no-file-parallelism --reporter=dot; fi'
