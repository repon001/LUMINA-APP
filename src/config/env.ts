import "dotenv/config";
import { z } from "zod";

/**
 * `z.coerce.boolean()` is not usable for env vars: `Boolean("false")` is `true`,
 * so every value would read as enabled. Parse the literal strings instead.
 */
const boolish = (defaultValue: boolean) =>
  z
    .enum(["true", "false", "1", "0"])
    .default(defaultValue ? "true" : "false")
    .transform((value) => value === "true" || value === "1");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET must be at least 16 characters"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET must be at least 16 characters"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL: z.string().default("30d"),
  COOKIE_SECURE: boolish(false),

  RATE_TIME_LIMIT: z.coerce.number().int().positive().default(15),
  RATE_REQUEST_LIMIT: z.coerce.number().int().positive().default(100),
  // Auth endpoints get a much tighter budget than the rest of the API: they
  // are the ones worth brute-forcing.
  AUTH_RATE_REQUEST_LIMIT: z.coerce.number().int().positive().default(10),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  console.error(`Invalid environment configuration:\n${details}`);
  process.exit(1);
}

const raw = parsed.data;

// Refuse to boot production with the placeholder secrets from .env.example.
if (raw.NODE_ENV === "production") {
  const placeholders = (["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"] as const).filter((key) =>
    raw[key].startsWith("replace_me"),
  );
  if (placeholders.length > 0) {
    console.error(
      `Refusing to start in production with example secrets: ${placeholders.join(", ")}`,
    );
    process.exit(1);
  }
}

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === "production",
  corsOrigins: raw.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};

export type Env = typeof env;
