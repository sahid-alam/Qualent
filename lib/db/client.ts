import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export function createDb(connectionString: string | undefined, max: number) {
  return drizzle(new Pool({ connectionString, max }));
}
