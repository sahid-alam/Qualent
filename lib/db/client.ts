import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import { safeMessage } from "../errors.ts";

let pool: Pool | undefined;

function getPool() {
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  return pool;
}

export type Db = NodePgDatabase & { $client: PoolClient };

/**
 * A failed query's error holds its values, and Next.js logs uncaught errors as they are.
 * Stripping them here covers every caller. Our own error classes pass through untouched.
 */
function cleanDbError(error: unknown) {
  const { message = "", code, cause } = (error ?? {}) as { message?: string; code?: unknown; cause?: { code?: unknown; message?: unknown } };
  const dbCode = cause?.code ?? code;
  const isDatabase = message.startsWith("Failed query") || (typeof dbCode === "string" && /^[0-9A-Z]{5}$/.test(dbCode));
  if (!isDatabase) return error;
  return Object.assign(new Error(safeMessage(error)), { cause: { code: dbCode, message: String(cause?.message ?? message).split("\n")[0].replace(/"[^"]*"/g, '"…"') } });
}

async function inTransaction<T>(settings: Record<string, string>, fn: (db: Db) => Promise<T>) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    for (const [key, value] of Object.entries(settings)) {
      await client.query("select set_config($1, $2, true)", [key, value]);
    }
    const result = await fn(drizzle(client, { casing: "snake_case" }) as Db);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw cleanDbError(error);
  } finally {
    client.release();
  }
}

/** The one door to tenant data. Row-level security enforces the tenant. */
export function withTenant<T>(tenantId: string, fn: (db: Db) => Promise<T>, actor = "system") {
  return inTransaction({ "app.tenant_id": tenantId, "app.actor": actor }, fn);
}

/** Reads the caller's own memberships across tenants, for login and switching. */
export function withUser<T>(userId: string, fn: (db: Db) => Promise<T>, verifiedEmail = "") {
  return inTransaction({ "app.user_id": userId, "app.actor": userId, "app.user_email": verifiedEmail }, fn);
}

/** Non-tenant tables and the tenant list, for system jobs and platform admins. */
export function withPlatform<T>(fn: (db: Db) => Promise<T>, actor = "system") {
  return inTransaction({ "app.platform": "on", "app.actor": actor }, fn);
}

export async function closePool() {
  await pool?.end();
  pool = undefined;
}
