export type ParsedOptionValue = string | boolean | string[];

export type ParsedArgv = {
  positionals: string[];
  options: Map<string, ParsedOptionValue>;
};

export class CliInputError extends Error {}

export function parseArgv(argv: string[]): ParsedArgv {
  const positionals: string[] = [];
  const options = new Map<string, ParsedOptionValue>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) {
      break;
    }

    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    if (
      token === "--fix"
      || token === "--json"
      || token === "--check-relay"
      || token === "--help"
      || token === "--non-interactive"
      || token === "--local"
      || token === "--cloud"
      || token === "--events"
      || token === "--bundles"
      || token === "--all"
      || token === "--trigger-5xx"
    ) {
      options.set(token.slice(2), true);
      continue;
    }

    const equalIndex = token.indexOf("=");
    if (equalIndex >= 0) {
      const optionName = token.slice(2, equalIndex);
      const optionValue = token.slice(equalIndex + 1);
      if (optionValue.length === 0) {
        throw new CliInputError(`Missing value for --${optionName}.`);
      }

      const existingValue = options.get(optionName);
      if (existingValue === undefined) {
        options.set(optionName, optionValue);
      } else if (Array.isArray(existingValue)) {
        options.set(optionName, [...existingValue, optionValue]);
      } else if (typeof existingValue === "string") {
        options.set(optionName, [existingValue, optionValue]);
      } else {
        options.set(optionName, optionValue);
      }
      continue;
    }

    const optionName = token.slice(2);
    const optionValue = argv[index + 1];
    if (optionValue === undefined || optionValue.startsWith("--")) {
      throw new CliInputError(`Missing value for --${optionName}.`);
    }

    const existingValue = options.get(optionName);
    if (existingValue === undefined) {
      options.set(optionName, optionValue);
    } else if (Array.isArray(existingValue)) {
      options.set(optionName, [...existingValue, optionValue]);
    } else if (typeof existingValue === "string") {
      options.set(optionName, [existingValue, optionValue]);
    } else {
      options.set(optionName, optionValue);
    }
    index += 1;
  }

  return {
    positionals,
    options
  };
}

export function expectNoUnknownOptions(parsedArgv: ParsedArgv, allowedOptions: string[]): void {
  const allowed = new Set(allowedOptions);

  for (const optionName of parsedArgv.options.keys()) {
    if (!allowed.has(optionName)) {
      throw new CliInputError(`Unknown option --${optionName}.`);
    }
  }
}

export function requirePositional(parsedArgv: ParsedArgv, index: number, label: string): string {
  const value = parsedArgv.positionals[index];
  if (value === undefined) {
    throw new CliInputError(`Missing required argument <${label}>.`);
  }

  return value;
}

export function ensureNoExtraPositionals(parsedArgv: ParsedArgv, expectedCount: number): void {
  if (parsedArgv.positionals.length > expectedCount) {
    throw new CliInputError("Too many positional arguments.");
  }
}

export function readStringOption(parsedArgv: ParsedArgv, optionName: string): string | undefined {
  const value = parsedArgv.options.get(optionName);
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value[value.length - 1];
  }

  return undefined;
}

export function readStringListOption(parsedArgv: ParsedArgv, optionName: string): string[] | undefined {
  const value = parsedArgv.options.get(optionName);
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value;
  }

  return undefined;
}

type WeeklyReportDayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export function readWeeklyReportDayOfWeekOption(parsedArgv: ParsedArgv, optionName: string): WeeklyReportDayOfWeek | undefined {
  const value = readStringOption(parsedArgv, optionName);

  if (value === undefined) {
    return undefined;
  }

  if (["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].includes(value)) {
    return value as WeeklyReportDayOfWeek;
  }

  throw new CliInputError(`Invalid value for --${optionName}.`);
}

export function readBooleanOption(parsedArgv: ParsedArgv, optionName: string): boolean | undefined {
  const value = parsedArgv.options.get(optionName);
  if (value !== true) {
    return undefined;
  }

  return true;
}

export function readLimitOption(parsedArgv: ParsedArgv): number | undefined {
  const rawLimit = readStringOption(parsedArgv, "limit");
  if (rawLimit === undefined) {
    return undefined;
  }

  const limit = Number.parseInt(rawLimit, 10);
  if (!Number.isInteger(limit)) {
    throw new CliInputError("Invalid value for --limit.");
  }

  return limit;
}

export function readIntegerOption(parsedArgv: ParsedArgv, optionName: string): number | undefined {
  const rawValue = readStringOption(parsedArgv, optionName);
  if (rawValue === undefined) {
    return undefined;
  }

  const value = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(value)) {
    throw new CliInputError(`Invalid value for --${optionName}.`);
  }

  return value;
}

export function readCsvOption(parsedArgv: ParsedArgv, optionName: string): string[] | undefined {
  const rawValue = readStringOption(parsedArgv, optionName);
  if (rawValue === undefined) {
    return undefined;
  }

  const values = rawValue
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (values.length === 0) {
    throw new CliInputError(`Invalid value for --${optionName}.`);
  }

  return values;
}

export function readBooleanStringOption(parsedArgv: ParsedArgv, optionName: string): boolean | undefined {
  const rawValue = readStringOption(parsedArgv, optionName);
  if (rawValue === undefined) {
    return undefined;
  }

  if (rawValue === "true") {
    return true;
  }
  if (rawValue === "false") {
    return false;
  }

  throw new CliInputError(`Invalid value for --${optionName}.`);
}

export function readJsonOption(parsedArgv: ParsedArgv, optionName: string): unknown {
  const rawValue = readStringOption(parsedArgv, optionName);
  if (rawValue === undefined) {
    return undefined;
  }

  try {
    return JSON.parse(rawValue);
  } catch {
    throw new CliInputError(`Invalid value for --${optionName}.`);
  }
}

export function appendCommonAuthOptions<T extends Record<string, unknown>>(
  parsedArgv: ParsedArgv,
  target: T
): T & { authFilePath?: string; json?: boolean } {
  const result = target as T & { authFilePath?: string; json?: boolean };
  const authFilePath = readStringOption(parsedArgv, "auth-file");
  if (authFilePath !== undefined) {
    result.authFilePath = authFilePath;
  }

  const json = readBooleanOption(parsedArgv, "json");
  if (json !== undefined) {
    result.json = json;
  }

  return result;
}
