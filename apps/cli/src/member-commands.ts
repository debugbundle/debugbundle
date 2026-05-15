import { createCliHttpClient, runAuthenticatedCliCommand } from "./auth-context.js";
import { readCliAuthState } from "./auth-state.js";
import type { CliAuthState } from "./auth-state.js";
import type { CliCommandResult } from "./token-commands.js";

type MemberHttpRequest = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  bearerToken: string;
  body?: unknown;
};

type MemberHttpResponse = {
  status: number;
  body: unknown;
};

export class MemberApiError extends Error {
  public readonly status: number;
  public readonly code: string;

  public constructor(status: number, code: string) {
    super(`member_api_error: ${status}:${code}`);
    this.name = "MemberApiError";
    this.status = status;
    this.code = code;
  }
}

function toApiError(status: number, body: unknown): MemberApiError {
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") {
    return new MemberApiError(status, body.error);
  }

  return new MemberApiError(status, "unknown_error");
}

interface MemberLike {
  user_id: string;
  email: string;
  role: string;
  membership_type?: string;
  created_at: string;
}

interface InviteLike {
  invite_id: string;
  email: string;
  role: string;
  expires_at: string;
}

export function createMemberApi(httpClient: {
  request(request: MemberHttpRequest): Promise<MemberHttpResponse>;
}): {
  listMembers(input: { bearerToken: string; projectId: string }): Promise<{ members: MemberLike[] }>;
  listInvites(input: { bearerToken: string; projectId: string }): Promise<{ invites: InviteLike[] }>;
  inviteMember(input: { bearerToken: string; projectId: string; email: string; role: string }): Promise<{ invite: InviteLike }>;
  cancelInvite(input: { bearerToken: string; projectId: string; inviteId: string }): Promise<{ invite: InviteLike }>;
  updateMemberRole(input: { bearerToken: string; projectId: string; userId: string; role: string }): Promise<{ member: MemberLike }>;
  removeMember(input: { bearerToken: string; projectId: string; userId: string }): Promise<{ member: MemberLike }>;
} {
  return {
    async listMembers(input) {
      const response = await httpClient.request({
        method: "GET",
        path: `/v1/projects/${input.projectId}/members`,
        bearerToken: input.bearerToken
      });

      if (response.status !== 200) {
        throw toApiError(response.status, response.body);
      }

      return response.body as { members: MemberLike[] };
    },

    async listInvites(input) {
      const response = await httpClient.request({
        method: "GET",
        path: `/v1/projects/${input.projectId}/invites`,
        bearerToken: input.bearerToken
      });

      if (response.status !== 200) {
        throw toApiError(response.status, response.body);
      }

      return response.body as { invites: InviteLike[] };
    },

    async inviteMember(input) {
      const response = await httpClient.request({
        method: "POST",
        path: `/v1/projects/${input.projectId}/invite`,
        bearerToken: input.bearerToken,
        body: { email: input.email, role: input.role }
      });

      if (response.status !== 201) {
        throw toApiError(response.status, response.body);
      }

      return response.body as { invite: InviteLike };
    },

    async cancelInvite(input) {
      const response = await httpClient.request({
        method: "DELETE",
        path: `/v1/projects/${input.projectId}/invites/${input.inviteId}`,
        bearerToken: input.bearerToken
      });

      if (response.status !== 200) {
        throw toApiError(response.status, response.body);
      }

      return response.body as { invite: InviteLike };
    },

    async updateMemberRole(input) {
      const response = await httpClient.request({
        method: "PATCH",
        path: `/v1/projects/${input.projectId}/members/${input.userId}`,
        bearerToken: input.bearerToken,
        body: { role: input.role }
      });

      if (response.status !== 200) {
        throw toApiError(response.status, response.body);
      }

      return response.body as { member: MemberLike };
    },

    async removeMember(input) {
      const response = await httpClient.request({
        method: "DELETE",
        path: `/v1/projects/${input.projectId}/members/${input.userId}`,
        bearerToken: input.bearerToken
      });

      if (response.status !== 200) {
        throw toApiError(response.status, response.body);
      }

      return response.body as { member: MemberLike };
    }
  };
}

function formatMembersTable(members: MemberLike[]): string {
  if (members.length === 0) {
    return "No members found.";
  }

  return members.map((m) => `${m.user_id} | ${m.email} | ${m.role} | type=${m.membership_type ?? "collaborator"} | joined=${m.created_at}`).join("\n");
}

function formatInvitesTable(invites: InviteLike[]): string {
  if (invites.length === 0) {
    return "No pending invites.";
  }

  return invites.map((i) => `${i.invite_id} | ${i.email} | ${i.role} | expires=${i.expires_at}`).join("\n");
}

function mapErrorToExitCode(error: unknown): number {
  if (!(error instanceof MemberApiError)) {
    return 1;
  }

  if (error.status === 401) {
    return 2;
  }
  if (error.status === 403) {
    return 3;
  }
  if (error.status === 404) {
    return 3;
  }
  if (error.status === 409) {
    return 5;
  }

  return 1;
}

export async function listMembersCommand(
  input: { bearerToken: string; projectId: string; json?: boolean },
  api: ReturnType<typeof createMemberApi>
): Promise<CliCommandResult> {
  try {
    const result = await api.listMembers({ bearerToken: input.bearerToken, projectId: input.projectId });
    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(result) : formatMembersTable(result.members)
    };
  } catch (error) {
    return {
      exitCode: mapErrorToExitCode(error),
      output: error instanceof MemberApiError ? error.code : String(error)
    };
  }
}

export async function listInvitesCommand(
  input: { bearerToken: string; projectId: string; json?: boolean },
  api: ReturnType<typeof createMemberApi>
): Promise<CliCommandResult> {
  try {
    const result = await api.listInvites({ bearerToken: input.bearerToken, projectId: input.projectId });
    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(result) : formatInvitesTable(result.invites)
    };
  } catch (error) {
    return {
      exitCode: mapErrorToExitCode(error),
      output: error instanceof MemberApiError ? error.code : String(error)
    };
  }
}

export async function inviteMemberCommand(
  input: { bearerToken: string; projectId: string; email: string; role: string; json?: boolean },
  api: ReturnType<typeof createMemberApi>
): Promise<CliCommandResult> {
  try {
    const result = await api.inviteMember({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      email: input.email,
      role: input.role
    });
    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(result) : `Invite sent: ${result.invite.invite_id} → ${result.invite.email} (${result.invite.role})`
    };
  } catch (error) {
    return {
      exitCode: mapErrorToExitCode(error),
      output: error instanceof MemberApiError ? error.code : String(error)
    };
  }
}

export async function cancelInviteCommand(
  input: { bearerToken: string; projectId: string; inviteId: string; json?: boolean },
  api: ReturnType<typeof createMemberApi>
): Promise<CliCommandResult> {
  try {
    const result = await api.cancelInvite({ bearerToken: input.bearerToken, projectId: input.projectId, inviteId: input.inviteId });
    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(result) : `Invite cancelled: ${result.invite.invite_id}`
    };
  } catch (error) {
    return {
      exitCode: mapErrorToExitCode(error),
      output: error instanceof MemberApiError ? error.code : String(error)
    };
  }
}

export async function updateMemberRoleCommand(
  input: { bearerToken: string; projectId: string; userId: string; role: string; json?: boolean },
  api: ReturnType<typeof createMemberApi>
): Promise<CliCommandResult> {
  try {
    const result = await api.updateMemberRole({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      userId: input.userId,
      role: input.role
    });
    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(result) : `Role updated: ${result.member.user_id} → ${result.member.role}`
    };
  } catch (error) {
    return {
      exitCode: mapErrorToExitCode(error),
      output: error instanceof MemberApiError ? error.code : String(error)
    };
  }
}

export async function removeMemberCommand(
  input: { bearerToken: string; projectId: string; userId: string; json?: boolean },
  api: ReturnType<typeof createMemberApi>
): Promise<CliCommandResult> {
  try {
    const result = await api.removeMember({ bearerToken: input.bearerToken, projectId: input.projectId, userId: input.userId });
    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(result) : `Member removed: ${result.member.user_id}`
    };
  } catch (error) {
    return {
      exitCode: mapErrorToExitCode(error),
      output: error instanceof MemberApiError ? error.code : String(error)
    };
  }
}

async function createAuthenticatedMemberApi(
  input: { authFilePath?: string },
  dependencies?: {
    readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
    createHttpClient?: (input: { baseUrl: string }) => { request(request: MemberHttpRequest): Promise<MemberHttpResponse> };
    createApi?: typeof createMemberApi;
  }
): Promise<{ authState: CliAuthState; api: ReturnType<typeof createMemberApi> }> {
  const readAuth = dependencies?.readAuthState ?? readCliAuthState;
  const authStateInput: { authFilePath?: string } = {};
  if (input.authFilePath !== undefined) {
    authStateInput.authFilePath = input.authFilePath;
  }

  const authState = await readAuth(authStateInput);
  const createHttpClient = dependencies?.createHttpClient ?? ((clientInput: { baseUrl: string }) => createCliHttpClient(clientInput));
  const httpClient = createHttpClient({ baseUrl: authState.base_url });
  const makeApi = dependencies?.createApi ?? createMemberApi;

  return { authState, api: makeApi(httpClient) };
}

export async function listMembersWithAuthCommand(
  input: { projectId: string; json?: boolean; authFilePath?: string },
  dependencies?: Parameters<typeof createAuthenticatedMemberApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedMemberApi,
    dependencies,
    runCommand: (authState, api) =>
      listMembersCommand(
        { bearerToken: authState.bearer_token, projectId: input.projectId, ...(input.json === undefined ? {} : { json: input.json }) },
        api
      )
  });
}

export async function listInvitesWithAuthCommand(
  input: { projectId: string; json?: boolean; authFilePath?: string },
  dependencies?: Parameters<typeof createAuthenticatedMemberApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedMemberApi,
    dependencies,
    runCommand: (authState, api) =>
      listInvitesCommand(
        { bearerToken: authState.bearer_token, projectId: input.projectId, ...(input.json === undefined ? {} : { json: input.json }) },
        api
      )
  });
}

export async function inviteMemberWithAuthCommand(
  input: { projectId: string; email: string; role: string; json?: boolean; authFilePath?: string },
  dependencies?: Parameters<typeof createAuthenticatedMemberApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedMemberApi,
    dependencies,
    runCommand: (authState, api) =>
      inviteMemberCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          email: input.email,
          role: input.role,
          ...(input.json === undefined ? {} : { json: input.json })
        },
        api
      )
  });
}

export async function cancelInviteWithAuthCommand(
  input: { projectId: string; inviteId: string; json?: boolean; authFilePath?: string },
  dependencies?: Parameters<typeof createAuthenticatedMemberApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedMemberApi,
    dependencies,
    runCommand: (authState, api) =>
      cancelInviteCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          inviteId: input.inviteId,
          ...(input.json === undefined ? {} : { json: input.json })
        },
        api
      )
  });
}

export async function updateMemberRoleWithAuthCommand(
  input: { projectId: string; userId: string; role: string; json?: boolean; authFilePath?: string },
  dependencies?: Parameters<typeof createAuthenticatedMemberApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedMemberApi,
    dependencies,
    runCommand: (authState, api) =>
      updateMemberRoleCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          userId: input.userId,
          role: input.role,
          ...(input.json === undefined ? {} : { json: input.json })
        },
        api
      )
  });
}

export async function removeMemberWithAuthCommand(
  input: { projectId: string; userId: string; json?: boolean; authFilePath?: string },
  dependencies?: Parameters<typeof createAuthenticatedMemberApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedMemberApi,
    dependencies,
    runCommand: (authState, api) =>
      removeMemberCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          userId: input.userId,
          ...(input.json === undefined ? {} : { json: input.json })
        },
        api
      )
  });
}
