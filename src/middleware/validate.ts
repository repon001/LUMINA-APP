import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

interface Schemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/**
 * Validates and replaces `req.body` / `req.query` / `req.params` with the
 * parsed result, so handlers receive coerced, trusted values.
 *
 * In Express 5 `req.query` is a getter-only property, so the parsed query is
 * stored via defineProperty rather than assignment.
 */
export const validate = (schemas: Schemas) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as typeof req.params;
      }
      if (schemas.query) {
        const parsedQuery = schemas.query.parse(req.query);
        Object.defineProperty(req, "query", {
          value: parsedQuery,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      next();
    } catch (error) {
      // ZodError is mapped to a 422 by the central error handler.
      next(error);
    }
  };
};
