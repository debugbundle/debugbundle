#!/bin/sh
set -eu
review_owner=referral-public-review-v1
review_network=debugbundle-referral-review
review_db=debugbundle-referral-review-db
review_api=debugbundle-referral-review-api
action=${1:-up}
case "$action" in up|down) ;; *) echo 'Expected up or down' >&2; exit 1 ;; esac
for name in "$review_db" "$review_api"; do
  if docker container inspect "$name" >/dev/null 2>&1; then
    test "$(docker inspect --format '{{index .Config.Labels "com.debugbundle.review-owner"}}' "$name")" = "$review_owner" || { echo "Refusing foreign container: $name" >&2; exit 1; }
  fi
done
if docker network inspect "$review_network" >/dev/null 2>&1; then
  test "$(docker network inspect --format '{{index .Labels "com.debugbundle.review-owner"}}' "$review_network")" = "$review_owner" || { echo 'Refusing foreign review network' >&2; exit 1; }
fi
if [ "$action" = down ]; then
  for name in "$review_api" "$review_db"; do
    if docker container inspect "$name" >/dev/null 2>&1; then docker rm -f "$name" >/dev/null; fi
  done
  if docker network inspect "$review_network" >/dev/null 2>&1; then docker network rm "$review_network" >/dev/null; fi
  exit 0
fi
if ! docker network inspect "$review_network" >/dev/null 2>&1; then
  docker network create --label "com.debugbundle.review-owner=$review_owner" "$review_network" >/dev/null
fi
if ! docker container inspect "$review_db" >/dev/null 2>&1; then
  docker run -d --name "$review_db" --network "$review_network" --network-alias postgres \
    --label "com.debugbundle.review-owner=$review_owner" --tmpfs /var/lib/postgresql/data \
    --health-cmd='pg_isready -U review -d debugbundle_referral_review' --health-interval=5s \
    -e POSTGRES_DB=debugbundle_referral_review -e POSTGRES_USER=review -e POSTGRES_PASSWORD=local-review-only postgres:16-alpine >/dev/null
else docker start "$review_db" >/dev/null
fi
attempt=0
until docker exec "$review_db" pg_isready -U review -d debugbundle_referral_review >/dev/null 2>&1; do
  attempt=$((attempt+1)); test "$attempt" -lt 30 || { echo 'Review database unavailable' >&2; exit 1; }; sleep 1
done
if docker container inspect "$review_api" >/dev/null 2>&1; then
  docker restart "$review_api" >/dev/null
else
  docker run -d --name "$review_api" --network "$review_network" \
    --label "com.debugbundle.review-owner=$review_owner" -p 127.0.0.1:3003:3003 \
    -e REFERRAL_PUBLIC_REVIEW=1 -e NODE_ENV=development -v "$PWD:/workspace:ro" -w /workspace \
    --health-cmd='node -e "fetch(\"http://127.0.0.1:3003/ready\").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"' \
    --health-interval=10s --health-start-period=15s node:24-alpine \
    node --import tsx scripts/referral-public-review.ts >/dev/null
fi
attempt=0
until curl --fail --silent http://127.0.0.1:3003/ready >/dev/null; do
  attempt=$((attempt+1)); test "$attempt" -lt 45 || { echo 'Review API unavailable; inspect its local container log' >&2; exit 1; }; sleep 1
done
echo 'Synthetic public referral review API: http://localhost:3003 (REVIEW20)'
