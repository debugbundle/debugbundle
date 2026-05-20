import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { buildPublicOpenApiSpec } from '../apps/api/src/openapi.js';
import { ProfileSchema } from '../apps/cli/src/profile-validation.js';
import { CLI_USAGE_LINES } from '../apps/cli/src/usage.js';
import { MCP_TOOL_CATALOG } from '../apps/mcp/src/tool-catalog.js';
import { BundleV1Schema } from '../packages/shared-types/src/index.js';
import { WebhookEventPayloadSchema, WebhookEventTypeSchema } from '../packages/webhook-client/src/index.js';

type MachineReadableArtifact = {
  routePath: string;
  contentType: 'application/json' | 'text/plain';
  content: string;
};

type JsonSchemaDocument = Record<string, unknown>;

type OpenApiOperation = {
  operationId?: string;
  summary?: string;
  tags?: string[];
  security?: Array<Record<string, []>>;
};

type OpenApiDocument = {
  paths?: Record<string, Record<string, OpenApiOperation>>;
};

type SchemaReferenceLink = {
  title: string;
  href: string;
  description: string;
};

type ApiReferenceEntry = {
  method: string;
  path: string;
  operationId: string;
  summary: string;
  tags: string[];
  auth: string[];
};

type CliReferenceEntry = {
  commandPath: string;
  usage: string;
  group: string;
};

type McpToolReferenceEntry = {
  name: string;
  description: string;
  requiredArguments: string[];
  optionalArguments: string[];
};

type McpToolReferenceGroup = {
  group: string;
  label: string;
  tools: McpToolReferenceEntry[];
};

type ErrorCodeReference = {
  codes: Array<{ code: string; statusCodes: string[] }>;
  categories: string[];
};

type ReferenceData = {
  release: {
    coreVersion: string;
  };
  apiEntries: ApiReferenceEntry[];
  cliEntries: CliReferenceEntry[];
  mcpGroups: McpToolReferenceGroup[];
  webhookReference: {
    eventTypes: string[];
    schemaPath: string;
    overviewPath: string;
  };
  schemaLinks: SchemaReferenceLink[];
  errorReference: ErrorCodeReference;
};

const workspaceRoot = fileURLToPath(new URL('..', import.meta.url));
const publicDirectory = join(workspaceRoot, 'site', 'public');
const currentScriptPath = fileURLToPath(import.meta.url);

const publicSiteConfig = {
  domain: 'https://debugbundle.com',
  appUrl: 'https://app.debugbundle.com',
  docsHome: '/docs/',
} as const;

const securityLabelMap: Record<string, string> = {
  browserSession: 'Browser session',
  memberBearerToken: 'Member bearer token',
  projectBearerToken: 'Project bearer token',
};

const mcpGroupLabels: Record<string, string> = {
  alerts: 'Alerts',
  analyze: 'Analyze',
  projects: 'Projects',
  retrieval: 'Retrieval',
  services: 'Services',
  setup: 'Setup',
  tokens: 'Tokens',
  webhooks: 'Webhooks',
  weekly_reports: 'Weekly reports',
};

function ensureTrailingNewline(content: string): string {
  return content.endsWith('\n') ? content : `${content}\n`;
}

function withPublicSchemaMetadata(input: {
  routePath: string;
  title: string;
  document: JsonSchemaDocument;
}): JsonSchemaDocument {
  return {
    ...input.document,
    $schema: 'https://json-schema.org/draft/2020-12/schema#',
    $id: `https://debugbundle.com${input.routePath}`,
    title: input.title,
  };
}

function toEmbeddedJsonSchema(schema: unknown): JsonSchemaDocument {
  return zodToJsonSchema(schema as never, {
    target: 'jsonSchema2019-09',
    $refStrategy: 'none',
    definitionPath: '$defs',
  }) as JsonSchemaDocument;
}

function toPublicJsonSchema(input: {
  routePath: string;
  title: string;
  schema: unknown;
}): JsonSchemaDocument {
  return withPublicSchemaMetadata({
    routePath: input.routePath,
    title: input.title,
    document: toEmbeddedJsonSchema(input.schema),
  });
}

function toSchemaDefinitionName(toolName: string): string {
  return `${toolName.replace(/[^a-zA-Z0-9]+/g, '_')}Arguments`;
}

function buildMcpToolInvocationSchema(): JsonSchemaDocument {
  const definitions = Object.fromEntries(
    MCP_TOOL_CATALOG.map((tool) => [toSchemaDefinitionName(tool.name), toEmbeddedJsonSchema(tool.inputSchema)]),
  );

  return withPublicSchemaMetadata({
    routePath: '/schemas/mcp-tools.json',
    title: 'DebugBundle MCP Tool Invocation Schema',
    document: {
      description: 'Source-backed invocation schema for the MCP tools currently implemented in DebugBundle.',
      type: 'object',
      oneOf: MCP_TOOL_CATALOG.map((tool) => ({
        type: 'object',
        additionalProperties: false,
        required: ['name', 'arguments'],
        properties: {
          name: {
            type: 'string',
            const: tool.name,
            description: tool.description,
          },
          arguments: {
            $ref: `#/$defs/${toSchemaDefinitionName(tool.name)}`,
          },
        },
      })),
      $defs: definitions,
    },
  });
}

function toAbsoluteUrl(path: string): string {
  return new URL(path, publicSiteConfig.domain).toString();
}

function buildLlmsTxt(): string {
  return ensureTrailingNewline(
    [
      '# DebugBundle',
      '',
      'DebugBundle captures runtime failures, groups them into incidents, and publishes deterministic debug bundles for humans and AI agents.',
      '',
      `Primary docs: ${toAbsoluteUrl(publicSiteConfig.docsHome)}`,
      `App: ${publicSiteConfig.appUrl}`,
      '',
      'Start here',
      `- What is DebugBundle: ${toAbsoluteUrl('/docs/what-is-debugbundle/')}`,
      `- Quickstart: ${toAbsoluteUrl('/docs/quickstart/')}`,
      `- Installation: ${toAbsoluteUrl('/docs/installation/')}`,
      `- How it works: ${toAbsoluteUrl('/docs/how-it-works/')}`,
      `- Core concepts: ${toAbsoluteUrl('/docs/core-concepts/')}`,
      '',
      'Setup paths',
      `- Local-only mode: ${toAbsoluteUrl('/docs/project-setup/local-only/')}`,
      `- Connect to Cloud: ${toAbsoluteUrl('/docs/project-setup/connect-to-cloud/')}`,
      `- Project setup: ${toAbsoluteUrl('/docs/project-setup/')}`,
      `- Profile configuration: ${toAbsoluteUrl('/docs/project-setup/profile/')}`,
      '',
      'Capture and integration docs',
      `- SDK overview: ${toAbsoluteUrl('/docs/sdks/')}`,
      `- Node.js SDK: ${toAbsoluteUrl('/docs/sdks/node/')}`,
      `- Browser SDK: ${toAbsoluteUrl('/docs/sdks/browser/')}`,
      `- Browser relay: ${toAbsoluteUrl('/docs/sdks/browser-relay/')}`,
      `- Python SDK: ${toAbsoluteUrl('/docs/sdks/python/')}`,
      `- PHP SDK: ${toAbsoluteUrl('/docs/sdks/php/')}`,
      `- Universal SDK interface: ${toAbsoluteUrl('/docs/sdks/universal-interface/')}`,
      `- WordPress integration: ${toAbsoluteUrl('/docs/integrations/wordpress/')}`,
      `- Log ingestion: ${toAbsoluteUrl('/docs/cli/log-ingestion/')}`,
      '',
      'Interfaces',
      `- CLI overview: ${toAbsoluteUrl('/docs/cli/')}`,
      `- CLI local workflow: ${toAbsoluteUrl('/docs/cli/local-workflow/')}`,
      `- CLI cloud workflow: ${toAbsoluteUrl('/docs/cli/cloud-workflow/')}`,
      `- API overview: ${toAbsoluteUrl('/docs/api/')}`,
      `- MCP overview: ${toAbsoluteUrl('/docs/mcp/')}`,
      `- MCP tools: ${toAbsoluteUrl('/docs/mcp/tools/')}`,
      '',
      'Bundles, automation, and operations',
      `- Bundles: ${toAbsoluteUrl('/docs/bundles/')}`,
      `- Improvement bundles: ${toAbsoluteUrl('/docs/bundles/improvement-bundles/')}`,
      `- Incidents: ${toAbsoluteUrl('/docs/incidents/')}`,
      `- Reproduction artifacts: ${toAbsoluteUrl('/docs/incidents/reproduction/')}`,
      `- Probes: ${toAbsoluteUrl('/docs/probes/')}`,
      `- Webhooks: ${toAbsoluteUrl('/docs/webhooks/')}`,
      `- Webhook events: ${toAbsoluteUrl('/docs/webhooks/events/')}`,
      `- Alerts: ${toAbsoluteUrl('/docs/alerts/')}`,
      `- GitHub automation: ${toAbsoluteUrl('/docs/agent-workflows/automation-recipes/')}`,
      `- Agent workflows: ${toAbsoluteUrl('/docs/agent-workflows/')}`,
      `- Agent skill file: ${toAbsoluteUrl('/docs/agent-workflows/skill-file/')}`,
      '',
      'Generated reference',
      `- Reference index: ${toAbsoluteUrl('/docs/v1/reference/')}`,
      `- API endpoints: ${toAbsoluteUrl('/docs/v1/reference/api-endpoints/')}`,
      `- CLI commands: ${toAbsoluteUrl('/docs/v1/reference/cli-commands/')}`,
      `- MCP tools reference: ${toAbsoluteUrl('/docs/v1/reference/mcp-tools/')}`,
      `- Webhook events reference: ${toAbsoluteUrl('/docs/v1/reference/webhook-events/')}`,
      `- Bundle schema reference: ${toAbsoluteUrl('/docs/v1/reference/bundle-schema/')}`,
      `- Profile schema reference: ${toAbsoluteUrl('/docs/v1/reference/profile-schema/')}`,
      `- Error codes: ${toAbsoluteUrl('/docs/v1/reference/error-codes/')}`,
      '',
      'Machine-readable artifacts',
      `- OpenAPI: ${toAbsoluteUrl('/openapi.json')}`,
      `- Bundle schema: ${toAbsoluteUrl('/schemas/bundle.json')}`,
      `- Profile schema: ${toAbsoluteUrl('/schemas/profile.json')}`,
      `- Webhook events schema: ${toAbsoluteUrl('/schemas/webhook-events.json')}`,
      `- MCP tools schema: ${toAbsoluteUrl('/schemas/mcp-tools.json')}`,
      '',
      'Examples',
      `- Failure bundle example: ${toAbsoluteUrl('/examples/bundle.failure.json')}`,
      `- Improvement bundle example: ${toAbsoluteUrl('/examples/bundle.improvement.json')}`,
      '',
      'Agent guidance',
      '- Prefer MCP tools when the environment exposes the DebugBundle MCP server.',
      '- Prefer the CLI for local-only projects or repositories with a .debugbundle directory.',
      '- Use the API and generated reference pages for custom automation.',
      '- Use the browser relay path when adding browser capture to projects with a backend.',
    ].join('\n'),
  );
}

async function readExampleBundle(fileName: string): Promise<string> {
  return readFile(join(workspaceRoot, 'examples', fileName), 'utf8');
}

function toTitleCase(value: string): string {
  return value
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function sortMethods(left: string, right: string): number {
  const order = ['get', 'post', 'patch', 'delete'];
  return order.indexOf(left) - order.indexOf(right);
}

function getCommandPathFromUsage(usage: string): string {
  const tokens = usage.replace(/^debugbundle\s+/, '').split(/\s+/);
  const commandTokens: string[] = [];

  for (const token of tokens) {
    if (token.startsWith('<') || token.startsWith('[') || token.startsWith('--')) {
      break;
    }
    commandTokens.push(token);
  }

  return commandTokens.join(' ');
}

function buildApiReferenceEntries(): ApiReferenceEntry[] {
  const document = buildPublicOpenApiSpec() as OpenApiDocument;
  const entries: ApiReferenceEntry[] = [];

  for (const [path, methods] of Object.entries(document.paths ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
    for (const [method, operation] of Object.entries(methods).sort(([left], [right]) => sortMethods(left, right))) {
      const auth = Array.from(
        new Set(
          (operation.security ?? [])
            .flatMap((requirement) => Object.keys(requirement))
            .map((key) => securityLabelMap[key] ?? toTitleCase(key)),
        ),
      );

      entries.push({
        method: method.toUpperCase(),
        path,
        operationId: operation.operationId ?? `${method}:${path}`,
        summary: operation.summary ?? operation.operationId ?? 'Undocumented operation',
        tags: operation.tags ?? [],
        auth: auth.length > 0 ? auth : ['Public'],
      });
    }
  }

  return entries;
}

function buildCliReferenceEntries(): CliReferenceEntry[] {
  return CLI_USAGE_LINES.filter((line) => line.startsWith('  debugbundle ')).map((line) => {
    const usage = line.trim();
    const commandPath = getCommandPathFromUsage(usage);

    return {
      commandPath,
      usage,
      group: commandPath.split(' ')[0] ?? 'general',
    };
  });
}

function buildMcpToolReferenceGroups(): McpToolReferenceGroup[] {
  const groups = new Map<string, McpToolReferenceEntry[]>();

  for (const tool of MCP_TOOL_CATALOG) {
    if (!(tool.inputSchema instanceof z.ZodObject)) {
      continue;
    }

    const shape: Record<string, z.ZodTypeAny> = tool.inputSchema.shape;
    const argumentNames = Object.keys(shape).sort();
    const requiredArguments = argumentNames.filter((key) => !shape[key]?.isOptional());
    const currentTools = groups.get(tool.group) ?? [];

    currentTools.push({
      name: tool.name,
      description: tool.description,
      requiredArguments,
      optionalArguments: argumentNames.filter((key) => !requiredArguments.includes(key)),
    });
    groups.set(tool.group, currentTools);
  }

  return Array.from(groups.entries()).map(([group, tools]) => ({
    group,
    label: mcpGroupLabels[group] ?? toTitleCase(group),
    tools: tools.sort((left, right) => left.name.localeCompare(right.name)),
  }));
}

function buildWebhookReference(): ReferenceData['webhookReference'] {
  return {
    eventTypes: [...WebhookEventTypeSchema.options],
    schemaPath: '/schemas/webhook-events.json',
    overviewPath: '/docs/v1/webhooks/',
  };
}

function buildSchemaReferenceLinks(): SchemaReferenceLink[] {
  return [
    {
      title: 'Bundle schema',
      href: '/schemas/bundle.json',
      description: 'The published JSON Schema for bundle artifacts.',
    },
    {
      title: 'Profile schema',
      href: '/schemas/profile.json',
      description: 'The published JSON Schema for repository profile files.',
    },
    {
      title: 'Failure bundle example',
      href: '/examples/bundle.failure.json',
      description: 'A schema-valid failure bundle example artifact.',
    },
    {
      title: 'Improvement bundle example',
      href: '/examples/bundle.improvement.json',
      description: 'A schema-valid improvement bundle example artifact.',
    },
  ];
}

async function buildErrorCodeReference(): Promise<ErrorCodeReference> {
  const contract = await readFile(join(workspaceRoot, 'contracts', 'public-interfaces.md'), 'utf8');
  const codes = new Map<string, Set<string>>();
  const errorCodePattern = /`(\d{3}) \{ "error": "([^"]+)" \}`/g;
  let match = errorCodePattern.exec(contract);

  while (match !== null) {
    const statusCode = match[1];
    const code = match[2];
    if (statusCode !== undefined && code !== undefined) {
      const statusCodes = codes.get(code) ?? new Set<string>();
      statusCodes.add(statusCode);
      codes.set(code, statusCodes);
    }
    match = errorCodePattern.exec(contract);
  }

  const categoriesMatch = contract.match(/Structured error categories:\s*`([^`]+)`/);

  return {
    codes: Array.from(codes.entries())
      .map(([code, statusCodes]) => ({ code, statusCodes: Array.from(statusCodes).sort() }))
      .sort((left, right) => left.code.localeCompare(right.code)),
    categories: categoriesMatch?.[1] ? categoriesMatch[1].split(',').map((value) => value.trim()) : [],
  };
}

export async function buildMachineReadableArtifacts(): Promise<MachineReadableArtifact[]> {
  const [failureBundle, improvementBundle] = await Promise.all([
    readExampleBundle('bundle.failure.json'),
    readExampleBundle('bundle.improvement.json'),
  ]);

  return [
    {
      routePath: '/llms.txt',
      contentType: 'text/plain',
      content: buildLlmsTxt(),
    },
    {
      routePath: '/openapi.json',
      contentType: 'application/json',
      content: ensureTrailingNewline(JSON.stringify(buildPublicOpenApiSpec(), null, 2)),
    },
    {
      routePath: '/schemas/bundle.json',
      contentType: 'application/json',
      content: ensureTrailingNewline(
        JSON.stringify(
          toPublicJsonSchema({
            routePath: '/schemas/bundle.json',
            title: 'DebugBundle Bundle v1 Schema',
            schema: BundleV1Schema,
          }),
          null,
          2,
        ),
      ),
    },
    {
      routePath: '/schemas/profile.json',
      contentType: 'application/json',
      content: ensureTrailingNewline(
        JSON.stringify(
          toPublicJsonSchema({
            routePath: '/schemas/profile.json',
            title: 'DebugBundle Repository Profile Schema',
            schema: ProfileSchema,
          }),
          null,
          2,
        ),
      ),
    },
    {
      routePath: '/schemas/webhook-events.json',
      contentType: 'application/json',
      content: ensureTrailingNewline(
        JSON.stringify(
          toPublicJsonSchema({
            routePath: '/schemas/webhook-events.json',
            title: 'DebugBundle Webhook Event Payload Schema',
            schema: WebhookEventPayloadSchema,
          }),
          null,
          2,
        ),
      ),
    },
    {
      routePath: '/schemas/mcp-tools.json',
      contentType: 'application/json',
      content: ensureTrailingNewline(JSON.stringify(buildMcpToolInvocationSchema(), null, 2)),
    },
    {
      routePath: '/examples/bundle.failure.json',
      contentType: 'application/json',
      content: ensureTrailingNewline(failureBundle),
    },
    {
      routePath: '/examples/bundle.improvement.json',
      contentType: 'application/json',
      content: ensureTrailingNewline(improvementBundle),
    },
  ];
}

export async function writeMachineReadableArtifacts(outputDirectory: string = publicDirectory): Promise<void> {
  const artifacts = await buildMachineReadableArtifacts();

  for (const artifact of artifacts) {
    const outputPath = join(outputDirectory, artifact.routePath.replace(/^\//, ''));
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, artifact.content, 'utf8');
  }
}

async function readWorkspacePackageVersion(): Promise<string> {
  const raw = await readFile(join(workspaceRoot, 'package.json'), 'utf8');
  const parsed = z.object({ version: z.string().min(1) }).parse(JSON.parse(raw));
  return parsed.version;
}

export async function buildReferenceData(): Promise<ReferenceData> {
  return {
    release: {
      coreVersion: await readWorkspacePackageVersion(),
    },
    apiEntries: buildApiReferenceEntries(),
    cliEntries: buildCliReferenceEntries(),
    mcpGroups: buildMcpToolReferenceGroups(),
    webhookReference: buildWebhookReference(),
    schemaLinks: buildSchemaReferenceLinks(),
    errorReference: await buildErrorCodeReference(),
  };
}

export async function writeReferenceData(outputPath: string = join(publicDirectory, 'reference-data.json')): Promise<void> {
  const data = await buildReferenceData();
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function main(): Promise<void> {
  await Promise.all([writeMachineReadableArtifacts(), writeReferenceData()]);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === currentScriptPath) {
  await main();
}

export type { MachineReadableArtifact, ReferenceData };
