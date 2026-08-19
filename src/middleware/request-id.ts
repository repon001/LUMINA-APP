import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const MAX_LENGTH = 64;
const SAFE = /^[\w.:-]+$/;

/**
 * Gives every request an id, echoed back as `x-request-id`.
 *
 * A caller-supplied id is reused so a trace survives across services, but only
 * if it is short and boring - it ends up in logs and response bodies, and an
 * arbitrary header should not be able to inject newlines into either.
 */
export const requestId = (req: Request, res: Response, next: NextFunction) => {
  const incoming = req.headers["x-request-id"];
  const supplied =
    typeof incoming === "string" && incoming.length <= MAX_LENGTH && SAFE.test(incoming)
      ? incoming
      : undefined;

  const id = supplied ?? randomUUID();
  req.requestId = id;
  res.setHeader("x-request-id", id);
  next();
};
