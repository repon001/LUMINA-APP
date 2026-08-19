import type { NextFunction, Request, Response } from "express";

type AsyncController = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/**
 * Forwards a rejected handler to the error middleware.
 *
 * Express 5 does this on its own, but wrapping every controller keeps the
 * contract explicit at the call site instead of relying on framework behaviour.
 */
export const catchAsync = (fn: AsyncController) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
