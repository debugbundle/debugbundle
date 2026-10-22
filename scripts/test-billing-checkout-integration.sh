#!/bin/sh
set -eu

# A disposable database with no published ports or persistent volumes. Existing
# developer stacks and production connections are never used by this target.
test_name="debugbundle-billing-safety-$$"
cleanup() {
  docker rm -f "$test_name" >/dev/null 2>&1 || true
  docker network rm "$test_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM
docker network create "$test_name" >/dev/null
docker run --rm -d --name "$test_name" --network "$test_name" --network-alias postgres \
  --tmpfs /var/lib/postgresql/data -e POSTGRES_USER=debugbundle \
  -e POSTGRES_PASSWORD=debugbundle -e POSTGRES_DB=debugbundle postgres:16-alpine >/dev/null
attempt=0
until docker exec "$test_name" pg_isready -U debugbundle >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then echo "Disposable billing database failed readiness" >&2; exit 1; fi
  sleep 1
done
docker run --rm --network "$test_name" -v "$PWD:/workspace" -w /workspace \
  -e RUN_INTEGRATION=1 -e DB_HOST=postgres -e DB_USER=debugbundle \
  -e DB_PASSWORD=debugbundle -e DB_NAME=debugbundle node:24-alpine sh -lc \
  'node_modules/.bin/vitest run tests/integration/billing-checkout-safety.integration.test.ts tests/integration/billing-webhook-safety.integration.test.ts --no-file-parallelism --reporter=dot --coverage --coverage.include=packages/storage/src/billing-checkout-store.ts --coverage.include=packages/storage/src/billing-checkout-schema.ts --coverage.include=packages/storage/src/billing-subscription-operation-store.ts --coverage.include=packages/storage/src/billing-subscription-operation-schema.ts --coverage.include=packages/billing/src/stripe-webhook-transaction.ts --coverage.include=packages/storage/src/billing-notification-schema.ts --coverage.include=packages/storage/src/billing-plan-change-schema.ts --coverage.reportsDirectory=.tmp/billing-store-coverage'
