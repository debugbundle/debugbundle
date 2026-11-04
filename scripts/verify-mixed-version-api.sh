#!/usr/bin/env bash
set -euo pipefail

# Exercise the deployed source revision and the candidate against one isolated,
# forward-migrated database. This never connects to a hosted data store.
previous_revision="${PREVIOUS_API_REVISION:?Set PREVIOUS_API_REVISION to the deployed core commit}"
repo_root="$(git rev-parse --show-toplevel)"
git -C "$repo_root" cat-file -e "${previous_revision}^{commit}"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/debugbundle-mixed-api.XXXXXX")"
prefix="$(basename "$scratch" | tr '[:upper:]' '[:lower:]')"
network="$prefix"
owned_network=0
owned_containers=()

cleanup() {
  local status=$? name owner
  trap - EXIT INT TERM
  for name in "${owned_containers[@]}"; do
    if ! docker inspect "$name" >/dev/null 2>&1; then continue; fi
    owner="$(docker inspect --format '{{ index .Config.Labels "com.debugbundle.test-owner" }}' "$name")"
    if [[ "$owner" != "$prefix" ]]; then
      echo "Mixed API container ownership changed; refusing cleanup." >&2
      status=1
    else docker rm -f "$name" >/dev/null || status=1; fi
  done
  if [[ "$owned_network" == 1 ]]; then
    owner="$(docker network inspect --format '{{ index .Labels "com.debugbundle.test-owner" }}' "$network")"
    if [[ "$owner" != "$prefix" ]]; then
      echo "Mixed API network ownership changed; refusing cleanup." >&2
      status=1
    else docker network rm "$network" >/dev/null || status=1; fi
  fi
  rm -rf "$scratch"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir -p "$scratch/previous"
git -C "$repo_root" archive "$previous_revision" | tar -xf - -C "$scratch/previous"
docker network create --label "com.debugbundle.test-owner=$prefix" "$network" >/dev/null
owned_network=1
docker run -d --name "${prefix}-postgres" --network "$network" \
  --label "com.debugbundle.test-owner=$prefix" \
  -e POSTGRES_USER=debugbundle -e POSTGRES_PASSWORD=debugbundle -e POSTGRES_DB=debugbundle \
  postgres:17 >/dev/null
owned_containers+=("${prefix}-postgres")
docker run -d --name "${prefix}-redis" --network "$network" --label "com.debugbundle.test-owner=$prefix" redis:7 >/dev/null
owned_containers+=("${prefix}-redis")
docker run -d --name "${prefix}-s3" --network "$network" -e SERVICES=s3 \
  --label "com.debugbundle.test-owner=$prefix" \
  -e AWS_DEFAULT_REGION=us-east-1 localstack/localstack:4.14.0 >/dev/null
owned_containers+=("${prefix}-s3")

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
  --label "com.debugbundle.test-owner=$prefix" \
  -v "$scratch/previous:/workspace" -w /workspace "${runtime_env[@]}" \
  node:24-alpine sh -lc 'corepack enable && corepack pnpm api:start' >/dev/null
owned_containers+=("${prefix}-old")

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
  --label "com.debugbundle.test-owner=$prefix" \
  -v "$repo_root:/workspace" -w /workspace "${runtime_env[@]}" \
  node:24-alpine sh -lc 'corepack enable && corepack pnpm api:start' >/dev/null
owned_containers+=("${prefix}-new")
wait_ready "${prefix}-new"

docker run --rm --network "$network" -v "$repo_root:/workspace" -w /workspace \
  "${runtime_env[@]}" -e MIXED_API_OLD_HOST="${prefix}-old" \
  -e MIXED_API_NEW_HOST="${prefix}-new" node:24-alpine sh -lc \
  'corepack enable && corepack pnpm exec tsx scripts/verify-mixed-version-api-traffic.ts'

docker rm -f "${prefix}-new" >/dev/null
check_ready "${prefix}-old"
echo "mixed_api_forward_migration_and_rollback_ok"
