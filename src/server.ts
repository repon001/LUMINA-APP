import { createApp } from "./app";
import { env } from "./config/env";
import { disconnectPrisma, prisma } from "./config/prisma";

const SHUTDOWN_GRACE_MS = 10_000;

const start = async () => {
  // Fail fast on a bad DATABASE_URL rather than on the first request.
  await prisma.$queryRaw`SELECT 1`;

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`API listening on http://localhost:${env.PORT} [${env.NODE_ENV}]`);
  });

  // Both must exceed the idle timeout of whatever proxy sits in front (60s on
  // most load balancers), or the proxy reuses a connection Node just closed
  // and the client sees a sporadic 502.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${env.PORT} is already in use`);
      process.exit(1);
    }
    throw error;
  });

  let shuttingDown = false;
  const shutdown = async (reason: string, exitCode = 0) => {
    // A second SIGTERM, or a signal arriving mid-shutdown, must not start the
    // teardown twice.
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${reason} received, shutting down`);

    // Stop accepting connections, then wait for in-flight requests to finish.
    server.close(async () => {
      await disconnectPrisma().catch(() => undefined);
      process.exit(exitCode);
    });

    // Do not let a hung connection block the exit forever.
    setTimeout(() => {
      console.error("Shutdown timed out, forcing exit");
      process.exit(1);
    }, SHUTDOWN_GRACE_MS).unref();
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  // An unhandled rejection leaves the process in an unknown state. Log it and
  // exit rather than serving traffic from a half-broken instance - the
  // supervisor restarts a clean one.
  process.on("unhandledRejection", (reason) => {
    console.error("[fatal] unhandled rejection:", reason);
    void shutdown("unhandledRejection", 1);
  });
  process.on("uncaughtException", (error) => {
    console.error("[fatal] uncaught exception:", error);
    void shutdown("uncaughtException", 1);
  });
};

start().catch(async (error) => {
  console.error("Failed to start server:", error);
  await disconnectPrisma().catch(() => undefined);
  process.exit(1);
});
