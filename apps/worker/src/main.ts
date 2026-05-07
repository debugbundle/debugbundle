import { createRuntimeLoggerFromEnv, getErrorMessage } from "../../../packages/runtime-logger/src/index.js";
import { runWorkerFromEnv } from "./runtime.js";

async function main(): Promise<void> {
  const logger = createRuntimeLoggerFromEnv({
    app: "worker",
    defaultService: "debugbundle-worker",
    env: process.env,
    ...(process.env["npm_package_version"] === undefined ? {} : { version: process.env["npm_package_version"] })
  });

  try {
    await runWorkerFromEnv(process.env);
  } catch (error) {
    logger.fatal({ error_message: getErrorMessage(error, "unknown_worker_error") }, "worker_startup_failed");
    process.exit(1);
  }
}

void main();
