/**
 * An error we raised deliberately and can safely describe to the client.
 * Anything that is not an ApiError is treated as a bug and reported as a
 * generic 500, so internal details never leak.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  /** Stable, machine-readable code the client can branch on. */
  readonly code: string;
  readonly details?: unknown;
  readonly isOperational = true;

  constructor(statusCode: number, message: string, code: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, message, "BAD_REQUEST", details);
  }

  static unauthorized(message = "Authentication required") {
    return new ApiError(401, message, "UNAUTHORIZED");
  }

  static forbidden(message = "You do not have access to this resource") {
    return new ApiError(403, message, "FORBIDDEN");
  }

  static notFound(message = "Resource not found") {
    return new ApiError(404, message, "NOT_FOUND");
  }

  static conflict(message: string, details?: unknown) {
    return new ApiError(409, message, "CONFLICT", details);
  }

  static validation(message = "Validation failed", details?: unknown) {
    return new ApiError(422, message, "VALIDATION_ERROR", details);
  }

  static tooManyRequests(message = "Too many requests, please try again later") {
    return new ApiError(429, message, "RATE_LIMITED");
  }

  static internal(message = "Something went wrong") {
    return new ApiError(500, message, "INTERNAL_ERROR");
  }
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError;
