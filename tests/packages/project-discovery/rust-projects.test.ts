import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverRustProjects } from "../../../packages/project-discovery/src/index.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function root(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "debugbundle-cargo-discovery-"));
  roots.push(path);
  return path;
}
async function file(root: string, path: string, text: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text);
}

describe("Rust project discovery", () => {
  it("withholds a malformed or oversized workspace instead of guessing descendant membership", async () => {
    const directory = await root();
    await file(directory, "Cargo.toml", "[workspace\n");
    await file(
      directory,
      "child/Cargo.toml",
      '[package]\nname="not-a-confirmed-member"\nversion="0.1.0"\n'
    );
    await file(directory, "child/src/main.rs", "fn main() {}\n");
    expect(await discoverRustProjects(directory)).toEqual([]);
    await file(directory, "Cargo.toml", "#".repeat(65537));
    expect(await discoverRustProjects(directory)).toEqual([]);
  });
  it("detects a standalone backend by Cargo identity and aliased framework dependencies", async () => {
    const directory = await root();
    await file(
      directory,
      "Cargo.toml",
      '[package]\nname="checkout-web"\nversion="0.1.0"\n[dependencies]\nhttp_server={package="actix-web",version="4"}\n'
    );
    await file(directory, "src/main.rs", "fn main() {}\n");
    expect(await discoverRustProjects(directory)).toEqual([
      { name: "checkout-web", kind: "backend", framework: "Actix Web", path: "." }
    ]);
  });
  it("resolves workspace globs, exclusions and inherited aliases without promoting libraries", async () => {
    const directory = await root();
    await file(
      directory,
      "Cargo.toml",
      '[workspace]\nmembers=["crates/*"]\nexclude=["crates/excluded"]\n[workspace.dependencies]\nhttp_server={package="axum",version="0.8"}\n'
    );
    await file(
      directory,
      "crates/api/Cargo.toml",
      '[package]\nname="checkout-api"\nversion="0.1.0"\n[dependencies]\nhttp_server.workspace=true\n'
    );
    await file(directory, "crates/api/src/main.rs", "fn main() {}\n");
    await file(
      directory,
      "crates/job/Cargo.toml",
      '[package]\nname="billing-worker"\nversion="0.1.0"\n'
    );
    await file(directory, "crates/job/src/main.rs", "fn main() {}\n");
    await file(
      directory,
      "crates/library/Cargo.toml",
      '[package]\nname="shared-http"\nversion="0.1.0"\n[dependencies]\naxum="0.8"\n'
    );
    await file(directory, "crates/library/src/lib.rs", "pub fn shared() {}\n");
    await file(
      directory,
      "crates/excluded/Cargo.toml",
      '[package]\nname="excluded"\nversion="0.1.0"\n'
    );
    await file(directory, "crates/excluded/src/main.rs", "fn main() {}\n");
    expect(await discoverRustProjects(directory)).toEqual([
      { name: "checkout-api", kind: "backend", framework: "Axum", path: "crates/api" },
      { name: "billing-worker", kind: "worker", framework: "unknown", path: "crates/job" }
    ]);
  });
  it("recognizes explicit binaries and target dependencies while respecting autobins false", async () => {
    const directory = await root();
    await file(
      directory,
      "Cargo.toml",
      '[package]\nname="entrypoint"\nversion="0.1.0"\nautobins=false\n[[bin]]\nname="server"\npath="server.rs"\n[target.\'cfg(unix)\'.dependencies]\naxum="0.8"\n'
    );
    await file(directory, "server.rs", "fn main() {}\n");
    expect(await discoverRustProjects(directory)).toEqual([
      { name: "entrypoint", kind: "backend", framework: "Axum", path: "." }
    ]);
    await file(
      directory,
      "Cargo.toml",
      '[package]\nname="library"\nversion="0.1.0"\nautobins=false\n'
    );
    await file(directory, "src/main.rs", "fn main() {}\n");
    expect(await discoverRustProjects(directory)).toEqual([]);
  });
  it("infers an explicit package-named binary and honours an explicit missing path", async () => {
    const directory = await root();
    const manifest =
      '[package]\nname="server"\nversion="0.1.0"\nautobins=false\n[[bin]]\nname="server"\n';
    await file(directory, "Cargo.toml", manifest);
    await file(directory, "src/main.rs", "fn main() {}\n");
    expect(await discoverRustProjects(directory)).toEqual([
      { name: "server", kind: "backend", framework: "unknown", path: "." }
    ]);
    await file(directory, "src/bin/server.rs", "fn main() {}\n");
    await file(directory, "Cargo.toml", `${manifest}path="missing.rs"\n`);
    expect(await discoverRustProjects(directory)).toEqual([]);
  });
  it("ignores malformed manifests, symlinks, outside members and generated SDK trees", async () => {
    const directory = await root();
    const outside = await root();
    await file(outside, "Cargo.toml", '[package]\nname="outside"\nversion="0.1.0"\n');
    await file(outside, "src/main.rs", "fn main() {}\n");
    await file(
      directory,
      "Cargo.toml",
      '[workspace]\nmembers=["../outside", "linked", "broken", "sdks/*"]\n'
    );
    await symlink(outside, join(directory, "linked"), "dir");
    await file(directory, "broken/Cargo.toml", "[package\n");
    await file(
      directory,
      "sdks/candidate/Cargo.toml",
      '[package]\nname="generated-sdk"\nversion="0.1.0"\n'
    );
    await file(directory, "sdks/candidate/src/main.rs", "fn main() {}\n");
    expect(await discoverRustProjects(directory)).toEqual([]);
  });
});
