import { beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";

const {
  queryMock,
  endMock,
  connectMock,
  releaseMock,
  bootstrapStorageSchemaMock,
  seedStorageMigrationLedgerForCurrentSchemaMock,
  poolConstructorMock
} = vi.hoisted(() => ({
  queryMock: vi.fn(),
  endMock: vi.fn().mockResolvedValue(undefined),
  releaseMock: vi.fn(),
  connectMock: vi.fn(),
  bootstrapStorageSchemaMock: vi.fn(),
  seedStorageMigrationLedgerForCurrentSchemaMock: vi.fn(),
  poolConstructorMock: vi.fn()
}));

vi.mock("pg", () => ({
  Pool: vi.fn().mockImplementation(function (config: unknown) {
    poolConstructorMock(config);
    return {
      connect: connectMock,
      end: endMock
    };
  })
}));

vi.mock("../../packages/storage/src/migrations.js", () => ({
  bootstrapStorageSchema: bootstrapStorageSchemaMock
}));

vi.mock("../../packages/storage/src/schema-migrations.js", () => ({
  seedStorageMigrationLedgerForCurrentSchema: seedStorageMigrationLedgerForCurrentSchemaMock
}));

import { isDirectExecution, runStorageBootstrapScript } from "../../scripts/bootstrap-storage.ts";

describe("storage bootstrap script", () => {
  beforeEach(() => {
    queryMock.mockReset();
    endMock.mockClear();
    releaseMock.mockClear();
    connectMock.mockReset();
    connectMock.mockResolvedValue({
      query: queryMock,
      release: releaseMock
    });
    bootstrapStorageSchemaMock.mockReset();
    seedStorageMigrationLedgerForCurrentSchemaMock.mockReset();
    poolConstructorMock.mockReset();
    delete process.env["DB_HOST"];
    delete process.env["DB_PORT"];
    delete process.env["DB_USER"];
    delete process.env["DB_PASSWORD"];
    delete process.env["DB_NAME"];
    delete process.env["DB_SSL_MODE"];
  });

  it("should log when bootstrap creates the schema", async (): Promise<void> => {
    bootstrapStorageSchemaMock.mockResolvedValueOnce({ status: "bootstrapped" });
    seedStorageMigrationLedgerForCurrentSchemaMock.mockResolvedValueOnce("seeded_current_schema");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runStorageBootstrapScript({});

    expect(logSpy).toHaveBeenCalledWith("db_bootstrap_ok: bootstrapped; migration_ledger=seeded_current_schema");
    expect(bootstrapStorageSchemaMock).toHaveBeenCalledOnce();
    expect(seedStorageMigrationLedgerForCurrentSchemaMock).toHaveBeenCalledOnce();
    expect(releaseMock).toHaveBeenCalledOnce();
    expect(endMock).toHaveBeenCalledOnce();
    logSpy.mockRestore();
  });

  it("should log when the schema is already bootstrapped", async (): Promise<void> => {
    bootstrapStorageSchemaMock.mockResolvedValueOnce({ status: "already_bootstrapped" });
    seedStorageMigrationLedgerForCurrentSchemaMock.mockResolvedValueOnce("already_present");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runStorageBootstrapScript({});

    expect(logSpy).toHaveBeenCalledWith("db_bootstrap_ok: already_bootstrapped; migration_ledger=already_present");
    expect(releaseMock).toHaveBeenCalledOnce();
    expect(endMock).toHaveBeenCalledOnce();
    logSpy.mockRestore();
  });

  it("should construct pool using explicit env values", async (): Promise<void> => {
    process.env["DB_HOST"] = "db-host";
    process.env["DB_PORT"] = "5433";
    process.env["DB_USER"] = "db-user";
    process.env["DB_PASSWORD"] = "db-pass";
    process.env["DB_NAME"] = "db-name";
    process.env["DB_SSL_MODE"] = "require";

    bootstrapStorageSchemaMock.mockResolvedValueOnce({ status: "already_bootstrapped" });
    seedStorageMigrationLedgerForCurrentSchemaMock.mockResolvedValueOnce("already_present");

    await runStorageBootstrapScript(process.env);

    expect(poolConstructorMock).toHaveBeenCalledWith({
      host: "db-host",
      port: 5433,
      user: "db-user",
      password: "db-pass",
      database: "db-name",
      ssl: { rejectUnauthorized: false }
    });
  });

  it("should report false for missing argv path", (): void => {
    expect(isDirectExecution("")).toBe(false);
  });

  it("should report true when argv path matches bootstrap script", (): void => {
    const bootstrapPath = path.join(process.cwd(), "scripts", "bootstrap-storage.ts");
    expect(isDirectExecution(bootstrapPath)).toBe(true);
  });

  it("should call pool query through bootstrap query adapter", async (): Promise<void> => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    bootstrapStorageSchemaMock.mockImplementationOnce(async (db: { query: (sql: string, params: unknown[]) => Promise<unknown> }) => {
      await db.query("SELECT 1", ["x"]);
      return { status: "already_bootstrapped" };
    });
    seedStorageMigrationLedgerForCurrentSchemaMock.mockResolvedValueOnce("already_present");

    await runStorageBootstrapScript({});

    expect(queryMock).toHaveBeenCalledWith("SELECT 1", ["x"]);
  });
});
