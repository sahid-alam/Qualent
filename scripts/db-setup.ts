// Applies all migrations, installs the job queues, and grants the app role.
// Runs as the migration role, never as the app role.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { PgBoss } from "pg-boss";
import { Pool } from "pg";
import { DEAD_LETTER_QUEUE, QUEUES } from "../lib/jobs/queues.ts";

export async function setupDatabase(url: string | undefined) {
  if (!url) throw new Error("MIGRATE_DATABASE_URL is required");
  const pool = new Pool({ connectionString: url, max: 2 });
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });

  const boss = new PgBoss({ connectionString: url, max: 2, supervise: false, schedule: false });
  boss.on("error", (error) => console.error(error.message));
  await boss.start();
  await boss.createQueue(DEAD_LETTER_QUEUE).catch(ignoreExisting);
  for (const [name, options] of Object.entries(QUEUES)) {
    await boss.createQueue(name, { ...options, deadLetter: DEAD_LETTER_QUEUE }).catch(ignoreExisting);
  }
  await boss.stop({ graceful: false });

  await pool.query(`
    grant usage on schema pgboss to app_user;
    grant all on all tables in schema pgboss to app_user;
    grant all on all sequences in schema pgboss to app_user;
    grant execute on all functions in schema pgboss to app_user;
  `);
  await pool.end();
}

function ignoreExisting(error: Error) {
  if (!/already exists/.test(error.message)) throw error;
}

if (import.meta.main) {
  await setupDatabase(process.env.MIGRATE_DATABASE_URL);
  console.log("database ready");
}
