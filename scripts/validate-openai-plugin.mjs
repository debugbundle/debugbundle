#!/usr/bin/env node

import process from "node:process";

import { validateOpenAiPluginSource } from "./openai-plugin-release-lib.mjs";

function parseArgs(argv) {
  const supported = new Set(["--json", "--require-connection", "--help", "-h"]);
  for (const argument of argv) {
    if (!supported.has(argument)) throw new Error(`unknown_option:${argument}`);
  }
  return {
    help: argv.includes("--help") || argv.includes("-h"),
    json: argv.includes("--json"),
    requireConnection: argv.includes("--require-connection")
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(
      "Usage: node scripts/validate-openai-plugin.mjs [--json] [--require-connection]\n"
    );
    return;
  }

  const result = validateOpenAiPluginSource({ requireConnection: args.requireConnection });
  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(
      `OpenAI plugin ${result.version} ${result.evidenceState}: source validation passed.\n`
    );
    for (const gate of result.manualGates) process.stdout.write(`Manual gate: ${gate}\n`);
  } else {
    for (const failure of result.failures) process.stderr.write(`${failure}\n`);
  }

  if (!result.ok) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
