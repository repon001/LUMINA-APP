import { disconnectPrisma, prisma } from "./config/prisma";
import { Role } from "./generated/prisma/client";
import { hashPassword } from "./utils/password";

/**
 * Development seed: one account per role, so every role gate has something to
 * sign in with.
 *
 * Written with upserts and keyed on email, so a rerun updates the same rows
 * instead of accumulating duplicates or failing on the unique constraint.
 * Refuses to run against production unless explicitly forced.
 */

const DEFAULT_PASSWORD = process.env["SEED_PASSWORD"] ?? "Password123!";

const ACCOUNTS = [
  { name: "Ada Admin", email: "admin@example.com", role: Role.ADMIN },
  { name: "Mo Moderator", email: "moderator@example.com", role: Role.MODERATOR },
  { name: "Sam User", email: "user@example.com", role: Role.USER },
];

const runSeed = async () => {
  if (process.env["NODE_ENV"] === "production" && process.env["SEED_FORCE"] !== "true") {
    console.error("Refusing to seed a production database. Set SEED_FORCE=true to override.");
    process.exit(1);
  }

  const passwordHash = await hashPassword(DEFAULT_PASSWORD);

  for (const account of ACCOUNTS) {
    await prisma.user.upsert({
      where: { email: account.email },
      // Only the fields the seed owns: an edited name or role stays put on
      // rerun, but the password is reset so the documented login always works.
      update: { passwordHash, isActive: true },
      create: { ...account, passwordHash },
    });
    console.log(`seeded ${account.role.padEnd(7)} ${account.email}`);
  }

  console.log(`\n${ACCOUNTS.length} accounts ready (password: ${DEFAULT_PASSWORD})`);
};

runSeed()
  .then(async () => {
    await disconnectPrisma();
    console.log("seed complete");
  })
  .catch(async (error) => {
    console.error("seed failed:", error);
    await disconnectPrisma().catch(() => undefined);
    process.exit(1);
  });
