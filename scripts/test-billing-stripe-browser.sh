#!/bin/sh
set -eu
# Only disposable containers are used; ports bind to loopback. No existing
# Compose stack, customer, Stripe setting or webhook endpoint is modified.
test_name="debugbundle-billing-browser-$$"
listener_pid=""
cleanup() {
  if [ -n "$listener_pid" ]; then kill "$listener_pid" 2>/dev/null || true; wait "$listener_pid" 2>/dev/null || true; fi
  docker stop -t 30 "$test_name-app" >/dev/null 2>&1 || true
  docker rm -f "$test_name-app" "$test_name" >/dev/null 2>&1 || true
  docker network rm "$test_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM
umask 077
test -f .local-notes/stripe-test.env
test -f .local-notes/stripe-sandbox.toml
stripe --config .local-notes/stripe-sandbox.toml --project-name debugbundle-local-sandbox listen \
  --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed \
  --forward-to http://127.0.0.1:3297/v1/billing/stripe-webhook > .local-notes/stripe-browser-listener.log 2>&1 &
listener_pid=$!
attempt=0
until python3 - <<'PY'
import pathlib, re
text = pathlib.Path('.local-notes/stripe-browser-listener.log').read_text()
secret = re.search(r'whsec_[A-Za-z0-9]+', text)
if secret is None: raise SystemExit(1)
pathlib.Path('.local-notes/stripe-browser-listener.env').write_text('STRIPE_TEST_WEBHOOK_SECRET=' + secret.group() + '\n')
PY
do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then echo "Test listener did not become ready; private log retained" >&2; exit 1; fi
  sleep 1
done
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
docker run --rm --name "$test_name-app" --network "$test_name" \
  -p 127.0.0.1:5297:5297 -p 127.0.0.1:3297:3297 \
  --env-file .local-notes/stripe-test.env --env-file .local-notes/stripe-browser-listener.env \
  -e RUN_STRIPE_TEST=1 -e DB_HOST=postgres -e AUTH_COOKIE_SECURE=false \
  -v "$PWD:/workspace" -w /workspace node:24-alpine \
  node_modules/.bin/tsx apps/web/scripts/billing-stripe-browser-test.ts
