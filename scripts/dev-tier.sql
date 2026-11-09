-- psql variables are quoted as SQL literals; the shell also validates both inputs.
SELECT :'target_plan' = 'status' AS inspect_only \gset
\if :inspect_only
  SELECT id AS organization_id, name, plan, billing_state,
    stripe_customer_id IS NOT NULL OR stripe_subscription_id IS NOT NULL AS provider_linked
  FROM organizations
  WHERE NULLIF(:'organization_id', '') IS NULL OR id = NULLIF(:'organization_id', '')::uuid
  ORDER BY created_at, id;
\else
  BEGIN;
  SET LOCAL lock_timeout = '5s';
  SET LOCAL statement_timeout = '10s';
  SELECT set_config('debugbundle.dev_tier', :'target_plan', true) AS requested_tier,
    set_config('debugbundle.dev_tier_org', :'organization_id', true) AS requested_org \gset
  DO $$
  DECLARE
    target text := current_setting('debugbundle.dev_tier');
    requested uuid := NULLIF(current_setting('debugbundle.dev_tier_org'), '')::uuid;
    ids uuid[];
    organization organizations%ROWTYPE;
  BEGIN
    IF target NOT IN ('free', 'solo', 'team', 'business') THEN
      RAISE EXCEPTION 'Unsupported local tier';
    END IF;
    SELECT array_agg(id) INTO ids FROM organizations WHERE requested IS NULL OR id = requested;
    IF COALESCE(cardinality(ids), 0) <> 1 THEN
      RAISE EXCEPTION 'Select exactly one local organisation: run make dev-tier, then use ORG=its-uuid';
    END IF;
    SELECT * INTO STRICT organization FROM organizations WHERE id = ids[1] FOR UPDATE;
    IF organization.stripe_customer_id IS NOT NULL OR organization.stripe_subscription_id IS NOT NULL
      OR organization.billing_state = 'trialing'
      OR EXISTS(SELECT 1 FROM billing_checkout_attempts WHERE organization_id = organization.id)
      OR EXISTS(SELECT 1 FROM billing_subscription_operations WHERE organization_id = organization.id AND completed_at IS NULL)
    THEN
      RAISE EXCEPTION 'Use an unlinked local workspace without an active trial or pending billing operation';
    END IF;
    -- Test base-tier allowances without payment, trial conversion or quota resets.
    -- Normal database downgrade guards deliberately remain enabled.
    UPDATE organizations SET plan = target, billing_state = 'admin_override',
      additional_capacity_units = 0, updated_at = statement_timestamp()
    WHERE id = organization.id AND (plan IS DISTINCT FROM target
      OR billing_state IS DISTINCT FROM 'admin_override' OR additional_capacity_units <> 0);
    RAISE NOTICE 'Local tier: % -> %', organization.plan, target;
  END $$;
  SELECT id AS organization_id, name, plan, billing_state, additional_capacity_units
  FROM organizations WHERE id = NULLIF(:'organization_id', '')::uuid
    OR (NULLIF(:'organization_id', '') IS NULL AND (SELECT count(*) FROM organizations) = 1);
  COMMIT;
\endif
