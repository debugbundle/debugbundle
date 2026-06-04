import {
  cancelBillingCapacityReductionWithAuthCommand as defaultCancelBillingCapacityReductionCommand,
  getBillingSummaryWithAuthCommand as defaultGetBillingSummaryCommand,
  increaseBillingCapacityWithAuthCommand as defaultIncreaseBillingCapacityCommand,
  scheduleBillingCapacityReductionWithAuthCommand as defaultScheduleBillingCapacityReductionCommand,
  startBillingTrialWithAuthCommand as defaultStartBillingTrialCommand
} from "./billing-commands.js";
import {
  cancelInviteWithAuthCommand as defaultCancelInviteCommand,
  inviteMemberWithAuthCommand as defaultInviteMemberCommand,
  leaveProjectWithAuthCommand as defaultLeaveProjectCommand,
  listInvitesWithAuthCommand as defaultListInvitesCommand,
  listMembersWithAuthCommand as defaultListMembersCommand,
  removeMemberWithAuthCommand as defaultRemoveMemberCommand,
  updateMemberRoleWithAuthCommand as defaultUpdateMemberRoleCommand
} from "./member-commands.js";
import {
  createProjectWithAuthCommand as defaultCreateProjectCommand,
  deleteProjectWithAuthCommand as defaultDeleteProjectCommand,
  listProjectsWithAuthCommand as defaultListProjectsCommand,
  updateProjectWithAuthCommand as defaultUpdateProjectCommand
} from "./project-commands.js";
import {
  appendCommonAuthOptions,
  CliInputError,
  ensureNoExtraPositionals,
  expectNoUnknownOptions,
  readIntegerOption,
  readLimitOption,
  readStringListOption,
  readStringOption,
  requirePositional,
  type ParsedArgv
} from "./argv-helpers.js";
import type { ManagementCommandDependencies, CliCommandResult } from "./management-command-dependencies.js";
import {
  createMemberTokenWithAuthCommand as defaultCreateMemberTokenCommand,
  createProjectTokenWithAuthCommand as defaultCreateProjectTokenCommand,
  listMemberTokensWithAuthCommand as defaultListMemberTokensCommand,
  listProjectTokensWithAuthCommand as defaultListProjectTokensCommand,
  revokeMemberTokenWithAuthCommand as defaultRevokeMemberTokenCommand,
  revokeProjectTokenWithAuthCommand as defaultRevokeProjectTokenCommand
} from "./token-commands.js";

export async function handleBillingCommand(parsedArgv: ParsedArgv, dependencies: ManagementCommandDependencies): Promise<CliCommandResult> {
  const action = requirePositional(parsedArgv, 1, "action");

  if (action === "get") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json"]);
    ensureNoExtraPositionals(parsedArgv, 2);

    return await (dependencies.getBillingSummaryCommand ?? defaultGetBillingSummaryCommand)(appendCommonAuthOptions(parsedArgv, {}));
  }

  if (action === "trial") {
    const trialAction = requirePositional(parsedArgv, 2, "trial-action");
    if (trialAction !== "start") {
      throw new CliInputError("Unknown billing trial command.");
    }

    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "plan"]);
    ensureNoExtraPositionals(parsedArgv, 3);

    const targetPlan = readStringOption(parsedArgv, "plan");
    if (targetPlan !== "solo" && targetPlan !== "team") {
      throw new CliInputError("Missing required option --plan.");
    }

    return await (dependencies.startBillingTrialCommand ?? defaultStartBillingTrialCommand)(
      appendCommonAuthOptions(parsedArgv, {
        targetPlan
      })
    );
  }

  if (action !== "capacity") {
    throw new CliInputError("Unknown billing command.");
  }

  const capacityAction = requirePositional(parsedArgv, 2, "capacity-action");

  if (capacityAction === "increase") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "target-additional-capacity-units"]);
    ensureNoExtraPositionals(parsedArgv, 3);

    const targetAdditionalCapacityUnits = readIntegerOption(parsedArgv, "target-additional-capacity-units");
    if (targetAdditionalCapacityUnits === undefined) {
      throw new CliInputError("Missing required option --target-additional-capacity-units.");
    }

    return await (dependencies.increaseBillingCapacityCommand ?? defaultIncreaseBillingCapacityCommand)(
      appendCommonAuthOptions(parsedArgv, { targetAdditionalCapacityUnits })
    );
  }

  if (capacityAction === "schedule-reduction") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "target-additional-capacity-units"]);
    ensureNoExtraPositionals(parsedArgv, 3);

    const targetAdditionalCapacityUnits = readIntegerOption(parsedArgv, "target-additional-capacity-units");
    if (targetAdditionalCapacityUnits === undefined) {
      throw new CliInputError("Missing required option --target-additional-capacity-units.");
    }

    return await (dependencies.scheduleBillingCapacityReductionCommand ?? defaultScheduleBillingCapacityReductionCommand)(
      appendCommonAuthOptions(parsedArgv, { targetAdditionalCapacityUnits })
    );
  }

  if (capacityAction === "cancel-reduction") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json"]);
    ensureNoExtraPositionals(parsedArgv, 3);

    return await (dependencies.cancelBillingCapacityReductionCommand ?? defaultCancelBillingCapacityReductionCommand)(
      appendCommonAuthOptions(parsedArgv, {})
    );
  }

  throw new CliInputError("Unknown billing capacity command.");
}

export async function handleProjectCommand(parsedArgv: ParsedArgv, dependencies: ManagementCommandDependencies): Promise<CliCommandResult> {
  const action = requirePositional(parsedArgv, 1, "action");

  if (action === "members") {
    const membersAction = requirePositional(parsedArgv, 2, "members-action");
    const projectId = readStringOption(parsedArgv, "project-id");
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project-id.");
    }

    if (membersAction === "list") {
      expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "project-id"]);
      ensureNoExtraPositionals(parsedArgv, 3);
      return await (dependencies.listMembersCommand ?? defaultListMembersCommand)(
        appendCommonAuthOptions(parsedArgv, { projectId })
      );
    }

    if (membersAction === "invites") {
      expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "project-id"]);
      ensureNoExtraPositionals(parsedArgv, 3);
      return await (dependencies.listInvitesCommand ?? defaultListInvitesCommand)(
        appendCommonAuthOptions(parsedArgv, { projectId })
      );
    }

    if (membersAction === "invite") {
      expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "project-id", "email", "role"]);
      ensureNoExtraPositionals(parsedArgv, 3);
      const email = readStringOption(parsedArgv, "email");
      if (email === undefined) {
        throw new CliInputError("Missing required option --email.");
      }
      const role = readStringOption(parsedArgv, "role");
      if (role === undefined) {
        throw new CliInputError("Missing required option --role.");
      }
      return await (dependencies.inviteMemberCommand ?? defaultInviteMemberCommand)(
        appendCommonAuthOptions(parsedArgv, { projectId, email, role })
      );
    }

    if (membersAction === "cancel-invite") {
      expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "project-id"]);
      ensureNoExtraPositionals(parsedArgv, 4);
      return await (dependencies.cancelInviteCommand ?? defaultCancelInviteCommand)(
        appendCommonAuthOptions(parsedArgv, {
          projectId,
          inviteId: requirePositional(parsedArgv, 3, "invite-id")
        })
      );
    }

    if (membersAction === "update-role") {
      expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "project-id", "role"]);
      ensureNoExtraPositionals(parsedArgv, 4);
      const role = readStringOption(parsedArgv, "role");
      if (role === undefined) {
        throw new CliInputError("Missing required option --role.");
      }
      return await (dependencies.updateMemberRoleCommand ?? defaultUpdateMemberRoleCommand)(
        appendCommonAuthOptions(parsedArgv, {
          projectId,
          userId: requirePositional(parsedArgv, 3, "user-id"),
          role
        })
      );
    }

    if (membersAction === "remove") {
      expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "project-id"]);
      ensureNoExtraPositionals(parsedArgv, 4);
      return await (dependencies.removeMemberCommand ?? defaultRemoveMemberCommand)(
        appendCommonAuthOptions(parsedArgv, {
          projectId,
          userId: requirePositional(parsedArgv, 3, "user-id")
        })
      );
    }

    if (membersAction === "leave") {
      expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "project-id"]);
      ensureNoExtraPositionals(parsedArgv, 3);
      return await (dependencies.leaveProjectCommand ?? defaultLeaveProjectCommand)(
        appendCommonAuthOptions(parsedArgv, {
          projectId
        })
      );
    }

    throw new CliInputError("Unknown project members command.");
  }

  if (action === "list") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "limit"]);
    ensureNoExtraPositionals(parsedArgv, 2);

    const input = appendCommonAuthOptions(parsedArgv, {} as {
      limit?: number;
      authFilePath?: string;
      json?: boolean;
    });
    const limit = readLimitOption(parsedArgv);
    if (limit !== undefined) {
      input.limit = limit;
    }

    return await (dependencies.listProjectsCommand ?? defaultListProjectsCommand)(input);
  }

  if (action === "create") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "name", "slug", "environment-default"]);
    ensureNoExtraPositionals(parsedArgv, 2);

    const name = readStringOption(parsedArgv, "name");
    if (name === undefined) {
      throw new CliInputError("Missing required option --name.");
    }
    const slug = readStringOption(parsedArgv, "slug");
    if (slug === undefined) {
      throw new CliInputError("Missing required option --slug.");
    }

    const input = appendCommonAuthOptions(parsedArgv, { name, slug } as {
      name: string;
      slug: string;
      environmentDefault?: string;
      authFilePath?: string;
      json?: boolean;
    });
    const environmentDefault = readStringOption(parsedArgv, "environment-default");
    if (environmentDefault !== undefined) {
      input.environmentDefault = environmentDefault;
    }

    return await (dependencies.createProjectCommand ?? defaultCreateProjectCommand)(input);
  }

  if (action === "update") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "name", "slug", "environment-default"]);
    ensureNoExtraPositionals(parsedArgv, 3);

    const input = appendCommonAuthOptions(parsedArgv, {
      projectId: requirePositional(parsedArgv, 2, "project-id")
    } as {
      projectId: string;
      name?: string;
      slug?: string;
      environmentDefault?: string;
      authFilePath?: string;
      json?: boolean;
    });
    const name = readStringOption(parsedArgv, "name");
    if (name !== undefined) {
      input.name = name;
    }
    const slug = readStringOption(parsedArgv, "slug");
    if (slug !== undefined) {
      input.slug = slug;
    }
    const environmentDefault = readStringOption(parsedArgv, "environment-default");
    if (environmentDefault !== undefined) {
      input.environmentDefault = environmentDefault;
    }

    if (input.name === undefined && input.slug === undefined && input.environmentDefault === undefined) {
      throw new CliInputError("At least one project field must be provided.");
    }

    return await (dependencies.updateProjectCommand ?? defaultUpdateProjectCommand)(input);
  }

  if (action === "delete") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json"]);
    ensureNoExtraPositionals(parsedArgv, 3);

    return await (dependencies.deleteProjectCommand ?? defaultDeleteProjectCommand)(
      appendCommonAuthOptions(parsedArgv, {
        projectId: requirePositional(parsedArgv, 2, "project-id")
      })
    );
  }

  throw new CliInputError("Unknown project command.");
}

export async function handleTokenCommand(parsedArgv: ParsedArgv, dependencies: ManagementCommandDependencies): Promise<CliCommandResult> {
  const scope = requirePositional(parsedArgv, 1, "scope");
  const action = requirePositional(parsedArgv, 2, "action");

  if (scope === "project") {
    if (action === "list") {
      expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "limit"]);
      ensureNoExtraPositionals(parsedArgv, 4);

      const input = appendCommonAuthOptions(parsedArgv, {
        projectId: requirePositional(parsedArgv, 3, "project-id")
      } as {
        projectId: string;
        limit?: number;
        authFilePath?: string;
        json?: boolean;
      });
      const limit = readLimitOption(parsedArgv);
      if (limit !== undefined) {
        input.limit = limit;
      }

      return await (dependencies.listProjectTokensCommand ?? defaultListProjectTokensCommand)(input);
    }

    if (action === "create") {
      expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "label", "allowed-origin"]);
      ensureNoExtraPositionals(parsedArgv, 4);

      const label = readStringOption(parsedArgv, "label");
      if (label === undefined) {
        throw new CliInputError("Missing required option --label.");
      }
      const allowedOrigins = readStringListOption(parsedArgv, "allowed-origin");

      return await (dependencies.createProjectTokenCommand ?? defaultCreateProjectTokenCommand)(
        appendCommonAuthOptions(parsedArgv, {
          projectId: requirePositional(parsedArgv, 3, "project-id"),
          label,
          ...(allowedOrigins === undefined ? {} : { allowedOrigins })
        })
      );
    }

    if (action === "revoke") {
      expectNoUnknownOptions(parsedArgv, ["auth-file", "json"]);
      ensureNoExtraPositionals(parsedArgv, 5);

      return await (dependencies.revokeProjectTokenCommand ?? defaultRevokeProjectTokenCommand)(
        appendCommonAuthOptions(parsedArgv, {
          projectId: requirePositional(parsedArgv, 3, "project-id"),
          tokenId: requirePositional(parsedArgv, 4, "token-id")
        })
      );
    }
  }

  if (scope === "member") {
    if (action === "list") {
      expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "limit"]);
      ensureNoExtraPositionals(parsedArgv, 3);

      const input = appendCommonAuthOptions(parsedArgv, {} as {
        limit?: number;
        authFilePath?: string;
        json?: boolean;
      });
      const limit = readLimitOption(parsedArgv);
      if (limit !== undefined) {
        input.limit = limit;
      }

      return await (dependencies.listMemberTokensCommand ?? defaultListMemberTokensCommand)(input);
    }

    if (action === "create") {
      expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "label"]);
      ensureNoExtraPositionals(parsedArgv, 3);

      const label = readStringOption(parsedArgv, "label");
      if (label === undefined) {
        throw new CliInputError("Missing required option --label.");
      }

      return await (dependencies.createMemberTokenCommand ?? defaultCreateMemberTokenCommand)(
        appendCommonAuthOptions(parsedArgv, { label })
      );
    }

    if (action === "revoke") {
      expectNoUnknownOptions(parsedArgv, ["auth-file", "json"]);
      ensureNoExtraPositionals(parsedArgv, 4);

      return await (dependencies.revokeMemberTokenCommand ?? defaultRevokeMemberTokenCommand)(
        appendCommonAuthOptions(parsedArgv, {
          tokenId: requirePositional(parsedArgv, 3, "token-id")
        })
      );
    }
  }

  throw new CliInputError("Unknown token command.");
}
