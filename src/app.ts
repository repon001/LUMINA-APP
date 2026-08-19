import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import hpp from "hpp";
import morgan from "morgan";
import { env } from "./config/env";
import { prisma } from "./config/prisma";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { globalLimiter } from "./middleware/rate-limit";
import { requestId } from "./middleware/request-id";
import routes from "./routes";
import { ApiError } from "./utils/api-error";
import { sendResponse } from "./utils/api-response";
import { catchAsync } from "./utils/catch-async";

morgan.token("id", (req) => (req as express.Request).requestId ?? "-");

export const createApp = () => {
  const app = express();

  // Behind a load balancer this is what makes req.ip (and therefore rate
  // limiting) reflect the real client instead of the proxy.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(requestId);
  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins.length > 0 ? env.corsOrigins : false,
      credentials: true,
      exposedHeaders: ["x-request-id"],
    }),
  );

  // Stripe signs the exact bytes it sent, so this one route must see the body
  // unparsed. It has to be registered before the JSON parser to win the match.
  app.use("/api/payments/webhook/stripe", express.raw({ type: "*/*", limit: "1mb" }));

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Must run after the body parsers to also clean polluted body params.
  app.use(hpp());

  if (env.NODE_ENV !== "test") {
    app.use(
      morgan(env.isProduction ? ":id :remote-addr :method :url :status :response-time ms" : "dev"),
    );
  }

  app.use(globalLimiter);

  /**
   * Liveness: is the process up? Deliberately does not touch the database - a
   * failing dependency should not make an orchestrator kill a healthy process.
   */
  app.get("/health", (_req, res) => {
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Service healthy",
      data: { status: "ok", uptime: process.uptime() },
    });
  });

  /** Readiness: can this instance actually serve traffic? */
  app.get(
    "/health/ready",
    catchAsync(async (_req, res) => {
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch {
        throw ApiError.serviceUnavailable("Database is unreachable");
      }
      sendResponse(res, {
        statusCode: 200,
        success: true,
        message: "Service ready",
        data: { status: "ready" },
      });
    }),
  );

  app.use("/api", routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
