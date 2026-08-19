import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "../generated/prisma/client";
import { env } from "../config/env";
import { ApiError, isApiError } from "../utils/api-error";

interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

const fromZodError = (error: ZodError): ErrorBody => ({
  code: "VALIDATION_ERROR",
  message: "Validation failed",
  details: error.issues.map((issue) => ({
    field: issue.path.join(".") || "(root)",
    message: issue.message,
  })),
});

const fromPrismaError = (error: Prisma.PrismaClientKnownRequestError): ErrorBody => {
  switch (error.code) {
    case "P2002": {
      // Unique constraint. `target` is the column list that collided.
      const target = error.meta?.["target"];
      const fields = Array.isArray(target) ? target.join(", ") : String(target ?? "field");
      return {
        code: "CONFLICT",
        message: `A record with this ${fields} already exists`,
        details: { fields },
      };
    }
    case "P2028":
      // Interactive transaction timed out, typically waiting on a contended
      // row lock. Transient, so the client should retry rather than treat it
      // as a server fault.
      return {
        code: "TRANSIENT_CONFLICT",
        message: "The database was busy; retry the request",
      };
    case "P2025":
      return { code: "NOT_FOUND", message: "Record not found" };
    case "P2003":
      return {
        code: "BAD_REQUEST",
        message: "Referenced record does not exist",
        details: { field: error.meta?.["field_name"] },
      };
    default:
      return { code: "DATABASE_ERROR", message: "Database request failed" };
  }
};

const statusForPrismaError = (error: Prisma.PrismaClientKnownRequestError): number => {
  switch (error.code) {
    case "P2002":
      return 409;
    case "P2025":
      return 404;
    case "P2003":
      return 400;
    case "P2028":
      return 503;
    default:
      return 500;
  }
};

/**
 * Terminal error handler. Mirrors the success envelope from `sendResponse` -
 * same `statusCode` / `success` / `message` fields - so a client parses one
 * shape either way, with machine-readable `error.code` for branching.
 */
export const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  let status = 500;
  let body: ErrorBody = { code: "INTERNAL_ERROR", message: "Something went wrong" };

  if (isApiError(error)) {
    status = error.statusCode;
    body = { code: error.code, message: error.message };
    if (error.details !== undefined) body.details = error.details;
  } else if (error instanceof ZodError) {
    status = 422;
    body = fromZodError(error);
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    status = statusForPrismaError(error);
    body = fromPrismaError(error);
  } else if (error instanceof Prisma.PrismaClientValidationError) {
    status = 400;
    body = { code: "BAD_REQUEST", message: "Malformed database query" };
  }

  // Unexpected failures are bugs - always log them with the stack.
  if (status >= 500) {
    console.error("[error]", error);
  }

  res.status(status).json({
    statusCode: status,
    success: false,
    message: body.message,
    error: {
      code: body.code,
      ...(body.details !== undefined ? { details: body.details } : {}),
      // Stacks only for genuine 5xx bugs, and never in production.
      ...(env.isProduction || status < 500
        ? {}
        : { stack: error instanceof Error ? error.stack : undefined }),
    },
  });
};

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction) => {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
};
