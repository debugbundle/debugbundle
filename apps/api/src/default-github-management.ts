import {
  createPostgresGitHubStore,
  runInTransaction,
  type AccountAnalyticsStore,
  type Queryable,
  type createPostgresGitHubMarketplaceStore,
  type createPostgresMetadataStore
} from "../../../packages/storage/src/index.js";

import type { ApiDependencies } from "./api-types.js";
import type { createBillingManagement } from "./billing-management.js";
import type { GitHubAppClient } from "./github-app.js";

type GitHubStore = ReturnType<typeof createPostgresGitHubStore>;
type GitHubMarketplaceStore = ReturnType<typeof createPostgresGitHubMarketplaceStore>;
type MetadataStore = ReturnType<typeof createPostgresMetadataStore>;
type BillingManagementServices = ReturnType<typeof createBillingManagement>;

export function createDefaultGitHubManagement(input: {
  accountAnalyticsStore?: AccountAnalyticsStore;
  billingManagementServices: BillingManagementServices;
  db: Queryable;
  githubAppClient: GitHubAppClient;
  githubMarketplaceStore: GitHubMarketplaceStore;
  githubStore: GitHubStore;
  metadataStore: MetadataStore;
}): NonNullable<ApiDependencies["githubManagement"]> {
  return {
    getInstallUrl: () => input.githubAppClient.getInstallUrl(),
    getInstallationForOrganization: (request) => input.githubStore.getGitHubInstallationForOrganization(request),
    disconnectInstallationForOrganization: (request) =>
      input.githubStore.deleteGitHubInstallationForOrganization(request),
    async listRepositoriesForOrganization(requestInput) {
      const installation = await input.githubStore.getGitHubInstallationForOrganization({
        organization_id: requestInput.organization_id
      });
      if (installation === null) {
        return "installation_not_found";
      }
      if (installation.status === "suspended") {
        return "installation_suspended";
      }
      if (installation.status === "removed") {
        return "installation_removed";
      }

      return input.githubAppClient.listRepositories({ installationId: installation.installation_id });
    },
    getProjectRepoForOrganization: (request) => input.githubStore.getProjectGitHubRepoForOrganization(request),
    listProjectDeliveriesForOrganization: (request) =>
      input.githubStore.listProjectGitHubDeliveriesForOrganization(request),
    async retryProjectDeliveryForOrganization(requestInput) {
      const installation = await input.githubStore.getGitHubInstallationForOrganization({
        organization_id: requestInput.organization_id
      });
      if (installation === null) {
        return "installation_not_found";
      }
      if (installation.status === "suspended") {
        return "installation_suspended";
      }
      if (installation.status === "removed") {
        return "installation_removed";
      }

      const repo = await input.githubStore.getProjectGitHubRepoForOrganization({
        organization_id: requestInput.organization_id,
        project_id: requestInput.project_id
      });
      if (repo === null) {
        return "repo_not_found";
      }

      const retried = await input.githubStore.retryProjectGitHubDeliveryForOrganization(requestInput);
      return retried ?? "delivery_not_found";
    },
    listProjectRulesForOrganization: (request) =>
      input.githubStore.listProjectGitHubRulesForOrganization(request),
    getProjectRuleForOrganization: (request) => input.githubStore.getProjectGitHubRuleForOrganization(request),
    async createProjectRuleForOrganization(requestInput) {
      const repo = await input.githubStore.getProjectGitHubRepoForOrganization({
        organization_id: requestInput.organization_id,
        project_id: requestInput.project_id
      });
      if (repo === null) {
        const scopedProject = await input.metadataStore.listProjectsForOrganization({
          organization_id: requestInput.organization_id,
          now: new Date().toISOString(),
          limit: 1_000
        });

        return scopedProject.some((project) => project.project_id === requestInput.project_id)
          ? "repo_not_found"
          : "project_not_found";
      }

      const billingSummary = await input.billingManagementServices.getProjectedBillingSummary({
        organization_id: requestInput.organization_id,
        now: new Date().toISOString()
      });
      const ruleLimit = billingSummary?.plan === "team" ? 20 : 3;
      const existingRules =
        (await input.githubStore.listProjectGitHubRulesForOrganization({
          organization_id: requestInput.organization_id,
          project_id: requestInput.project_id
        })) ?? [];
      if (existingRules.length >= ruleLimit) {
        return "rule_limit_reached";
      }

      const created = await runInTransaction(input.db, async (tx) => {
        const txGitHubStore = createPostgresGitHubStore(tx);
        const createdRule = await txGitHubStore.createProjectGitHubRuleForOrganization(requestInput);

        if (createdRule !== null && input.accountAnalyticsStore !== undefined) {
          await input.accountAnalyticsStore.withDb(tx).recordMetricDeltas({
            organization_id: requestInput.organization_id,
            occurred_at: createdRule.created_at,
            source: "github_dispatch_rule_created",
            dedupe_key: `github_dispatch_rule_created:${createdRule.rule_id}`,
            deltas: {
              github_dispatch_rules_created: 1
            }
          });
        }

        return createdRule;
      });
      return created ?? "project_not_found";
    },
    async updateProjectRuleForOrganization(requestInput) {
      const updated = await input.githubStore.updateProjectGitHubRuleForOrganization(requestInput);
      return updated ?? "rule_not_found";
    },
    deleteProjectRuleForOrganization: async (requestInput) =>
      runInTransaction(input.db, async (tx) => {
        const txGitHubStore = createPostgresGitHubStore(tx);
        const deleted = await txGitHubStore.deleteProjectGitHubRuleForOrganization(requestInput);

        if (deleted && input.accountAnalyticsStore !== undefined) {
          await input.accountAnalyticsStore.withDb(tx).recordMetricDeltas({
            organization_id: requestInput.organization_id,
            occurred_at: new Date().toISOString(),
            source: "github_dispatch_rule_deleted",
            dedupe_key: `github_dispatch_rule_deleted:${requestInput.rule_id}`,
            deltas: {
              github_dispatch_rules_deleted: 1
            }
          });
        }

        return deleted;
      }),
    async setProjectRepoForOrganization(requestInput) {
      const installation = await input.githubStore.getGitHubInstallationForOrganization({
        organization_id: requestInput.organization_id
      });
      if (installation === null) {
        return "installation_not_found";
      }
      if (installation.status === "suspended") {
        return "installation_suspended";
      }
      if (installation.status === "removed") {
        return "installation_removed";
      }

      const repositories = await input.githubAppClient.listRepositories({
        installationId: installation.installation_id
      });
      const repository = repositories.find(
        (candidate) => candidate.owner === requestInput.owner && candidate.name === requestInput.repo
      );
      if (repository === undefined) {
        return "repo_not_found";
      }

      const stored = await input.githubStore.upsertProjectGitHubRepoForOrganization({
        organization_id: requestInput.organization_id,
        project_id: requestInput.project_id,
        installation_id: installation.id,
        repo_owner: repository.owner,
        repo_name: repository.name,
        default_branch: repository.default_branch
      });

      if (stored === null) {
        return "project_not_found";
      }

      const existingRules = await input.githubStore.listProjectGitHubRulesForOrganization({
        organization_id: requestInput.organization_id,
        project_id: requestInput.project_id
      });
      if (existingRules === null || existingRules.length === 0) {
        await runInTransaction(input.db, async (tx) => {
          const txGitHubStore = createPostgresGitHubStore(tx);
          const defaultRule = await txGitHubStore.createProjectGitHubRuleForOrganization({
            organization_id: requestInput.organization_id,
            project_id: requestInput.project_id,
            created_by_user_id: requestInput.created_by_user_id,
            name: "Default triage rule",
            enabled: true,
            event_types: ["bundle.created", "bundle.reopened"],
            environments: [],
            services: [],
            severity_min: "high",
            bundle_type: null,
            incident_status: "new_or_reopened",
            cooldown_seconds: 300
          });

          if (defaultRule !== null && input.accountAnalyticsStore !== undefined) {
            await input.accountAnalyticsStore.withDb(tx).recordMetricDeltas({
              organization_id: requestInput.organization_id,
              occurred_at: defaultRule.created_at,
              source: "github_dispatch_rule_created",
              dedupe_key: `github_dispatch_rule_created:${defaultRule.rule_id}`,
              deltas: {
                github_dispatch_rules_created: 1
              }
            });
          }
        });
      }

      return stored;
    },
    removeProjectRepoForOrganization: (request) =>
      input.githubStore.deleteProjectGitHubRepoForOrganization(request),
    async completeGithubInstallationForOrganization(requestInput) {
      const installation = await input.githubAppClient.getInstallation({
        installationId: requestInput.installation_id
      });

      const storedInstallation = await input.githubStore.upsertGitHubInstallationForOrganization({
        organization_id: requestInput.organization_id,
        installation_id: installation.installation_id,
        account_login: installation.account_login,
        account_type: installation.account_type,
        status: "active"
      });

      await input.githubMarketplaceStore.linkOrganizationToMarketplaceAccountByInstallationId({
        organization_id: requestInput.organization_id,
        installation_id: installation.installation_id
      });

      return storedInstallation;
    },
    verifyWebhookSignature: (request) => input.githubAppClient.verifyWebhookSignature(request),
    async processWebhook(request) {
      if (request.eventName !== "installation") {
        return;
      }

      const installation =
        typeof request.payload["installation"] === "object" && request.payload["installation"] !== null
          ? (request.payload["installation"] as Record<string, unknown>)
          : null;
      const installationId = installation?.["id"];
      if (typeof installationId !== "number") {
        return;
      }

      const action = request.payload["action"];
      const nextStatus =
        action === "deleted"
          ? "removed"
          : action === "suspend"
            ? "suspended"
            : action === "unsuspend" || action === "created"
              ? "active"
              : null;
      if (nextStatus === null) {
        return;
      }

      const account =
        typeof installation?.["account"] === "object" && installation["account"] !== null
          ? (installation["account"] as Record<string, unknown>)
          : null;

      await input.githubStore.updateGitHubInstallationStatus({
        installation_id: installationId,
        status: nextStatus,
        ...(typeof account?.["login"] === "string" ? { account_login: account["login"] } : {}),
        ...(account?.["type"] === "Organization" || account?.["type"] === "User"
          ? { account_type: account["type"] }
          : {})
      });
    }
  };
}
