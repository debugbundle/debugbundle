#!/bin/sh
set -eu

# This operator tool can reach only this checkout's local Compose database socket.
# It is never installed as an API route or packaged in the dashboard.
fail() { echo "dev-tier: $*" >&2; exit 1; }
tier=${DEV_TIER:-status}
organization=${DEV_TIER_ORG:-}
case "$tier" in status|free|solo|team|business) ;; *) fail "Use TIER=free, solo, team or business (omit TIER to inspect)." ;; esac
if [ -n "$organization" ]; then
  echo "$organization" | LC_ALL=C grep -Eq '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' || fail "ORG must be an organisation UUID."
fi
[ "${NODE_ENV:-}" != production ] || fail "Production execution is not supported."
case "${DOCKER_HOST:-}" in ''|unix://*) ;; *) fail "Only a local Unix Docker socket is supported." ;; esac
endpoint=$(docker context inspect --format '{{ .Endpoints.docker.Host }}')
case "$endpoint" in unix://*) ;; *) fail "Select a local Docker context." ;; esac

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
container=$(docker inspect --format '{{.Id}}' debugbundle-postgres)
case "$container" in ''|*[!a-f0-9]*) fail "Invalid local Postgres container identity." ;; esac
[ "${#container}" -eq 64 ] || fail "Invalid local Postgres container identity."
working_dir=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$container")
[ "$working_dir" -ef "$repo_root" ] || fail "Postgres does not belong to this checkout."
[ "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$container")" = postgres ] || fail "Expected the local Compose Postgres service."
[ "$(docker inspect --format '{{.Name}}' "$container")" = /debugbundle-postgres ] || fail "Unexpected Postgres container."
[ "$(docker inspect --format '{{.State.Running}}' "$container")" = true ] || fail "Start the local stack with make dev first."

docker exec -i "$container" psql -X -h /var/run/postgresql -U debugbundle -d debugbundle \
  -v ON_ERROR_STOP=1 -v target_plan="$tier" -v organization_id="$organization" \
  < "$repo_root/scripts/dev-tier.sql"
if [ "$tier" != status ]; then
  echo "Refresh http://localhost:5291 to load the selected base tier."
  echo "Business report schedules pause on downgrade; review and resume them after returning to Business."
fi
