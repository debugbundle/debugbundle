export const PROFILE_FILE_PATH = ".debugbundle/profile.json";
export const CONNECTION_FILE_PATH = ".debugbundle/local/connection.json";
export const SKILL_DIRECTORY_PATH = ".agents/skills/debugbundle";
export const SKILL_FILE_PATH = `${SKILL_DIRECTORY_PATH}/SKILL.md`;
export const CLI_REFERENCE_FILE_PATH = `${SKILL_DIRECTORY_PATH}/references/cli.md`;
export const MCP_REFERENCE_FILE_PATH = `${SKILL_DIRECTORY_PATH}/references/mcp.md`;
export const BUNDLE_SCHEMA_REFERENCE_FILE_PATH = `${SKILL_DIRECTORY_PATH}/references/bundle-schema.md`;
export const PROFILE_ENRICHMENT_REFERENCE_FILE_PATH = `${SKILL_DIRECTORY_PATH}/references/profile-enrichment.md`;
export const IMPROVEMENT_ANALYSIS_RECIPE_FILE_PATH = `${SKILL_DIRECTORY_PATH}/assets/schemas/improvement-analysis.json`;
export const PERFORMANCE_ANALYSIS_RECIPE_FILE_PATH = `${SKILL_DIRECTORY_PATH}/assets/schemas/performance-analysis.json`;
export const EVALS_FILE_PATH = `${SKILL_DIRECTORY_PATH}/evals/evals.json`;
export const GITIGNORE_FILE_PATH = ".gitignore";

export const GENERATED_FILE_PATHS = [
  PROFILE_FILE_PATH,
  CONNECTION_FILE_PATH,
  SKILL_FILE_PATH,
  CLI_REFERENCE_FILE_PATH,
  MCP_REFERENCE_FILE_PATH,
  BUNDLE_SCHEMA_REFERENCE_FILE_PATH,
  PROFILE_ENRICHMENT_REFERENCE_FILE_PATH,
  IMPROVEMENT_ANALYSIS_RECIPE_FILE_PATH,
  PERFORMANCE_ANALYSIS_RECIPE_FILE_PATH,
  EVALS_FILE_PATH
] as const;

export const ENSURED_DIRECTORY_PATHS = [
  ".debugbundle/local/events",
  ".debugbundle/bundles/local/reproductions",
  ".debugbundle/bundles/cloud",
  `${SKILL_DIRECTORY_PATH}/references`,
  `${SKILL_DIRECTORY_PATH}/assets/schemas`,
  `${SKILL_DIRECTORY_PATH}/evals`
] as const;

export const OBSOLETE_GENERATED_SCAFFOLD_PATHS = [
  ".debugbundle/agent-guide.md",
  ".debugbundle/skill",
  "skills/debugbundle"
] as const;

const MANAGED_GITIGNORE_LINES = [
  "# DebugBundle (managed by debugbundle setup)",
  ".debugbundle/local/*",
  "!.debugbundle/local/connection.json",
  ".debugbundle/bundles/"
] as const;

export function buildSkill(): string {
  return [
    "---",
    "name: debugbundle",
    "description: >-",
    "  Investigate runtime incidents, inspect debug bundles, generate reproductions,",
    "  and run improvement analysis using the DebugBundle CLI and local project scaffold.",
    "  Use when the user reports a bug, runtime failure, or asks about production incidents.",
    "metadata:",
    "  author: debugbundle",
    '  version: "1.0"',
    "---",
    "",
    "# DebugBundle",
    "",
    "Use DebugBundle before starting a fresh bug investigation.",
    "",
    "## Core Workflow",
    "",
    "1. Check DebugBundle incidents first to avoid re-investigating a known failure.",
    "2. Inspect the incident bundle and reproduction artifact before proposing a fix.",
    "3. Run `debugbundle analyze --type improvement --local` after local processing when you need a deterministic change plan.",
    "4. Apply the narrowest fix, then validate it with the repository test workflow from `.debugbundle/profile.json`.",
    "5. When the fix is confirmed, or when the incident was intentionally generated for smoke, verification, or dogfooding, resolve it with `debugbundle resolve <incident-id>` or MCP `resolve_incident` so the open queue stays actionable.",
    "",
    "## Incident Hygiene",
    "",
    "- Treat `open` as actionable work, not historical record.",
    "- Resolve incidents after the fix is verified or after an intentional test incident has served its purpose.",
    "- Reopen or leave open if the failure is still present, the validation is incomplete, or the incident represents a live unresolved problem.",
    "- If a resolved incident regresses, let the platform move it back to `regressed` through normal incident lifecycle behavior.",
    "",
    "## Profile Validation",
    "",
    "Use this task after setup or whenever architecture changes make the static profile stale.",
    "",
    "1. Read `.debugbundle/profile.json` and confirm services, frameworks, and workflows match the repository.",
    "2. Fill in missing critical paths, ownership notes, and integration boundaries.",
    "3. Update `debugbundle.validation_status` to `agent-validated` when the profile is trustworthy.",
    "",
    "## Setup Verification",
    "",
    "- Run `debugbundle doctor` to confirm the profile, connection mode, auth state, and connected API reachability when the project is cloud-enabled.",
    "- Run `debugbundle validate --fix` to restore missing generated setup files without overwriting the profile.",
    "- Run `debugbundle process` after local events land in `.debugbundle/local/events/`.",
    "",
    "## References",
    "",
    "- CLI reference: `references/cli.md`",
    "- MCP reference: `references/mcp.md`",
    "- Bundle schema: `references/bundle-schema.md`",
    "- Profile enrichment guide: `references/profile-enrichment.md`",
    "",
    "## Analysis Recipes",
    "",
    "- Improvement recipe: `assets/schemas/improvement-analysis.json`",
    "- Performance recipe: `assets/schemas/performance-analysis.json`",
    ""
  ].join("\n");
}

export function buildCliReference(): string {
  return [
    "# DebugBundle CLI Reference",
    "",
    "## Setup",
    "",
    "- `debugbundle setup [--non-interactive] [--json]`",
    "- `debugbundle doctor [--json]`",
    "- `debugbundle validate [--fix] [--json]`",
    "- `debugbundle ingest <file> --format <format> [--json]`",
    "- `debugbundle watch --log <file> --format <format> [--json]`",
    "- `debugbundle watch --cloud --log <file> --format <format> [--json]`",
    "- `debugbundle process [--json]`",
    "",
    "## Investigation",
    "",
    "- `debugbundle incidents`",
    "- `debugbundle inspect <incident-id>`",
    "- `debugbundle bundle <incident-id>`",
    "- `debugbundle reproduce <incident-id>`",
    "- `debugbundle resolve <incident-id>`",
    "- `debugbundle reopen <incident-id>`",
    "- `debugbundle analyze --type improvement --local`",
    "",
    "## Incident Hygiene",
    "",
    "Resolve incidents after a fix is verified or after an intentional smoke, dogfood, or verification incident has served its purpose.",
    "Leave incidents open when the failure is still live or the fix is not yet confirmed.",
    "",
    "### Smoke-Test Cleanup Recipe",
    "",
    "Review open incidents and resolve the intentionally generated ones:",
    "",
    "```bash",
    "debugbundle incidents --status open --json",
    "debugbundle resolve <incident-id>",
    "debugbundle incidents --status open --json",
    "```",
    "",
    "If you want a title-based batch cleanup and have `jq` available:",
    "",
    "```bash",
    "debugbundle incidents --status open --json \\",
    "  | jq -r '.incidents[] | select(.title | test(\"smoke test|dogfood|verification|synthetic\"; \"i\")) | .incident_id' \\",
    "  | xargs -n1 debugbundle resolve",
    "```",
    ""
  ].join("\n");
}

export function buildMcpReference(): string {
  return [
    "# DebugBundle MCP Reference",
    "",
    "Use the same incident-first workflow through MCP when an agent is operating in connected mode.",
    "",
    "- Prefer bundle retrieval tools before reading raw repository files.",
    "- Use MCP bundle access when the current issue originated in production.",
    "- Resolve fixed or intentionally generated incidents with `resolve_incident` so open incidents stay actionable.",
    "- Fall back to local CLI processing when the project is local-only.",
    "",
    "## Smoke-Test Cleanup Recipe",
    "",
    "1. Call `list_incidents` with `status: \"open\"`.",
    "2. Filter incidents whose titles show they were intentionally generated for smoke, dogfood, verification, or synthetic checks.",
    "3. Call `resolve_incident` for each verified synthetic incident.",
    "4. Call `list_incidents` again and confirm the open queue only contains actionable failures.",
    ""
  ].join("\n");
}

export function buildBundleSchemaReference(): string {
  return [
    "# Bundle Schema Reference",
    "",
    "Bundle artifacts describe a normalized incident with deterministic metadata, evidence, and reproduction guidance.",
    "",
    "Focus on:",
    "- `summary` for the failure synopsis and recommended action",
    "- `service` and `environment` for routing to the right code path",
    "- `links.reproduction` for the generated reproduction artifact",
    "- `metadata.source` for whether the bundle came from local or cloud data",
    ""
  ].join("\n");
}

export function buildProfileEnrichmentReference(): string {
  return [
    "# Profile Enrichment",
    "",
    "The setup profile is generated from static analysis and must be reviewed before agents rely on it for architecture decisions.",
    "",
    "Checklist:",
    "- verify service kinds, frameworks, and runtime assumptions",
    "- add critical paths and ownership notes",
    "- confirm build, test, and lint workflows",
    "- update `debugbundle.validation_status` to `agent-validated` when complete",
    ""
  ].join("\n");
}

function buildAnalysisRecipe(recipe: {
  analysisType: "improvement" | "performance";
  goal: string;
  focusAreas: string[];
  requiredInputs: string[];
  outputSections: string[];
}): string {
  return `${JSON.stringify(
    {
      schema_version: "v1",
      analysis_type: recipe.analysisType,
      goal: recipe.goal,
      required_inputs: recipe.requiredInputs,
      focus_areas: recipe.focusAreas,
      output_sections: recipe.outputSections
    },
    null,
    2
  )}\n`;
}

export function buildImprovementAnalysisRecipe(): string {
  return buildAnalysisRecipe({
    analysisType: "improvement",
    goal: "Turn the latest local DebugBundle failure evidence into a deterministic improvement plan.",
    focusAreas: [
      "Identify the most likely code path to change first.",
      "Explain why the current failure happens with the available bundle evidence.",
      "Propose a narrow code change and the validation steps needed to confirm it."
    ],
    requiredInputs: [
      ".debugbundle/profile.json",
      ".debugbundle/bundles/local/*.bundle.json",
      "Relevant repository source files"
    ],
    outputSections: ["root_cause_hypothesis", "recommended_code_changes", "validation_plan"]
  });
}

export function buildPerformanceAnalysisRecipe(): string {
  return buildAnalysisRecipe({
    analysisType: "performance",
    goal: "Review the latest local DebugBundle evidence for deterministic performance improvements.",
    focusAreas: [
      "Identify the primary latency or throughput bottleneck.",
      "Call out the most likely constrained dependency or code path.",
      "Recommend the smallest measurable optimization and how to verify it."
    ],
    requiredInputs: [
      ".debugbundle/profile.json",
      ".debugbundle/bundles/local/*.bundle.json",
      "Relevant repository source files"
    ],
    outputSections: ["performance_hypothesis", "optimization_plan", "measurement_plan"]
  });
}

export function buildSkillEvals(): string {
  return `${JSON.stringify(
    {
      schema_version: "v1",
      skill: "debugbundle",
      evaluations: [
        {
          name: "incident_first_workflow",
          prompt: "The user reports a production checkout failure. Confirm the skill tells the agent to inspect DebugBundle artifacts first.",
          expected_behavior: [
            "Check incidents before reading arbitrary source files.",
            "Read the skill workflow before proposing a fix."
          ]
        },
        {
          name: "profile_validation_task",
          prompt: "The generated profile is shallow. Confirm the skill teaches the agent how to validate and enrich it.",
          expected_behavior: [
            "Read .debugbundle/profile.json.",
            "Update validation_status when the profile has been reviewed."
          ]
        },
        {
          name: "incident_resolution_hygiene",
          prompt: "A bug was fixed and a smoke-test incident was intentionally triggered during verification. Confirm the skill teaches the agent to resolve that incident once the check passes.",
          expected_behavior: [
            "Resolve verified or intentionally generated incidents after the workflow is complete.",
            "Leave unresolved incidents open when the failure is still live or unverified."
          ]
        }
      ]
    },
    null,
    2
  )}\n`;
}

export function buildConnectionConfig(): string {
  return `${JSON.stringify(
    {
      mode: "local-only",
      cloud_project_id: null,
      cloud_base_url: null,
      environments: {
        local: { delivery: "local-only" },
        development: { delivery: "local-only" },
        staging: { delivery: "local-only" },
        production: { delivery: "local-only" }
      }
    },
    null,
    2
  )}\n`;
}

export function buildManagedGitignoreSection(): string {
  return `${MANAGED_GITIGNORE_LINES.join("\n")}\n`;
}