import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  casing: "snake_case",
  schemaFilter: ["public", "ops"],
  dbCredentials: { url: process.env.MIGRATE_DATABASE_URL ?? "" },
});
