import type { Response } from "express";

/**
 * Either pagination meta or an endpoint-specific bag (e.g. a report date
 * window). A union rather than a bare `Record`, so `PageMeta` keeps its exact
 * field types instead of needing an index signature.
 */
export type ResponseMeta = PageMeta | Record<string, unknown>;

export interface ApiResponse<T> {
  statusCode: number;
  success: boolean;
  message: string;
  data?: T | null;
  meta?: ResponseMeta;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * The single success envelope. `statusCode` is echoed in the body so a client
 * reading a logged or proxied payload can see the outcome without the HTTP
 * headers alongside it.
 */
export const sendResponse = <T>(res: Response, payload: ApiResponse<T>) => {
  const body: Record<string, unknown> = {
    statusCode: payload.statusCode,
    success: payload.success,
    message: payload.message,
  };

  if (payload.data !== undefined) body.data = payload.data;
  if (payload.meta) body.meta = payload.meta;

  res.status(payload.statusCode).json(body);
};

export const buildPageMeta = (page: number, limit: number, total: number): PageMeta => {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
};

/** Shorthand for a list response: data plus pagination meta. */
export const sendPaginated = <T>(
  res: Response,
  message: string,
  result: { items: T[]; page: number; limit: number; total: number },
) =>
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message,
    data: result.items,
    meta: buildPageMeta(result.page, result.limit, result.total),
  });
