import {
  CreateProjectTokenBodySchema,
  CreateProjectInviteBodySchema,
  CreateProjectBodySchema,
  CreateTokenBodySchema,
  MemberTokenParamsSchema,
  ProjectInviteParamsSchema,
  ProjectMemberParamsSchema,
  ProjectParamsSchema,
  ProjectsQuerySchema,
  ProjectTokenParamsSchema,
  TokenListQuerySchema,
  UpdateProjectMemberRoleBodySchema,
  UpdateProjectBodySchema,
  anyMemberAuth,
  component,
  type OperationSpec
} from "./openapi-model.js";
import {
  apiError,
  avatarImageResponse,
  memberListResponse,
  inviteListResponse,
  inviteResponse,
  memberResponse,
  projectListResponse,
  projectCreateResponse,
  projectUpdateResponse,
  projectDeleteResponse,
  tokenListResponse,
  tokenResponse
} from "./openapi-components.js";

export function projectsOperations(): OperationSpec[] {
  return [
    {
      method: "get",
      path: "/v1/projects/{id}/members",
      operationId: "listProjectMembers",
      summary: "List project members",
      tags: ["Projects"],
      security: anyMemberAuth,
      params: ProjectParamsSchema,
      responses: {
        "200": { description: "Project members.", schema: memberListResponse },
        "400": { description: "Invalid project id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": {
          description: "Shared collaborator access is paused until the owner upgrades again.",
          schema: apiError
        },
        "404": {
          description: "Project was not found or collaboration is unavailable.",
          schema: apiError
        }
      }
    },

    {
      method: "get",
      path: "/v1/projects/{id}/invites",
      operationId: "listProjectInvites",
      summary: "List pending project invites",
      tags: ["Projects"],
      security: anyMemberAuth,
      params: ProjectParamsSchema,
      responses: {
        "200": { description: "Pending project invites.", schema: inviteListResponse },
        "400": { description: "Invalid project id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": {
          description: "Project was not found or collaboration is unavailable.",
          schema: apiError
        }
      }
    },

    {
      method: "get",
      path: "/v1/projects/{id}/members/{userId}/avatar",
      operationId: "getProjectMemberAvatar",
      summary: "Get a cached project member avatar image",
      tags: ["Projects"],
      security: anyMemberAuth,
      params: ProjectMemberParamsSchema,
      responses: {
        "200": { description: "Avatar image bytes.", schema: avatarImageResponse },
        "400": { description: "Invalid member id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Project, member, or avatar was not found.", schema: apiError },
        "503": { description: "Account management is not configured.", schema: apiError }
      }
    },

    {
      method: "post",
      path: "/v1/projects/{id}/invite",
      operationId: "inviteProjectMember",
      summary: "Invite a project member",
      tags: ["Projects"],
      security: anyMemberAuth,
      params: ProjectParamsSchema,
      requestBody: component("CreateProjectInviteBody", CreateProjectInviteBodySchema),
      responses: {
        "201": { description: "Invite created.", schema: inviteResponse },
        "400": { description: "Invalid project id or request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": {
          description: "Admin or owner access and verified email are required.",
          schema: apiError
        },
        "404": {
          description: "Project was not found or collaboration is unavailable.",
          schema: apiError
        },
        "409": {
          description: "Member or invite already exists, or collaborator limits were reached.",
          schema: apiError
        },
        "500": { description: "Unexpected invite creation failure.", schema: apiError }
      }
    },

    {
      method: "delete",
      path: "/v1/projects/{id}/invites/{inviteId}",
      operationId: "cancelProjectInvite",
      summary: "Cancel a project invite",
      tags: ["Projects"],
      security: anyMemberAuth,
      params: ProjectInviteParamsSchema,
      responses: {
        "200": { description: "Invite cancelled.", schema: inviteResponse },
        "400": { description: "Invalid request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": {
          description: "Admin or owner access and verified email are required.",
          schema: apiError
        },
        "404": { description: "Invite was not found.", schema: apiError }
      }
    },

    {
      method: "patch",
      path: "/v1/projects/{id}/members/{userId}",
      operationId: "updateProjectMemberRole",
      summary: "Update a project member role",
      tags: ["Projects"],
      security: anyMemberAuth,
      params: ProjectMemberParamsSchema,
      requestBody: component("UpdateProjectMemberRoleBody", UpdateProjectMemberRoleBodySchema),
      responses: {
        "200": { description: "Updated project member.", schema: memberResponse },
        "400": { description: "Invalid member id or payload.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Admin or owner access is required.", schema: apiError },
        "404": { description: "Member was not found.", schema: apiError },
        "409": { description: "Owner role cannot be changed.", schema: apiError }
      }
    },

    {
      method: "delete",
      path: "/v1/projects/{id}/members/{userId}",
      operationId: "removeProjectMember",
      summary: "Remove a project member",
      tags: ["Projects"],
      security: anyMemberAuth,
      params: ProjectMemberParamsSchema,
      responses: {
        "200": { description: "Removed project member.", schema: memberResponse },
        "400": { description: "Invalid member id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Admin or owner access is required.", schema: apiError },
        "404": { description: "Member was not found.", schema: apiError },
        "409": { description: "Owner cannot be removed.", schema: apiError }
      }
    },

    {
      method: "delete",
      path: "/v1/projects/{id}/membership",
      operationId: "leaveProject",
      summary: "Leave a shared project",
      tags: ["Projects"],
      security: anyMemberAuth,
      params: ProjectParamsSchema,
      responses: {
        "200": { description: "Left project membership.", schema: memberResponse },
        "400": { description: "Invalid project id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Project membership was not found.", schema: apiError },
        "409": { description: "Owners cannot leave their own project.", schema: apiError }
      }
    },

    {
      method: "get",
      path: "/v1/projects",
      operationId: "listProjects",
      summary: "List projects",
      tags: ["Projects"],
      security: anyMemberAuth,
      query: ProjectsQuerySchema,
      responses: {
        "200": {
          description: "Projects for the caller organization.",
          schema: projectListResponse
        },
        "400": { description: "Invalid query parameters.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Projects are unavailable.", schema: apiError }
      }
    },

    {
      method: "post",
      path: "/v1/projects",
      operationId: "createProject",
      summary: "Create a project",
      tags: ["Projects"],
      security: anyMemberAuth,
      requestBody: component("CreateProjectBody", CreateProjectBodySchema),
      responses: {
        "201": { description: "Project created.", schema: projectCreateResponse },
        "400": { description: "Invalid request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Owner access is required.", schema: apiError },
        "404": { description: "Projects are unavailable.", schema: apiError },
        "409": { description: "Project slug already exists.", schema: apiError }
      }
    },

    {
      method: "patch",
      path: "/v1/projects/{id}",
      operationId: "updateProject",
      summary: "Update a project",
      tags: ["Projects"],
      security: anyMemberAuth,
      params: ProjectParamsSchema,
      requestBody: component("UpdateProjectBody", UpdateProjectBodySchema),
      responses: {
        "200": { description: "Updated project.", schema: projectUpdateResponse },
        "400": { description: "Invalid project id or request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": {
          description:
            "Owner access is required, and paused shared collaborator access cannot mutate the project.",
          schema: apiError
        },
        "404": {
          description: "Project was not found or projects are unavailable.",
          schema: apiError
        },
        "409": { description: "Project slug is already in use.", schema: apiError }
      }
    },

    {
      method: "delete",
      path: "/v1/projects/{id}",
      operationId: "deleteProject",
      summary: "Delete a project",
      tags: ["Projects"],
      security: anyMemberAuth,
      params: ProjectParamsSchema,
      responses: {
        "200": { description: "Deleted project.", schema: projectDeleteResponse },
        "400": { description: "Invalid project id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": {
          description:
            "Owner access is required, and paused shared collaborator access cannot delete the project.",
          schema: apiError
        },
        "404": {
          description: "Project was not found or projects are unavailable.",
          schema: apiError
        }
      }
    },

    {
      method: "get",
      path: "/v1/projects/{id}/tokens",
      operationId: "listProjectTokens",
      summary: "List project tokens",
      tags: ["Tokens"],
      security: anyMemberAuth,
      params: ProjectParamsSchema,
      query: TokenListQuerySchema,
      responses: {
        "200": { description: "Project tokens.", schema: tokenListResponse },
        "400": { description: "Invalid project id or query parameters.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Project was not found.", schema: apiError }
      }
    },

    {
      method: "post",
      path: "/v1/projects/{id}/tokens",
      operationId: "createProjectToken",
      summary: "Create a project token",
      tags: ["Tokens"],
      security: anyMemberAuth,
      params: ProjectParamsSchema,
      requestBody: component("CreateProjectTokenBody", CreateProjectTokenBodySchema),
      responses: {
        "201": { description: "Project token created.", schema: tokenResponse },
        "400": { description: "Invalid project id or request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Owner or admin project access is required.", schema: apiError },
        "404": { description: "Project was not found.", schema: apiError }
      }
    },

    {
      method: "post",
      path: "/v1/projects/{id}/tokens/{tokenId}/revoke",
      operationId: "revokeProjectToken",
      summary: "Revoke a project token",
      tags: ["Tokens"],
      security: anyMemberAuth,
      params: ProjectTokenParamsSchema,
      responses: {
        "200": { description: "Revoked project token.", schema: tokenResponse },
        "400": { description: "Invalid token id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Owner or admin project access is required.", schema: apiError },
        "404": { description: "Token was not found.", schema: apiError }
      }
    },

    {
      method: "get",
      path: "/v1/member/tokens",
      operationId: "listMemberTokens",
      summary: "List member tokens",
      tags: ["Tokens"],
      security: anyMemberAuth,
      query: TokenListQuerySchema,
      responses: {
        "200": { description: "Member tokens.", schema: tokenListResponse },
        "400": { description: "Invalid query parameters.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError }
      }
    },

    {
      method: "post",
      path: "/v1/member/tokens",
      operationId: "createMemberToken",
      summary: "Create a member token",
      tags: ["Tokens"],
      security: anyMemberAuth,
      requestBody: component("CreateTokenBody", CreateTokenBodySchema),
      responses: {
        "201": { description: "Member token created.", schema: tokenResponse },
        "400": { description: "Invalid request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": {
          description: "Verified email is required before creating the first member token.",
          schema: apiError
        }
      }
    },

    {
      method: "post",
      path: "/v1/member/tokens/{tokenId}/revoke",
      operationId: "revokeMemberToken",
      summary: "Revoke a member token",
      tags: ["Tokens"],
      security: anyMemberAuth,
      params: MemberTokenParamsSchema,
      responses: {
        "200": { description: "Revoked member token.", schema: tokenResponse },
        "400": { description: "Invalid token id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Token was not found.", schema: apiError }
      }
    }
  ];
}
