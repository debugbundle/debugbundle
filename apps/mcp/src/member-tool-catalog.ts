import { z } from "zod";

const projectScopeSchema = z.object({
  bearerToken: z.string(),
  projectId: z.string()
});

export const MEMBER_MCP_TOOL_CATALOG = [
  {
    name: "list_project_members",
    group: "members",
    description: "List members for a project.",
    inputSchema: projectScopeSchema
  },
  {
    name: "list_project_member_invites",
    group: "members",
    description: "List pending invites for a project.",
    inputSchema: projectScopeSchema
  },
  {
    name: "invite_project_member",
    group: "members",
    description: "Invite a collaborator to a project.",
    inputSchema: projectScopeSchema.extend({ email: z.string(), role: z.string() })
  },
  {
    name: "cancel_project_member_invite",
    group: "members",
    description: "Cancel a pending project invite.",
    inputSchema: projectScopeSchema.extend({ inviteId: z.string() })
  },
  {
    name: "update_project_member_role",
    group: "members",
    description: "Update the role of a project collaborator.",
    inputSchema: projectScopeSchema.extend({ userId: z.string(), role: z.string() })
  },
  {
    name: "remove_project_member",
    group: "members",
    description: "Remove a collaborator from a project.",
    inputSchema: projectScopeSchema.extend({ userId: z.string() })
  },
  {
    name: "leave_project",
    group: "members",
    description: "Leave a shared project as the authenticated collaborator.",
    inputSchema: projectScopeSchema
  }
] as const;
