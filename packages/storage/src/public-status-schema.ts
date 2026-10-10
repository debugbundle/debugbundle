import { defineStorageSchemaMigration } from "./schema-migration-definition.js";
const statements = [
  `CREATE TABLE IF NOT EXISTS public_status_pages (
    id uuid PRIMARY KEY, anchor_project_id uuid NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
    owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    public_id text NOT NULL UNIQUE CHECK (public_id ~ '^[a-f0-9]{24}$'),
    title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120), enabled boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS public_status_page_projects (
    page_id uuid NOT NULL REFERENCES public_status_pages(id) ON DELETE CASCADE,
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    position integer NOT NULL CHECK (position BETWEEN 0 AND 49), PRIMARY KEY(page_id, project_id)
  )`,
  `CREATE TABLE IF NOT EXISTS public_status_page_checks (
    page_id uuid NOT NULL, project_id uuid NOT NULL, check_id uuid NOT NULL REFERENCES availability_checks(id) ON DELETE CASCADE,
    PRIMARY KEY(page_id, check_id), FOREIGN KEY(page_id, project_id) REFERENCES public_status_page_projects(page_id, project_id) ON DELETE CASCADE
  )`,
  "CREATE INDEX IF NOT EXISTS public_status_page_projects_project_idx ON public_status_page_projects(project_id)",
  "CREATE INDEX IF NOT EXISTS public_status_page_checks_check_idx ON public_status_page_checks(check_id)"
] as const;
export const PUBLIC_STATUS_BOOTSTRAP_STATEMENTS = statements.map((s) =>
  s.replaceAll(" IF NOT EXISTS", "")
);
export const PUBLIC_STATUS_SCHEMA_MIGRATIONS = [
  defineStorageSchemaMigration({
    id: "202610080001_add_public_status_pages",
    description: "Add opt-in, explicitly selected public availability pages.",
    statements
  })
];
