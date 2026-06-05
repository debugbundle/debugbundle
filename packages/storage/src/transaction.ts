import type { Queryable } from "./types.js";

export async function runInTransaction<Result>(
  db: Queryable,
  callback: (tx: Queryable) => Promise<Result>
): Promise<Result> {
  if (db.transaction !== undefined) {
    return db.transaction(callback);
  }

  await db.query("BEGIN", []);
  try {
    const result = await callback(db);
    await db.query("COMMIT", []);
    return result;
  } catch (error) {
    try {
      await db.query("ROLLBACK", []);
    } catch {
      // Preserve the original transaction failure.
    }
    throw error;
  }
}
