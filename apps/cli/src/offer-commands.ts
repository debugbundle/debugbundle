import { readFile, stat } from "node:fs/promises";
import { z } from "zod";
import {
  createOfferApi,
  OfferApiError,
  OFFER_OPERATIONS,
  type OfferOperation,
  type OfferHttpClient
} from "../../../packages/referral-client/src/offer-api.js";
import { readCliAuthState, type CliAuthState } from "./auth-state.js";
import { createCliHttpClient } from "./auth-context.js";
import {
  CliInputError,
  ensureNoExtraPositionals,
  expectNoUnknownOptions,
  readBooleanOption,
  readIntegerOption,
  readStringOption,
  requirePositional,
  type ParsedArgv
} from "./argv-helpers.js";
import type { CliCommandResult } from "./token-commands.js";

export async function offersWithAuthCommand(
  input: {
    action: OfferOperation;
    payload: unknown;
    operatorProofFile?: string;
    authFilePath?: string;
  },
  dependencies: {
    readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
    createHttpClient?: (input: { baseUrl: string }) => OfferHttpClient;
  } = {}
): Promise<CliCommandResult> {
  try {
    const operation = OFFER_OPERATIONS[input.action];
    operation.input.parse(input.payload);
    const auth = await (dependencies.readAuthState ?? readCliAuthState)(
      input.authFilePath ? { authFilePath: input.authFilePath } : {}
    );
    let operatorProof: string | undefined;
    if (operation.operator) {
      if (!input.operatorProofFile)
        throw new CliInputError(
          "Operator actions require --operator-proof-file from the email-authenticated programme screen."
        );
      const info = await stat(input.operatorProofFile);
      if (
        !info.isFile() ||
        info.size > 1024 ||
        (process.platform !== "win32" && (info.mode & 0o077) !== 0)
      )
        throw new CliInputError(
          "The operator proof file must be private (0600) and smaller than 1 KiB."
        );
      operatorProof = z
        .string()
        .regex(/^[A-Za-z0-9_-]{43}$/)
        .parse((await readFile(input.operatorProofFile, "utf8")).trim());
    }
    const result = await createOfferApi(
      (dependencies.createHttpClient ?? createCliHttpClient)({ baseUrl: auth.base_url })
    ).execute(input.action, input.payload, {
      bearerToken: auth.bearer_token,
      ...(operatorProof ? { operatorProof } : {})
    });
    return { exitCode: 0, output: JSON.stringify(result, null, 2) };
  } catch (error) {
    return {
      exitCode: 1,
      output:
        error instanceof OfferApiError
          ? `Offer action failed: ${error.code}.`
          : error instanceof CliInputError
            ? error.message
            : "Offer action failed. Check authentication, input and private operator proof."
    };
  }
}
export async function handleOfferCommand(
  parsed: ParsedArgv,
  command: typeof offersWithAuthCommand = offersWithAuthCommand
): Promise<CliCommandResult> {
  const action = requirePositional(parsed, 1, "action");
  if (!Object.hasOwn(OFFER_OPERATIONS, action)) throw new CliInputError("Unknown offers action.");
  ensureNoExtraPositionals(parsed, 2);
  expectNoUnknownOptions(parsed, [
    "input",
    "code",
    "version",
    "accept-terms-version",
    "organization",
    "confirm-change",
    "confirm-remove",
    "limit",
    "before",
    "operator-proof-file",
    "auth-file",
    "json"
  ]);
  let payload: Record<string, unknown> = {};
  const inputPath = readStringOption(parsed, "input");
  if (inputPath) {
    try {
      const info = await stat(inputPath);
      if (
        !info.isFile() ||
        info.size > 65536 ||
        (action === "save_payout_preferences" &&
          process.platform !== "win32" &&
          (info.mode & 0o077) !== 0)
      )
        throw new Error("invalid_input_file");
      payload = z
        .record(z.string(), z.unknown())
        .parse(JSON.parse(await readFile(inputPath, "utf8")));
    } catch {
      throw new CliInputError(
        "The --input file must contain a JSON object smaller than 64 KiB; payment preferences require a private (0600) file."
      );
    }
  }
  const fields = {
    code: "code",
    version: "version_id",
    "accept-terms-version": "terms_version",
    organization: action === "operator_claims" ? "organization_id" : "expected_organization_id",
    before: "before"
  };
  for (const [flag, key] of Object.entries(fields)) {
    const value = readStringOption(parsed, flag);
    if (value !== undefined) payload[key] = value;
  }
  const limit = readIntegerOption(parsed, "limit");
  if (limit !== undefined) payload["limit"] = limit;
  if (readBooleanOption(parsed, "confirm-change") === true) payload["explicit_correction"] = true;
  if (readBooleanOption(parsed, "confirm-remove") === true) payload["confirmed"] = true;
  const operatorProofFile = readStringOption(parsed, "operator-proof-file"),
    authFilePath = readStringOption(parsed, "auth-file");
  return command({
    action: action as OfferOperation,
    payload,
    ...(operatorProofFile ? { operatorProofFile } : {}),
    ...(authFilePath ? { authFilePath } : {})
  });
}
