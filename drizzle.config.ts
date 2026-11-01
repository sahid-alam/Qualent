import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  schemaFilter: ["ops"],
  dbCredentials: { url: process.env.MIGRATE_DATABASE_URL ?? "" },
});
