import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../generated/prisma/client";
import { env } from "./env";

// Prisma 7 connects through a driver adapter rather than a `url` in the schema.
// The explicit schema matters when the database holds more than this app: without
// it, queries fall back to `search_path` and can hit a same-named table next door.
const adapter = new PrismaPg(
  { connectionString: env.DATABASE_URL },
  { schema: env.DATABASE_SCHEMA },
);

export const prisma = new PrismaClient({
  adapter,
  log: env.isProduction ? ["warn", "error"] : ["warn", "error"],

  // Prisma's 5s default assumes a database on the same network. A managed
  // Postgres a region away can spend that on round trips alone, so a write
  // transaction would fail with P2028 under normal conditions. Transactions
  // here are deliberately short; this is headroom for latency, not for work.
  transactionOptions: {
    maxWait: 10_000,
    timeout: 20_000,
  },
});

/** The client handed to a `prisma.$transaction(async (tx) => …)` callback. */
export type PrismaTx = Prisma.TransactionClient;

export const disconnectPrisma = async () => {
  await prisma.$disconnect();
};
