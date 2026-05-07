import { createRuntimeLoggerFromEnv, getErrorMessage } from "../../../packages/runtime-logger/src/index.js";
import { startApiServerFromEnv } from "./runtime.js";

async function main(): Promise<void> {
  const logger = createRuntimeLoggerFromEnv({
    app: "api",
    defaultService: "debugbundle-api",
    env: process.env,
    ...(process.env["npm_package_version"] === undefined ? {} : { version: process.env["npm_package_version"] })
  });

  try {
    await startApiServerFromEnv(process.env);
  } catch (error) {
    logger.fatal({ error_message: getErrorMessage(error, "unknown_startup_error") }, "api_startup_failed");
    process.exit(1);
  }
}

void main();
