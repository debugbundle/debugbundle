import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import type { DetectedService } from "./setup-service-discovery.js";

type PromptUser = (prompt: string) => Promise<string>;

type SelectSetupTargetsDependencies = {
  isInteractive?: () => boolean;
  promptUser?: PromptUser;
};

function defaultPromptUser(prompt: string): Promise<string> {
  const terminal = createInterface({ input, output });
  return terminal.question(prompt).finally(() => {
    terminal.close();
  });
}

function filterTargetsByMode(services: DetectedService[], mode: "all" | "backend" | "frontend" | "none"): string[] {
  if (mode === "none") {
    return [];
  }

  if (mode === "all") {
    return services.map((service) => service.name);
  }

  return services
    .filter((service) => (mode === "frontend" ? service.kind === "frontend" : service.kind !== "frontend"))
    .map((service) => service.name);
}

export async function selectSetupTargets(
  services: DetectedService[],
  inputOptions: { json?: boolean; nonInteractive?: boolean },
  dependencies: SelectSetupTargetsDependencies = {}
): Promise<string[]> {
  if (services.length === 0) {
    return [];
  }

  if (inputOptions.json === true || inputOptions.nonInteractive === true) {
    return services.map((service) => service.name);
  }

  const isInteractive = dependencies.isInteractive ?? (() => process.stdin.isTTY === true && process.stdout.isTTY === true);
  if (!isInteractive()) {
    return services.map((service) => service.name);
  }

  const promptUser = dependencies.promptUser ?? defaultPromptUser;
  const serviceSummary = services.map((service) => `${service.name} (${service.kind}, ${service.runtime}, ${service.framework})`).join("; ");
  const answer = (await promptUser(
    `Detected services: ${serviceSummary}\nSelect setup targets: [a]ll, [b]ackend/server, [f]rontend/browser, [n]one (default: all): `
  )).trim().toLowerCase();

  if (answer === "b" || answer === "backend") {
    return filterTargetsByMode(services, "backend");
  }

  if (answer === "f" || answer === "frontend") {
    return filterTargetsByMode(services, "frontend");
  }

  if (answer === "n" || answer === "none") {
    return [];
  }

  return filterTargetsByMode(services, "all");
}