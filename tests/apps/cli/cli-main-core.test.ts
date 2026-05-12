import { describe, expect, it, vi } from "vitest";

import { runCli } from "../../../apps/cli/src/main.js";

describe("cli main core routing", () => {
  it("routes doctor --check-relay arguments into the doctor command", async () => {
    const doctorCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "doctor"
    });

    const result = await runCli([
      "doctor",
      "--check-relay",
      "--json"
    ], {
      doctorCommand
    });

    expect(doctorCommand).toHaveBeenCalledWith({
      checkRelay: true,
      json: true
    });
    expect(result).toEqual({
      exitCode: 0,
      output: "doctor"
    });
  });

  it("routes analyze arguments into the analyze command", async () => {
    const analyzeCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "analyze"
    });

    const result = await runCli([
      "analyze",
      "--type",
      "improvement",
      "--local",
      "--json"
    ], {
      analyzeCommand
    });

    expect(analyzeCommand).toHaveBeenCalledWith({
      type: "improvement",
      local: true,
      json: true
    });
    expect(result).toEqual({
      exitCode: 0,
      output: "analyze"
    });
  });

  it("routes process arguments into the process command", async () => {
    const processCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "processed"
    });

    const result = await runCli([
      "process",
      "--json"
    ], {
      processCommand
    });

    expect(processCommand).toHaveBeenCalledWith({
      json: true
    });
    expect(result).toEqual({
      exitCode: 0,
      output: "processed"
    });
  });

  it("routes ingest arguments into the ingest command", async () => {
    const ingestCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "ingested"
    });

    const result = await runCli([
      "ingest",
      "/tmp/php_errors.log",
      "--format",
      "php-error",
      "--json"
    ], {
      ingestCommand
    });

    expect(ingestCommand).toHaveBeenCalledWith({
      filePath: "/tmp/php_errors.log",
      format: "php-error",
      json: true
    });
    expect(result).toEqual({
      exitCode: 0,
      output: "ingested"
    });
  });

  it("routes watch arguments into the watch command", async () => {
    const watchCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "watching"
    });

    const result = await runCli([
      "watch",
      "--log",
      "/tmp/php_errors.log",
      "--format",
      "php-error",
      "--json"
    ], {
      watchCommand
    });

    expect(watchCommand).toHaveBeenCalledWith({
      logPath: "/tmp/php_errors.log",
      format: "php-error",
      json: true
    });
    expect(result).toEqual({
      exitCode: 0,
      output: "watching"
    });
  });

  it("routes watch --cloud arguments into the watch command", async () => {
    const watchCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "watching-cloud"
    });

    const result = await runCli([
      "watch",
      "--cloud",
      "--log",
      "/tmp/php_errors.log",
      "--format",
      "php-error",
      "--json"
    ], {
      watchCommand
    });

    expect(watchCommand).toHaveBeenCalledWith({
      cloud: true,
      logPath: "/tmp/php_errors.log",
      format: "php-error",
      json: true
    });
    expect(result).toEqual({
      exitCode: 0,
      output: "watching-cloud"
    });
  });

  it("routes clean arguments into the clean command", async () => {
    const cleanCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "cleaned"
    });

    const result = await runCli([
      "clean",
      "--events",
      "--bundles",
      "--older-than",
      "10d",
      "--json"
    ], {
      cleanCommand
    });

    expect(cleanCommand).toHaveBeenCalledWith({
      events: true,
      bundles: true,
      olderThan: "10d",
      json: true
    });
    expect(result).toEqual({
      exitCode: 0,
      output: "cleaned"
    });
  });

  it("routes clean --all into the clean command", async () => {
    const cleanCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "cleaned-all"
    });

    const result = await runCli([
      "clean",
      "--all",
      "--json"
    ], {
      cleanCommand
    });

    expect(cleanCommand).toHaveBeenCalledWith({
      all: true,
      json: true
    });
    expect(result).toEqual({
      exitCode: 0,
      output: "cleaned-all"
    });
  });

  it("supports help, empty argv, and equals-style option parsing", async () => {
    const helpResult = await runCli(["help"]);
    const emptyResult = await runCli([]);
    const analyzeCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "analyze-equals" });
    const equalsResult = await runCli([
      "analyze",
      "--type=improvement",
      "--local",
      "--json"
    ], {
      analyzeCommand
    });

    expect(helpResult.exitCode).toBe(0);
    expect(helpResult.output).toContain("Usage:");
    expect(emptyResult.exitCode).toBe(4);
    expect(emptyResult.output).toContain("No command provided.");
    expect(analyzeCommand).toHaveBeenCalledWith({
      type: "improvement",
      local: true,
      json: true
    });
    expect(equalsResult.exitCode).toBe(0);
  });

  it("routes smoke arguments into the smoke command", async () => {
    const smokeCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "smoke"
    });

    const result = await runCli([
      "smoke",
      "--project-id",
      "proj_123",
      "--service",
      "checkout-api",
      "--environment",
      "production",
      "--max-age-minutes",
      "20",
      "--auth-file",
      "/tmp/auth.json",
      "--json"
    ], {
      smokeCommand
    });

    expect(smokeCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      service: "checkout-api",
      environment: "production",
      maxAgeMinutes: 20,
      authFilePath: "/tmp/auth.json",
      json: true
    });
    expect(result).toEqual({
      exitCode: 0,
      output: "smoke"
    });
  });

  it("routes verify cloud arguments into the verify-cloud command", async () => {
    const verifyCloudCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "verify-cloud"
    });

    const result = await runCli([
      "verify",
      "cloud",
      "--project-id",
      "proj_123",
      "--service",
      "checkout-api",
      "--environment",
      "production",
      "--max-age-minutes",
      "20",
      "--trigger-5xx",
      "--auth-file",
      "/tmp/auth.json",
      "--json"
    ], {
      verifyCloudCommand
    });

    expect(verifyCloudCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      service: "checkout-api",
      environment: "production",
      maxAgeMinutes: 20,
      trigger5xx: true,
      authFilePath: "/tmp/auth.json",
      json: true
    });
    expect(result).toEqual({
      exitCode: 0,
      output: "verify-cloud"
    });
  });

  it("routes verify local arguments into the verify-local command", async () => {
    const verifyLocalCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "verify-local"
    });

    const result = await runCli([
      "verify",
      "local",
      "--json"
    ], {
      verifyLocalCommand
    });

    expect(verifyLocalCommand).toHaveBeenCalledWith({
      json: true
    });
    expect(result).toEqual({
      exitCode: 0,
      output: "verify-local"
    });
  });

  it("routes validate arguments into the validate command", async () => {
    const validateCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "validate"
    });

    const result = await runCli([
      "validate",
      "--fix",
      "--json"
    ], {
      validateCommand
    });

    expect(validateCommand).toHaveBeenCalledWith({
      fix: true,
      json: true
    });
    expect(result).toEqual({
      exitCode: 0,
      output: "validate"
    });
  });

  it("routes profile validate arguments into the profile validate command", async () => {
    const profileValidateCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "profile-validate"
    });

    const result = await runCli([
      "profile",
      "validate",
      "--json"
    ], {
      profileValidateCommand
    });

    expect(profileValidateCommand).toHaveBeenCalledWith({
      json: true
    });
    expect(result).toEqual({
      exitCode: 0,
      output: "profile-validate"
    });
  });

  it("routes doctor arguments into the doctor command", async () => {
    const doctorCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "doctor"
    });

    const result = await runCli([
      "doctor",
      "--json"
    ], {
      doctorCommand
    });

    expect(doctorCommand).toHaveBeenCalledWith({
      json: true
    });
    expect(result).toEqual({
      exitCode: 0,
      output: "doctor"
    });
  });

  it("routes doctor --privacy arguments into the doctor command", async () => {
    const doctorCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "doctor-privacy"
    });

    const result = await runCli([
      "doctor",
      "--privacy",
      "--json"
    ], {
      doctorCommand
    });

    expect(doctorCommand).toHaveBeenCalledWith({
      privacy: true,
      json: true
    });
    expect(result).toEqual({
      exitCode: 0,
      output: "doctor-privacy"
    });
  });

  it("routes setup arguments into the setup command", async () => {
    const setupCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "initialized"
    });

    const result = await runCli([
      "setup",
      "--json"
    ], {
      setupCommand
    });

    expect(setupCommand).toHaveBeenCalledWith({
      json: true
    });
    expect(result).toEqual({
      exitCode: 0,
      output: "initialized"
    });
  });

  it("routes setup --non-interactive into the setup command", async () => {
    const setupCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "initialized-ci"
    });

    const result = await runCli([
      "setup",
      "--non-interactive",
      "--json"
    ], {
      setupCommand
    });

    expect(setupCommand).toHaveBeenCalledWith({
      nonInteractive: true,
      json: true
    });
    expect(result).toEqual({
      exitCode: 0,
      output: "initialized-ci"
    });
  });

  it("routes connect arguments into the connect command", async () => {
    const connectCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "connected"
    });

    const result = await runCli([
      "connect",
      "--auth-file",
      "/tmp/auth.json",
      "--json"
    ], {
      connectCommand
    });

    expect(connectCommand).toHaveBeenCalledWith({
      authFilePath: "/tmp/auth.json",
      json: true
    });
    expect(result).toEqual({
      exitCode: 0,
      output: "connected"
    });
  });

  it("routes login arguments into the login command", async () => {
    const loginCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "logged in"
    });

    const result = await runCli([
      "login",
      "dbundle_mem_secret_token",
      "--base-url",
      "https://selfhost.debugbundle.test",
      "--auth-file",
      "/tmp/auth.json",
      "--json"
    ], {
      loginCommand
    });

    expect(loginCommand).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_secret_token",
      baseUrl: "https://selfhost.debugbundle.test",
      authFilePath: "/tmp/auth.json",
      json: true
    });
    expect(result).toEqual({
      exitCode: 0,
      output: "logged in"
    });
  });

  it("routes GitHub login arguments into the login command", async () => {
    const loginCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "logged in with github"
    });

    const result = await runCli([
      "login",
      "--github",
      "--label",
      "GitHub bootstrap",
      "--json"
    ], {
      loginCommand
    });

    expect(loginCommand).toHaveBeenCalledWith({
      github: true,
      label: "GitHub bootstrap",
      json: true
    });
    expect(result).toEqual({
      exitCode: 0,
      output: "logged in with github"
    });
  });

});
