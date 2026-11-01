// Makes someone a platform admin. There is no screen for this, on purpose:
// it needs database rights, so a compromised app session can't grant it.
//
// npm run make-admin -- person@example.com
// They must have signed in once, or been added under Authentication in Supabase.
import { Pool } from "pg";
import { closePool, withPlatform } from "../lib/db/client.ts";
import { profiles } from "../lib/db/schema.ts";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) throw new Error("Usage: npm run make-admin -- person@example.com");
if (!process.env.MIGRATE_DATABASE_URL) throw new Error("MIGRATE_DATABASE_URL is required");

const pool = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 });
const { rows } = await pool.query<{ id: string }>("select id from auth.users where lower(email) = $1", [email]);
await pool.end();
if (!rows[0]) throw new Error("No Supabase user has that email yet");

await withPlatform((db) =>
  db
    .insert(profiles)
    .values({ id: rows[0].id, name: email.split("@")[0], isPlatformAdmin: true })
    .onConflictDoUpdate({ target: profiles.id, set: { isPlatformAdmin: true } }),
);
await closePool();
console.log("Done. They can create clients after signing in.");
