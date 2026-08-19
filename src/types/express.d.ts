import type { Role } from "../generated/prisma/client";

declare global {
  namespace Express {
    interface Request {
      /** Set by the `authenticate` middleware. */
      user?: {
        id: string;
        email: string;
        role: Role;
      };
      /** Set by the `requestId` middleware, echoed as the `x-request-id` header. */
      requestId?: string;
    }
  }
}
