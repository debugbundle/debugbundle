#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)"
review_owner=referral-public-review-v1
review_network=debugbundle-referral-review
review_db=debugbundle-referral-review-db
review_api=debugbundle-referral-review-api
action=${1:-up}
case "$action" in up|down) ;; *) echo 'Expected up or down' >&2; exit 1 ;; esac

compose() {
  docker compose --project-name debugbundle -f docker-compose.yml --profile referral-review "$@"
}

# Validate every existing target before removing anything. Legacy standalone
# fixtures are adopted once; foreign containers and checkouts remain untouched.
legacy=0
for name in "$review_db" "$review_api"; do
  if docker container inspect "$name" >/dev/null 2>&1; then
    test "$(docker inspect --format '{{index .Config.Labels "com.debugbundle.review-owner"}}' "$name")" = "$review_owner" || { echo "Refusing foreign container: $name" >&2; exit 1; }
    project=$(docker inspect --format '{{if index .Config.Labels "com.docker.compose.project"}}{{index .Config.Labels "com.docker.compose.project"}}{{end}}' "$name")
    case "$project" in '') legacy=1 ;; debugbundle) ;; *) echo "Refusing foreign project: $name" >&2; exit 1 ;; esac
  fi
done
if docker container inspect "$review_api" >/dev/null 2>&1; then
  source=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/workspace"}}{{.Source}}{{end}}{{end}}' "$review_api")
  test "$(cd "$source" && pwd -P)" = "$PWD" || { echo 'Refusing a different checkout' >&2; exit 1; }
fi
if docker network inspect "$review_network" >/dev/null 2>&1; then
  test "$(docker network inspect --format '{{index .Labels "com.debugbundle.review-owner"}}' "$review_network")" = "$review_owner" || { echo 'Refusing foreign review network' >&2; exit 1; }
fi
if docker network inspect debugbundle_referral-review >/dev/null 2>&1; then
  test "$(docker network inspect --format '{{index .Labels "com.docker.compose.project"}}' debugbundle_referral-review)" = debugbundle || { echo 'Refusing foreign Compose network' >&2; exit 1; }
fi
if [ "$action" = down ]; then
  for name in "$review_api" "$review_db"; do
    if docker container inspect "$name" >/dev/null 2>&1; then docker rm -f "$name" >/dev/null; fi
  done
  # Compose shares the project with the real app: never use compose down here.
  for network in "$review_network" debugbundle_referral-review; do
    if docker network inspect "$network" >/dev/null 2>&1; then
      docker network rm "$network" >/dev/null
    fi
  done
  exit 0
fi

backup=
if [ "$legacy" = 1 ]; then
  # A stopped tmpfs database loses its state. Dump before replacing its container,
  # and retain the local backup if any later migration step fails.
  if docker container inspect "$review_db" >/dev/null 2>&1; then
    mkdir -p .tmp
    backup=$(mktemp "$PWD/.tmp/referral-review-migration.XXXXXX")
    docker start "$review_db" >/dev/null
    docker exec "$review_db" pg_dump -U review -d debugbundle_referral_review --clean --if-exists > "$backup"
    test -s "$backup"
    echo "Preserving synthetic review data in $backup"
  fi
  for name in "$review_api" "$review_db"; do
    if docker container inspect "$name" >/dev/null 2>&1; then docker rm -f "$name" >/dev/null; fi
  done
  if docker network inspect "$review_network" >/dev/null 2>&1; then docker network rm "$review_network" >/dev/null; fi
fi

compose up -d --wait --wait-timeout 60 referral-review-db
if [ -n "$backup" ]; then
  docker exec -i "$review_db" psql -X -v ON_ERROR_STOP=1 -U review -d debugbundle_referral_review < "$backup" >/dev/null
fi
compose up -d --wait --wait-timeout 90 --force-recreate --no-deps referral-review-api
if [ -n "$backup" ]; then rm "$backup"; fi
echo 'Synthetic public referral review API: http://localhost:3004 (REVIEW20)'
