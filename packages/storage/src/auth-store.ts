import { randomUUID } from "node:crypto";

import type {
  EmailAuthChallengeStore,
  GitHubCliAuthStore,
  GitHubDeviceAuthorizationRecord,
  GitHubUserAccountInput,
  IssuedMemberTokenRecord,
  WebSessionAuthStore,
  WebSessionRecord,
  WebUserAccount
} from "../../auth/src/index.js";

import type { Queryable } from "./types.js";

type PostgresAuthStore = WebSessionAuthStore & EmailAuthChallengeStore & GitHubCliAuthStore;

function mapUserAccountRow(row: Record<string, unknown>): WebUserAccount {
  return {
    user_id: String(row["user_id"]),
    email: String(row["email"]),
    email_verified_at: (row["email_verified_at"] as string | null) ?? null,
    organization_id: String(row["organization_id"]),
    role: row["role"] === "owner" ? "owner" : "member"
  };
}

function mapSessionRow(row: Record<string, unknown>): WebSessionRecord {
  return {
    session_id: String(row["session_id"]),
    user_id: String(row["user_id"]),
    email: String(row["email"]),
    email_verified_at: (row["email_verified_at"] as string | null) ?? null,
    organization_id: String(row["organization_id"]),
    role: row["role"] === "owner" ? "owner" : "member",
    created_at: String(row["created_at"]),
    expires_at: String(row["expires_at"]),
    revoked_at: (row["revoked_at"] as string | null) ?? null,
    has_email_auth: row["has_email_auth"] === true,
    has_github_oauth: row["has_github_oauth"] === true
  };
}

function mapIssuedMemberTokenRow(row: Record<string, unknown>): IssuedMemberTokenRecord {
  return {
    token_id: String(row["token_id"]),
    user_id: String(row["user_id"]),
    organization_id: String(row["organization_id"]),
    label: String(row["label"]),
    created_at: String(row["created_at"]),
    last_used_at: (row["last_used_at"] as string | null) ?? null,
    revoked_at: (row["revoked_at"] as string | null) ?? null,
    expires_at: (row["expires_at"] as string | null) ?? null
  };
}

function mapGitHubDeviceAuthorizationRow(row: Record<string, unknown>): GitHubDeviceAuthorizationRecord {
  return {
    request_id: String(row["request_id"]),
    device_code: String(row["device_code"]),
    user_code: String(row["user_code"]),
    verification_uri: String(row["verification_uri"]),
    interval_seconds: Number(row["interval_seconds"]),
    expires_at: String(row["expires_at"]),
    accepted_terms_at: (row["accepted_terms_at"] as string | null) ?? null,
    created_at: String(row["created_at"]),
    completed_at: (row["completed_at"] as string | null) ?? null,
    claimed_at: (row["claimed_at"] as string | null) ?? null,
    terminal_error: (row["terminal_error"] as string | null) ?? null,
    user_id: (row["user_id"] as string | null) ?? null,
    organization_id: (row["organization_id"] as string | null) ?? null
  };
}

export function createPostgresAuthStore(db: Queryable): PostgresAuthStore {
  return {
    async findUserAccountByEmail(email) {
      const normalizedEmail = email.trim().toLowerCase();
      const result = await db.query<Record<string, unknown>>(
        `
          SELECT
            u.id AS user_id,
            u.email,
            u.email_verified_at::text AS email_verified_at,
            om.organization_id,
            om.role
          FROM users u
          JOIN organization_members om ON om.user_id = u.id
          WHERE lower(u.email) = $1
          ORDER BY CASE WHEN om.role = 'owner' THEN 0 ELSE 1 END, om.created_at ASC
          LIMIT 1
        `,
        [normalizedEmail]
      );

      const row = result.rows[0];
      return row === undefined ? null : mapUserAccountRow(row);
    },

    async findGitHubUserAccountByProviderUserId(githubUserId) {
      const result = await db.query<Record<string, unknown>>(
        `
          SELECT
            u.id AS user_id,
            u.email,
            u.email_verified_at::text AS email_verified_at,
            om.organization_id,
            om.role
          FROM oauth_identities oi
          JOIN users u ON u.id = oi.user_id
          JOIN organization_members om ON om.user_id = u.id
          WHERE oi.provider = 'github'
            AND oi.provider_user_id = $1
          ORDER BY CASE WHEN om.role = 'owner' THEN 0 ELSE 1 END, om.created_at ASC
          LIMIT 1
        `,
        [githubUserId]
      );

      const row = result.rows[0];
      return row === undefined ? null : mapUserAccountRow(row);
    },

    async createUserAccount(input) {
      const userId = randomUUID();
      const organizationId = randomUUID();
      const membershipId = randomUUID();
      const result = await db.query<Record<string, unknown>>(
        `
          WITH inserted_user AS (
            INSERT INTO users (id, email, accepted_terms_at, created_at, updated_at)
            VALUES ($1, $2, $4::timestamptz, $3::timestamptz, $3::timestamptz)
            ON CONFLICT (email) DO NOTHING
            RETURNING id, email, email_verified_at::text AS email_verified_at
          ),
          inserted_organization AS (
            INSERT INTO organizations (id, name, slug, created_at, updated_at)
            SELECT $5, $6, $7, $3::timestamptz, $3::timestamptz
            FROM inserted_user
            RETURNING id
          ),
          inserted_membership AS (
            INSERT INTO organization_members (id, organization_id, user_id, role, created_at)
            SELECT $8, inserted_organization.id, inserted_user.id, 'owner', $3::timestamptz
            FROM inserted_user
            JOIN inserted_organization ON true
            RETURNING organization_id, user_id, role
          )
          SELECT
            inserted_user.id AS user_id,
            inserted_user.email,
            inserted_user.email_verified_at,
            inserted_membership.organization_id,
            inserted_membership.role
          FROM inserted_user
          JOIN inserted_membership ON inserted_membership.user_id = inserted_user.id
        `,
        [
          userId,
          input.email,
          input.created_at,
          input.accepted_terms_at,
          organizationId,
          input.organization_name,
          input.organization_slug,
          membershipId
        ]
      );

      const row = result.rows[0];
      return row === undefined ? null : mapUserAccountRow(row);
    },

    async createSession(input) {
      const result = await db.query<Record<string, unknown>>(
        `
          WITH active_membership AS (
            SELECT om.organization_id
            FROM organization_members om
            JOIN organizations org ON org.id = om.organization_id
            WHERE om.user_id = $2
              AND om.organization_id = $3
              AND om.suspended_at IS NULL
              AND org.suspended_at IS NULL
            LIMIT 1
          ),
          inserted AS (
            INSERT INTO sessions (id, user_id, organization_id, session_token_hash, expires_at, created_at)
            SELECT $1, $2, organization_id, $4, $5::timestamptz, now()
            FROM active_membership
            RETURNING id, user_id, organization_id, created_at, expires_at, revoked_at
          )
          SELECT
            inserted.id AS session_id,
            inserted.user_id,
            u.email,
            u.email_verified_at::text AS email_verified_at,
            inserted.organization_id,
            om.role,
            inserted.created_at::text AS created_at,
            inserted.expires_at::text AS expires_at,
            inserted.revoked_at::text AS revoked_at,
            true AS has_email_auth,
            EXISTS (
              SELECT 1
              FROM oauth_identities oi
              WHERE oi.user_id = inserted.user_id
                AND oi.provider = 'github'
            ) AS has_github_oauth
          FROM inserted
          JOIN users u ON u.id = inserted.user_id
          JOIN organization_members om
            ON om.user_id = inserted.user_id
           AND om.organization_id = inserted.organization_id
          JOIN organizations org ON org.id = inserted.organization_id
          WHERE om.suspended_at IS NULL
            AND org.suspended_at IS NULL
          LIMIT 1
        `,
        [randomUUID(), input.user_id, input.organization_id, input.session_token_hash, input.expires_at]
      );

      const row = result.rows[0];
      return row === undefined ? null : mapSessionRow(row);
    },

    async resolveSessionByTokenHash(sessionTokenHash) {
      const result = await db.query<Record<string, unknown>>(
        `
          SELECT
            s.id AS session_id,
            s.user_id,
            u.email,
            u.email_verified_at::text AS email_verified_at,
            s.organization_id,
            om.role,
            s.created_at::text AS created_at,
            s.expires_at::text AS expires_at,
            s.revoked_at::text AS revoked_at,
            true AS has_email_auth,
            EXISTS (
              SELECT 1
              FROM oauth_identities oi
              WHERE oi.user_id = s.user_id
                AND oi.provider = 'github'
            ) AS has_github_oauth
          FROM sessions s
          JOIN users u ON u.id = s.user_id
          JOIN organization_members om
            ON om.user_id = s.user_id
           AND om.organization_id = s.organization_id
          JOIN organizations org ON org.id = s.organization_id
          WHERE s.session_token_hash = $1
            AND om.suspended_at IS NULL
            AND org.suspended_at IS NULL
          LIMIT 1
        `,
        [sessionTokenHash]
      );

      const row = result.rows[0];
      return row === undefined ? null : mapSessionRow(row);
    },

    async revokeSessionByTokenHash(input) {
      const result = await db.query<Record<string, unknown>>(
        `
          UPDATE sessions
          SET revoked_at = $2::timestamptz
          WHERE session_token_hash = $1
            AND revoked_at IS NULL
          RETURNING id AS session_id
        `,
        [input.session_token_hash, input.revoked_at]
      );

      return result.rows[0] !== undefined;
    },

    async revokeOtherSessionsForUser(input) {
      const result = await db.query<Record<string, unknown>>(
        `
          UPDATE sessions
          SET revoked_at = $3::timestamptz
          WHERE user_id = $1
            AND session_token_hash <> $2
            AND revoked_at IS NULL
          RETURNING id AS session_id
        `,
        [input.user_id, input.except_session_token_hash, input.revoked_at]
      );

      return result.rowCount ?? result.rows.length;
    },

    async markUserEmailVerified(input) {
      const result = await db.query<Record<string, unknown>>(
        `
          UPDATE users
          SET email_verified_at = $2::timestamptz,
              updated_at = $2::timestamptz
          WHERE id = $1
          RETURNING id AS user_id
        `,
        [input.user_id, input.verified_at]
      );

      return result.rows[0] !== undefined;
    },

    async upsertGitHubUserAccount(input: GitHubUserAccountInput) {
      const existingIdentityResult = await db.query<Record<string, unknown>>(
        `
          SELECT
            u.id AS user_id,
            u.email,
            u.email_verified_at::text AS email_verified_at,
            om.organization_id,
            om.role
          FROM oauth_identities oi
          JOIN users u ON u.id = oi.user_id
          JOIN organization_members om ON om.user_id = u.id
          WHERE oi.provider = 'github'
            AND oi.provider_user_id = $1
          ORDER BY CASE WHEN om.role = 'owner' THEN 0 ELSE 1 END, om.created_at ASC
          LIMIT 1
        `,
        [input.github_user_id]
      );

      const existingIdentity = existingIdentityResult.rows[0];
      if (existingIdentity !== undefined) {
        return {
          ...mapUserAccountRow(existingIdentity),
          created_user: false
        };
      }

      const existingUserResult = await db.query<Record<string, unknown>>(
        `
          SELECT
            u.id AS user_id,
            u.email,
            COALESCE(u.email_verified_at::text, $2::text) AS email_verified_at,
            om.organization_id,
            om.role
          FROM users u
          JOIN organization_members om ON om.user_id = u.id
          WHERE lower(u.email) = $1
          ORDER BY CASE WHEN om.role = 'owner' THEN 0 ELSE 1 END, om.created_at ASC
          LIMIT 1
        `,
        [input.email.trim().toLowerCase(), input.verified_at]
      );

      let account = existingUserResult.rows[0];
      let createdUser = false;
      if (account === undefined) {
        const userId = randomUUID();
        const organizationId = randomUUID();
        const membershipId = randomUUID();
        const slugBase = input.email
          .trim()
          .toLowerCase()
          .split("@")[0]
          ?.replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 40) || "workspace";

        const createdAccountResult = await db.query<Record<string, unknown>>(
          `
            WITH inserted_user AS (
              INSERT INTO users (id, email, email_verified_at, accepted_terms_at, created_at, updated_at)
              VALUES ($1, $2, $3::timestamptz, $4::timestamptz, $3::timestamptz, $3::timestamptz)
              RETURNING id, email, email_verified_at::text AS email_verified_at
            ),
            inserted_organization AS (
              INSERT INTO organizations (id, name, slug, created_at, updated_at)
              SELECT $5, $6, $7, $3::timestamptz, $3::timestamptz
              FROM inserted_user
              RETURNING id
            ),
            inserted_membership AS (
              INSERT INTO organization_members (id, organization_id, user_id, role, created_at)
              SELECT $8, inserted_organization.id, inserted_user.id, 'owner', $3::timestamptz
              FROM inserted_user
              JOIN inserted_organization ON true
              RETURNING organization_id, user_id, role
            )
            SELECT
              inserted_user.id AS user_id,
              inserted_user.email,
              inserted_user.email_verified_at,
              inserted_membership.organization_id,
              inserted_membership.role
            FROM inserted_user
            JOIN inserted_membership ON inserted_membership.user_id = inserted_user.id
          `,
          [
            userId,
            input.email.trim().toLowerCase(),
            input.verified_at,
            input.accepted_terms_at ?? null,
            organizationId,
            `${slugBase.charAt(0).toUpperCase()}${slugBase.slice(1)} Workspace`,
            `${slugBase}-${input.github_user_id.slice(0, 8)}`,
            membershipId
          ]
        );

        account = createdAccountResult.rows[0];
        createdUser = true;
      } else {
        await db.query<Record<string, unknown>>(
          `
            UPDATE users
            SET email_verified_at = COALESCE(email_verified_at, $2::timestamptz),
                accepted_terms_at = COALESCE(accepted_terms_at, $3::timestamptz),
                updated_at = $2::timestamptz
            WHERE id = $1
          `,
          [account["user_id"], input.verified_at, input.accepted_terms_at ?? null]
        );
      }

      if (account === undefined) {
        throw new Error("github_user_account_upsert_failed");
      }

      await db.query<Record<string, unknown>>(
        `
          INSERT INTO oauth_identities (id, provider, provider_user_id, user_id, created_at, updated_at)
          VALUES ($1, 'github', $2, $3, $4::timestamptz, $4::timestamptz)
          ON CONFLICT (provider, provider_user_id)
          DO UPDATE SET user_id = EXCLUDED.user_id, updated_at = EXCLUDED.updated_at
          RETURNING id AS oauth_identity_id
        `,
        [randomUUID(), input.github_user_id, account["user_id"], input.verified_at]
      );

      return {
        user_id: String(account["user_id"]),
        email: String(account["email"]),
        email_verified_at: input.verified_at,
        organization_id: String(account["organization_id"]),
        role: account["role"] === "owner" ? "owner" : "member",
        created_user: createdUser
      };
    },

    async createGitHubDeviceAuthorization(input) {
      const result = await db.query<Record<string, unknown>>(
        `
          INSERT INTO github_device_authorizations (
            id,
            device_code,
            user_code,
            verification_uri,
            interval_seconds,
            expires_at,
            accepted_terms_at,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8::timestamptz)
          RETURNING
            id AS request_id,
            device_code,
            user_code,
            verification_uri,
            interval_seconds,
            expires_at::text AS expires_at,
            accepted_terms_at::text AS accepted_terms_at,
            created_at::text AS created_at,
            completed_at::text AS completed_at,
            claimed_at::text AS claimed_at,
            terminal_error,
            user_id::text AS user_id,
            organization_id::text AS organization_id
        `,
        [
          input.request_id,
          input.device_code,
          input.user_code,
          input.verification_uri,
          input.interval_seconds,
          input.expires_at,
          input.accepted_terms_at,
          input.created_at
        ]
      );

      const row = result.rows[0];
      if (row === undefined) {
        throw new Error("github_device_authorization_insert_failed");
      }

      return mapGitHubDeviceAuthorizationRow(row);
    },

    async getGitHubDeviceAuthorization(requestId) {
      const result = await db.query<Record<string, unknown>>(
        `
          SELECT
            id AS request_id,
            device_code,
            user_code,
            verification_uri,
            interval_seconds,
            expires_at::text AS expires_at,
            accepted_terms_at::text AS accepted_terms_at,
            created_at::text AS created_at,
            completed_at::text AS completed_at,
            claimed_at::text AS claimed_at,
            terminal_error,
            user_id::text AS user_id,
            organization_id::text AS organization_id
          FROM github_device_authorizations
          WHERE id = $1
          LIMIT 1
        `,
        [requestId]
      );

      const row = result.rows[0];
      return row === undefined ? null : mapGitHubDeviceAuthorizationRow(row);
    },

    async completeGitHubDeviceAuthorization(input) {
      const result = await db.query<Record<string, unknown>>(
        `
          UPDATE github_device_authorizations
          SET user_id = $2,
              organization_id = $3,
              completed_at = $4::timestamptz,
              terminal_error = NULL
          WHERE id = $1
            AND claimed_at IS NULL
            AND terminal_error IS NULL
            AND completed_at IS NULL
          RETURNING id AS request_id
        `,
        [input.request_id, input.user_id, input.organization_id, input.completed_at]
      );

      return result.rows[0] !== undefined;
    },

    async setGitHubDeviceAuthorizationTerminalError(input) {
      const result = await db.query<Record<string, unknown>>(
        `
          UPDATE github_device_authorizations
          SET terminal_error = $2
          WHERE id = $1
            AND claimed_at IS NULL
            AND completed_at IS NULL
          RETURNING id AS request_id
        `,
        [input.request_id, input.terminal_error]
      );

      return result.rows[0] !== undefined;
    },

    async claimGitHubDeviceAuthorizationMemberToken(input) {
      await db.query("BEGIN", []);

      try {
        const authorizationResult = await db.query<Record<string, unknown>>(
          `
            SELECT
              id AS request_id,
              user_id::text AS user_id,
              organization_id::text AS organization_id,
              expires_at::text AS expires_at,
              completed_at::text AS completed_at,
              claimed_at::text AS claimed_at,
              terminal_error
            FROM github_device_authorizations
            WHERE id = $1
            FOR UPDATE
          `,
          [input.request_id]
        );

        const authorization = authorizationResult.rows[0];
        if (authorization === undefined) {
          await db.query("COMMIT", []);
          return "not_found";
        }
        if ((authorization["claimed_at"] as string | null) !== null) {
          await db.query("COMMIT", []);
          return "claimed";
        }
        if ((authorization["terminal_error"] as string | null) !== null) {
          await db.query("COMMIT", []);
          return "terminal_error";
        }
        if ((authorization["completed_at"] as string | null) === null) {
          const expiresAt = Date.parse(String(authorization["expires_at"]));
          if (!Number.isNaN(expiresAt) && expiresAt <= Date.parse(input.claimed_at)) {
            await db.query("COMMIT", []);
            return "expired";
          }
          await db.query("COMMIT", []);
          return "pending";
        }

        const insertResult = await db.query<Record<string, unknown>>(
          `
            INSERT INTO member_tokens (
              id,
              user_id,
              organization_id,
              token_hash,
              label,
              created_at
            )
            VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6::timestamptz)
            RETURNING
              id AS token_id,
              user_id::text AS user_id,
              organization_id::text AS organization_id,
              label,
              created_at::text AS created_at,
              last_used_at::text AS last_used_at,
              revoked_at::text AS revoked_at,
              expires_at::text AS expires_at
          `,
          [
            input.token_id,
            authorization["user_id"],
            authorization["organization_id"],
            input.token_hash,
            input.label,
            input.claimed_at
          ]
        );

        const insertedToken = insertResult.rows[0];
        if (insertedToken === undefined) {
          throw new Error("github_device_authorization_member_token_insert_failed");
        }

        await db.query<Record<string, unknown>>(
          `
            UPDATE github_device_authorizations
            SET claimed_at = $2::timestamptz
            WHERE id = $1
          `,
          [input.request_id, input.claimed_at]
        );

        await db.query("COMMIT", []);
        return mapIssuedMemberTokenRow(insertedToken);
      } catch (error) {
        try {
          await db.query("ROLLBACK", []);
        } catch {
          // ignore rollback error here so the caller gets the primary failure
        }

        throw error;
      }
    },

    async issueMemberTokenForUser(input) {
      const result = await db.query<Record<string, unknown>>(
        `
          INSERT INTO member_tokens (
            id,
            user_id,
            organization_id,
            token_hash,
            label,
            created_at
          )
          VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6::timestamptz)
          RETURNING
            id AS token_id,
            user_id::text AS user_id,
            organization_id::text AS organization_id,
            label,
            created_at::text AS created_at,
            last_used_at::text AS last_used_at,
            revoked_at::text AS revoked_at,
            expires_at::text AS expires_at
        `,
        [input.token_id, input.user_id, input.organization_id, input.token_hash, input.label, input.created_at]
      );

      const row = result.rows[0];
      if (row === undefined) {
        throw new Error("member_token_issue_failed");
      }

      return mapIssuedMemberTokenRow(row);
    },

    async replaceEmailAuthChallenge(input) {
      const result = await db.query<Record<string, unknown>>(
        `
          WITH invalidated AS (
            UPDATE email_auth_challenges
            SET used_at = $5::timestamptz
            WHERE lower(email) = lower($2)
              AND used_at IS NULL
          )
          INSERT INTO email_auth_challenges (id, email, code_hash, accepted_terms_at, expires_at, created_at)
          VALUES ($1, $2, $3, $4::timestamptz, $6::timestamptz, now())
          RETURNING
            id AS challenge_id,
            email,
            accepted_terms_at::text AS accepted_terms_at,
            expires_at::text AS expires_at,
            used_at::text AS used_at
        `,
        [randomUUID(), input.email, input.code_hash, input.accepted_terms_at, input.replaced_at, input.expires_at]
      );

      const row = result.rows[0];
      if (row === undefined) {
        throw new Error("email_auth_challenge_insert_failed");
      }

      return {
        challenge_id: String(row["challenge_id"]),
        email: String(row["email"]),
        accepted_terms_at: (row["accepted_terms_at"] as string | null) ?? null,
        expires_at: String(row["expires_at"]),
        used_at: (row["used_at"] as string | null) ?? null
      };
    },

    async consumeEmailAuthChallenge(input) {
      const result = await db.query<Record<string, unknown>>(
        `
          UPDATE email_auth_challenges
          SET used_at = $3::timestamptz
          WHERE lower(email) = lower($1)
            AND code_hash = $2
            AND used_at IS NULL
            AND expires_at > $3::timestamptz
          RETURNING email, accepted_terms_at::text AS accepted_terms_at
        `,
        [input.email, input.code_hash, input.used_at]
      );

      const row = result.rows[0];
      if (row === undefined) {
        return null;
      }

      return {
        email: String(row["email"]),
        accepted_terms_at: (row["accepted_terms_at"] as string | null) ?? null
      };
    }
  };
}
