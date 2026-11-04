export const PROJECT_WEEKLY_REPORT_BOOTSTRAP = [
  `CREATE TABLE weekly_report_channel_aliases (
    legacy_channel_id uuid PRIMARY KEY REFERENCES weekly_report_channels(id) ON DELETE CASCADE,
    canonical_channel_id uuid NOT NULL REFERENCES weekly_report_channels(id) ON DELETE CASCADE,
    operation_id uuid NOT NULL REFERENCES project_merge_operations(id) ON DELETE RESTRICT,
    CHECK(legacy_channel_id<>canonical_channel_id)
  )`,
  "CREATE INDEX weekly_report_channel_aliases_canonical_idx ON weekly_report_channel_aliases(canonical_channel_id)",
  `CREATE FUNCTION debugbundle_canonical_weekly_channel(channel_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
      SELECT COALESCE((SELECT canonical_channel_id FROM weekly_report_channel_aliases WHERE legacy_channel_id=$1),$1)
    $$`,
  `CREATE FUNCTION guard_weekly_report_channel_alias() RETURNS trigger
    LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
    DECLARE target_id uuid; representative_id uuid;
    BEGIN
      SELECT target_project_id INTO target_id FROM project_merge_operations
        WHERE id=NEW.operation_id AND state='applying' AND lease_expires_at>now() FOR UPDATE NOWAIT;
      IF target_id IS NULL THEN RAISE EXCEPTION 'weekly_channel_binding_invalid'; END IF;
      representative_id:=CASE WHEN TG_OP='UPDATE' THEN OLD.canonical_channel_id ELSE NEW.legacy_channel_id END;
      PERFORM 1 FROM weekly_report_channels original_channel JOIN weekly_report_channels representative ON representative.id=representative_id
        JOIN weekly_report_channels target_channel ON target_channel.id=NEW.canonical_channel_id
        JOIN project_merge_participants participant ON participant.project_id=original_channel.project_id AND participant.operation_id=NEW.operation_id
        WHERE original_channel.id=NEW.legacy_channel_id AND target_channel.project_id=target_id
          AND (representative.channel,representative.config,representative.schedule_day_of_week,representative.schedule_hour_of_day,representative.schedule_timezone,representative.is_enabled)
            =(target_channel.channel,target_channel.config,target_channel.schedule_day_of_week,target_channel.schedule_hour_of_day,target_channel.schedule_timezone,target_channel.is_enabled);
      IF NOT FOUND OR NEW.legacy_channel_id=NEW.canonical_channel_id THEN RAISE EXCEPTION 'weekly_channel_binding_invalid'; END IF;
      RETURN NEW;
    END $$`,
  `CREATE TRIGGER weekly_report_channel_alias_guard BEFORE INSERT OR UPDATE ON weekly_report_channel_aliases
    FOR EACH ROW EXECUTE FUNCTION guard_weekly_report_channel_alias()`,
  `CREATE FUNCTION snapshot_weekly_report_scope() RETURNS trigger
    LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
    BEGIN
      IF TG_OP='UPDATE' THEN
        IF NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.scope_origin_ids IS DISTINCT FROM OLD.scope_origin_ids
          THEN RAISE EXCEPTION 'weekly_report_scope_immutable'; END IF;
      ELSE
        PERFORM debugbundle_assert_canonical_project_write(NEW.project_id);
        IF NEW.scope_origin_ids IS NULL THEN NEW.scope_origin_ids:=debugbundle_project_origins(NEW.project_id); END IF;
        IF NEW.scope_origin_ids<>debugbundle_project_origins(NEW.project_id) THEN RAISE EXCEPTION 'weekly_report_scope_invalid'; END IF;
      END IF;
      RETURN NEW;
    END $$`,
  `CREATE TRIGGER weekly_report_delivery_scope_snapshot BEFORE INSERT OR UPDATE OF project_id,scope_origin_ids ON weekly_report_deliveries
    FOR EACH ROW EXECUTE FUNCTION snapshot_weekly_report_scope()`
] as const;

export const PROJECT_WEEKLY_REPORT_MIGRATION = [
  "ALTER TABLE weekly_report_deliveries ADD COLUMN scope_origin_ids uuid[]",
  // Removing a channel cancels its queued jobs but must retain accepted claim IDs/history.
  "ALTER TABLE weekly_report_deliveries DROP CONSTRAINT weekly_report_deliveries_weekly_report_channel_id_fkey",
  "ALTER TABLE weekly_report_deliveries ADD CONSTRAINT weekly_report_deliveries_weekly_report_channel_id_fkey FOREIGN KEY(weekly_report_channel_id) REFERENCES weekly_report_channels(id) ON DELETE SET NULL",
  ...PROJECT_WEEKLY_REPORT_BOOTSTRAP
] as const;
