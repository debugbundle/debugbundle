import type { Queryable } from "../../packages/storage/src/types.js";

/** Sequential functional fixtures provide data statements. Real Postgres tests
 * independently verify the complete-origin transaction fence. */
export function configurationFixtureDb(query: unknown): Queryable {
  const dataQuery = query as Queryable["query"];
  const wrapped = ((sql: string, params: unknown[]) =>
    sql.startsWith("SELECT debugbundle_begin_project_rule_write(") ||
    sql.startsWith("SELECT debugbundle_assert_canonical_project_write(")
      ? Promise.resolve({ rows: [] })
      : dataQuery(sql, params)) as Queryable["query"];
  const db: Queryable = { query: wrapped, transaction: (callback) => callback(db) };
  return db;
}
