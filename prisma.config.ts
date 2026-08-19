import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7 reads migrate/introspect settings from here instead of from the
// `datasource` block in schema.prisma.
export default defineConfig({
  // Folder, not a single file: models are split per domain under prisma/schema/.
  schema: "prisma/schema",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx src/seed.ts",
  },
  datasource: {
    // Migrations need a direct session — a pooled endpoint (PgBouncer in
    // transaction mode, as Neon and Supabase use) cannot run DDL or advisory
    // locks reliably. Falls back to DATABASE_URL when there is no pooler.
    url: process.env["DIRECT_URL"] ? env("DIRECT_URL") : env("DATABASE_URL"),
  },
});
