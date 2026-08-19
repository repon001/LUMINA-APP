import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Set before any module loads, so config/env.ts validates against these
    // instead of the developer real .env - tests must not depend on, or touch,
    // a local database.
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test?schema=public",
      JWT_ACCESS_SECRET: "test_access_secret_not_used_anywhere_else",
      JWT_REFRESH_SECRET: "test_refresh_secret_not_used_anywhere_else",
      CORS_ORIGINS: "http://localhost:3000",
    },
  },
});
