// Runs once before all tests: a clean database, migrated as a superuser.
// The tests themselves connect as app_user, so row-level security really applies.
import { Client } from "pg";
import { setupDatabase } from "../scripts/db-setup.ts";

export default async function setup() {
  const admin = process.env.TEST_DATABASE_URL;
  if (!admin) throw new Error("TEST_DATABASE_URL is required");

  const client = new Client({ connectionString: admin });
  await client.connect();
  await client.query(`
    drop schema if exists public cascade;
    drop schema if exists ops cascade;
    drop schema if exists pgboss cascade;
    drop schema if exists drizzle cascade;
    create schema public;
  `);
  await setupDatabase(admin);
  await client.query(`alter role app_user login password 'app_user'`);
  await client.end();

  const url = new URL(admin);
  url.username = "app_user";
  url.password = "app_user";
  process.env.DATABASE_URL = url.toString();
}
