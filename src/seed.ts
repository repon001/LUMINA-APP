import { disconnectPrisma, prisma } from "./config/prisma";
import { Role } from "./generated/prisma/client";
import { hashPassword } from "./utils/password";
import { attachAutoImage } from "./modules/image/image.service";

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

  await backfillImages();
};

/**
 * Give anything that predates the image table a photograph.
 *
 * New submissions get one on the way in, but everything already in the
 * catalogue was created before that existed, and an empty gallery on every
 * entry looks like a broken feature rather than like nobody has uploaded
 * anything yet.
 *
 * Idempotent: an entry that already has one is left alone.
 */
const backfillImages = async () => {
  const [destinations, places] = await Promise.all([
    prisma.destination.findMany({
      where: { images: { none: {} } },
      select: { id: true, name: true, country: true },
    }),
    prisma.place.findMany({
      where: { images: { none: {} } },
      select: { id: true, name: true, category: true, destination: { select: { name: true } } },
    }),
  ]);

  for (const destination of destinations) {
    await attachAutoImage(
      { destinationId: destination.id },
      destination.name + " " + destination.country,
      "CITY",
    );
  }

  for (const place of places) {
    await attachAutoImage(
      { placeId: place.id },
      place.name + " " + place.destination.name,
      place.category,
    );
  }

  const total = destinations.length + places.length;
  console.log(
    total === 0 ? "every entry already has a photograph" : "added " + total + " photographs",
  );
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
