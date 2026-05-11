#!/usr/bin/env node
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const binDirectory = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(binDirectory, "..");
const mainPath = resolve(packageRoot, "dist/main.cjs");

require(mainPath);