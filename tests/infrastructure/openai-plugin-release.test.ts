import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function runJson(args: string[]): unknown {
  return JSON.parse(
    execFileSync(process.execPath, ["scripts/release-openai-plugin.mjs", ...args, "--json"], {
      cwd: repoRoot,
      encoding: "utf8"
    })
  ) as unknown;
}

describe("OpenAI plugin release automation", () => {
  it("keeps completed rollback evidence out of the remaining manual gates", () => {
    const sources = [
      "SYSTEM_OVERVIEW.md",
      "ARCHITECTURE_MAP.md",
      "spec/openai-plugin-threat-model.md",
      "apps/mcp/openai/submission/review-checklist.md"
    ].map((path) => readFileSync(join(repoRoot, path), "utf8"));
    const checklist = sources.at(-1);

    expect(checklist).toContain(
      "- [x] The controlled shared-runtime rollback rehearsal passes against immutable images."
    );
    expect(checklist).toContain(
      "- [ ] Representative capacity/load evidence passes against the immutable candidate."
    );
    for (const source of sources) {
      expect(source).not.toContain("load/rollback evidence");
      expect(source).not.toContain("capacity/load and shared-runtime rollback evidence");
    }
  });

  it("provides a data-free local MCP Inspector catalog harness", () => {
    const makefile = readFileSync(join(repoRoot, "Makefile"), "utf8");
    const harness = readFileSync(
      join(repoRoot, "scripts/openai-plugin-inspector-harness.ts"),
      "utf8"
    );

    expect(makefile).toContain("openai-plugin-inspector-check:");
    expect(makefile).toContain("@modelcontextprotocol/inspector@2.5.0 --cli");
    expect(makefile).toContain("--method tools/list --strict --format json");
    expect(harness).toContain("OPENAI_TOOL_CATALOG.map");
    expect(harness).toContain("getOpenAiToolSchemas");
    expect(harness).not.toContain("createOpenAiHostedToolHandlers");
    expect(harness).not.toContain("process.env");
  });

  it("packages an explicit privacy and legal review record", () => {
    const policyReview = readFileSync(
      join(repoRoot, "apps/mcp/openai/submission/policy-review.md"),
      "utf8"
    );

    expect(policyReview).toContain("## Engineering Verification");
    expect(policyReview).toContain("## Owner Legal Attestations");
    expect(policyReview).toContain("OpenAI is the recipient");
    expect(policyReview).toContain("aggregate product analytics");
    expect(policyReview).toContain("No legal conclusion is inferred from a passing test");
  });

  it("is independently versioned and permanently excludes external release actions", () => {
    const plan = runJson(["plan"]) as {
      version: string;
      independent_from_npm_mcp_version: boolean;
      allowed_actions: string[];
      prohibited_actions: string[];
    };

    expect(plan.version).toBe("1.0.0");
    expect(plan.independent_from_npm_mcp_version).toBe(true);
    expect(plan.allowed_actions).toEqual([
      "validate_source",
      "build_deterministic_archives",
      "record_non_secret_hashes",
      "generate_submission_packet"
    ]);
    expect(plan.prohibited_actions).toEqual([
      "portal_login",
      "submit",
      "cancel_review",
      "publish",
      "directory_edit",
      "announcement",
      "spend",
      "deployment"
    ]);

    const source = readFileSync(join(repoRoot, "scripts/release-openai-plugin.mjs"), "utf8");
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("https.request");
    expect(source).not.toContain("playwright");
    expect(source).not.toContain("aws ");
    expect(source).not.toContain("docker ");
  });

  it("keeps prepared submission evidence aligned after manifest-only release commits", () => {
    const source = readFileSync(join(repoRoot, "scripts/release-openai-plugin.mjs"), "utf8");

    expect(source).toContain("readRecordedSourceCommit");
    expect(source).toContain("release_artifact_set_incomplete");
    expect(source).toContain("submission_packet_drift");
    expect(source).toContain("release_checksums_drift");
  });

  it("fails closed when generated release artifacts drift", () => {
    const outputRoot = mkdtempSync(join(tmpdir(), "debugbundle-openai-artifacts-"));
    try {
      writeFileSync(join(outputRoot, "debugbundle-openai-plugin-1.0.0.zip"), "stale-plugin");
      writeFileSync(join(outputRoot, "debugbundle-openai-submission-1.0.0.zip"), "stale-packet");
      writeFileSync(join(outputRoot, "SHA256SUMS"), "stale-checksums\n");

      const completed = spawnSync(
        process.execPath,
        ["scripts/release-openai-plugin.mjs", "verify", "--output", outputRoot, "--json"],
        { cwd: repoRoot, encoding: "utf8" }
      );
      expect(completed.stdout, completed.stderr).not.toBe("");
      const result = JSON.parse(completed.stdout) as { failures: string[] };

      expect(completed.status).toBe(1);
      expect(result.failures).toEqual(
        expect.arrayContaining([
          "plugin_archive_drift",
          "submission_packet_drift",
          "release_checksums_drift"
        ])
      );
    } finally {
      rmSync(outputRoot, { recursive: true, force: true });
    }
  });

  it("verifies the committed source manifest and exact package hashes without live access", () => {
    const result = runJson(["verify"]) as {
      ok: boolean;
      failures: string[];
      manifest: {
        plugin_version: string;
        registered_connection_id: string | null;
        runtime: { resource_origin: string; mcp_endpoint: string; api_image_digest: string | null };
        contract: { tools_in_scan_order: string[] };
        automation_boundary: Record<string, boolean>;
        manual_gates: string[];
      };
    };

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.manifest.plugin_version).toBe("1.0.0");
    expect(result.manifest.registered_connection_id).toBe(
      "plugin_asdk_app_6a99ba6c1e7881919091a592738692c6"
    );
    expect(result.manifest.runtime).toMatchObject({
      resource_origin: "https://mcp.debugbundle.com",
      mcp_endpoint: "https://mcp.debugbundle.com/mcp"
    });
    if (result.manifest.runtime.api_image_digest === null) {
      expect(result.manifest.manual_gates).toContain("immutable_api_image_deployment_digest");
    } else {
      expect(result.manifest.runtime.api_image_digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
      expect(result.manifest.manual_gates).not.toContain("immutable_api_image_deployment_digest");
    }
    expect(result.manifest.contract.tools_in_scan_order).toHaveLength(23);
    expect(
      Object.values(result.manifest.automation_boundary).every((value) => value === false)
    ).toBe(true);
    expect(result.manifest.manual_gates).not.toContain(
      "developer_mode_connection_registration_scan_and_app_json"
    );
    expect(result.manifest.manual_gates).toContain(
      "manual_keyboard_and_screen_reader_accessibility_validation"
    );
    expect(result.manifest.manual_gates).toContain("representative_capacity_load_evidence");
    expect(result.manifest.manual_gates).not.toContain(
      "representative_capacity_load_and_rollback_evidence"
    );
    expect(result.manifest.manual_gates).toContain(
      "reviewer_outside_network_smoke_and_fixture_isolation"
    );
    expect(result.manifest.manual_gates).toContain("remaining_chatgpt_and_codex_reviewer_corpus");
    expect(result.manifest.manual_gates).toContain(
      "openai_monitoring_install_and_recurring_spend_approval"
    );
    expect(result.manifest.manual_gates).toContain(
      "owner_legal_attestations_and_policy_deployment"
    );
    expect(result.manifest.manual_gates).not.toContain("privacy_legal_and_owner_candidate_review");
    expect(result.manifest.manual_gates).not.toContain(
      "reviewer_credential_provisioning_and_outside_network_smoke"
    );
    expect(result.manifest.manual_gates).not.toContain(
      "mcp_inspector_chatgpt_and_codex_manual_corpus"
    );
    expect(result.manifest.manual_gates).not.toContain(
      "manual_consent_reviewer_visual_and_accessibility_validation"
    );
    expect(result.manifest.manual_gates).not.toContain(
      "production_migration_and_database_ledger_evidence"
    );
    expect(result.manifest.manual_gates).not.toContain(
      "dns_tls_caddy_monitoring_capacity_and_rollback_evidence"
    );
    expect(result.manifest.manual_gates).not.toContain(
      "owner_approval_and_implementation_of_consent_ui_design"
    );
  });

  it("produces byte-identical ZIP bytes for the same ordered or unordered inputs", () => {
    const program = [
      'import { buildDeterministicZip } from "./scripts/deterministic-zip.mjs";',
      'import { createHash } from "node:crypto";',
      'const entries = [{path:"z.txt",bytes:Buffer.from("z")},{path:"a.txt",bytes:Buffer.from("a")}];',
      "const one = buildDeterministicZip(entries);",
      "const two = buildDeterministicZip([...entries].reverse());",
      'process.stdout.write(JSON.stringify({same:one.equals(two),hash:createHash("sha256").update(one).digest("hex")}));'
    ].join("");
    const first = execFileSync(process.execPath, ["--input-type=module", "--eval", program], {
      cwd: repoRoot,
      encoding: "utf8"
    });
    const second = execFileSync(process.execPath, ["--input-type=module", "--eval", program], {
      cwd: repoRoot,
      encoding: "utf8"
    });

    expect(JSON.parse(first)).toEqual(JSON.parse(second));
    expect(JSON.parse(first)).toMatchObject({ same: true });
  });

  it("keeps the implementation source commit stable across a manifest-only evidence commit", () => {
    const program = [
      'import { execFileSync } from "node:child_process";',
      'import { mkdtempSync, rmSync, writeFileSync } from "node:fs";',
      'import { tmpdir } from "node:os";',
      'import { join } from "node:path";',
      'import { readOpenAiPluginSourceState } from "./scripts/openai-plugin-source-state.mjs";',
      'const root = mkdtempSync(join(tmpdir(), "debugbundle-openai-source-"));',
      'const git = (args, encoding) => execFileSync("git", args, { cwd: root, encoding, stdio: encoding ? undefined : "ignore" });',
      'git(["init", "-q"]);',
      'git(["config", "user.email", "release-test@debugbundle.com"]);',
      'git(["config", "user.name", "DebugBundle Release Test"]);',
      'writeFileSync(join(root, "source.txt"), "one\\n");',
      'writeFileSync(join(root, "release-manifest.json"), "{}\\n");',
      'git(["add", "."]);',
      'git(["commit", "-q", "-m", "source"]);',
      'const sourceCommit = git(["rev-parse", "HEAD"], "utf8").trim();',
      'writeFileSync(join(root, "release-manifest.json"), `${JSON.stringify({ sourceCommit })}\\n`);',
      'git(["add", "release-manifest.json"]);',
      'git(["commit", "-q", "-m", "manifest"]);',
      'const manifestOnly = readOpenAiPluginSourceState({ repoRoot: root, releaseManifestRelativePath: "release-manifest.json", recordedCommit: sourceCommit });',
      'writeFileSync(join(root, "source.txt"), "two\\n");',
      'git(["add", "source.txt"]);',
      'git(["commit", "-q", "-m", "source changed"]);',
      'const changed = readOpenAiPluginSourceState({ repoRoot: root, releaseManifestRelativePath: "release-manifest.json", recordedCommit: sourceCommit });',
      "rmSync(root, { recursive: true, force: true });",
      "process.stdout.write(JSON.stringify({ sourceCommit, manifestOnly, changed }));"
    ].join("");

    const result = JSON.parse(
      execFileSync(process.execPath, ["--input-type=module", "--eval", program], {
        cwd: repoRoot,
        encoding: "utf8"
      })
    ) as {
      sourceCommit: string;
      manifestOnly: { commit: string; tree_clean: boolean };
      changed: { commit: string; tree_clean: boolean };
    };

    expect(result.manifestOnly).toMatchObject({
      commit: result.sourceCommit,
      tree_clean: true
    });
    expect(result.changed.commit).not.toBe(result.sourceCommit);
    expect(result.changed.tree_clean).toBe(true);
  });
});
