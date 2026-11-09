import {
  OrganizationInviteBodySchema,
  OrganizationMemberUpdateSchema,
  type OrganizationInviteBody,
  type OrganizationMemberUpdate
} from "../../../packages/shared-types/src/index.js";
import {
  createOrganizationApi,
  OrganizationApiError,
  type OrganizationApi,
  type OrganizationHttpClient
} from "../../../packages/organization-client/src/index.js";
import { createCliHttpClient } from "./auth-context.js";
import { readCliAuthState, type CliAuthState } from "./auth-state.js";
import {
  CliInputError,
  ensureNoExtraPositionals,
  expectNoUnknownOptions,
  readBooleanOption,
  readStringListOption,
  readStringOption,
  requirePositional,
  type ParsedArgv
} from "./argv-helpers.js";
import type { CliCommandResult } from "./token-commands.js";

const actions = [
  "list",
  "people",
  "invites",
  "invite",
  "cancel-invite",
  "resend-invite",
  "update-person",
  "remove-person",
  "transfer-status",
  "transfer",
  "cancel-transfer",
  "switch",
  "accept-invite",
  "accept-transfer"
] as const;
type OrganizationAction = (typeof actions)[number];
export interface OrganizationCommandInput {
  action: OrganizationAction;
  organizationId?: string;
  userId?: string;
  inviteId?: string;
  invitation?: OrganizationInviteBody;
  changes?: OrganizationMemberUpdate;
  authFilePath?: string;
  json?: boolean;
}
const humanActions: readonly OrganizationAction[] = [
  "transfer",
  "cancel-transfer",
  "switch",
  "accept-invite",
  "accept-transfer"
];

async function execute(
  api: OrganizationApi,
  bearerToken: string,
  input: OrganizationCommandInput
): Promise<unknown> {
  if (input.action === "list")
    return { organizations: await api.listOrganizations({ bearerToken }) };
  if (input.organizationId === undefined) throw new CliInputError("Missing organisation id.");
  const scope = { bearerToken, organizationId: input.organizationId };
  switch (input.action) {
    case "people":
      return { people: await api.listPeople(scope) };
    case "invites":
      return { invites: await api.listInvites(scope) };
    case "invite":
      if (input.invitation === undefined) throw new CliInputError("Missing invitation.");
      return { invite: await api.invite({ ...scope, invitation: input.invitation }) };
    case "cancel-invite":
      if (input.inviteId === undefined) throw new CliInputError("Missing invitation id.");
      return { canceled: await api.cancelInvite({ ...scope, inviteId: input.inviteId }) };
    case "resend-invite":
      if (input.inviteId === undefined) throw new CliInputError("Missing invitation id.");
      return { invite: await api.resendInvite({ ...scope, inviteId: input.inviteId }) };
    case "update-person":
      if (input.userId === undefined || input.changes === undefined)
        throw new CliInputError("Missing person or changes.");
      await api.updatePerson({ ...scope, userId: input.userId, changes: input.changes });
      return { updated: true };
    case "remove-person":
      if (input.userId === undefined) throw new CliInputError("Missing person id.");
      await api.removePerson({ ...scope, userId: input.userId });
      return { removed: true };
    case "transfer-status":
      return { transfer: await api.getOwnershipTransfer(scope) };
    default:
      throw new OrganizationApiError(403, "interactive_verification_required");
  }
}

export async function organizationWithAuthCommand(
  input: OrganizationCommandInput,
  dependencies: {
    readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
    createHttpClient?: (input: { baseUrl: string }) => OrganizationHttpClient;
  } = {}
): Promise<CliCommandResult> {
  try {
    const auth = await (dependencies.readAuthState ?? readCliAuthState)(
      input.authFilePath === undefined ? {} : { authFilePath: input.authFilePath }
    );
    if (humanActions.includes(input.action))
      return {
        exitCode: 4,
        output: `interactive_verification_required: Open ${auth.base_url.replace(/\/$/, "")}/settings/people in a verified browser session. Accept invitations/transfers from their email links. Bearer token context remains fixed.`
      };
    const api = createOrganizationApi(
      (dependencies.createHttpClient ?? createCliHttpClient)({ baseUrl: auth.base_url })
    );
    const result = await execute(api, auth.bearer_token, input);
    return { exitCode: 0, output: JSON.stringify(result, null, input.json ? undefined : 2) };
  } catch (error) {
    return {
      exitCode: error instanceof OrganizationApiError && error.status === 403 ? 4 : 1,
      output:
        error instanceof OrganizationApiError
          ? error.code
          : error instanceof Error
            ? error.message
            : "organization_command_failed"
    };
  }
}

export async function handleOrganizationCommand(
  parsed: ParsedArgv,
  command: typeof organizationWithAuthCommand = organizationWithAuthCommand
): Promise<CliCommandResult> {
  const action = requirePositional(parsed, 1, "action");
  if (!actions.some((candidate) => candidate === action))
    throw new CliInputError("Unknown organisation action.");
  const selected = action as OrganizationAction;
  const common = ["auth-file", "json"];
  const inviteOptions = ["email", "role", "project-access", "project-role", "projects"];
  expectNoUnknownOptions(parsed, [
    ...common,
    ...(selected === "invite" ? inviteOptions : []),
    ...(selected === "update-person" ? ["changes-json"] : [])
  ]);
  const noOrganization =
    selected === "list" || selected === "accept-invite" || selected === "accept-transfer";
  const hasResource =
    selected === "cancel-invite" ||
    selected === "resend-invite" ||
    selected === "update-person" ||
    selected === "remove-person";
  ensureNoExtraPositionals(parsed, noOrganization ? 2 : hasResource ? 4 : 3);
  const input: OrganizationCommandInput = { action: selected };
  if (!noOrganization) input.organizationId = requirePositional(parsed, 2, "organization-id");
  if (selected === "cancel-invite" || selected === "resend-invite")
    input.inviteId = requirePositional(parsed, 3, "invite-id");
  if (selected === "update-person" || selected === "remove-person")
    input.userId = requirePositional(parsed, 3, "user-id");
  if (selected === "invite") {
    const invitation = OrganizationInviteBodySchema.safeParse({
      email: readStringOption(parsed, "email"),
      role: readStringOption(parsed, "role"),
      project_access: readStringOption(parsed, "project-access"),
      default_project_role: readStringOption(parsed, "project-role"),
      project_ids: (readStringListOption(parsed, "projects") ?? [])
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter(Boolean)
    });
    if (!invitation.success)
      throw new CliInputError(
        "Invalid invitation. Provide --email and valid role/project access options."
      );
    input.invitation = invitation.data;
  }
  if (selected === "update-person") {
    const raw = readStringOption(parsed, "changes-json");
    try {
      input.changes = OrganizationMemberUpdateSchema.parse(JSON.parse(raw ?? "null"));
    } catch {
      throw new CliInputError("Provide a valid --changes-json object.");
    }
  }
  const authFile = readStringOption(parsed, "auth-file");
  if (authFile !== undefined) input.authFilePath = authFile;
  const json = readBooleanOption(parsed, "json");
  if (json !== undefined) input.json = json;
  return command(input);
}
