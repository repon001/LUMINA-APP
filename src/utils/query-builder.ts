import { ApiError } from "./api-error";

export type FilterKind = "string" | "number" | "boolean" | "date" | "enum" | "stringList";

export interface FilterRule {
  /** `stringList` targets a text[] column: `?tags=sushi` means "contains". */
  kind: FilterKind;
  /** Allowed values, for `kind: "enum"`. */
  values?: readonly string[];
  /** Column to filter on, when it differs from the query parameter name. */
  column?: string;
}

export interface ListQueryConfig {
  /** Fields a client may sort by. Anything else is rejected. */
  sortable: readonly string[];
  /** Query params a client may filter on, mapped to how to coerce them. */
  filterable?: Readonly<Record<string, FilterRule>>;
  /** Fields scanned by `?q=` using a case-insensitive partial match. */
  searchable?: readonly string[];
  /** Applied when the client sends no `sort`. Defaults to newest first. */
  defaultSort?: string;
  defaultLimit?: number;
  maxLimit?: number;
}

export interface ListQueryResult {
  where: Record<string, unknown>;
  orderBy: Record<string, unknown>[];
  skip: number;
  take: number;
  page: number;
  limit: number;
}

/** Query params that are never treated as filters. */
const RESERVED = new Set(["page", "limit", "sort", "q"]);

/** Suffixes that turn a plain filter into a range / set comparison. */
const OPERATORS = {
  gte: "gte",
  gt: "gt",
  lte: "lte",
  lt: "lt",
  ne: "not",
  in: "in",
} as const;

type OperatorSuffix = keyof typeof OPERATORS;

/**
 * Expands a dotted path into the nested object Prisma expects:
 * `nest("author.name", { contains: "ada" })` becomes
 * `{ author: { name: { contains: "ada" } } }`
 */
const nest = (path: string, leaf: unknown): Record<string, unknown> => {
  const segments = path.split(".");
  return segments.reduceRight<unknown>((acc, segment) => ({ [segment]: acc }), leaf) as Record<
    string,
    unknown
  >;
};

const firstValue = (value: unknown): string | undefined => {
  // hpp already collapses duplicates, but query strings can still yield arrays.
  if (Array.isArray(value)) return value.length > 0 ? String(value[0]) : undefined;
  if (value === undefined || value === null) return undefined;
  return String(value);
};

const coerce = (raw: string, rule: FilterRule, param: string): unknown => {
  switch (rule.kind) {
    case "string":
      return raw;
    case "number": {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        throw ApiError.badRequest(`Query parameter "${param}" must be a number`);
      }
      return parsed;
    }
    case "boolean": {
      if (raw === "true" || raw === "1") return true;
      if (raw === "false" || raw === "0") return false;
      throw ApiError.badRequest(`Query parameter "${param}" must be true or false`);
    }
    case "date": {
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) {
        throw ApiError.badRequest(`Query parameter "${param}" must be a valid date`);
      }
      return parsed;
    }
    case "stringList":
      return raw;
    case "enum": {
      if (!rule.values?.includes(raw)) {
        throw ApiError.badRequest(
          `Query parameter "${param}" must be one of: ${rule.values?.join(", ")}`,
        );
      }
      return raw;
    }
  }
};

const splitOperator = (
  param: string,
  filterable: Readonly<Record<string, FilterRule>>,
): { field: string; operator?: OperatorSuffix } | undefined => {
  if (filterable[param]) return { field: param };

  const separatorIndex = param.lastIndexOf("_");
  if (separatorIndex === -1) return undefined;

  const field = param.slice(0, separatorIndex);
  const suffix = param.slice(separatorIndex + 1);
  if (!filterable[field]) return undefined;
  if (!Object.hasOwn(OPERATORS, suffix)) return undefined;

  return { field, operator: suffix as OperatorSuffix };
};

const buildWhere = (
  query: Record<string, unknown>,
  config: ListQueryConfig,
): Record<string, unknown> => {
  const filterable = config.filterable ?? {};
  const conditions: Record<string, unknown>[] = [];

  for (const [param, rawValue] of Object.entries(query)) {
    if (RESERVED.has(param)) continue;

    const match = splitOperator(param, filterable);
    if (!match) continue; // unknown params are ignored, never passed to the DB

    const rule = filterable[match.field]!;
    const column = rule.column ?? match.field;
    const raw = firstValue(rawValue);
    if (raw === undefined || raw === "") continue;

    if (match.operator === "in") {
      const values = raw
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => coerce(part, rule, param));
      if (values.length === 0) continue;

      // On an array column, "in" reads as "overlaps with any of these".
      conditions.push(
        nest(column, rule.kind === "stringList" ? { hasSome: values } : { in: values }),
      );
      continue;
    }

    const value = coerce(raw, rule, param);
    if (rule.kind === "stringList" && !match.operator) {
      conditions.push(nest(column, { has: value }));
      continue;
    }
    if (match.operator) {
      conditions.push(nest(column, { [OPERATORS[match.operator]]: value }));
    } else {
      conditions.push(nest(column, value));
    }
  }

  const search = firstValue(query["q"])?.trim();
  if (search && config.searchable?.length) {
    conditions.push({
      OR: config.searchable.map((field) => nest(field, { contains: search, mode: "insensitive" })),
    });
  }

  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0]!;
  return { AND: conditions };
};

/** `sort=-createdAt,name` sorts newest first, then by name ascending. */
const buildOrderBy = (
  query: Record<string, unknown>,
  config: ListQueryConfig,
): Record<string, unknown>[] => {
  const raw = firstValue(query["sort"])?.trim() || config.defaultSort;
  if (!raw) return [{ createdAt: "desc" }];

  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const descending = part.startsWith("-");
      const field = descending ? part.slice(1) : part;

      if (!config.sortable.includes(field)) {
        throw ApiError.badRequest(
          `Cannot sort by "${field}". Allowed: ${config.sortable.join(", ")}`,
        );
      }

      // Dotted paths sort through a relation, e.g. `sort=author.name`.
      return nest(field, descending ? "desc" : "asc");
    });
};

const parsePositiveInt = (raw: string | undefined, fallback: number, param: string): number => {
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw ApiError.badRequest(`Query parameter "${param}" must be a positive integer`);
  }
  return parsed;
};

/**
 * Turns a request query string into Prisma `findMany` arguments.
 *
 * Only fields declared in `config` are honoured - unknown parameters are
 * dropped rather than forwarded, so a client cannot filter or sort on columns
 * the endpoint did not opt into.
 */
export const buildListQuery = (
  query: Record<string, unknown>,
  config: ListQueryConfig,
): ListQueryResult => {
  const maxLimit = config.maxLimit ?? 100;
  const page = parsePositiveInt(firstValue(query["page"]), 1, "page");
  const requestedLimit = parsePositiveInt(
    firstValue(query["limit"]),
    config.defaultLimit ?? 20,
    "limit",
  );
  const limit = Math.min(requestedLimit, maxLimit);

  return {
    where: buildWhere(query, config),
    orderBy: buildOrderBy(query, config),
    skip: (page - 1) * limit,
    take: limit,
    page,
    limit,
  };
};
