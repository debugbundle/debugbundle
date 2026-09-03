import { gzipSync } from "node:zlib";

import { Pool } from "pg";

import reviewerFixture from "../tests/fixtures/openai-plugin-v1/reviewer-tenant.json" with { type: "json" };
import {
  buildBundleObjectKey,
  buildImprovementBundleObjectKey,
  buildReproductionObjectKey,
  createS3ObjectStoreClient
} from "../packages/storage/src/index.js";
import { buildPostgresSslConfig } from "../packages/storage/src/postgres-ssl.js";

const APPLY_CONFIRMATION = "apply-synthetic-openai-reviewer-fixture";

function requiredEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`openai_reviewer_fixture_env_missing:${key}`);
  }
  return value;
}

function shifted(anchor: Date, minutes: number): string {
  return new Date(anchor.getTime() + minutes * 60_000).toISOString();
}

function dayBucket(anchor: Date): string {
  const bucket = new Date(anchor);
  bucket.setUTCHours(0, 0, 0, 0);
  return bucket.toISOString();
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const anchorValue = requiredEnv("OPENAI_REVIEWER_FIXTURE_ANCHOR");
  const anchor = new Date(anchorValue);
  if (Number.isNaN(anchor.getTime())) {
    throw new Error("openai_reviewer_fixture_anchor_invalid");
  }
  if (!apply) {
    process.stdout.write(
      `${JSON.stringify({
        mode: "check",
        version: reviewerFixture.version,
        anchor: anchor.toISOString(),
        identifiers: reviewerFixture.identifiers
      })}\n`
    );
    return;
  }
  if (process.env["OPENAI_REVIEWER_FIXTURE_CONFIRM"] !== APPLY_CONFIRMATION) {
    throw new Error("openai_reviewer_fixture_apply_confirmation_missing");
  }

  const dbSsl = buildPostgresSslConfig(process.env["DB_SSL_MODE"]);
  const pool = new Pool({
    host: process.env["DB_HOST"] ?? "localhost",
    port: Number(process.env["DB_PORT"] ?? "5432"),
    user: process.env["DB_USER"] ?? "debugbundle",
    password: process.env["DB_PASSWORD"] ?? "debugbundle",
    database: process.env["DB_NAME"] ?? "debugbundle",
    max: 1,
    ...(dbSsl === undefined ? {} : { ssl: dbSsl })
  });
  const objectStore = createS3ObjectStoreClient({
    endpoint: process.env["S3_ENDPOINT"] ?? "http://localhost:4566",
    region: process.env["S3_REGION"] ?? "us-east-1",
    bucket: process.env["S3_BUCKET"] ?? "debugbundle-raw-events",
    accessKeyId: requiredEnv("AWS_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnv("AWS_SECRET_ACCESS_KEY"),
    forcePathStyle: process.env["S3_FORCE_PATH_STYLE"] !== "false"
  });
  const ids = reviewerFixture.identifiers;
  const identity = reviewerFixture.identity;
  const incidentAt = shifted(anchor, -30);
  const deploymentAt = shifted(anchor, -45);
  const healthAt = shifted(anchor, -5);
  const analyticsBucket = dayBucket(anchor);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `
        INSERT INTO users (id, email, accepted_terms_at, email_verified_at, created_at, updated_at)
        VALUES ($1, $2, $3, $3, $3, $3)
        ON CONFLICT (id) DO UPDATE
        SET email = EXCLUDED.email, email_verified_at = EXCLUDED.email_verified_at, updated_at = EXCLUDED.updated_at
      `,
      [ids.user_id, identity.email, anchor.toISOString()]
    );
    await client.query(
      `
        INSERT INTO organizations (id, name, slug, plan, created_at, updated_at, suspended_at)
        VALUES ($1, $2, $3, 'team', $4, $4, NULL)
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name, slug = EXCLUDED.slug, plan = 'team', suspended_at = NULL, updated_at = EXCLUDED.updated_at
      `,
      [
        ids.organization_id,
        identity.organization_name,
        identity.organization_slug,
        anchor.toISOString()
      ]
    );
    await client.query(
      `
        INSERT INTO organization_members (id, organization_id, user_id, role, suspended_at, created_at)
        VALUES ($1, $2, $3, 'owner', NULL, $4)
        ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'owner', suspended_at = NULL
      `,
      [ids.membership_id, ids.organization_id, ids.user_id, anchor.toISOString()]
    );
    await client.query(
      `
        INSERT INTO projects (id, organization_id, owner_user_id, name, slug, environment_default, plan, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, 'production', 'team', $6, $6)
        ON CONFLICT (id) DO UPDATE
        SET organization_id = EXCLUDED.organization_id, owner_user_id = EXCLUDED.owner_user_id,
            name = EXCLUDED.name, slug = EXCLUDED.slug, updated_at = EXCLUDED.updated_at
      `,
      [
        ids.project_id,
        ids.organization_id,
        ids.user_id,
        identity.project_name,
        identity.project_slug,
        anchor.toISOString()
      ]
    );
    await client.query(
      `
        INSERT INTO services (id, project_id, name, runtime, framework, environment, created_at, updated_at)
        VALUES ($1, $2, 'checkout-api', 'nodejs', 'fastify', 'production', $3, $3)
        ON CONFLICT (id) DO UPDATE SET runtime = EXCLUDED.runtime, framework = EXCLUDED.framework, updated_at = EXCLUDED.updated_at
      `,
      [ids.service_id, ids.project_id, anchor.toISOString()]
    );
    await client.query(
      `
        INSERT INTO deployments (id, project_id, service_id, environment, source_event_id, commit_sha, version, branch, deployed_at)
        VALUES ($1, $2, $3, 'production', $4, '0123456789abcdef0123456789abcdef01234567', 'review-1.0.0', 'synthetic-review', $5)
        ON CONFLICT (id) DO UPDATE SET deployed_at = EXCLUDED.deployed_at, updated_at = now()
      `,
      [ids.deployment_id, ids.project_id, ids.service_id, ids.deployment_event_id, deploymentAt]
    );
    await client.query(
      `
        INSERT INTO incidents (
          id, project_id, service_id, environment, fingerprint, title, severity, status,
          first_seen_at, last_seen_at, occurrence_count, latest_deployment_id,
          bundle_generation_number, bundle_created_at, bundle_updated_at, bundle_source_event_id,
          bundle_source_occurred_at, bundle_trigger, created_at, updated_at
        )
        VALUES ($1, $2, $3, 'production', $4, $5, $6, 'open', $7, $7, $8, $9, 1, $7, $7, $10, $7, 'automatic', $7, $7)
        ON CONFLICT (id) DO UPDATE
        SET title = EXCLUDED.title, last_seen_at = EXCLUDED.last_seen_at,
            occurrence_count = EXCLUDED.occurrence_count, bundle_updated_at = EXCLUDED.bundle_updated_at,
            updated_at = EXCLUDED.updated_at
      `,
      [
        ids.incident_id,
        ids.project_id,
        ids.service_id,
        reviewerFixture.incident.fingerprint,
        reviewerFixture.incident.title,
        reviewerFixture.incident.severity,
        incidentAt,
        reviewerFixture.incident.occurrence_count,
        ids.deployment_id,
        ids.incident_event_id
      ]
    );
    await client.query(
      `
        INSERT INTO improvement_opportunities (
          id, project_id, service_id, service_name, environment, kind, status, severity,
          confidence, fingerprint, title, summary, occurrence_count, evidence,
          first_detected_at, last_detected_at, last_source_event_id, related_incident_ids,
          bundle_generation_number, bundle_created_at, bundle_updated_at, bundle_source_event_id,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, 'checkout-api', 'production', 'slow_request', 'open', 'medium',
                0.94, $4, $5, $6, 5, $7::jsonb, $8, $8, $9, ARRAY[$10::uuid],
                1, $8, $8, $9, $8, $8)
        ON CONFLICT (id) DO UPDATE
        SET title = EXCLUDED.title, summary = EXCLUDED.summary, last_detected_at = EXCLUDED.last_detected_at,
            bundle_updated_at = EXCLUDED.bundle_updated_at, updated_at = EXCLUDED.updated_at
      `,
      [
        ids.improvement_id,
        ids.project_id,
        ids.service_id,
        reviewerFixture.improvement.fingerprint,
        reviewerFixture.improvement.title,
        reviewerFixture.improvement.summary,
        JSON.stringify({ synthetic: true, request_path: "/checkout" }),
        incidentAt,
        ids.improvement_event_id,
        ids.incident_id
      ]
    );
    await client.query(
      `
        INSERT INTO availability_checks (
          id, project_id, created_by_user_id, name, url, method, interval_seconds,
          environment, service_name, enabled, status, last_checked_at, next_check_at,
          last_result_status, last_result_http_status, last_result_duration_ms, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, 'GET', 60, 'production', 'checkout-api', true,
                'failing', $6, $7, 'http_status_mismatch', 503, 420, $8, $8)
        ON CONFLICT (id) DO UPDATE
        SET url = EXCLUDED.url, status = EXCLUDED.status, last_checked_at = EXCLUDED.last_checked_at,
            next_check_at = EXCLUDED.next_check_at, updated_at = EXCLUDED.updated_at
      `,
      [
        ids.health_check_id,
        ids.project_id,
        ids.user_id,
        reviewerFixture.health.name,
        reviewerFixture.health.url,
        healthAt,
        shifted(anchor, 1),
        anchor.toISOString()
      ]
    );
    await client.query(
      `
        INSERT INTO availability_check_results (
          id, check_id, project_id, started_at, completed_at, duration_ms, status,
          http_status, error_kind, error_message, checked_url_host, checked_url_path, final_url
        )
        VALUES ($1, $2, $3, $4, $5, 420, 'http_status_mismatch', 503,
                'synthetic_upstream', 'Synthetic response only.', $6, '/private/token-1234567890', $7)
        ON CONFLICT (id) DO UPDATE SET started_at = EXCLUDED.started_at, completed_at = EXCLUDED.completed_at
      `,
      [
        ids.health_result_id,
        ids.health_check_id,
        ids.project_id,
        healthAt,
        shifted(anchor, -4),
        reviewerFixture.health.checked_host,
        reviewerFixture.health.final_url
      ]
    );
    await client.query(
      `
        INSERT INTO availability_check_daily_rollups (
          id, check_id, project_id, day, state, total_checks, successful_checks,
          failed_checks, degraded_checks, avg_duration_ms, first_checked_at,
          last_checked_at, downtime_seconds, incident_ids
        )
        VALUES ($1, $2, $3, $4::date, 'down', 10, 2, 8, 0, 420, $5, $6, 2400, ARRAY[$7::uuid])
        ON CONFLICT (check_id, day) DO UPDATE
        SET state = EXCLUDED.state, total_checks = EXCLUDED.total_checks,
            failed_checks = EXCLUDED.failed_checks, last_checked_at = EXCLUDED.last_checked_at,
            incident_ids = EXCLUDED.incident_ids, updated_at = now()
      `,
      [
        ids.health_rollup_id,
        ids.health_check_id,
        ids.project_id,
        anchor.toISOString().slice(0, 10),
        shifted(anchor, -60),
        healthAt,
        ids.incident_id
      ]
    );
    const analytics = reviewerFixture.analytics;
    const analyticsDimensions = JSON.stringify({
      referrer_domain: analytics.referrer_domain,
      utm_source: analytics.utm_source,
      utm_medium: analytics.utm_medium,
      utm_campaign: analytics.utm_campaign
    });
    await client.query(
      `
        INSERT INTO analytics_session_rollups (
          project_id, service, environment, bucket_start, bucket_granularity,
          dimension_hash, dimensions, device_type, browser_family, os_family,
          language, country_code, auth_state, sessions, active_visitors,
          new_visitors, returning_visitors, bounces, exits, total_duration_ms,
          total_pageviews
        )
        VALUES (
          $1, $2, $3, $4, 'day', $5, $6::jsonb, $7, $8, $9, $10, $11, $12,
          $13, $14, $15, $16, $17, $18, 540000, $19
        )
        ON CONFLICT (
          project_id, service, environment, bucket_start, bucket_granularity, dimension_hash
        ) DO UPDATE
        SET dimensions = EXCLUDED.dimensions, device_type = EXCLUDED.device_type,
            browser_family = EXCLUDED.browser_family, os_family = EXCLUDED.os_family,
            language = EXCLUDED.language, country_code = EXCLUDED.country_code,
            auth_state = EXCLUDED.auth_state, sessions = EXCLUDED.sessions,
            active_visitors = EXCLUDED.active_visitors, new_visitors = EXCLUDED.new_visitors,
            returning_visitors = EXCLUDED.returning_visitors, bounces = EXCLUDED.bounces,
            exits = EXCLUDED.exits, total_duration_ms = EXCLUDED.total_duration_ms,
            total_pageviews = EXCLUDED.total_pageviews, updated_at = now()
      `,
      [
        ids.project_id,
        analytics.service,
        analytics.environment,
        analyticsBucket,
        analytics.dimension_hash,
        analyticsDimensions,
        analytics.device_type,
        analytics.browser_family,
        analytics.os_family,
        analytics.language,
        analytics.country_code,
        analytics.auth_state,
        analytics.sessions,
        analytics.active_visitors,
        analytics.new_visitors,
        analytics.returning_visitors,
        analytics.bounces,
        analytics.exits,
        analytics.pageviews
      ]
    );
    await client.query(
      `
        INSERT INTO analytics_route_rollups (
          project_id, service, environment, bucket_start, bucket_granularity,
          route_key, dimension_hash, dimensions, device_type, browser_family,
          os_family, language, country_code, auth_state, pageviews,
          unique_sessions, entrances, exits, bounces, duration_bucket_counts,
          linked_incident_sessions
        )
        VALUES (
          $1, $2, $3, $4, 'day', $5, $6, $7::jsonb, $8, $9, $10, $11, $12,
          $13, $14, $15, $15, $16, $17, '{"under_10s": 2, "10s_to_30s": 6, "30s_to_60s": 4}'::jsonb,
          $18
        )
        ON CONFLICT (
          project_id, service, environment, bucket_start, bucket_granularity,
          route_key, dimension_hash
        ) DO UPDATE
        SET dimensions = EXCLUDED.dimensions, device_type = EXCLUDED.device_type,
            browser_family = EXCLUDED.browser_family, os_family = EXCLUDED.os_family,
            language = EXCLUDED.language, country_code = EXCLUDED.country_code,
            auth_state = EXCLUDED.auth_state, pageviews = EXCLUDED.pageviews,
            unique_sessions = EXCLUDED.unique_sessions, entrances = EXCLUDED.entrances,
            exits = EXCLUDED.exits, bounces = EXCLUDED.bounces,
            duration_bucket_counts = EXCLUDED.duration_bucket_counts,
            linked_incident_sessions = EXCLUDED.linked_incident_sessions,
            updated_at = now()
      `,
      [
        ids.project_id,
        analytics.service,
        analytics.environment,
        analyticsBucket,
        analytics.route,
        analytics.dimension_hash,
        analyticsDimensions,
        analytics.device_type,
        analytics.browser_family,
        analytics.os_family,
        analytics.language,
        analytics.country_code,
        analytics.auth_state,
        analytics.pageviews,
        analytics.sessions,
        analytics.exits,
        analytics.bounces,
        analytics.affected_subject_hashes.length
      ]
    );
    await client.query(
      `
        INSERT INTO analytics_transition_rollups (
          project_id, service, environment, bucket_start, bucket_granularity,
          from_route_key, to_route_key, dimension_hash, dimensions, device_type,
          browser_family, os_family, language, country_code, auth_state,
          transition_count, unique_sessions
        )
        VALUES (
          $1, $2, $3, $4, 'day', $5, $6, $7, $8::jsonb, $9, $10, $11, $12,
          $13, $14, $15, $16
        )
        ON CONFLICT (
          project_id, service, environment, bucket_start, bucket_granularity,
          from_route_key, to_route_key, dimension_hash
        ) DO UPDATE
        SET dimensions = EXCLUDED.dimensions, device_type = EXCLUDED.device_type,
            browser_family = EXCLUDED.browser_family, os_family = EXCLUDED.os_family,
            language = EXCLUDED.language, country_code = EXCLUDED.country_code,
            auth_state = EXCLUDED.auth_state, transition_count = EXCLUDED.transition_count,
            unique_sessions = EXCLUDED.unique_sessions, updated_at = now()
      `,
      [
        ids.project_id,
        analytics.service,
        analytics.environment,
        analyticsBucket,
        analytics.route,
        analytics.next_route,
        analytics.dimension_hash,
        analyticsDimensions,
        analytics.device_type,
        analytics.browser_family,
        analytics.os_family,
        analytics.language,
        analytics.country_code,
        analytics.auth_state,
        analytics.transition_count,
        analytics.transition_count
      ]
    );
    await client.query(
      `
        INSERT INTO analytics_action_rollups (
          project_id, service, environment, bucket_start, bucket_granularity,
          action_key, route_key, dimension_hash, dimensions, device_type,
          browser_family, os_family, language, country_code, auth_state,
          event_count, unique_sessions
        )
        VALUES (
          $1, $2, $3, $4, 'day', 'conversion:purchase', $5, $6, $7::jsonb,
          $8, $9, $10, $11, $12, $13, $14, $14
        )
        ON CONFLICT (
          project_id, service, environment, bucket_start, bucket_granularity,
          action_key, route_key, dimension_hash
        ) DO UPDATE
        SET dimensions = EXCLUDED.dimensions, device_type = EXCLUDED.device_type,
            browser_family = EXCLUDED.browser_family, os_family = EXCLUDED.os_family,
            language = EXCLUDED.language, country_code = EXCLUDED.country_code,
            auth_state = EXCLUDED.auth_state, event_count = EXCLUDED.event_count,
            unique_sessions = EXCLUDED.unique_sessions, updated_at = now()
      `,
      [
        ids.project_id,
        analytics.service,
        analytics.environment,
        analyticsBucket,
        analytics.route,
        analytics.dimension_hash,
        analyticsDimensions,
        analytics.device_type,
        analytics.browser_family,
        analytics.os_family,
        analytics.language,
        analytics.country_code,
        analytics.auth_state,
        analytics.conversions
      ]
    );
    await client.query(
      `
        INSERT INTO analytics_funnel_definitions (
          project_id, funnel_key, display_name, steps, created_by_user_id,
          created_at, updated_at, archived_at
        )
        VALUES ($1, $2, $3, $4::jsonb, $5, $6, $6, NULL)
        ON CONFLICT (project_id, funnel_key) DO UPDATE
        SET display_name = EXCLUDED.display_name, steps = EXCLUDED.steps,
            archived_at = NULL, updated_at = EXCLUDED.updated_at
      `,
      [
        ids.project_id,
        analytics.funnel_key,
        analytics.funnel_display_name,
        JSON.stringify(analytics.funnel_steps),
        ids.user_id,
        anchor.toISOString()
      ]
    );
    await client.query(
      `
        INSERT INTO analytics_funnel_rollups (
          project_id, service, environment, bucket_start, bucket_granularity,
          funnel_key, step_key, step_order, dimension_hash, dimensions,
          device_type, browser_family, os_family, language, country_code,
          auth_state, sessions_entered, sessions_completed, dropoffs,
          duration_bucket_counts
        )
        VALUES
          ($1, $2, $3, $4, 'day', $5, 'checkout_view', 0, $6, $7::jsonb,
           $8, $9, $10, $11, $12, $13, $14, $15, $16, '{}'::jsonb),
          ($1, $2, $3, $4, 'day', $5, 'purchase_complete', 1, $6, $7::jsonb,
           $8, $9, $10, $11, $12, $13, $15, $15, 0, '{}'::jsonb)
        ON CONFLICT (
          project_id, service, environment, bucket_start, bucket_granularity,
          funnel_key, step_key, dimension_hash
        ) DO UPDATE
        SET dimensions = EXCLUDED.dimensions, device_type = EXCLUDED.device_type,
            browser_family = EXCLUDED.browser_family, os_family = EXCLUDED.os_family,
            language = EXCLUDED.language, country_code = EXCLUDED.country_code,
            auth_state = EXCLUDED.auth_state, sessions_entered = EXCLUDED.sessions_entered,
            sessions_completed = EXCLUDED.sessions_completed, dropoffs = EXCLUDED.dropoffs,
            duration_bucket_counts = EXCLUDED.duration_bucket_counts, updated_at = now()
      `,
      [
        ids.project_id,
        analytics.service,
        analytics.environment,
        analyticsBucket,
        analytics.funnel_key,
        analytics.dimension_hash,
        analyticsDimensions,
        analytics.device_type,
        analytics.browser_family,
        analytics.os_family,
        analytics.language,
        analytics.country_code,
        analytics.auth_state,
        analytics.sessions,
        analytics.conversions,
        analytics.sessions - analytics.conversions
      ]
    );
    await client.query(
      `
        INSERT INTO analytics_incident_session_links (
          project_id, incident_id, service, environment, bucket_start,
          bucket_granularity, route_key, dimension_hash, subject_hash
        )
        SELECT $1, $2, $3, $4, $5, 'day', $6, $7, subject_hash
        FROM unnest($8::text[]) AS subject_hash
        ON CONFLICT DO NOTHING
      `,
      [
        ids.project_id,
        ids.incident_id,
        analytics.service,
        analytics.environment,
        analyticsBucket,
        analytics.route,
        analytics.dimension_hash,
        analytics.affected_subject_hashes
      ]
    );
    await client.query(
      `
        INSERT INTO analytics_rollup_uniques (
          project_id, rollup_kind, service, environment, bucket_start,
          bucket_granularity, rollup_key, dimension_hash, subject_hash
        )
        SELECT $1, kind, $2, $3, $4, 'day', rollup_key, $5, subject_hash
        FROM unnest($6::text[]) AS subject_hash
        CROSS JOIN (
          VALUES
            ('funnel_step_session', $7::text || '|checkout_view'),
            ('transition_session', $8::text || '|' || $9::text)
        ) AS aggregate(kind, rollup_key)
        ON CONFLICT DO NOTHING
      `,
      [
        ids.project_id,
        analytics.service,
        analytics.environment,
        analyticsBucket,
        analytics.dimension_hash,
        analytics.affected_subject_hashes,
        analytics.funnel_key,
        analytics.route,
        analytics.next_route
      ]
    );
    const artifacts = reviewerFixture.artifacts;
    await Promise.all([
      objectStore.putObject({
        key: buildBundleObjectKey(ids.project_id, ids.incident_id),
        body: gzipSync(JSON.stringify(artifacts.bundle)),
        contentType: "application/json",
        contentEncoding: "gzip"
      }),
      objectStore.putObject({
        key: buildReproductionObjectKey(ids.project_id, ids.incident_id),
        body: gzipSync(JSON.stringify(artifacts.reproduction)),
        contentType: "application/json",
        contentEncoding: "gzip"
      }),
      objectStore.putObject({
        key: buildImprovementBundleObjectKey(ids.project_id, ids.improvement_id),
        body: gzipSync(JSON.stringify(artifacts.improvement_bundle)),
        contentType: "application/json",
        contentEncoding: "gzip"
      })
    ]);
    // Keep relational rows invisible until every deterministic object exists. A failed
    // object write rolls back Postgres; any partial object writes are safe to overwrite
    // on the next run because the synthetic keys and payloads are deterministic.
    await client.query("COMMIT");
    process.stdout.write(
      `${JSON.stringify({ mode: "applied", version: reviewerFixture.version, anchor: anchor.toISOString() })}\n`
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

await main();
