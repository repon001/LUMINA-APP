import { createApp } from "./app";
import { env } from "./config/env";
import { disconnectPrisma, prisma } from "./config/prisma";

const start = async () => {
  // Fail fast on a bad DATABASE_URL rather than on the first request.
  await prisma.$queryRaw`SELECT 1`;

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`API listening on http://localhost:${env.PORT} [${env.NODE_ENV}]`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down`);
    server.close(async () => {
      await disconnectPrisma();
      process.exit(0);
    });

    // Do not let a hung connection block the exit forever.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
};

start().catch(async (error) => {
  console.error("Failed to start server:", error);
  await disconnectPrisma().catch(() => undefined);
  process.exit(1);
});
