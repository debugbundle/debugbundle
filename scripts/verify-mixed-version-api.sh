#!/usr/bin/env bash
set -euo pipefail

# Exercise the deployed source revision and the candidate against one isolated,
# forward-migrated database. This never connects to a hosted data store.
previous_revision="${PREVIOUS_API_REVISION:?Set PREVIOUS_API_REVISION to the deployed core commit}"
repo_root="$(git rev-parse --show-toplevel)"
git -C "$repo_root" cat-file -e "${previous_revision}^{commit}"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/debugbundle-mixed-api.XXXXXX")"
network="debugbundle-mixed-api-$$"
prefix="debugbundle-mixed-api-$$"

cleanup() {
  docker rm -f "${prefix}-old" "${prefix}-new" "${prefix}-postgres" "${prefix}-redis" "${prefix}-s3" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  rm -rf "$scratch"
}
trap cleanup EXIT

mkdir -p "$scratch/previous"
git -C "$repo_root" archive "$previous_revision" | tar -xf - -C "$scratch/previous"
docker network create "$network" >/dev/null
docker run -d --name "${prefix}-postgres" --network "$network" \
  -e POSTGRES_USER=debugbundle -e POSTGRES_PASSWORD=debugbundle -e POSTGRES_DB=debugbundle \
  postgres:17 >/dev/null
docker run -d --name "${prefix}-redis" --network "$network" redis:7 >/dev/null
docker run -d --name "${prefix}-s3" --network "$network" -e SERVICES=s3 \
  -e AWS_DEFAULT_REGION=us-east-1 localstack/localstack:4.14.0 >/dev/null

for attempt in {1..60}; do
  if docker exec "${prefix}-postgres" pg_isready -U debugbundle -d debugbundle >/dev/null 2>&1 && \
    docker exec "${prefix}-s3" awslocal s3 ls >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" -eq 60 ]]; then
    echo "mixed_api_dependency_start_failed" >&2
    exit 1
  fi
  sleep 2
done
docker exec "${prefix}-s3" awslocal s3 mb s3://debugbundle-raw-events >/dev/null

runtime_env=(
  -e DB_HOST="${prefix}-postgres" -e DB_PORT=5432
  -e DB_USER=debugbundle -e DB_PASSWORD=debugbundle -e DB_NAME=debugbundle
  -e REDIS_URL="redis://${prefix}-redis:6379"
  -e S3_ENDPOINT="http://${prefix}-s3:4566" -e S3_REGION=us-east-1
  -e S3_BUCKET=debugbundle-raw-events
  -e AWS_ACCESS_KEY_ID=test -e AWS_SECRET_ACCESS_KEY=test
  -e ANALYTICS_HASH_SECRET=mixed-api-local-test
  -e DEBUGBUNDLE_PROBE_TRIGGER_SECRET=mixed-api-local-test
  -e API_HOST=0.0.0.0 -e API_PORT=3000
)

docker run --rm --network "$network" -v "$scratch/previous:/workspace" -w /workspace \
  "${runtime_env[@]}" node:24-alpine sh -lc \
  'corepack enable && corepack pnpm install --frozen-lockfile && corepack pnpm db:bootstrap && corepack pnpm db:migrate' >/dev/null

docker run -d --name "${prefix}-old" --network "$network" \
  -v "$scratch/previous:/workspace" -w /workspace "${runtime_env[@]}" \
  node:24-alpine sh -lc 'corepack enable && corepack pnpm api:start' >/dev/null

check_ready() {
  local target="$1"
  docker run --rm --network "$network" node:24-alpine node -e \
    'fetch(`http://${process.argv[1]}:3000/ready`, {signal: AbortSignal.timeout(4000)}).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))' \
    "$target" >/dev/null
}

wait_ready() {
  local target="$1"
  for attempt in {1..45}; do
    if check_ready "$target"; then return 0; fi
    sleep 2
  done
  echo "mixed_api_not_ready:$target" >&2
  return 1
}

wait_ready "${prefix}-old"
docker run --rm --network "$network" -v "$repo_root:/workspace" -w /workspace \
  "${runtime_env[@]}" node:24-alpine sh -lc \
  'corepack enable && corepack pnpm db:migrate' >/dev/null
wait_ready "${prefix}-old"

docker run -d --name "${prefix}-new" --network "$network" \
  -v "$repo_root:/workspace" -w /workspace "${runtime_env[@]}" \
  node:24-alpine sh -lc 'corepack enable && corepack pnpm api:start' >/dev/null
wait_ready "${prefix}-new"

docker run --rm --network "$network" -v "$repo_root:/workspace" -w /workspace \
  "${runtime_env[@]}" -e MIXED_API_OLD_HOST="${prefix}-old" \
  -e MIXED_API_NEW_HOST="${prefix}-new" node:24-alpine sh -lc \
  'corepack enable && corepack pnpm exec tsx scripts/verify-mixed-version-api-traffic.ts'

docker rm -f "${prefix}-new" >/dev/null
check_ready "${prefix}-old"
echo "mixed_api_forward_migration_and_rollback_ok"
