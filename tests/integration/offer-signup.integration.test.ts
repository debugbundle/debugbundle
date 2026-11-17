import { afterAll, beforeEach, expect, it } from "vitest";
import { createPostgresAuthStore } from "../../packages/storage/src/auth-store.js";
import { createOfferSignupStore } from "../../packages/storage/src/offer-signup-store.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";
import { resetOfferIntegrationSchema } from "../helpers/offer-integration.js";
runIntegration("new-account offer intent atomicity", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool),
    auth = createPostgresAuthStore(db),
    intents = createOfferSignupStore(db);
  const hint = () => ({
    code: "SIGNUP20",
    expires_at: new Date(Date.now() + 86400000).toISOString()
  });
  const emailInput = () => ({
    email: "new-email@example.test",
    organization_name: "New",
    organization_slug: "new-email",
    accepted_terms_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    signup_offer: hint()
  });
  const githubInput = () => ({
    email: "new-github@example.test",
    github_user_id: "123456789",
    verified_at: new Date().toISOString(),
    accepted_terms_at: new Date().toISOString(),
    signup_offer: hint()
  });
  beforeEach(async () => resetOfferIntegrationSchema(db));
  afterAll(async () => pool.end());
  it.each(["email", "github"])(
    "persists only the original %s signup and retries exactly once under concurrency",
    async (method) => {
      const account =
        method === "email"
          ? await auth.createUserAccount(emailInput())
          : await auth.upsertGitHubUserAccount(githubInput());
      expect(account).not.toBeNull();
      const actor = { organization_id: account!.organization_id, actor_user_id: account!.user_id };
      expect(await intents.read(actor)).toEqual({ code: "SIGNUP20", status: "pending" });
      if (method === "email")
        expect(
          await auth.createUserAccount({
            ...emailInput(),
            signup_offer: { ...hint(), code: "LATER30" }
          })
        ).toBeNull();
      else
        expect(
          await auth.upsertGitHubUserAccount({
            ...githubInput(),
            signup_offer: { ...hint(), code: "LATER30" }
          })
        ).toMatchObject({ created_user: false });
      const taken = await Promise.all([intents.take(actor), intents.take(actor)]);
      expect(taken.filter(Boolean)).toHaveLength(1);
      expect(await intents.read(actor)).toMatchObject({ code: "SIGNUP20" });
    }
  );
  it.each(["email", "github"])(
    "rolls back the %s account if its local intent insert fails",
    async (method) => {
      await db.query(
        "CREATE FUNCTION reject_test_offer_intent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test_intent_unavailable'; END $$",
        []
      );
      await db.query(
        "CREATE TRIGGER reject_test_offer_intent BEFORE INSERT ON offer_signup_intents FOR EACH ROW EXECUTE FUNCTION reject_test_offer_intent()",
        []
      );
      await expect(
        method === "email"
          ? auth.createUserAccount(emailInput())
          : auth.upsertGitHubUserAccount(githubInput())
      ).rejects.toThrow("test_intent_unavailable");
      for (const table of [
        "users",
        "organizations",
        "organization_members",
        "oauth_identities",
        "offer_signup_intents"
      ])
        expect((await db.query(`SELECT count(*)::int AS n FROM ${table}`, [])).rows[0]!["n"]).toBe(
          0
        );
    }
  );
  it("never attaches a later GitHub link to an existing email account", async () => {
    const source = emailInput();
    const input = {
      email: source.email,
      organization_name: source.organization_name,
      organization_slug: source.organization_slug,
      accepted_terms_at: source.accepted_terms_at,
      created_at: source.created_at
    };
    const account = await auth.createUserAccount(input);
    expect(
      await auth.upsertGitHubUserAccount({ ...githubInput(), email: input.email })
    ).toMatchObject({ user_id: account!.user_id, created_user: false });
    expect((await db.query("SELECT id FROM offer_signup_intents", [])).rows).toEqual([]);
  });
});
