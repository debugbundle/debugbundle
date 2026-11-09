import { PROJECT_CONFIGURATION_GUARD_STATEMENTS } from "./project-configuration-guard-schema.js";

const existingGuard = PROJECT_CONFIGURATION_GUARD_STATEMENTS.find((statement) =>
  statement.startsWith("CREATE FUNCTION guard_project_configuration()")
);
if (existingGuard === undefined) throw new Error("organization_transfer_guard_predecessor_missing");
const scopeMarker = "scope_id:=(row_value->>TG_ARGV[0])::uuid;";
if (!existingGuard.includes(scopeMarker))
  throw new Error("organization_transfer_guard_predecessor_changed");

/** Accepted transfers may change owner references; organisation removal may
 * revoke only the target person's retained grants, automation and invitations.
 * Both contexts are transaction-bound. Ordinary writes keep existing fences. */
export const ORGANIZATION_CONFIGURATION_GUARD_STATEMENT = existingGuard
  .replace(
    "CREATE FUNCTION guard_project_configuration()",
    "CREATE OR REPLACE FUNCTION guard_project_configuration()"
  )
  .replace(
    scopeMarker,
    `${scopeMarker}
      IF TG_OP='UPDATE' AND TG_TABLE_NAME='projects' AND
        (to_jsonb(NEW)-ARRAY['owner_user_id','updated_at'])=(to_jsonb(OLD)-ARRAY['owner_user_id','updated_at']) AND
        EXISTS(SELECT 1 FROM organization_ownership_transfers transfer
          JOIN organization_members om ON om.organization_id=transfer.organization_id
            AND om.user_id=transfer.recipient_user_id AND om.role='owner'
          WHERE transfer.id::text=current_setting('debugbundle.organization_owner_transfer',true)
            AND transfer.accepted_at IS NOT NULL AND transfer.canceled_at IS NULL
            AND transfer.organization_id=(to_jsonb(OLD)->>'organization_id')::uuid
            AND transfer.requested_by_user_id=(to_jsonb(OLD)->>'owner_user_id')::uuid
            AND transfer.recipient_user_id=(to_jsonb(NEW)->>'owner_user_id')::uuid) THEN
        PERFORM debugbundle_assert_project_scope_write(scope_id);
        RETURN NEW;
      END IF;`
  )
  .replace(
    scopeMarker,
    `${scopeMarker}
      IF current_setting('debugbundle.organization_removal_org',true)<>'' AND
        EXISTS(SELECT 1 FROM projects p WHERE p.id=scope_id
          AND p.organization_id=NULLIF(current_setting('debugbundle.organization_removal_org',true),'')::uuid) AND
        NOT EXISTS(SELECT 1 FROM organization_members om
          WHERE om.organization_id=NULLIF(current_setting('debugbundle.organization_removal_org',true),'')::uuid
            AND om.user_id=NULLIF(current_setting('debugbundle.organization_removal_user',true),'')::uuid) AND (
          (TG_OP='DELETE' AND TG_TABLE_NAME='project_members' AND
            (row_value->>'user_id')=current_setting('debugbundle.organization_removal_user',true)) OR
          (TG_OP='DELETE' AND TG_TABLE_NAME IN ('github_dispatch_rules','agent_webhooks','alert_rules') AND
            (row_value->>'created_by_user_id')=current_setting('debugbundle.organization_removal_user',true)) OR
          (TG_OP='UPDATE' AND TG_TABLE_NAME='project_invites' AND
            (to_jsonb(NEW)-ARRAY['canceled_at','updated_at'])=(to_jsonb(OLD)-ARRAY['canceled_at','updated_at']) AND
            (to_jsonb(NEW)->>'canceled_at') IS NOT NULL AND EXISTS(SELECT 1 FROM users u
              WHERE u.id=NULLIF(current_setting('debugbundle.organization_removal_user',true),'')::uuid
                AND (lower(trim(u.email))=lower(trim(row_value->>'email')) OR
                  row_value->>'invited_by_user_id'=u.id::text)))
        ) THEN
        PERFORM debugbundle_assert_project_scope_write(scope_id);
        IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
      END IF;`
  );
