#!/usr/bin/env bash
set -euo pipefail

# Disposable source execution only. Never connects to a hosted database.
previous_revision="${PREVIOUS_API_REVISION:?Set PREVIOUS_API_REVISION to the exact baseline commit}"
repo_root="$(git rev-parse --show-toplevel)"
git -C "$repo_root" cat-file -e "${previous_revision}^{commit}"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/debugbundle-hosted-oauth.XXXXXX")"
prefix="debugbundle-hosted-oauth-$$"
network="$prefix"
cleanup() {
  docker rm -f "${prefix}-postgres" "${prefix}-redis" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  rm -rf "$scratch"
}
trap cleanup EXIT
mkdir -p "$scratch/previous" "$scratch/corpus"
chmod 700 "$scratch" "$scratch/corpus"
if docker run --rm --network none -v "$repo_root:/workspace:ro" -w /workspace \
  -e DB_HOST=production -e REDIS_URL=redis://production:6379 \
  -e HOSTED_OAUTH_CORPUS_DIR=/corpus node:24-alpine \
  node --import tsx scripts/verify-hosted-oauth-compatibility.mjs seed old > "$scratch/boundary.log" 2>&1; then
  echo "hosted_oauth_unsafe_target_guard_failed" >&2
  exit 1
fi
if ! grep -qx 'hosted_oauth_compatibility_invalid_test_target' "$scratch/boundary.log"; then
  echo "hosted_oauth_target_guard_not_exercised" >&2
  exit 1
fi
echo "hosted_oauth_unsafe_target_rejected_ok"
git -C "$repo_root" archive "$previous_revision" | tar -xf - -C "$scratch/previous"
cp "$repo_root/scripts/verify-hosted-oauth-compatibility.mjs" "$scratch/previous/scripts/"
docker network create "$network" >/dev/null
docker run -d --name "${prefix}-postgres" --network "$network" \
  -e POSTGRES_USER=debugbundle -e POSTGRES_PASSWORD=debugbundle -e POSTGRES_DB=debugbundle postgres:17 >/dev/null
docker run -d --name "${prefix}-redis" --network "$network" redis:7 >/dev/null
for attempt in {1..30}; do
  if docker exec "${prefix}-postgres" pg_isready -U debugbundle -d debugbundle >/dev/null 2>&1 && \
    docker exec "${prefix}-redis" redis-cli ping | grep -qx PONG; then break; fi
  if [[ "$attempt" -eq 30 ]]; then echo "hosted_oauth_dependencies_not_ready" >&2; exit 1; fi
  sleep 1
done
runtime_env=(
  -e DB_HOST="${prefix}-postgres" -e DB_PORT=5432 -e DB_USER=debugbundle
  -e DB_PASSWORD=debugbundle -e DB_NAME=debugbundle
  -e REDIS_URL="redis://${prefix}-redis:6379" -e HOSTED_OAUTH_CORPUS_DIR=/corpus
)
docker run --rm --network "$network" -v "$scratch/previous:/workspace" -w /workspace \
  "${runtime_env[@]}" node:24-alpine sh -lc \
  'corepack enable && corepack pnpm install --frozen-lockfile && corepack pnpm db:bootstrap && corepack pnpm db:migrate' >/dev/null
run_corpus() {
  local source="$1" mode="$2" name="$3"
  docker run --rm --network "$network" -v "$source:/workspace:ro" \
    -v "$scratch/corpus:/corpus" -w /workspace "${runtime_env[@]}" node:24-alpine \
    node --import tsx scripts/verify-hosted-oauth-compatibility.mjs "$mode" "$name"
}
run_corpus "$scratch/previous" seed old
docker run --rm --network "$network" -v "$repo_root:/workspace:ro" -w /workspace \
  "${runtime_env[@]}" node:24-alpine node --import tsx scripts/migrate-storage.ts >/dev/null
run_corpus "$repo_root" exercise old
run_corpus "$repo_root" seed new
run_corpus "$scratch/previous" exercise new
run_corpus "$scratch/previous" rollback old
run_corpus "$repo_root" negative new
echo "hosted_oauth_old_new_source_compatibility_ok_legacy_rollback_rotation_gap"
