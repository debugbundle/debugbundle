#!/bin/sh
set -eu

runtime_tmp=$(mktemp -d "${TMPDIR:-/tmp}/debugbundle-service-runtime.XXXXXXXX")
runtime_name=$(basename "$runtime_tmp" | tr '[:upper:].' '[:lower:]-')
cleanup() {
  runtime_status=$?
  trap - EXIT INT TERM
  rm -f "$runtime_tmp/noports.yml"
  rmdir "$runtime_tmp" || runtime_status=1
  exit "$runtime_status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
cat > "$runtime_tmp/noports.yml" <<'YAML'
services:
  postgres:
    ports: !reset []
  redis:
    ports: !reset []
  localstack:
    ports: !reset []
YAML
POSTGRES_USER=debugbundle POSTGRES_PASSWORD=debugbundle POSTGRES_DB=debugbundle \
S3_BUCKET=debugbundle-raw-events S3_REGION=us-east-1 \
make test-integration INTEGRATION_PROJECT="$runtime_name" \
  INTEGRATION_CONTAINER_PREFIX="$runtime_name" \
  INTEGRATION_COMPOSE="docker compose -p $runtime_name -f deploy/selfhost/docker-compose.yml -f $runtime_tmp/noports.yml" \
  PNPM_INSTALL_RELAXED=true INTEGRATION_TEST_TIMEOUT=180000 \
  INTEGRATION_TEST_FILES="${RUNTIME_INTEGRATION_TEST_FILES:-tests/integration/project-service-runtime.integration.test.ts}"
