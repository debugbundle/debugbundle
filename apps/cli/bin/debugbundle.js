#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const binDirectory = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(binDirectory, "..");
const mainPath = resolve(packageRoot, "dist/main.js");
const { main } = await import(pathToFileURL(mainPath).href);

await main();