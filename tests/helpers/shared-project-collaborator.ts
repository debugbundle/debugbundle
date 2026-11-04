import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { seedOwnedProject } from "./integration-setup.js";

/** An invited collaborator keeps their own account; project access does not add
 * organization membership to the owner's account (FR-AUTH-09). */
export async function seedExternalProjectCollaborator(
  pool: Pool,
  projectIds: string[]
): Promise<string> {
  const userId = randomUUID(),
    organizationId = randomUUID();
  await seedOwnedProject({
    pool,
    organizationId,
    projectId: randomUUID(),
    organizationName: "Collaborator",
    organizationSlug: organizationId,
    projectName: "Personal",
    projectSlug: "personal",
    ownerUserId: userId,
    organizationPlan: "free"
  });
  for (const project of projectIds)
    await pool.query(
      "INSERT INTO project_members(id,project_id,user_id,role) VALUES($1,$2,$3,'admin')",
      [randomUUID(), project, userId]
    );
  return userId;
}
