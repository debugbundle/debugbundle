#!/bin/sh
set -eu

# Exercise the real psql script against a disposable socket-only database.
container="debugbundle-dev-tier-test-$$"
container_id=
evidence=$(mktemp -d)
cleanup() {
  if [ -n "$container_id" ]; then docker rm -f "$container_id" >/dev/null 2>&1 || true; fi
  rm -f "$evidence/result"
  rmdir "$evidence"
}
trap cleanup EXIT INT TERM
container_id=$(docker run --rm -d --name "$container" --network none \
  --tmpfs /var/lib/postgresql/data -e POSTGRES_USER=debugbundle \
  -e POSTGRES_PASSWORD=debugbundle -e POSTGRES_DB=debugbundle postgres:17)
attempt=0
until docker exec "$container" pg_isready -U debugbundle >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 30 ] || { echo "Disposable tier database did not become ready" >&2; exit 1; }
  sleep 1
done
psql() { docker exec -i "$container" psql -X -h /var/run/postgresql -U debugbundle -d debugbundle -v ON_ERROR_STOP=1 "$@"; }
first=11111111-1111-4111-8111-111111111111
second=22222222-2222-4222-8222-222222222222
psql -q <<'SQL'
CREATE TABLE organizations(id uuid PRIMARY KEY, name text, plan text, billing_state text,
  stripe_customer_id text, stripe_subscription_id text, additional_capacity_units integer DEFAULT 0,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE billing_checkout_attempts(organization_id uuid);
CREATE TABLE billing_subscription_operations(organization_id uuid, completed_at timestamptz);
INSERT INTO organizations(id,name,plan) VALUES('11111111-1111-4111-8111-111111111111','First','team');
SQL
switch() { psql -q -v target_plan="$1" -v organization_id="${2:-}" < scripts/dev-tier.sql; }
assert_value() {
  actual=$(psql -At -c "$1")
  [ "$actual" = "$2" ] || { echo "Tier SQL assertion failed: $actual != $2" >&2; exit 1; }
}
refuse() {
  if switch "$2" "${3:-}" >"$evidence/result" 2>&1; then
    echo "Tier SQL unexpectedly accepted $1" >&2; exit 1
  fi
  grep -q "$1" "$evidence/result"
}
for tier in free solo team business; do
  switch "$tier" >"$evidence/result" 2>&1
  assert_value "SELECT plan||':'||billing_state FROM organizations WHERE id='$first'" "$tier:admin_override"
done
refuse 'Unsupported local tier' enterprise
refuse 'Select exactly one local organisation' team 33333333-3333-4333-8333-333333333333
psql -q -c "INSERT INTO organizations(id,name,plan) VALUES('$second','Second','free')"
refuse 'Select exactly one local organisation' team
switch solo "$first" >"$evidence/result" 2>&1
assert_value "SELECT plan FROM organizations WHERE id='$second'" free
for column in stripe_customer_id stripe_subscription_id; do
  psql -q -c "UPDATE organizations SET $column='linked' WHERE id='$first'"
  refuse 'Use an unlinked local workspace' team "$first"
  assert_value "SELECT plan FROM organizations WHERE id='$first'" solo
  psql -q -c "UPDATE organizations SET $column=NULL WHERE id='$first'"
done
psql -q -c "UPDATE organizations SET billing_state='trialing' WHERE id='$first'"
refuse 'Use an unlinked local workspace' team "$first"
psql -q -c "UPDATE organizations SET billing_state='admin_override' WHERE id='$first'"
psql -q -c "INSERT INTO billing_checkout_attempts VALUES('$first')"
refuse 'Use an unlinked local workspace' team "$first"
psql -q -c "DELETE FROM billing_checkout_attempts"
psql -q -c "INSERT INTO billing_subscription_operations VALUES('$first',NULL)"
refuse 'Use an unlinked local workspace' team "$first"
psql -q -c "UPDATE billing_subscription_operations SET completed_at=now()"
switch business "$first" >"$evidence/result" 2>&1
assert_value "SELECT plan FROM organizations WHERE id='$first'" business
echo "Tier SQL verified: all four tiers, explicit organisation selection and provider/trial/operation guards."
