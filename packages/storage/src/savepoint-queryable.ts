import { randomUUID } from "node:crypto";
import type { Queryable } from "./types.js";

/** Preserve the owning transaction when domain stores open nested transactions. */
export function createSavepointQueryable(connection: Queryable): Queryable {
  const scoped: Queryable = {
    query: (sql, params) => connection.query(sql, params),
    async transaction(callback) {
      const name = `worker_${randomUUID().replaceAll("-", "")}`;
      await connection.query(`SAVEPOINT ${name}`, []);
      try {
        const result = await callback(scoped);
        await connection.query(`RELEASE SAVEPOINT ${name}`, []);
        return result;
      } catch (error) {
        await connection.query(`ROLLBACK TO SAVEPOINT ${name}`, []);
        await connection.query(`RELEASE SAVEPOINT ${name}`, []);
        throw error;
      }
    }
  };
  return scoped;
}
