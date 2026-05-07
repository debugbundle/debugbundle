import type { PoolConfig } from "pg";

export type PostgresSslMode = "disable" | "require";

export function parsePostgresSslMode(value: string | undefined): PostgresSslMode {
  const normalized = value?.trim().toLowerCase() ?? "";

  if (normalized === "" || normalized === "disable" || normalized === "false" || normalized === "0") {
    return "disable";
  }

  if (normalized === "require" || normalized === "true" || normalized === "1") {
    return "require";
  }

  throw new Error("postgres_ssl_mode_invalid");
}

export function buildPostgresSslConfig(value: string | undefined): PoolConfig["ssl"] {
  return parsePostgresSslMode(value) === "require" ? { rejectUnauthorized: false } : undefined;
}