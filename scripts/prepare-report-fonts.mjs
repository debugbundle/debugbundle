import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const revision = "523d033d6cb47f4a80c58a35753646f5c3608a78";
const root = resolve("packages/smart-reports/assets");
const assets = [
  {
    name: "NotoSansCJKjp-Regular.otf",
    source: "Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf",
    max: 25 * 1024 * 1024,
    sha256: "68a3fc98800b2a27b371f2fb79991daf3633bd89309d4ffaa6946fd587f375b5"
  },
  {
    name: "NotoSansCJK-OFL.txt",
    source: "LICENSE",
    max: 64 * 1024,
    sha256: "6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2"
  },
  {
    name: "InstrumentSans-LatinExt-Regular.woff",
    workspaceSource:
      "apps/web/node_modules/@fontsource/instrument-sans/files/instrument-sans-latin-ext-400-normal.woff",
    max: 64 * 1024,
    sha256: "70972e3355cd7613dd08b9fb8fb07d4a88092722897f0d8aa076f3a8d40dbaa6"
  },
  {
    name: "InstrumentSans-OFL.txt",
    workspaceSource: "apps/web/node_modules/@fontsource/instrument-sans/LICENSE",
    max: 64 * 1024,
    sha256: "c27a3c53c3beed7f5c26853afa15991478ff7145d3754a36b0382f84e10c0d03"
  }
];
const download = process.argv.slice(2).length === 1 && process.argv[2] === "--download";
if (process.argv.length > 2 && !download) throw new Error("report_font_arguments_invalid");
await mkdir(root, { recursive: true });
for (const asset of assets) {
  const destination = resolve(root, asset.name);
  let body;
  try {
    body = await readFile(destination);
  } catch (error) {
    if (error?.code !== "ENOENT" || !download) throw error;
    if (asset.workspaceSource !== undefined) body = await readFile(resolve(asset.workspaceSource));
    else {
      const response = await fetch(
        `https://raw.githubusercontent.com/notofonts/noto-cjk/${revision}/${asset.source}`,
        { signal: AbortSignal.timeout(30000), redirect: "error" }
      );
      if (!response.ok || !response.body) throw new Error("report_font_download_failed");
      const chunks = [];
      let length = 0;
      for await (const chunk of response.body) {
        length += chunk.byteLength;
        if (length > asset.max) throw new Error("report_font_size_exceeded");
        chunks.push(Buffer.from(chunk));
      }
      body = Buffer.concat(chunks);
    }
    const hash = createHash("sha256").update(body).digest("hex");
    if (hash !== asset.sha256) throw new Error("report_font_integrity_failed");
    await writeFile(destination, body, { flag: "wx" });
  }
  if (body.length > asset.max) throw new Error("report_font_size_exceeded");
  const hash = createHash("sha256").update(body).digest("hex");
  if (hash !== asset.sha256) throw new Error("report_font_integrity_failed");
  process.stdout.write(`${asset.name} ${body.length} ${hash}\n`);
}
