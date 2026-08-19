import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import hpp from "hpp";
import morgan from "morgan";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import routes from "./routes";
import { ApiError } from "./utils/api-error";
import { sendResponse } from "./utils/api-response";

export const createApp = () => {
  const app = express();

  // Behind a load balancer this is what makes req.ip (and therefore rate
  // limiting) reflect the real client instead of the proxy.
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins.length > 0 ? env.corsOrigins : false,
      credentials: true,
    }),
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Must run after the body parsers to also clean polluted body params.
  app.use(hpp());

  if (env.NODE_ENV !== "test") {
    app.use(morgan(env.isProduction ? "combined" : "dev"));
  }

  app.use(
    rateLimit({
      windowMs: env.RATE_TIME_LIMIT * 60 * 1000,
      limit: env.RATE_REQUEST_LIMIT,
      standardHeaders: "draft-7",
      legacyHeaders: false,

      // Liveness probes would otherwise consume a client whole quota.
      skip: (req) => req.path === "/health",

      // The library default reply is plain text, which would be the only
      // response in the API not using the shared envelope. Route it through
      // the error handler instead.
      handler: (_req, _res, next) => next(ApiError.tooManyRequests()),
    }),
  );

  // Uses the shared envelope like every other endpoint, so uptime probes and
  // API clients parse the same shape.
  app.get("/health", (_req, res) => {
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Service healthy",
      data: { status: "ok", uptime: process.uptime() },
    });
  });

  app.use("/api", routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
