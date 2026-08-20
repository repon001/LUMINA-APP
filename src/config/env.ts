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
  /**
   * The Postgres schema the app owns. The `?schema=` parameter in the URL only
   * reaches Prisma Migrate; the runtime client resolves unqualified names
   * through `search_path`, which is `public` on most servers. Naming it here
   * makes every generated query explicit about where its tables live.
   */
  DATABASE_SCHEMA: z.string().min(1).default("public"),

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

  // ---- payments ----
  /** Where gateways send the customer back, and where they call our webhooks. */
  PUBLIC_BASE_URL: z.string().default("http://localhost:4000"),
  /** Deep links the app handles after checkout. */
  PAYMENT_SUCCESS_URL: z.string().default("http://localhost:3000/payments/success"),
  PAYMENT_CANCEL_URL: z.string().default("http://localhost:3000/payments/cancel"),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  SSLCOMMERZ_STORE_ID: z.string().optional(),
  SSLCOMMERZ_STORE_PASSWORD: z.string().optional(),
  SSLCOMMERZ_SANDBOX: boolish(true),

  /**
   * Lets the stub gateway be used without keys. Refused in production, where a
   * payment that settles itself would be a hole rather than a convenience.
   */
  PAYMENT_ALLOW_STUB: boolish(true),

  // ---- media (Cloudinary) ----
  /**
   * Avatar uploads are optional: without these the endpoint answers 503 rather
   * than the app failing to boot, which keeps the rest of the API usable on a
   * machine that has no media credentials.
   */
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  /** Everything this app uploads lands under one folder in the account. */
  CLOUDINARY_FOLDER: z.string().default("lumina/avatars"),
  /** Bigger than any sensible avatar, small enough to refuse a video. */
  AVATAR_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(5 * 1024 * 1024),

  // ---- AI (OpenRouter) ----
  OPENROUTER_API_KEY: z.string().optional(),
  /**
   * Any model id OpenRouter serves. Swap it for a cheaper tier
   * (anthropic/claude-haiku-4.5, google/gemini-flash-*) without touching code.
   */
  OPENROUTER_MODEL: z.string().default("anthropic/claude-opus-5"),
  /** Generating a week-long itinerary takes longer than a normal request. */
  OPENROUTER_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
  /**
   * How much of the token budget a reasoning model may spend thinking.
   *
   * Off by default. Reasoning improves a plan, but it is drawn from the same
   * `max_tokens` as the answer - and a model that thinks until the budget runs
   * out returns nothing at all, which is worse than a shallower plan.
   */
  OPENROUTER_REASONING: z.enum(["off", "low", "medium", "high"]).default("off"),
  /** AI calls cost money per request, so they get their own tighter budget. */
  AI_RATE_REQUEST_LIMIT: z.coerce.number().int().positive().default(20),
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
